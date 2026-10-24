import { Link } from 'react-router-dom';
import { brl, ErrorBox, get, minutesSince, Spinner, StatusChip, time, useLoad, useRealtime, type Order } from 'shared';
import { orderWhere } from '../components';

interface Dash {
  revenue: number;
  avg_ticket: number;
  orders_today: number;
  open_orders: number;
  deliveries_active: number;
  tables: Record<string, number>;
  cash_open: boolean;
  by_hour: { hour: number; total: number }[];
  recent: Order[];
}

export default function Dashboard() {
  const { data, error, reload } = useLoad(() => get<Dash>('/dashboard'));
  useRealtime(['order:new', 'order:updated', 'tables:changed', 'cash:updated'], reload);
  if (error && !data) return <ErrorBox message={error} retry={reload} />;
  if (!data) return <Spinner />;
  const occupied = data.tables.ocupada + data.tables.aguardando_conta;
  const total = Object.values(data.tables).reduce((a, b) => a + b, 0);
  const max = Math.max(1, ...data.by_hour.map((h) => h.total));

  return (
    <>
      <div className="page-head">
        <h1>Painel de hoje</h1>
        <Link to="/pedidos/novo" className="btn primary">+ Novo pedido</Link>
      </div>
      {!data.cash_open && (
        <div className="card mb" style={{ background: 'var(--yellow-soft)', borderColor: 'var(--yellow)' }}>
          O caixa está fechado. <Link to="/caixa">Abrir o caixa</Link> para receber pagamentos.
        </div>
      )}
      <div className="stats">
        <div className="stat red"><small>Faturamento</small><b>{brl(data.revenue)}</b></div>
        <div className="stat"><small>Ticket médio</small><b>{brl(data.avg_ticket)}</b></div>
        <div className="stat"><small>Pedidos hoje</small><b>{data.orders_today}</b></div>
        <div className="stat"><small>Em andamento</small><b>{data.open_orders}</b></div>
        <div className="stat"><small>Mesas ocupadas</small><b>{occupied}/{total}</b></div>
        <div className="stat"><small>Entregas ativas</small><b>{data.deliveries_active}</b></div>
      </div>
      <div className="grid2">
        <div className="card">
          <h2 className="mb">Faturamento por hora</h2>
          {data.by_hour.length === 0 ? <p className="muted">Nenhum pagamento ainda hoje.</p> : (
            <div className="bars" style={{ paddingBottom: 20 }}>
              {data.by_hour.map((h) => (
                <div key={h.hour} style={{ height: `${(h.total / max) * 100}%` }} title={brl(h.total)}><span>{h.hour}h</span></div>
              ))}
            </div>
          )}
        </div>
        <div className="card">
          <div className="row between mb"><h2>Últimos pedidos</h2><Link to="/pedidos">ver todos</Link></div>
          {data.recent.length === 0 && <p className="muted">Nenhum pedido hoje.</p>}
          {data.recent.map((o) => (
            <div key={o.id} className="row between" style={{ padding: '6px 0', borderBottom: '1px solid var(--line-2)' }}>
              <span><b>#{o.number}</b> {orderWhere(o)}<br /><small className="muted">{time(o.created_at)} · há {minutesSince(o.created_at)} min</small></span>
              <span className="right"><StatusChip status={o.status} /><br /><b>{brl(o.total)}</b></span>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
