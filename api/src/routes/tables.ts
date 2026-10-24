import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { query, tx, updateRow } from '../db.js';
import { badRequest, conflict, notFound } from '../errors.js';
import { idParam, requireRole } from '../auth.js';
import { emit } from '../realtime.js';
import { accountDetail } from '../lib/billing.js';
import { audit } from '../audit.js';

const LIST_SQL = `
  select t.*, a.id as account_id, a.status as account_status, a.people, a.discount, a.opened_at as account_opened_at,
         u.name as waiter_name,
         coalesce((select sum(oi.qty * oi.unit_price) from orders o join order_items oi on oi.order_id = o.id
                    where o.account_id = a.id and o.status <> 'cancelado'), 0)::int as items_total,
         (select count(*)::int from orders o where o.account_id = a.id and o.status = 'pronto') as ready_count,
         (select count(*)::int from orders o where o.account_id = a.id and o.status in ('novo','em_preparo')) as pending_count
    from dining_tables t
    left join accounts a on a.table_id = t.id and a.status in ('aberta','aguardando_conta')
    left join users u on u.id = a.opened_by
   order by t.number`;

export async function tableRoutes(app: FastifyInstance) {
  app.get('/tables', { preHandler: requireRole('caixa', 'garcom') }, async () => {
    const rows = await query(LIST_SQL);
    return { tables: rows.map((t) => ({ ...t, total: Math.max(0, (t.items_total ?? 0) - (t.discount ?? 0)) })) };
  });

  app.post('/tables', { preHandler: requireRole() }, async (req) => {
    const d = z.object({ number: z.number().int().min(1).max(999), capacity: z.number().int().min(1).max(40).default(4), area: z.string().trim().max(40).default('Salão') }).parse(req.body);
    const row = (await query('insert into dining_tables (number, capacity, area) values ($1,$2,$3) returning *', [d.number, d.capacity, d.area]))[0];
    emit('tables:changed');
    return { table: row };
  });

  app.patch('/tables/:id', { preHandler: requireRole() }, async (req) => {
    const d = z.object({ number: z.number().int().min(1).max(999), capacity: z.number().int().min(1).max(40), area: z.string().trim().max(40) }).partial().parse(req.body);
    const row = await updateRow('dining_tables', idParam(req), d);
    if (!row) throw notFound('Mesa não encontrada.');
    emit('tables:changed');
    return { table: row };
  });

  app.get('/tables/:id/account', { preHandler: requireRole('caixa', 'garcom') }, async (req) => {
    const acc = (await query(`select id from accounts where table_id=$1 and status in ('aberta','aguardando_conta')`, [idParam(req)]))[0];
    return { account: acc ? await accountDetail(acc.id) : null };
  });

  app.post('/tables/:id/reserve', { preHandler: requireRole('caixa', 'garcom') }, async (req) => {
    const id = idParam(req);
    const d = z.object({ reserved_for: z.string().trim().min(2).max(80), reserved_at: z.string().trim().max(40).nullish() }).parse(req.body);
    const rows = await query(`update dining_tables set status='reservada', reserved_for=$2, reserved_at=$3 where id=$1 and status='livre' returning *`, [id, d.reserved_for, d.reserved_at ?? null]);
    if (!rows[0]) throw conflict('Só é possível reservar uma mesa livre.');
    emit('tables:changed');
    return { table: rows[0] };
  });

  app.post('/tables/:id/release', { preHandler: requireRole('caixa', 'garcom') }, async (req) => {
    const rows = await query(`update dining_tables set status='livre', reserved_for=null, reserved_at=null where id=$1 and status='reservada' returning *`, [idParam(req)]);
    if (!rows[0]) throw conflict('Esta mesa não está reservada.');
    emit('tables:changed');
    return { table: rows[0] };
  });

  app.post('/tables/:id/transfer', { preHandler: requireRole('caixa', 'garcom') }, async (req) => {
    const id = idParam(req);
    const { to_table_id } = z.object({ to_table_id: z.number().int().positive() }).parse(req.body);
    if (to_table_id === id) throw badRequest('Escolha outra mesa.');
    await tx(async (c) => {
      const acc = (await query(`select * from accounts where table_id=$1 and status in ('aberta','aguardando_conta') for update`, [id], c))[0];
      if (!acc) throw conflict('A mesa de origem não tem conta aberta.');
      const dest = (await query('select * from dining_tables where id=$1 for update', [to_table_id], c))[0];
      if (!dest) throw notFound('Mesa de destino não encontrada.');
      if (dest.status !== 'livre') throw conflict(`A mesa ${dest.number} não está livre.`);
      await query('update accounts set table_id=$2 where id=$1', [acc.id, to_table_id], c);
      await query('update orders set table_id=$2 where account_id=$1', [acc.id, to_table_id], c);
      await query(`update dining_tables set status='livre' where id=$1`, [id], c);
      await query('update dining_tables set status=$2 where id=$1', [to_table_id, acc.status === 'aguardando_conta' ? 'aguardando_conta' : 'ocupada'], c);
      await audit(c, req.user.id, 'mesa.transferir', 'account', acc.id, { from: id, to: to_table_id });
    });
    emit('tables:changed');
    emit('order:updated');
    return { ok: true };
  });

  app.post('/tables/:id/merge', { preHandler: requireRole('caixa') }, async (req) => {
    const id = idParam(req);
    const { into_table_id } = z.object({ into_table_id: z.number().int().positive() }).parse(req.body);
    if (into_table_id === id) throw badRequest('Escolha outra mesa.');
    await tx(async (c) => {
      const src = (await query(`select * from accounts where table_id=$1 and status in ('aberta','aguardando_conta') for update`, [id], c))[0];
      const dst = (await query(`select * from accounts where table_id=$1 and status in ('aberta','aguardando_conta') for update`, [into_table_id], c))[0];
      if (!src || !dst) throw conflict('As duas mesas precisam ter conta aberta para juntar.');
      await query('update orders set account_id=$2, table_id=$3 where account_id=$1', [src.id, dst.id, into_table_id], c);
      await query(`update accounts set discount = discount + $2, people = coalesce(people,0) + coalesce($3,0), status='aberta' where id=$1`, [dst.id, src.discount, src.people], c);
      await query(`update accounts set status='cancelada', closed_at=now() where id=$1`, [src.id], c);
      await query(`update dining_tables set status='livre' where id=$1`, [id], c);
      await query(`update dining_tables set status='ocupada' where id=$1`, [into_table_id], c);
      await audit(c, req.user.id, 'mesa.juntar', 'account', dst.id, { from: id, into: into_table_id });
    });
    emit('tables:changed');
    emit('order:updated');
    return { ok: true };
  });
}
