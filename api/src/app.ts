import Fastify from 'fastify';
import cors from '@fastify/cors';
import jwt from '@fastify/jwt';
import rateLimit from '@fastify/rate-limit';
import { ZodError } from 'zod';
import { corsOrigin, jwtSecret } from './config.js';
import { HttpError } from './errors.js';
import { authRoutes } from './routes/auth.js';
import { userRoutes } from './routes/users.js';
import { menuRoutes } from './routes/menu.js';
import { miscRoutes } from './routes/misc.js';
import { tableRoutes } from './routes/tables.js';
import { orderRoutes } from './routes/orders.js';
import { accountRoutes } from './routes/accounts.js';
import { cashRoutes } from './routes/cash.js';
import { reportRoutes } from './routes/reports.js';

export async function buildApp() {
  const app = Fastify({ logger: process.env.NODE_ENV === 'test' ? false : true, trustProxy: true });
  await app.register(cors, { origin: corsOrigin(), methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'] });
  await app.register(jwt, { secret: jwtSecret(), sign: { expiresIn: '12h' } });
  await app.register(rateLimit, { global: false });

  app.setErrorHandler((err: any, req, reply) => {
    if (err instanceof HttpError) return reply.status(err.status).send({ error: err.message });
    if (err instanceof ZodError) {
      return reply.status(400).send({ error: 'Dados inválidos: ' + err.issues.map((i) => `${i.path.join('.') || 'corpo'} ${i.message}`).join('; ') });
    }
    if (err?.code === '23505') return reply.status(409).send({ error: 'Já existe um registro com esses dados.' });
    if (err?.code === '23503') return reply.status(409).send({ error: 'Este registro está em uso e não pode ser alterado assim.' });
    if (err?.statusCode && err.statusCode < 500) return reply.status(err.statusCode).send({ error: err.message });
    req.log.error(err);
    return reply.status(500).send({ error: 'Erro interno. Tente novamente.' });
  });

  app.get('/health', async () => ({ ok: true }));

  await app.register(
    async (api) => {
      await api.register(authRoutes);
      await api.register(userRoutes);
      await api.register(menuRoutes);
      await api.register(miscRoutes);
      await api.register(tableRoutes);
      await api.register(orderRoutes);
      await api.register(accountRoutes);
      await api.register(cashRoutes);
      await api.register(reportRoutes);
    },
    { prefix: '/api' },
  );
  return app;
}
