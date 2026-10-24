import type { FastifyInstance } from 'fastify';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { query } from '../db.js';
import { HttpError } from '../errors.js';
import { requireAuth } from '../auth.js';

export async function authRoutes(app: FastifyInstance) {
  app.post('/auth/login', { config: { rateLimit: { max: 20, timeWindow: '1 minute' } } }, async (req) => {
    const { username, password } = z.object({ username: z.string().trim().min(1), password: z.string().min(1) }).parse(req.body);
    const u = (await query('select * from users where username=$1', [username.toLowerCase()]))[0];
    if (!u || !u.active || !(await bcrypt.compare(password, u.password_hash))) {
      throw new HttpError(401, 'Usuário ou senha incorretos.');
    }
    const user = { id: u.id, role: u.role, name: u.name };
    return { token: app.jwt.sign(user), user: { ...user, deliverer_type: u.deliverer_type } };
  });

  app.get('/auth/me', { preHandler: requireAuth() }, async (req) => {
    const u = (await query('select id, name, role, deliverer_type from users where id=$1', [req.user.id]))[0];
    return { user: u };
  });
}
