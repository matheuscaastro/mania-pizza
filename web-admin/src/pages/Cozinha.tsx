import { useRef, useState } from 'react';
import { act, ErrorBox, get, itemTitle, Logo, minutesSince, post, Spinner, time, TYPE_LABEL, useAuth, useLoad, useNow, useRealtime, type Order } from 'shared';
import { orderWhere } from '../components';

function beep() {
  try {
    const ctx = new AudioContext();
    [880, 1100].forEach((f, i) => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.frequency.value = f;
      o.connect(g);
      g.connect(ctx.destination);
      g.gain.setValueAtTime(0.25, ctx.currentTime + i * 0.2);
      g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + i * 0.2 + 0.18);
      o.start(ctx.currentTime + i * 0.2);
      o.stop(ctx.currentTime + i * 0.2 + 0.2);
    });
  } catch { /* sem áudio */ }
}

/** Tela da cozinha (TV): abre em tela cheia, sem menu. */
export default function Cozinha() {
  const { user, logout } = useAuth();
  const { data, error, reload } = useLoad(() => get<{ orders: Order[] }>('/orders?scope=active&status=novo,em_preparo,pronto&type=mesa,balcao,entrega'));
  const now = useNow(15000);
  const [sound, setSound] = useState(false);
  const soundRef = useRef(false);
  soundRef.current = sound;
  useRealtime(['order:new', 'order:updated'], reload, 15000);
  useRealtime(['order:new'], () => soundRef.current && beep(), 3600000);
  if (!user) return null;
  if (error && !data) return <div className="kitchen"><ErrorBox message={error} retry={reload} /></div>;
  if (!data) return <div className="kitchen"><Spinner /></div>;

  const list = (s: string) => data.orders.filter((o) => o.status === s);
  const move = async (o: Order, to: 'em_preparo' | 'pronto') => { await act(() => post(`/orders/${o.id}/status`, { status: to })); reload(); };
  const Ticket = ({ o, action }: { o: Order; action?: { label: string; to: 'em_preparo' | 'pronto' } }) => {
    const mins = minutesSince(o.created_at, now);
    return (
      <div className={`ticket ${o.status} ${mins >= 25 && o.status !== 'pronto' ? 'late' : ''}`}>
        <div className="head"><span className="where">#{o.number} · {o.type === 'mesa' ? `Mesa ${o.table_number}` : TYPE_LABEL[o.type]}</span><b>{time(o.created_at)} · {mins} min</b></div>
        {o.type !== 'mesa' && <small>{orderWhere(o)}</small>}
        <ul>{o.items.map((i) => <li key={i.id}>{i.qty}× {itemTitle(i)}{i.notes && <span className="obs">{i.notes}</span>}</li>)}</ul>
        {o.notes && <span className="obs">Pedido: {o.notes}</span>}
        {action && <button className={`btn ${action.to === 'pronto' ? 'green' : 'yellow'}`} onClick={() => move(o, action.to)}>{action.label}</button>}
      </div>
    );
  };

  return (
    <div className="kitchen">
      <header>
        <div className="row"><Logo size={48} /><h1>Cozinha</h1></div>
        <div className="row">
          <button className="btn sm" onClick={() => { setSound(!sound); if (!sound) beep(); }}>{sound ? '🔔 Som ligado' : '🔕 Ligar som'}</button>
          <button className="btn sm" onClick={() => document.documentElement.requestFullscreen?.()}>Tela cheia</button>
          <button className="btn sm" onClick={logout}>Sair</button>
        </div>
      </header>
      <div className="kgrid">
        <section className="kcolumn"><h2>Novos ({list('novo').length})</h2>{list('novo').map((o) => <Ticket key={o.id} o={o} action={{ label: 'Iniciar preparo', to: 'em_preparo' }} />)}</section>
        <section className="kcolumn"><h2>Em preparo ({list('em_preparo').length})</h2>{list('em_preparo').map((o) => <Ticket key={o.id} o={o} action={{ label: 'Pronto!', to: 'pronto' }} />)}</section>
        <section className="kcolumn"><h2>Prontos ({list('pronto').length})</h2>{list('pronto').map((o) => <Ticket key={o.id} o={o} />)}</section>
      </div>
    </div>
  );
}
