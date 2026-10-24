import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { query, type Row } from '../db.js';
import { badRequest, notFound } from '../errors.js';
import { idParam, requireRole } from '../auth.js';
import { ACTIVE_STATUSES, assignDeliverer, changeStatus, createOrder, createOrderSchema, fetchOrders, TODAY_START } from '../lib/orders.js';

export async function orderRoutes(app: FastifyInstance) {
  app.post('/orders', { preHandler: requireRole('caixa', 'garcom') }, async (req, reply) => {
    const input = createOrderSchema.parse(req.body);
    const order = await createOrder(req.user, input);
    return reply.status(201).send({ order });
  });

  app.get('/orders', { preHandler: requireRole('caixa', 'cozinha', 'garcom') }, async (req) => {
    const q = req.query as Row;
    const where: string[] = [];
    const params: any[] = [];
    const add = (sql: string, v: any) => {
      params.push(v);
      where.push(sql.replace('?', `$${params.length}`));
    };
    if (q.status) add('o.status = any(?::text[])', String(q.status).split(','));
    if (q.type) add('o.type = any(?::text[])', String(q.type).split(','));
    if (q.table_id) add('o.table_id = ?', Number(q.table_id));
    if (req.user.role === 'garcom') where.push(`o.type = 'mesa'`);
    const scope = q.scope ?? 'today';
    if (scope === 'active') where.push(`o.status = any(array['novo','em_preparo','pronto','em_rota'])`);
    else if (scope === 'today') where.push(`(o.created_at >= ${TODAY_START} or o.status = any(array['novo','em_preparo','pronto','em_rota']))`);
    const orders = await fetchOrders(where.length ? where.join(' and ') : 'true', params, { order: scope === 'active' ? 'o.created_at, o.id' : undefined });
    return { orders };
  });

  app.get('/orders/:id', { preHandler: requireRole('caixa', 'cozinha', 'garcom', 'entregador') }, async (req) => {
    const o = (await fetchOrders('o.id=$1', [idParam(req)]))[0];
    if (!o) throw notFound('Pedido não encontrado.');
    if (req.user.role === 'entregador' && o.deliverer_id !== req.user.id) throw notFound('Pedido não encontrado.');
    return { order: o };
  });

  app.post('/orders/:id/status', { preHandler: requireRole('caixa', 'cozinha', 'garcom', 'entregador') }, async (req) => {
    const body = z.object({ status: z.enum(['em_preparo', 'pronto', 'em_rota', 'entregue', 'cancelado']), reason: z.string().trim().max(300).nullish() }).parse(req.body);
    return changeStatus(req.user, idParam(req), body.status, body.reason);
  });

  app.post('/orders/:id/deliverer', { preHandler: requireRole('caixa') }, async (req) => {
    const { deliverer_id } = z.object({ deliverer_id: z.number().int().positive().nullable() }).parse(req.body);
    return { order: await assignDeliverer(req.user, idParam(req), deliverer_id) };
  });

  /** Entregas do próprio entregador: pendentes e as entregues hoje. */
  app.get('/deliveries/mine', { preHandler: requireRole('entregador') }, async (req) => {
    const orders = await fetchOrders(
      `o.type='entrega' and o.deliverer_id=$1 and (o.status in ('pronto','em_rota') or (o.status='entregue' and o.delivered_at >= ${TODAY_START}))`,
      [req.user.id],
      { order: 'o.created_at' },
    );
    return { orders };
  });

  app.get('/deliveries/board', { preHandler: requireRole('caixa') }, async () => {
    const orders = await fetchOrders(
      `o.type='entrega' and (o.status = any($1::text[]) or (o.status in ('entregue','cancelado') and o.created_at >= ${TODAY_START}))`,
      [ACTIVE_STATUSES],
      { order: 'o.created_at' },
    );
    const deliverers = await query(`select id, name, deliverer_type from users where role='entregador' and active order by name`);
    return { orders, deliverers };
  });
}

void badRequest;
