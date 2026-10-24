import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { act, brl, Empty, ErrorBox, get, itemTitle, Modal, post, Spinner, StatusChip, TABLE_STATUS_LABEL, time, useLoad, useRealtime, type Account, type DiningTable } from 'shared';
import { Field } from 'shared';

export default function Mesa() {
  const id = Number(useParams().id);
  const nav = useNavigate();
  const t = useLoad(() => get<{ tables: DiningTable[] }>('/tables'), [id]);
  const a = useLoad(() => get<{ account: Account | null }>(`/tables/${id}/account`), [id]);
  const reload = () => { t.reload(); a.reload(); };
  useRealtime(['tables:changed', 'order:updated', 'order:new'], reload, 20000);
  const [reserve, setReserve] = useState(false);
  const [who, setWho] = useState('');
  const [at, setAt] = useState('');

  if ((t.error && !t.data) || (a.error && !a.data)) return <ErrorBox message={t.error ?? a.error ?? ''} retry={reload} />;
  if (!t.data || !a.data) return <Spinner />;
  const table = t.data.tables.find((x) => x.id === id);
  if (!table) return <ErrorBox message="Mesa não encontrada." />;
  const account = a.data.account;

  return (
    <>
      <Link to="/">← Mesas</Link>
      <div className="row between mb mt"><h1>Mesa {table.number}</h1><span className={`chip`}>{TABLE_STATUS_LABEL[table.status]}</span></div>

      {table.status === 'reservada' && <div className="card mb">Reservada para <b>{table.reserved_for}</b> {table.reserved_at}</div>}
      {!account && table.status !== 'reservada' && <Empty>Mesa livre. Toque em “Novo pedido” para abrir.</Empty>}

      {account?.orders.map((o) => (
        <div key={o.id} className="card mb">
          <div className="row between"><b>Pedido #{o.number}</b><span className="row"><small className="muted">{time(o.created_at)}</small><StatusChip status={o.status} /></span></div>
          {o.items.map((i) => (
            <div key={i.id} className="mt">{i.qty}× {itemTitle(i)}{i.notes && <div className="obs">Obs.: {i.notes}</div>}</div>
          ))}
          {o.notes && <div className="obs mt">Pedido: {o.notes}</div>}
          {o.status === 'pronto' && <button className="btn green lg mt" onClick={async () => { if (await act(() => post(`/orders/${o.id}/status`, { status: 'entregue' }), 'Marcado como servido')) reload(); }}>Servido na mesa</button>}
          {o.status === 'novo' && <CancelOwn id={o.id} onDone={reload} />}
        </div>
      ))}
      {account && <div className="sum-row total mb"><span>Total da mesa</span><span>{brl(account.total)}</span></div>}

      <div className="stack">
        {table.status !== 'reservada' && <button className="btn primary lg" onClick={() => nav(`/mesa/${id}/pedido`)}>+ Novo pedido</button>}
        {account && account.status === 'aberta' && account.orders.some((o) => o.status !== 'cancelado') && (
          <button className="btn yellow lg" onClick={async () => { if (await act(() => post(`/accounts/${account.id}/request-bill`), 'Conta pedida — o caixa foi avisado')) reload(); }}>Pedir a conta</button>
        )}
        {account?.status === 'aguardando_conta' && <div className="card" style={{ background: 'var(--yellow-soft)' }}>Conta pedida. Aguardando o caixa.</div>}
        {table.status === 'livre' && <button className="btn lg" onClick={() => setReserve(true)}>Reservar</button>}
        {table.status === 'reservada' && <button className="btn lg" onClick={async () => { if (await act(() => post(`/tables/${id}/release`), 'Reserva cancelada')) reload(); }}>Cancelar reserva</button>}
      </div>

      {reserve && (
        <Modal title="Reservar mesa" onClose={() => setReserve(false)}>
          <Field label="Nome"><input value={who} onChange={(e) => setWho(e.target.value)} autoFocus /></Field>
          <Field label="Horário"><input value={at} onChange={(e) => setAt(e.target.value)} placeholder="20:00" /></Field>
          <button className="btn primary lg" disabled={who.trim().length < 2} onClick={async () => { if (await act(() => post(`/tables/${id}/reserve`, { reserved_for: who, reserved_at: at || null }), 'Mesa reservada')) { setReserve(false); reload(); } }}>Reservar</button>
        </Modal>
      )}
    </>
  );
}

function CancelOwn({ id, onDone }: { id: number; onDone: () => void }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  return (
    <>
      <button className="btn ghost sm mt" onClick={() => setOpen(true)}>Cancelar pedido</button>
      {open && (
        <Modal title="Cancelar pedido" onClose={() => setOpen(false)}>
          <Field label="Motivo"><input value={reason} onChange={(e) => setReason(e.target.value)} autoFocus /></Field>
          <button className="btn primary lg" disabled={reason.trim().length < 3} onClick={async () => { if (await act(() => post(`/orders/${id}/status`, { status: 'cancelado', reason }), 'Pedido cancelado')) { setOpen(false); onDone(); } }}>Cancelar pedido</button>
        </Modal>
      )}
    </>
  );
}
