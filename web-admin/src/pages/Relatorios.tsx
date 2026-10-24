import { useState } from 'react';
import { brl, ErrorBox, get, METHOD_LABEL, Spinner, TYPE_LABEL, useLoad, type OrderType, type PayMethod } from 'shared';

interface Summary {
  from: string; to: string; revenue: number; paid_accounts: number; avg_ticket: number; orders: number; cancelled: number; avg_delivery_minutes: number | null;
  by_method: { method: PayMethod; total: number }[]; by_day: { day: string; total: number }[]; by_type: { type: OrderType; orders: number; total: number }[]; top_products: { name: string; qty: number; total: number }[];
}

const today = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
const shift = (d: string, n: number) => { const x = new Date(d + 'T12:00:00'); x.setDate(x.getDate() + n); return x.toLocaleDateString('en-CA'); };

export default function Relatorios() {
  const [from, setFrom] = useState(today());
  const [to, setTo] = useState(today());
  const { data, error, reload } = useLoad(() => get<Summary>(`/reports/summary?from=${from}&to=${to}`), [from, to]);
  if (error && !data) return <ErrorBox message={error} retry={reload} />;
  const max = Math.max(1, ...(data?.by_day.map((d) => d.total) ?? []));
  return (
    <>
      <div className="page-head"><h1>Relatórios</h1>
        <div className="row wrap">
          <button className="btn sm" onClick={() => { setFrom(today()); setTo(today()); }}>Hoje</button>
          <button className="btn sm" onClick={() => { setFrom(shift(today(), -6)); setTo(today()); }}>7 dias</button>
          <button className="btn sm" onClick={() => { setFrom(shift(today(), -29)); setTo(today()); }}>30 dias</button>
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} style={{ width: 150 }} /><input type="date" value={to} onChange={(e) => setTo(e.target.value)} style={{ width: 150 }} />
        </div></div>
      {!data ? <Spinner /> : (
        <>
          <div className="stats">
            <div className="stat red"><small>Faturamento</small><b>{brl(data.revenue)}</b></div>
            <div className="stat"><small>Contas pagas</small><b>{data.paid_accounts}</b></div>
            <div className="stat"><small>Ticket médio</small><b>{brl(data.avg_ticket)}</b></div>
            <div className="stat"><small>Pedidos</small><b>{data.orders}</b></div>
            <div className="stat"><small>Cancelados</small><b>{data.cancelled}</b></div>
            <div className="stat"><small>Tempo médio de entrega</small><b>{data.avg_delivery_minutes ?? '—'}{data.avg_delivery_minutes != null && ' min'}</b></div>
          </div>
          <div className="grid2">
            <div className="card"><h2 className="mb">Por forma de pagamento</h2>{data.by_method.length === 0 && <p className="muted">Sem recebimentos.</p>}{data.by_method.map((m) => <div key={m.method} className="sum-row"><span>{METHOD_LABEL[m.method]}</span><b>{brl(m.total)}</b></div>)}</div>
            <div className="card"><h2 className="mb">Por tipo de pedido</h2>{data.by_type.map((t) => <div key={t.type} className="sum-row"><span>{TYPE_LABEL[t.type]} ({t.orders})</span><b>{brl(t.total)}</b></div>)}</div>
            <div className="card"><h2 className="mb">Mais vendidos</h2>{data.top_products.map((p) => <div key={p.name} className="sum-row"><span>{p.qty}× {p.name}</span><b>{brl(p.total)}</b></div>)}</div>
            {data.by_day.length > 1 && <div className="card"><h2 className="mb">Faturamento por dia</h2><div className="bars" style={{ paddingBottom: 20 }}>{data.by_day.map((d) => <div key={d.day} style={{ height: `${(d.total / max) * 100}%` }} title={`${d.day}: ${brl(d.total)}`}><span>{d.day.slice(8)}</span></div>)}</div></div>}
          </div>
        </>
      )}
    </>
  );
}
