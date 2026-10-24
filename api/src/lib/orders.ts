import { z } from 'zod';
import { getPool, query, tx, type Db, type Row } from '../db.js';
import { badRequest, conflict, forbidden, HttpError, notFound } from '../errors.js';
import { emit } from '../realtime.js';
import { audit } from '../audit.js';
import type { AuthUser } from '../auth.js';
import { accountDetail, payAccountTx } from './billing.js';

export const ACTIVE_STATUSES = ['novo', 'em_preparo', 'pronto', 'em_rota'];
export const TODAY_START = `(date_trunc('day', now() at time zone 'America/Sao_Paulo') at time zone 'America/Sao_Paulo')`;

const STATUS_LABEL: Record<string, string> = {
  novo: 'Novo',
  em_preparo: 'Em preparo',
  pronto: 'Pronto',
  em_rota: 'Em rota',
  entregue: 'Entregue',
  cancelado: 'Cancelado',
};

export async function fetchOrders(where: string, params: any[] = [], opts: { order?: string; db?: Db; limit?: number } = {}): Promise<Row[]> {
  const db = opts.db ?? getPool();
  const rows = await query(
    `select o.*, t.number as table_number, d.name as deliverer_name, d.deliverer_type, u.name as created_by_name
       from orders o
       left join dining_tables t on t.id = o.table_id
       left join users d on d.id = o.deliverer_id
       left join users u on u.id = o.created_by
      where ${where}
      order by ${opts.order ?? 'o.created_at desc, o.id desc'}
      limit ${opts.limit ?? 500}`,
    params,
    db,
  );
  if (!rows.length) return rows;
  const items = await query('select * from order_items where order_id = any($1::int[]) order by id', [rows.map((r) => r.id)], db);
  const byOrder = new Map<number, Row[]>();
  for (const it of items) {
    const list = byOrder.get(it.order_id) ?? [];
    list.push(it);
    byOrder.set(it.order_id, list);
  }
  for (const r of rows) {
    r.items = byOrder.get(r.id) ?? [];
    r.items_total = r.items.reduce((s: number, i: Row) => s + i.qty * i.unit_price, 0);
    r.total = r.items_total + r.delivery_fee;
  }
  return rows;
}

export const itemSchema = z.object({
  product_id: z.number().int().positive(),
  size: z.enum(['G', 'GG']).nullish(),
  half_product_id: z.number().int().positive().nullish(),
  qty: z.number().int().min(1).max(50),
  notes: z.string().trim().max(300).nullish(),
});

export const createOrderSchema = z.object({
  client_id: z.string().min(8).max(64).nullish(),
  type: z.enum(['mesa', 'balcao', 'entrega']),
  table_id: z.number().int().positive().nullish(),
  people: z.number().int().min(1).max(50).nullish(),
  items: z.array(itemSchema).min(1).max(60),
  notes: z.string().trim().max(500).nullish(),
  customer_name: z.string().trim().max(120).nullish(),
  customer_phone: z.string().trim().max(30).nullish(),
  address: z.string().trim().max(300).nullish(),
  neighborhood_id: z.number().int().positive().nullish(),
  pay_on_delivery_method: z.enum(['dinheiro', 'debito', 'credito', 'pix']).nullish(),
  change_for: z.number().int().min(0).nullish(),
});
export type CreateOrderInput = z.infer<typeof createOrderSchema>;

type PricedItem = { product_id: number; name: string; size: string | null; half_product_id: number | null; half_name: string | null; qty: number; unit_price: number; notes: string | null };

export async function priceItems(items: CreateOrderInput['items'], db: Db): Promise<PricedItem[]> {
  const ids = [...new Set(items.flatMap((i) => [i.product_id, ...(i.half_product_id ? [i.half_product_id] : [])]))];
  const prods = await query('select p.*, c.kind from products p join categories c on c.id = p.category_id where p.id = any($1::int[])', [ids], db);
  const map = new Map<number, Row>(prods.map((p) => [p.id, p]));
  const rule = (await query(`select value from settings where key='half_rule'`, [], db))[0]?.value ?? 'maior';

  const priceFor = (p: Row, size: string) => {
    const v = size === 'G' ? p.price_g : p.price_gg;
    if (v == null) throw badRequest(`${p.name} não está disponível no tamanho ${size}.`);
    return v as number;
  };

  return items.map((i) => {
    const p = map.get(i.product_id);
    if (!p || !p.active) throw badRequest('Há um item indisponível no pedido. Atualize o cardápio.');
    let size: string | null = null;
    let unit = p.price_g as number;
    let half: Row | undefined;
    if (p.kind === 'pizza') {
      if (!i.size) throw badRequest(`Escolha o tamanho (G ou GG) de ${p.name}.`);
      size = i.size;
      unit = priceFor(p, size);
      if (i.half_product_id) {
        half = map.get(i.half_product_id);
        if (!half || !half.active) throw badRequest('O segundo sabor está indisponível.');
        if (!p.allows_half || !half.allows_half || half.kind !== 'pizza' || half.id === p.id) {
          throw badRequest('Esses sabores não podem ser combinados meio a meio.');
        }
        const hp = priceFor(half, size);
        unit = rule === 'media' ? Math.round((unit + hp) / 2) : Math.max(unit, hp);
      }
    } else if (i.half_product_id) {
      throw badRequest('Meio a meio vale apenas para pizzas.');
    }
    return {
      product_id: p.id,
      name: p.name,
      size,
      half_product_id: half?.id ?? null,
      half_name: half?.name ?? null,
      qty: i.qty,
      unit_price: unit,
      notes: i.notes || null,
    };
  });
}

export async function createOrder(user: AuthUser, input: CreateOrderInput): Promise<Row> {
  const existing = async () => {
    if (!input.client_id) return null;
    const ex = await query('select id from orders where client_id=$1', [input.client_id]);
    return ex[0] ? (await fetchOrders('o.id=$1', [ex[0].id]))[0] : null;
  };
  const dup = await existing();
  if (dup) return dup;

  if (user.role === 'garcom' && input.type !== 'mesa') throw forbidden('Garçom só lança pedidos de mesa.');
  if (input.type === 'mesa' && !input.table_id) throw badRequest('Informe a mesa.');
  const phone = input.customer_phone ? input.customer_phone.replace(/\D/g, '') : '';
  if (input.type === 'entrega') {
    if (!input.customer_name || !input.address || !input.neighborhood_id) throw badRequest('Entrega precisa de nome, endereço e bairro.');
    if (phone.length < 10) throw badRequest('Informe o telefone do cliente com DDD.');
  }

  let orderId: number;
  try {
    orderId = await tx(async (c) => {
      const priced = await priceItems(input.items, c);
      let accountId: number;
      let tableId: number | null = null;
      let neighborhood: Row | undefined;
      let customerId: number | null = null;

      if (input.type === 'mesa') {
        const t = (await query('select * from dining_tables where id=$1 for update', [input.table_id], c))[0];
        if (!t) throw notFound('Mesa não encontrada.');
        tableId = t.id;
        let acc = (await query(`select * from accounts where table_id=$1 and status in ('aberta','aguardando_conta')`, [t.id], c))[0];
        if (!acc) {
          acc = (await query('insert into accounts (table_id, people, opened_by) values ($1,$2,$3) returning *', [t.id, input.people ?? null, user.id], c))[0];
        } else if (acc.status === 'aguardando_conta') {
          await query(`update accounts set status='aberta' where id=$1`, [acc.id], c);
        }
        accountId = acc.id;
        await query(`update dining_tables set status='ocupada', reserved_for=null, reserved_at=null where id=$1`, [t.id], c);
      } else {
        accountId = (await query('insert into accounts (opened_by) values ($1) returning id', [user.id], c))[0].id;
      }

      if (input.type === 'entrega') {
        neighborhood = (await query('select * from neighborhoods where id=$1 and active', [input.neighborhood_id], c))[0];
        if (!neighborhood) throw badRequest('Bairro não atendido.');
        customerId = (
          await query(
            `insert into customers (name, phone, address, neighborhood_id) values ($1,$2,$3,$4)
             on conflict (phone) do update set name=excluded.name, address=excluded.address, neighborhood_id=excluded.neighborhood_id
             returning id`,
            [input.customer_name, phone, input.address, neighborhood.id],
            c,
          )
        )[0].id;
      }

      const order = (
        await query(
          `insert into orders (client_id, account_id, type, table_id, customer_id, customer_name, customer_phone, address,
             neighborhood_id, neighborhood_name, delivery_fee, pay_on_delivery_method, change_for, notes, created_by)
           values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15) returning id`,
          [
            input.client_id ?? null,
            accountId,
            input.type,
            tableId,
            customerId,
            input.customer_name || null,
            phone || null,
            input.type === 'entrega' ? input.address : null,
            neighborhood?.id ?? null,
            neighborhood?.name ?? null,
            neighborhood?.fee ?? 0,
            input.type === 'entrega' ? input.pay_on_delivery_method ?? null : null,
            input.type === 'entrega' ? input.change_for ?? null : null,
            input.notes || null,
            user.id,
          ],
          c,
        )
      )[0];
      for (const it of priced) {
        await query(
          `insert into order_items (order_id, product_id, name, size, half_product_id, half_name, qty, unit_price, notes)
           values ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
          [order.id, it.product_id, it.name, it.size, it.half_product_id, it.half_name, it.qty, it.unit_price, it.notes],
          c,
        );
      }
      return order.id as number;
    });
  } catch (e: any) {
    if (e?.code === '23505' && input.client_id) {
      const again = await existing();
      if (again) return again;
    }
    throw e;
  }

  const order = (await fetchOrders('o.id=$1', [orderId]))[0];
  emit('order:new', { id: order.id, number: order.number, type: order.type });
  if (order.type === 'mesa') emit('tables:changed');
  return order;
}

const FLOW: Record<string, string[]> = {
  novo: ['em_preparo', 'pronto', 'cancelado'],
  em_preparo: ['pronto', 'cancelado'],
  pronto: ['entregue', 'em_rota', 'cancelado'],
  em_rota: ['entregue', 'cancelado'],
};
const STAMP: Record<string, string> = { em_preparo: 'prepared_at', pronto: 'ready_at', em_rota: 'out_at', entregue: 'delivered_at' };

function checkPermission(user: AuthUser, o: Row, to: string) {
  const r = user.role;
  if (r === 'admin' || r === 'caixa') return;
  const deny = () => {
    throw forbidden('Você não pode fazer essa mudança no pedido.');
  };
  if (to === 'em_preparo' || to === 'pronto') return r === 'cozinha' ? undefined : deny();
  if (to === 'em_rota') return r === 'entregador' && o.deliverer_id === user.id ? undefined : deny();
  if (to === 'entregue') {
    if (r === 'garcom' && o.type === 'mesa') return;
    if (r === 'entregador' && o.type === 'entrega' && o.deliverer_id === user.id) return;
    return deny();
  }
  if (to === 'cancelado') {
    if (r === 'garcom' && o.type === 'mesa' && o.status === 'novo' && o.created_by === user.id) return;
    return deny();
  }
  return deny();
}

export async function changeStatus(user: AuthUser, id: number, to: string, reason?: string | null): Promise<{ order: Row; auto_paid: boolean }> {
  let autoPaid = false;
  await tx(async (c) => {
    const o = (await query('select * from orders where id=$1 for update', [id], c))[0];
    if (!o) throw notFound('Pedido não encontrado.');
    if (!(FLOW[o.status] ?? []).includes(to)) {
      throw conflict(`O pedido #${o.number} não pode ir de "${STATUS_LABEL[o.status]}" para "${STATUS_LABEL[to] ?? to}".`);
    }
    checkPermission(user, o, to);
    if (to === 'em_rota') {
      if (o.type !== 'entrega') throw badRequest('Só pedidos de entrega saem para rota.');
      if (!o.deliverer_id) throw badRequest('Escolha o entregador antes de enviar para rota.');
    }
    if (to === 'entregue' && o.type === 'entrega' && o.status !== 'em_rota') {
      throw conflict('Envie o pedido para rota antes de marcar como entregue.');
    }
    if (to === 'cancelado') {
      if (!reason || reason.trim().length < 3) throw badRequest('Informe o motivo do cancelamento.');
      const acc = (await query('select status from accounts where id=$1', [o.account_id], c))[0];
      if (acc.status === 'paga') throw conflict('A conta deste pedido já foi paga.');
    }

    const stamp = STAMP[to];
    await query(`update orders set status=$2, cancel_reason=$3 ${stamp ? `, ${stamp}=now()` : ''} where id=$1`, [id, to, to === 'cancelado' ? reason!.trim() : o.cancel_reason], c);

    if (to === 'cancelado') {
      await audit(c, user.id, 'pedido.cancelar', 'order', id, { number: o.number, reason });
      const live = (await query(`select count(*)::int as n from orders where account_id=$1 and status<>'cancelado'`, [o.account_id], c))[0].n;
      if (live === 0) {
        await query(`update accounts set status='cancelada', closed_at=now() where id=$1`, [o.account_id], c);
        if (o.table_id) await query(`update dining_tables set status='livre' where id=$1 and status in ('ocupada','aguardando_conta')`, [o.table_id], c);
      }
    }

    if (to === 'entregue' && o.type === 'entrega' && o.pay_on_delivery_method) {
      const detail = await accountDetail(o.account_id, c);
      if (detail && detail.total > 0) {
        const paid = await payAccountTx(c, user, o.account_id, [{ method: o.pay_on_delivery_method, amount: detail.total }], true);
        autoPaid = !!paid;
      }
    }
  });

  const order = (await fetchOrders('o.id=$1', [id]))[0];
  emit('order:updated', { id, status: to });
  emit('tables:changed');
  if (autoPaid) emit('cash:updated');
  return { order, auto_paid: autoPaid };
}

export async function assignDeliverer(user: AuthUser, id: number, delivererId: number | null): Promise<Row> {
  const o = (await query('select * from orders where id=$1', [id]))[0];
  if (!o) throw notFound('Pedido não encontrado.');
  if (o.type !== 'entrega') throw badRequest('Só pedidos de entrega têm entregador.');
  if (!ACTIVE_STATUSES.includes(o.status)) throw conflict('Este pedido já foi encerrado.');
  if (delivererId) {
    const d = (await query(`select id from users where id=$1 and role='entregador' and active`, [delivererId]))[0];
    if (!d) throw badRequest('Entregador inválido.');
  }
  await query('update orders set deliverer_id=$2 where id=$1', [id, delivererId]);
  await audit(getPool(), user.id, 'pedido.entregador', 'order', id, { delivererId });
  emit('order:updated', { id });
  return (await fetchOrders('o.id=$1', [id]))[0];
}

export { HttpError };
