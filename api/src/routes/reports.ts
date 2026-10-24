import type { FastifyInstance } from 'fastify';
import { query, type Row } from '../db.js';
import { requireRole } from '../auth.js';
import { ACTIVE_STATUSES, fetchOrders, TODAY_START } from '../lib/orders.js';

const TZ = `'America/Sao_Paulo'`;
const isoDay = /^\d{4}-\d{2}-\d{2}$/;

export async function reportRoutes(app: FastifyInstance) {
  app.get('/dashboard', { preHandler: requireRole('caixa') }, async () => {
    const rev = (await query(`select coalesce(sum(amount),0)::int as revenue, count(distinct account_id)::int as accounts from payments where created_at >= ${TODAY_START}`))[0];
    const byHour = await query(
      `select extract(hour from created_at at time zone ${TZ})::int as hour, sum(amount)::int as total
         from payments where created_at >= ${TODAY_START} group by 1 order by 1`,
    );
    const counts = (await query(
      `select count(*) filter (where status <> 'cancelado')::int as orders_today,
              count(*) filter (where status = any($1::text[]))::int as open_orders,
              count(*) filter (where type = 'entrega' and status in ('pronto','em_rota'))::int as deliveries_active
         from orders where created_at >= ${TODAY_START} or status = any($1::text[])`,
      [ACTIVE_STATUSES],
    ))[0];
    const tableRows = await query('select status, count(*)::int as n from dining_tables group by status');
    const tables: Record<string, number> = { livre: 0, ocupada: 0, aguardando_conta: 0, reservada: 0 };
    for (const r of tableRows) tables[r.status] = r.n;
    const cash = (await query('select id, opened_at, initial_amount from cash_sessions where closed_at is null'))[0] ?? null;
    const recent = await fetchOrders(`o.created_at >= ${TODAY_START}`, [], { limit: 8 });
    return {
      revenue: rev.revenue,
      avg_ticket: rev.accounts ? Math.round(rev.revenue / rev.accounts) : 0,
      ...counts,
      tables,
      cash_open: !!cash,
      cash,
      by_hour: byHour,
      recent,
    };
  });

  app.get('/reports/summary', { preHandler: requireRole() }, async (req) => {
    const q = req.query as Row;
    const today = (await query(`select to_char(now() at time zone ${TZ}, 'YYYY-MM-DD') as d`))[0].d as string;
    const from = isoDay.test(q.from) ? q.from : today;
    const to = isoDay.test(q.to) ? q.to : from;
    const range = (col: string) => `${col} >= ($1::date)::timestamp at time zone ${TZ} and ${col} < (($2::date + 1)::timestamp at time zone ${TZ})`;
    const p = [from, to];

    const rev = (await query(`select coalesce(sum(amount),0)::int as revenue, count(distinct account_id)::int as accounts from payments where ${range('created_at')}`, p))[0];
    const byMethod = await query(`select method, sum(amount)::int as total from payments where ${range('created_at')} group by method order by total desc`, p);
    const byDay = await query(`select to_char(created_at at time zone ${TZ}, 'YYYY-MM-DD') as day, sum(amount)::int as total from payments where ${range('created_at')} group by 1 order by 1`, p);
    const byType = await query(
      `select o.type, count(*)::int as orders,
              coalesce(sum((select sum(qty*unit_price) from order_items where order_id = o.id) + o.delivery_fee),0)::int as total
         from orders o where o.status <> 'cancelado' and ${range('o.created_at')} group by o.type order by total desc`,
      p,
    );
    const top = await query(
      `select oi.name, sum(oi.qty)::int as qty, sum(oi.qty * oi.unit_price)::int as total
         from order_items oi join orders o on o.id = oi.order_id
        where o.status <> 'cancelado' and ${range('o.created_at')} group by oi.name order by qty desc, total desc limit 10`,
      p,
    );
    const misc = (await query(
      `select count(*) filter (where status = 'cancelado')::int as cancelled,
              count(*) filter (where status <> 'cancelado')::int as orders,
              round(avg(extract(epoch from (delivered_at - created_at)) / 60) filter (where type = 'entrega' and status = 'entregue'))::int as avg_delivery_minutes
         from orders o where ${range('o.created_at')}`,
      p,
    ))[0];
    return {
      from,
      to,
      revenue: rev.revenue,
      paid_accounts: rev.accounts,
      avg_ticket: rev.accounts ? Math.round(rev.revenue / rev.accounts) : 0,
      by_method: byMethod,
      by_day: byDay,
      by_type: byType,
      top_products: top,
      ...misc,
    };
  });
}
