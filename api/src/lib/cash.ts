import { getPool, query, type Db, type Row } from '../db.js';

export async function cashSummary(sessionId: number, db: Db = getPool()): Promise<Row | null> {
  const s = (
    await query(
      `select cs.*, uo.name as opened_by_name, uc.name as closed_by_name
         from cash_sessions cs join users uo on uo.id = cs.opened_by left join users uc on uc.id = cs.closed_by
        where cs.id = $1`,
      [sessionId],
      db,
    )
  )[0];
  if (!s) return null;
  const byMethod = await query('select method, sum(amount)::int as total, count(*)::int as n from payments where cash_session_id=$1 group by method order by method', [sessionId], db);
  const movements = await query(
    `select m.*, u.name as created_by_name from cash_movements m left join users u on u.id = m.created_by where m.cash_session_id=$1 order by m.id`,
    [sessionId],
    db,
  );
  const m = (type: string) => movements.filter((x) => x.type === type).reduce((a, x) => a + x.amount, 0);
  const cashIn = byMethod.find((x) => x.method === 'dinheiro')?.total ?? 0;
  const received = byMethod.reduce((a, x) => a + x.total, 0);
  const expected = s.initial_amount + cashIn + m('suprimento') - m('sangria') - m('despesa');
  return {
    ...s,
    by_method: byMethod,
    movements,
    received,
    sangria: m('sangria'),
    suprimento: m('suprimento'),
    despesa: m('despesa'),
    expected_cash: s.closed_at ? s.expected_cash : expected,
  };
}
