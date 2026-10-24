import { useState } from 'react';
import { Link } from 'react-router-dom';
import { brl, Empty, ErrorBox, get, minutesSince, Spinner, StatusChip, time, TYPE_LABEL, useLoad, useNow, useRealtime, type Order, type OrderType } from 'shared';
import { ItemsMini, OrderActions, OrderDetail, orderWhere } from '../components';

export default function Pedidos() {
  const [scope, setScope] = useState<'active' | 'today'>('active');
  const [type, setType] = useState<OrderType | ''>('');
  const [open, setOpen] = useState<Order | null>(null);
  const now = useNow();
  const { data, error, reload } = useLoad(() => get<{ orders: Order[] }>(`/orders?scope=${scope}${type ? `&type=${type}` : ''}`), [scope, type]);
  useRealtime(['order:new', 'order:updated'], reload);
  if (error && !data) return <ErrorBox message={error} retry={reload} />;

  return (
    <>
      <div className="page-head">
        <h1>Pedidos</h1>
        <Link to="/pedidos/novo" className="btn primary">+ Novo pedido</Link>
      </div>
      <div className="row wrap mb">
        <div className="seg-inline">
          <button className={scope === 'active' ? 'on' : ''} onClick={() => setScope('active')}>Em andamento</button>
          <button className={scope === 'today' ? 'on' : ''} onClick={() => setScope('today')}>Hoje</button>
        </div>
        <div className="seg-inline">
          <button className={type === '' ? 'on' : ''} onClick={() => setType('')}>Todos</button>
          {(['mesa', 'balcao', 'entrega'] as OrderType[]).map((t) => <button key={t} className={type === t ? 'on' : ''} onClick={() => setType(t)}>{TYPE_LABEL[t]}</button>)}
        </div>
      </div>
      {!data ? <Spinner /> : data.orders.length === 0 ? <Empty>Nenhum pedido por aqui.</Empty> : (
        <div className="card" style={{ padding: 0 }}>
          {data.orders.map((o) => (
            <div key={o.id} className="ordrow">
              <div className="num">#{o.number}</div>
              <div style={{ cursor: 'pointer' }} onClick={() => setOpen(o)}>
                <div className="row wrap"><b>{orderWhere(o)}</b><StatusChip status={o.status} /><small className="muted">{time(o.created_at)}{['novo', 'em_preparo'].includes(o.status) ? ` · há ${minutesSince(o.created_at, now)} min` : ''}</small></div>
                <ItemsMini order={o} />
              </div>
              <div className="right">
                <b>{brl(o.total)}</b>
                <div className="acts mt"><OrderActions order={o} onChange={reload} /></div>
              </div>
            </div>
          ))}
        </div>
      )}
      {open && <OrderDetail order={open} onClose={() => setOpen(null)} />}
    </>
  );
}
