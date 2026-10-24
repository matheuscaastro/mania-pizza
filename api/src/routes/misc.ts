import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { query, updateRow, type Row } from '../db.js';
import { notFound } from '../errors.js';
import { idParam, requireAuth, requireRole } from '../auth.js';

const hood = z.object({
  name: z.string().trim().min(2).max(80),
  fee: z.number().int().min(0).max(100_000),
  eta_minutes: z.number().int().min(5).max(240),
  active: z.boolean(),
});

export async function miscRoutes(app: FastifyInstance) {
  app.get('/settings', { preHandler: requireAuth() }, async () => {
    const rows = await query('select key, value from settings');
    return Object.fromEntries(rows.map((r) => [r.key, r.value]));
  });

  app.put('/settings', { preHandler: requireRole() }, async (req) => {
    const d = z.object({ half_rule: z.enum(['maior', 'media']) }).parse(req.body);
    await query(`insert into settings (key, value) values ('half_rule', $1) on conflict (key) do update set value=excluded.value`, [d.half_rule]);
    return d;
  });

  app.get('/neighborhoods', { preHandler: requireAuth() }, async (req) => {
    const all = (req.query as Row).all === '1' && ['admin', 'caixa'].includes(req.user.role);
    return { neighborhoods: await query('select * from neighborhoods where (active or $1) order by name', [all]) };
  });

  app.post('/neighborhoods', { preHandler: requireRole() }, async (req) => {
    const d = hood.partial({ eta_minutes: true, active: true }).parse(req.body);
    const row = (await query('insert into neighborhoods (name, fee, eta_minutes, active) values ($1,$2,$3,$4) returning *', [d.name, d.fee, d.eta_minutes ?? 30, d.active ?? true]))[0];
    return { neighborhood: row };
  });

  app.patch('/neighborhoods/:id', { preHandler: requireRole() }, async (req) => {
    const row = await updateRow('neighborhoods', idParam(req), hood.partial().parse(req.body));
    if (!row) throw notFound('Bairro não encontrado.');
    return { neighborhood: row };
  });

  app.get('/customers', { preHandler: requireRole('caixa') }, async (req) => {
    const phone = String((req.query as Row).phone ?? '').replace(/\D/g, '');
    if (phone.length < 4) return { customers: [] };
    const rows = await query(
      `select c.*, n.name as neighborhood_name, n.fee from customers c left join neighborhoods n on n.id = c.neighborhood_id
        where c.phone like $1 order by c.name limit 5`,
      [`${phone}%`],
    );
    return { customers: rows };
  });
}
