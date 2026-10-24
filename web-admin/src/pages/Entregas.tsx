import { brl, ErrorBox, act, get, formatPhone, METHOD_LABEL, minutesSince, post, Spinner, time, useLoad, useNow, useRealtime, type Order } from 'shared';
import { ItemsMini, OrderActions } from '../components';

interface Board { orders: Order[]; deliverers: { id: number; name: string; deliverer_type: string }[] }

export default function Entregas() {
  const { data, error, reload } = useLoad(() => get<Board>('/deliveries/board'));
  useRealtime(['order:new', 'order:updated'], reload);
  const now = useNow();
  if (error && !data) return <ErrorBox message={error} retry={reload} />;
  if (!data) return <Spinner />;
  const by = (f: (o: Order) => boolean) => data.orders.filter(f);
  const cols: [string, Order[]][] = [
    ['Na cozinha', by((o) => o.status === 'novo' || o.status === 'em_preparo')],
    ['Prontos para sair', by((o) => o.status === 'pronto')],
    ['Em rota', by((o) => o.status === 'em_rota')],
    ['Finalizados hoje', by((o) => o.status === 'entregue' || o.status === 'cancelado')],
  ];
  return (
    <>
      <div className="page-head"><h1>Entregas</h1></div>
      <div className="kanban">
        {cols.map(([title, list]) => (
          <div key={title} className="kcol">
            <h3>{title}<span className="chip">{list.length}</span></h3>
            {list.map((o) => (
              <div key={o.id} className="card">
                <div className="row between"><b>#{o.number} · {o.customer_name}</b><small className="muted">{time(o.created_at)} · {minutesSince(o.created_at, now)} min</small></div>
                <small className="muted">{o.address} — {o.neighborhood_name}<br />{formatPhone(o.customer_phone)}</small>
                <div className="mt"><ItemsMini order={o} /></div>
                <div className="row between mt"><b>{brl(o.total)}</b><small>{o.pay_on_delivery_method ? `${METHOD_LABEL[o.pay_on_delivery_method]}${o.change_for ? ` · troco p/ ${brl(o.change_for)}` : ''}` : 'sem cobrança na entrega'}</small></div>
                {o.status !== 'entregue' && o.status !== 'cancelado' && (
                  <select className="mt" value={o.deliverer_id ?? ''} onChange={async (e) => { await act(() => post(`/orders/${o.id}/deliverer`, { deliverer_id: Number(e.target.value) || null })); reload(); }}>
                    <option value="">Escolher entregador…</option>
                    {data.deliverers.map((d) => <option key={d.id} value={d.id}>{d.name} ({d.deliverer_type === 'autonomo' ? 'autônomo' : 'funcionário'})</option>)}
                  </select>
                )}
                {o.status === 'entregue' && o.deliverer_name && <small className="muted">Entregue por {o.deliverer_name} às {time(o.delivered_at)}</small>}
                <div className="row wrap mt"><OrderActions order={o} onChange={reload} /></div>
              </div>
            ))}
          </div>
        ))}
      </div>
    </>
  );
}
