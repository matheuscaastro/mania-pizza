import { act, Empty, ErrorBox, get, itemTitle, minutesSince, post, Spinner, useLoad, useRealtime, type Order } from 'shared';

export default function Prontos() {
  const { data, error, reload } = useLoad(() => get<{ orders: Order[] }>('/orders?scope=active&status=pronto&type=mesa'));
  useRealtime(['order:updated', 'order:new'], reload, 20000);
  if (error && !data) return <ErrorBox message={error} retry={reload} />;
  if (!data) return <Spinner />;
  return (
    <>
      <h1 className="mb">Prontos para servir</h1>
      {data.orders.length === 0 && <Empty>Nada pronto no momento.</Empty>}
      {data.orders.map((o) => (
        <div key={o.id} className="card mb">
          <div className="row between"><b className="big">Mesa {o.table_number}</b><small className="muted">pronto há {minutesSince(o.ready_at)} min</small></div>
          {o.items.map((i) => <div key={i.id}>{i.qty}× {itemTitle(i)}</div>)}
          <button className="btn green lg mt" onClick={async () => { if (await act(() => post(`/orders/${o.id}/status`, { status: 'entregue' }), 'Servido')) reload(); }}>Servido</button>
        </div>
      ))}
    </>
  );
}
