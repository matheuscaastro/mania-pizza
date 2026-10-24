import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { query, updateRow, type Row } from '../db.js';
import { badRequest, notFound } from '../errors.js';
import { idParam, requireAuth, requireRole } from '../auth.js';

const category = z.object({
  name: z.string().trim().min(2).max(60),
  kind: z.enum(['pizza', 'simples']),
  sort: z.number().int().min(0).max(999),
  active: z.boolean(),
});
const product = z.object({
  category_id: z.number().int().positive(),
  name: z.string().trim().min(2).max(80),
  description: z.string().trim().max(300),
  price_g: z.number().int().min(0).max(1_000_000),
  price_gg: z.number().int().min(0).max(1_000_000).nullable(),
  allows_half: z.boolean(),
  active: z.boolean(),
});

export async function menuRoutes(app: FastifyInstance) {
  app.get('/menu', { preHandler: requireAuth() }, async (req) => {
    const all = (req.query as Row).all === '1' && ['admin', 'caixa'].includes(req.user.role);
    const cats = await query('select * from categories where (active or $1) order by sort, id', [all]);
    const prods = await query('select * from products where (active or $1) order by name', [all]);
    return { categories: cats.map((c) => ({ ...c, products: prods.filter((p) => p.category_id === c.id) })) };
  });

  app.post('/menu/categories', { preHandler: requireRole() }, async (req) => {
    const d = category.partial({ sort: true, active: true }).parse(req.body);
    const row = (await query('insert into categories (name, kind, sort, active) values ($1,$2,$3,$4) returning *', [d.name, d.kind, d.sort ?? 0, d.active ?? true]))[0];
    return { category: row };
  });

  app.patch('/menu/categories/:id', { preHandler: requireRole() }, async (req) => {
    const row = await updateRow('categories', idParam(req), category.partial().parse(req.body));
    if (!row) throw notFound('Categoria não encontrada.');
    return { category: row };
  });

  async function normalize(d: Partial<z.infer<typeof product>>, categoryId: number) {
    const cat = (await query('select kind from categories where id=$1', [categoryId]))[0];
    if (!cat) throw badRequest('Categoria inválida.');
    if (cat.kind === 'simples') {
      d.price_gg = null;
      d.allows_half = false;
    }
    return d;
  }

  app.post('/menu/products', { preHandler: requireRole() }, async (req) => {
    const d = await normalize(product.partial({ description: true, price_gg: true, allows_half: true, active: true }).parse(req.body), (req.body as Row)?.category_id);
    const row = (
      await query('insert into products (category_id, name, description, price_g, price_gg, allows_half, active) values ($1,$2,$3,$4,$5,$6,$7) returning *', [
        d.category_id,
        d.name,
        d.description ?? '',
        d.price_g,
        d.price_gg ?? null,
        d.allows_half ?? false,
        d.active ?? true,
      ])
    )[0];
    return { product: row };
  });

  app.patch('/menu/products/:id', { preHandler: requireRole() }, async (req) => {
    const id = idParam(req);
    const cur = (await query('select * from products where id=$1', [id]))[0];
    if (!cur) throw notFound('Produto não encontrado.');
    const d = await normalize(product.partial().parse(req.body), (req.body as Row)?.category_id ?? cur.category_id);
    return { product: await updateRow('products', id, d) };
  });
}
