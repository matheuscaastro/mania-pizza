import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { act, brl, ErrorBox, Field, get, minutesSince, Modal, post, Spinner, TABLE_STATUS_LABEL, useLoad, useRealtime, type Account, type DiningTable } from 'shared';
import { ItemsMini, OrderActions, PayModal } from '../components';

export default function Mesas() {
  const { data, error, reload } = useLoad(() => get<{ tables: DiningTable[] }>('/tables'));
  useRealtime(['tables:changed', 'order:new', 'order:updated'], reload);
  const [sel, setSel] = useState<DiningTable | null>(null);
  if (error && !data) return <ErrorBox message={error} retry={reload} />;
  if (!data) return <Spinner />;
  return (
    <>
      <div className="page-head"><h1>Mesas</h1></div>
      <div className="tables-grid">
        {data.tables.map((t) => (
          <button key={t.id} className={`tcard ${t.status}`} onClick={() => setSel(t)}>
            <span className="n">{t.number}</span>
            <b>{TABLE_STATUS_LABEL[t.status]}</b>
            {t.account_id && <span>{brl(t.total)} · {minutesSince(t.account_opened_at)} min{t.waiter_name ? ` · ${t.waiter_name}` : ''}</span>}
            {t.status === 'reservada' && <span>{t.reserved_for} {t.reserved_at}</span>}
            {t.status === 'livre' && <span className="muted">{t.capacity} lugares</span>}
            {t.ready_count > 0 && <span className="alert">{t.ready_count} pronto(s) p/ servir</span>}
          </button>
        ))}
      </div>
      {sel && <TableModal table={sel} tables={data.tables} onClose={() => setSel(null)} onChange={reload} />}
    </>
  );
}

function TableModal({ table, tables, onClose, onChange }: { table: DiningTable; tables: DiningTable[]; onClose: () => void; onChange: () => void }) {
  const nav = useNavigate();
  const { data: acc, reload } = useLoad(() => (table.account_id ? get<{ account: Account | null }>(`/tables/${table.id}/account`) : Promise.resolve({ account: null })), [table.id]);
  const [pay, setPay] = useState<Account | null>(null);
  const [mode, setMode] = useState<null | 'transfer' | 'merge' | 'reserve'>(null);
  const [target, setTarget] = useState('');
  const [who, setWho] = useState('');
  const [at, setAt] = useState('');
  const refresh = () => { reload(); onChange(); };
  const account = acc?.account ?? null;
  const freeOnes = tables.filter((t) => t.id !== table.id && t.status === 'livre');
  const busyOnes = tables.filter((t) => t.id !== table.id && t.account_id);

  return (
    <Modal title={`Mesa ${table.number} · ${TABLE_STATUS_LABEL[table.status]}`} onClose={onClose} wide>
      {account && (
        <>
          {account.orders.map((o) => (
            <div key={o.id} className="card flat mb">
              <div className="row between"><b>Pedido #{o.number}</b><div className="row"><OrderActions order={o} onChange={refresh} /></div></div>
              <ItemsMini order={o} />
            </div>
          ))}
          <div className="sum-row total"><span>Total</span><span>{brl(account.total)}</span></div>
        </>
      )}
      {!account && table.status !== 'reservada' && <p className="muted">Mesa sem conta aberta.</p>}
      {table.status === 'reservada' && <p>Reservada para <b>{table.reserved_for}</b> {table.reserved_at}</p>}

      {mode === 'transfer' && (
        <div className="row mt"><select value={target} onChange={(e) => setTarget(e.target.value)}><option value="">Para qual mesa livre?</option>{freeOnes.map((t) => <option key={t.id} value={t.id}>Mesa {t.number}</option>)}</select>
          <button className="btn primary" disabled={!target} onClick={async () => { if (await act(() => post(`/tables/${table.id}/transfer`, { to_table_id: Number(target) }), 'Mesa transferida')) { onChange(); onClose(); } }}>Transferir</button></div>
      )}
      {mode === 'merge' && (
        <div className="row mt"><select value={target} onChange={(e) => setTarget(e.target.value)}><option value="">Juntar com qual mesa?</option>{busyOnes.map((t) => <option key={t.id} value={t.id}>Mesa {t.number}</option>)}</select>
          <button className="btn primary" disabled={!target} onClick={async () => { if (await act(() => post(`/tables/${table.id}/merge`, { into_table_id: Number(target) }), 'Contas juntadas')) { onChange(); onClose(); } }}>Juntar</button></div>
      )}
      {mode === 'reserve' && (
        <div className="mt"><Field label="Reservada para"><input value={who} onChange={(e) => setWho(e.target.value)} /></Field><Field label="Horário"><input value={at} onChange={(e) => setAt(e.target.value)} placeholder="20:00" /></Field>
          <button className="btn primary" disabled={who.trim().length < 2} onClick={async () => { if (await act(() => post(`/tables/${table.id}/reserve`, { reserved_for: who, reserved_at: at || null }), 'Mesa reservada')) { onChange(); onClose(); } }}>Reservar</button></div>
      )}

      <div className="row wrap mt">
        {table.status !== 'reservada' && <button className="btn primary" onClick={() => nav(`/pedidos/novo?mesa=${table.id}`)}>+ Lançar pedido</button>}
        {account && account.status === 'aberta' && <button className="btn" onClick={async () => { if (await act(() => post(`/accounts/${account.id}/request-bill`))) refresh(); }}>Pedir conta</button>}
        {account && account.total > 0 && <button className="btn green" onClick={() => setPay(account)}>Cobrar</button>}
        {account && <button className="btn" onClick={() => setMode('transfer')}>Transferir</button>}
        {account && <button className="btn" onClick={() => setMode('merge')}>Juntar</button>}
        {table.status === 'livre' && <button className="btn" onClick={() => setMode('reserve')}>Reservar</button>}
        {table.status === 'reservada' && <button className="btn" onClick={async () => { if (await act(() => post(`/tables/${table.id}/release`), 'Reserva cancelada')) { onChange(); onClose(); } }}>Cancelar reserva</button>}
      </div>
      {pay && <PayModal account={pay} onClose={() => setPay(null)} onDone={() => { onChange(); onClose(); }} />}
    </Modal>
  );
}
