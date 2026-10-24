import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { query, tx } from '../db.js';
import { conflict, notFound } from '../errors.js';
import { idParam, requireRole } from '../auth.js';
import { cashSummary } from '../lib/cash.js';
import { emit } from '../realtime.js';
import { audit } from '../audit.js';

export async function cashRoutes(app: FastifyInstance) {
  const guard = { preHandler: requireRole('caixa') };

  app.get('/cash/current', guard, async () => {
    const s = (await query('select id from cash_sessions where closed_at is null'))[0];
    return { session: s ? await cashSummary(s.id) : null };
  });

  app.post('/cash/open', guard, async (req) => {
    const { initial_amount } = z.object({ initial_amount: z.number().int().min(0).max(100_000_00) }).parse(req.body);
    const id = await tx(async (c) => {
      if ((await query('select 1 from cash_sessions where closed_at is null', [], c))[0]) throw conflict('Já existe um caixa aberto.');
      const row = (await query('insert into cash_sessions (opened_by, initial_amount) values ($1,$2) returning id', [req.user.id, initial_amount], c))[0];
      await audit(c, req.user.id, 'caixa.abrir', 'cash_session', row.id, { initial_amount });
      return row.id as number;
    });
    emit('cash:updated');
    return { session: await cashSummary(id) };
  });

  app.post('/cash/movements', guard, async (req) => {
    const d = z
      .object({
        type: z.enum(['sangria', 'suprimento', 'despesa']),
        amount: z.number().int().positive().max(100_000_00),
        category: z.string().trim().max(60).nullish(),
        note: z.string().trim().max(200).nullish(),
      })
      .parse(req.body);
    const s = (await query('select id from cash_sessions where closed_at is null'))[0];
    if (!s) throw conflict('Abra o caixa antes de lançar movimentações.');
    await query('insert into cash_movements (cash_session_id, type, amount, category, note, created_by) values ($1,$2,$3,$4,$5,$6)', [s.id, d.type, d.amount, d.category ?? null, d.note ?? null, req.user.id]);
    emit('cash:updated');
    return { session: await cashSummary(s.id) };
  });

  app.post('/cash/close', guard, async (req) => {
    const { counted_cash } = z.object({ counted_cash: z.number().int().min(0) }).parse(req.body);
    const id = await tx(async (c) => {
      const s = (await query('select id from cash_sessions where closed_at is null for update', [], c))[0];
      if (!s) throw conflict('Não há caixa aberto.');
      const sum = (await cashSummary(s.id, c))!;
      const diff = counted_cash - sum.expected_cash;
      await query('update cash_sessions set closed_at=now(), closed_by=$2, counted_cash=$3, expected_cash=$4, difference=$5 where id=$1', [s.id, req.user.id, counted_cash, sum.expected_cash, diff], c);
      await audit(c, req.user.id, 'caixa.fechar', 'cash_session', s.id, { counted_cash, expected: sum.expected_cash, diff });
      return s.id as number;
    });
    emit('cash:updated');
    return { session: await cashSummary(id) };
  });

  app.get('/cash/sessions', guard, async () => {
    const rows = await query(
      `select cs.*, uo.name as opened_by_name, uc.name as closed_by_name,
              coalesce((select sum(amount) from payments p where p.cash_session_id = cs.id), 0)::int as received
         from cash_sessions cs join users uo on uo.id = cs.opened_by left join users uc on uc.id = cs.closed_by
        order by cs.id desc limit 60`,
    );
    return { sessions: rows };
  });

  app.get('/cash/sessions/:id', guard, async (req) => {
    const s = await cashSummary(idParam(req));
    if (!s) throw notFound('Caixa não encontrado.');
    return { session: s };
  });
}
