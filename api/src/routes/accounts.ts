import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { query, tx } from '../db.js';
import { badRequest, conflict, notFound } from '../errors.js';
import { idParam, requireRole } from '../auth.js';
import { accountDetail, payAccountTx } from '../lib/billing.js';
import { emit } from '../realtime.js';
import { audit } from '../audit.js';

export async function accountRoutes(app: FastifyInstance) {
  /** Contas a cobrar: mesas, balcão e entregas ainda não pagas. */
  app.get('/accounts/open', { preHandler: requireRole('caixa') }, async () => {
    const ids = await query(
      `select a.id from accounts a
        where a.status in ('aberta','aguardando_conta')
          and exists (select 1 from orders o where o.account_id = a.id and o.status <> 'cancelado')
        order by (a.status = 'aguardando_conta') desc, a.opened_at`,
    );
    const accounts = [];
    for (const r of ids) accounts.push(await accountDetail(r.id));
    return { accounts };
  });

  app.get('/accounts/:id', { preHandler: requireRole('caixa', 'garcom') }, async (req) => {
    const a = await accountDetail(idParam(req));
    if (!a) throw notFound('Conta não encontrada.');
    return { account: a };
  });

  app.post('/accounts/:id/request-bill', { preHandler: requireRole('caixa', 'garcom') }, async (req) => {
    const id = idParam(req);
    await tx(async (c) => {
      const a = (await query('select * from accounts where id=$1 for update', [id], c))[0];
      if (!a) throw notFound('Conta não encontrada.');
      if (a.status !== 'aberta') throw conflict('A conta não está aberta.');
      await query(`update accounts set status='aguardando_conta' where id=$1`, [id], c);
      if (a.table_id) await query(`update dining_tables set status='aguardando_conta' where id=$1`, [a.table_id], c);
    });
    emit('tables:changed');
    return { account: await accountDetail(id) };
  });

  app.post('/accounts/:id/discount', { preHandler: requireRole('caixa') }, async (req) => {
    const id = idParam(req);
    const d = z.object({ amount: z.number().int().min(0), reason: z.string().trim().max(200).nullish() }).parse(req.body);
    const a = await accountDetail(id);
    if (!a) throw notFound('Conta não encontrada.');
    if (!['aberta', 'aguardando_conta'].includes(a.status)) throw conflict('A conta já foi encerrada.');
    if (d.amount > a.subtotal) throw badRequest('O desconto não pode ser maior que o valor dos itens.');
    if (d.amount > 0 && !d.reason) throw badRequest('Informe o motivo do desconto.');
    await query('update accounts set discount=$2, discount_reason=$3 where id=$1', [id, d.amount, d.reason ?? null]);
    await audit(await import('../db.js').then((m) => m.getPool()), req.user.id, 'conta.desconto', 'account', id, d);
    emit('tables:changed');
    return { account: await accountDetail(id) };
  });

  app.post('/accounts/:id/pay', { preHandler: requireRole('caixa') }, async (req) => {
    const id = idParam(req);
    const { payments } = z
      .object({ payments: z.array(z.object({ method: z.enum(['dinheiro', 'debito', 'credito', 'pix']), amount: z.number().int().positive() })).min(1).max(6) })
      .parse(req.body);
    await tx((c) => payAccountTx(c, req.user, id, payments));
    emit('tables:changed');
    emit('cash:updated');
    emit('order:updated');
    return { account: await accountDetail(id) };
  });
}
