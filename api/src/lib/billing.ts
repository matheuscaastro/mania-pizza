import type { PoolClient } from 'pg';
import { getPool, query, type Db, type Row } from '../db.js';
import { badRequest, conflict, notFound } from '../errors.js';
import { audit } from '../audit.js';
import type { AuthUser } from '../auth.js';
import { fetchOrders } from './orders.js';

export const brl = (cents: number) => (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

export async function accountDetail(id: number, db: Db = getPool()): Promise<Row | null> {
  const acc = (
    await query(
      `select a.*, t.number as table_number, u.name as opened_by_name
         from accounts a left join dining_tables t on t.id = a.table_id left join users u on u.id = a.opened_by
        where a.id = $1`,
      [id],
      db,
    )
  )[0];
  if (!acc) return null;
  const orders = await fetchOrders('o.account_id=$1', [id], { order: 'o.created_at, o.id', db });
  const payments = await query('select * from payments where account_id=$1 order by id', [id], db);
  const live = orders.filter((o) => o.status !== 'cancelado');
  const subtotal = sum(live.map((o) => o.items_total));
  const deliveryFee = sum(live.map((o) => o.delivery_fee));
  return {
    ...acc,
    orders,
    payments,
    subtotal,
    delivery_fee: deliveryFee,
    total: Math.max(0, subtotal + deliveryFee - acc.discount),
    paid: sum(payments.map((p) => p.amount)),
  };
}

export type PaymentInput = { method: 'dinheiro' | 'debito' | 'credito' | 'pix'; amount: number };

/** Registra o pagamento da conta. Com `silent`, retorna null em vez de falhar quando não dá para cobrar (ex.: caixa fechado). */
export async function payAccountTx(c: PoolClient, user: AuthUser, accountId: number, pays: PaymentInput[], silent = false): Promise<Row | null> {
  const acc = (await query('select * from accounts where id=$1 for update', [accountId], c))[0];
  if (!acc) throw notFound('Conta não encontrada.');
  if (!['aberta', 'aguardando_conta'].includes(acc.status)) {
    if (silent) return null;
    throw conflict('Esta conta já foi encerrada.');
  }
  const cash = (await query('select id from cash_sessions where closed_at is null', [], c))[0];
  if (!cash) {
    if (silent) return null;
    throw conflict('Abra o caixa antes de receber pagamentos.');
  }
  const detail = (await accountDetail(accountId, c))!;
  if (detail.total <= 0) {
    if (silent) return null;
    throw badRequest('Conta sem valor a cobrar.');
  }
  const received = sum(pays.map((p) => p.amount));
  if (received !== detail.total) {
    throw badRequest(`Os pagamentos (${brl(received)}) precisam somar o total da conta (${brl(detail.total)}).`);
  }
  for (const p of pays) {
    await query('insert into payments (account_id, cash_session_id, method, amount, created_by) values ($1,$2,$3,$4,$5)', [accountId, cash.id, p.method, p.amount, user.id], c);
  }
  await query(`update accounts set status='paga', closed_at=now() where id=$1`, [accountId], c);
  if (acc.table_id) await query(`update dining_tables set status='livre' where id=$1`, [acc.table_id], c);
  await audit(c, user.id, 'conta.pagar', 'account', accountId, { total: detail.total, pays });
  return detail;
}
