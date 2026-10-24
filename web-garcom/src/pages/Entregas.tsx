import { act, brl, Empty, ErrorBox, formatPhone, get, itemTitle, METHOD_LABEL, post, Spinner, time, useLoad, useRealtime, type Order } from 'shared';

export default function Entregas() {
  const { data, error, reload } = useLoad(() => get<{ orders: Order[] }>('/deliveries/mine'));
  useRealtime(['order:updated', 'order:new'], reload, 20000);
  if (error && !data) return <ErrorBox message={error} retry={reload} />;
  if (!data) return <Spinner />;
  const todo = data.orders.filter((o) => o.status !== 'entregue');
  const done = data.orders.filter((o) => o.status === 'entregue');
  const go = async (o: Order, status: 'em_rota' | 'entregue') => {
    const r = await act(() => post<{ auto_paid: boolean }>(`/orders/${o.id}/status`, { status }), status === 'em_rota' ? 'Boa entrega!' : 'Entrega concluída');
    if (r) reload();
  };
  return (
    <>
      <h1 className="mb">Minhas entregas</h1>
      {todo.length === 0 && <Empty>Nenhuma entrega para você agora.</Empty>}
      {todo.map((o) => (
        <div key={o.id} className="card mb">
          <div className="row between"><b className="big">#{o.number} · {o.customer_name}</b><span className={`chip st-${o.status}`}>{o.status === 'pronto' ? 'Pronto p/ retirar' : 'Em rota'}</span></div>
          <p className="mt"><b>{o.address}</b><br />{o.neighborhood_name}</p>
          <div className="row wrap">
            <a className="btn" href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${o.address}, ${o.neighborhood_name}`)}`} target="_blank" rel="noreferrer">Abrir no mapa</a>
            <a className="btn" href={`tel:${o.customer_phone}`}>Ligar {formatPhone(o.customer_phone)}</a>
          </div>
          <div className="mt muted">{o.items.map((i) => <div key={i.id}>{i.qty}× {itemTitle(i)}</div>)}</div>
          <div className="card flat mt">
            {o.pay_on_delivery_method ? <>Cobrar <b>{brl(o.total)}</b> em <b>{METHOD_LABEL[o.pay_on_delivery_method]}</b>{o.change_for ? <> · troco para {brl(o.change_for)} (devolver {brl(o.change_for - o.total)})</> : null}</> : <>Pagamento já resolvido — nada a cobrar.</>}
          </div>
          {o.status === 'pronto' ? <button className="btn primary lg mt" onClick={() => go(o, 'em_rota')}>Saí para entrega</button> : <button className="btn green lg mt" onClick={() => go(o, 'entregue')}>Entreguei</button>}
        </div>
      ))}
      {done.length > 0 && <><h2 className="mb mt">Entregues hoje ({done.length})</h2>{done.map((o) => <div key={o.id} className="card flat mb row between"><span>#{o.number} · {o.customer_name}</span><small className="muted">{time(o.delivered_at)}</small></div>)}</>}
    </>
  );
}
