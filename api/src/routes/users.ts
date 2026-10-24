import type { FastifyInstance } from 'fastify';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { query, updateRow } from '../db.js';
import { badRequest, notFound } from '../errors.js';
import { idParam, requireRole } from '../auth.js';

const roles = z.enum(['admin', 'caixa', 'garcom', 'entregador', 'cozinha']);
const base = z.object({
  name: z.string().trim().min(2).max(80),
  username: z.string().trim().toLowerCase().min(3).max(40).regex(/^[a-z0-9._-]+$/, 'Use letras, números, ponto, hífen ou _'),
  password: z.string().min(6).max(100),
  role: roles,
  deliverer_type: z.enum(['funcionario', 'autonomo']).nullish(),
  active: z.boolean(),
});

const cols = 'id, name, username, role, deliverer_type, active, created_at';

export async function userRoutes(app: FastifyInstance) {
  app.get('/users', { preHandler: requireRole() }, async () => {
    return { users: await query(`select ${cols} from users order by active desc, name`) };
  });

  app.get('/users/deliverers', { preHandler: requireRole('caixa') }, async () => {
    return { users: await query(`select id, name, deliverer_type from users where role='entregador' and active order by name`) };
  });

  app.post('/users', { preHandler: requireRole() }, async (req) => {
    const d = base.omit({ active: true }).parse(req.body);
    const type = d.role === 'entregador' ? d.deliverer_type ?? 'funcionario' : null;
    const row = (
      await query(`insert into users (name, username, password_hash, role, deliverer_type) values ($1,$2,$3,$4,$5) returning ${cols}`, [d.name, d.username, await bcrypt.hash(d.password, 10), d.role, type])
    )[0];
    return { user: row };
  });

  app.patch('/users/:id', { preHandler: requireRole() }, async (req) => {
    const id = idParam(req);
    const d = base.partial().parse(req.body);
    if (id === req.user.id && (d.active === false || (d.role && d.role !== 'admin'))) {
      throw badRequest('Você não pode desativar nem rebaixar o seu próprio usuário.');
    }
    const cur = (await query('select * from users where id=$1', [id]))[0];
    if (!cur) throw notFound('Usuário não encontrado.');
    const role = d.role ?? cur.role;
    const data: Record<string, any> = {
      name: d.name,
      username: d.username,
      role: d.role,
      active: d.active,
      deliverer_type: role === 'entregador' ? d.deliverer_type ?? cur.deliverer_type ?? 'funcionario' : null,
    };
    if (d.password) data.password_hash = await bcrypt.hash(d.password, 10);
    const row = await updateRow('users', id, data);
    const { password_hash, ...safe } = row!;
    return { user: safe };
  });
}
