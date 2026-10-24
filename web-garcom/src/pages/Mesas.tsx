import { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { brl, ErrorBox, minutesSince, Spinner, TABLE_STATUS_LABEL, toast, useLoad, useRealtime, type DiningTable } from 'shared';
import { cachedGet } from '../outbox';

export default function Mesas() {
  const nav = useNavigate();
  const [stale, setStale] = useState(false);
  const lastReady = useRef(0);
  const { data, error, reload } = useLoad(async () => {
    const r = await cachedGet<{ tables: DiningTable[] }>('tables', '/tables');
    setStale(r.stale);
    const ready = r.data.tables.reduce((s, t) => s + t.ready_count, 0);
    if (ready > lastReady.current && lastReady.current >= 0 && !r.stale) {
      toast('Tem pedido pronto para servir!');
      navigator.vibrate?.(200);
    }
    lastReady.current = ready;
    return r.data;
  });
  useRealtime(['tables:changed', 'order:updated', 'order:new'], reload, 20000);
  if (error && !data) return <ErrorBox message={error} retry={reload} />;
  if (!data) return <Spinner />;
  return (
    <>
      {stale && <div className="banner warn">Sem conexão — mostrando a última lista de mesas.</div>}
      <h1 className="mb">Mesas</h1>
      <div className="tgrid">
        {data.tables.map((t) => (
          <button key={t.id} className={`tbtn ${t.status}`} onClick={() => nav(`/mesa/${t.id}`)}>
            <span className="n">{t.number}</span>
            <b>{TABLE_STATUS_LABEL[t.status]}</b>
            {t.account_id && <small>{brl(t.total)} · {minutesSince(t.account_opened_at)} min</small>}
            {t.status === 'reservada' && <small>{t.reserved_for} {t.reserved_at}</small>}
            {t.ready_count > 0 && <span className="alert">{t.ready_count} pronto(s)</span>}
          </button>
        ))}
      </div>
    </>
  );
}
