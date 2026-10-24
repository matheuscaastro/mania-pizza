import { useState } from 'react';
import { act, brl, dateTime, Empty, ErrorBox, Field, get, METHOD_LABEL, Modal, MoneyInput, post, Spinner, time, useLoad, useRealtime, type Account, type CashSession } from 'shared';
import { PayModal, orderWhere } from '../components';

const MOVE_LABEL = { sangria: 'Sangria (retirada)', suprimento: 'Suprimento (entrada)', despesa: 'Despesa paga em dinheiro' } as const;

export default function Caixa() {
  const cash = useLoad(() => get<{ session: CashSession | null }>('/cash/current'));
  const open = useLoad(() => get<{ accounts: Account[] }>('/accounts/open'));
  const hist = useLoad(() => get<{ sessions: (CashSession & { received: number })[] }>('/cash/sessions'));
  const reloadAll = () => { cash.reload(); open.reload(); hist.reload(); };
  useRealtime(['cash:updated', 'tables:changed', 'order:updated'], reloadAll);
  const [initial, setInitial] = useState<number | null>(null);
  const [pay, setPay] = useState<Account | null>(null);
  const [move, setMove] = useState(false);
  const [closing, setClosing] = useState(false);

  if (cash.error && !cash.data) return <ErrorBox message={cash.error} retry={reloadAll} />;
  if (!cash.data) return <Spinner />;
  const s = cash.data.session;

  return (
    <>
      <div className="page-head">
        <h1>Caixa</h1>
        {s && <div className="row"><button className="btn" onClick={() => setMove(true)}>Sangria / suprimento / despesa</button><button className="btn danger" onClick={() => setClosing(true)}>Fechar caixa</button></div>}
      </div>

      {!s ? (
        <div className="card mb" style={{ maxWidth: 420 }}>
          <h2 className="mb">Abrir o caixa</h2>
          <Field label="Troco inicial (dinheiro na gaveta)"><MoneyInput value={initial} onChange={setInitial} autoFocus /></Field>
          <button className="btn primary lg" disabled={initial == null} onClick={async () => { if (await act(() => post('/cash/open', { initial_amount: initial }), 'Caixa aberto')) reloadAll(); }}>Abrir caixa</button>
        </div>
      ) : (
        <>
          <div className="stats">
            <div className="stat"><small>Aberto às</small><b>{time(s.opened_at)}</b></div>
            <div className="stat"><small>Troco inicial</small><b>{brl(s.initial_amount)}</b></div>
            <div className="stat red"><small>Recebido</small><b>{brl(s.received)}</b></div>
            <div className="stat"><small>Dinheiro esperado na gaveta</small><b>{brl(s.expected_cash)}</b></div>
          </div>
          <div className="grid2 mb">
            <div className="card">
              <h2 className="mb">Por forma de pagamento</h2>
              {s.by_method.length === 0 && <p className="muted">Nenhum recebimento ainda.</p>}
              {s.by_method.map((m) => <div key={m.method} className="sum-row"><span>{METHOD_LABEL[m.method]} ({m.n})</span><b>{brl(m.total)}</b></div>)}
            </div>
            <div className="card">
              <h2 className="mb">Movimentações</h2>
              {s.movements.length === 0 && <p className="muted">Nenhuma retirada ou entrada.</p>}
              {s.movements.map((m) => <div key={m.id} className="sum-row"><span>{time(m.created_at)} · {m.type}{m.category ? ` · ${m.category}` : ''}{m.note ? ` (${m.note})` : ''}</span><b>{m.type === 'suprimento' ? '+' : '−'} {brl(m.amount)}</b></div>)}
            </div>
          </div>
        </>
      )}

      <h2 className="mb">Contas a cobrar</h2>
      {!open.data ? <Spinner /> : open.data.accounts.length === 0 ? <Empty>Nenhuma conta aguardando pagamento.</Empty> : (
        <div className="card" style={{ padding: 0 }}>
          {open.data.accounts.map((a) => (
            <div key={a.id} className="ordrow" style={{ gridTemplateColumns: '1fr auto' }}>
              <div><b>{a.table_number ? `Mesa ${a.table_number}` : orderWhere(a.orders[0])}</b> {a.status === 'aguardando_conta' && <span className="chip st-novo">Pediu a conta</span>}<br /><small className="muted">{a.orders.filter((o) => o.status !== 'cancelado').length} pedido(s) · desde {time(a.opened_at)}</small></div>
              <div className="row"><b>{brl(a.total)}</b><button className="btn green sm" disabled={!s} title={!s ? 'Abra o caixa primeiro' : undefined} onClick={() => setPay(a)}>Cobrar</button></div>
            </div>
          ))}
        </div>
      )}

      <h2 className="mb mt">Fechamentos anteriores</h2>
      <div className="card tbl-wrap">
        <table className="tbl"><thead><tr><th>Abertura</th><th>Fechamento</th><th>Recebido</th><th>Esperado</th><th>Contado</th><th>Diferença</th></tr></thead>
          <tbody>{hist.data?.sessions.filter((x) => x.closed_at).map((x) => (
            <tr key={x.id}><td>{dateTime(x.opened_at)}<br /><small className="muted">{x.opened_by_name}</small></td><td>{dateTime(x.closed_at)}<br /><small className="muted">{x.closed_by_name}</small></td><td>{brl(x.received)}</td><td>{brl(x.expected_cash)}</td><td>{brl(x.counted_cash)}</td>
              <td className={x.difference ? 'err' : ''}>{brl(x.difference)}</td></tr>))}</tbody></table>
      </div>

      {pay && <PayModal account={pay} onClose={() => setPay(null)} onDone={reloadAll} />}
      {move && <MoveModal onClose={() => setMove(false)} onDone={reloadAll} />}
      {closing && s && <CloseModal session={s} onClose={() => setClosing(false)} onDone={reloadAll} />}
    </>
  );
}

function MoveModal({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const [type, setType] = useState<keyof typeof MOVE_LABEL>('sangria');
  const [amount, setAmount] = useState<number | null>(null);
  const [note, setNote] = useState('');
  return (
    <Modal title="Movimentação do caixa" onClose={onClose}>
      <Field label="Tipo"><select value={type} onChange={(e) => setType(e.target.value as keyof typeof MOVE_LABEL)}>{Object.entries(MOVE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Field>
      <Field label="Valor"><MoneyInput value={amount} onChange={setAmount} autoFocus /></Field>
      <Field label={type === 'despesa' ? 'Descrição (ex.: gás, motoboy)' : 'Observação'}><input value={note} onChange={(e) => setNote(e.target.value)} /></Field>
      <button className="btn primary lg" disabled={!amount} onClick={async () => { if (await act(() => post('/cash/movements', { type, amount, category: type === 'despesa' ? note || null : null, note: type === 'despesa' ? null : note || null }), 'Lançado')) { onClose(); onDone(); } }}>Lançar</button>
    </Modal>
  );
}

function CloseModal({ session, onClose, onDone }: { session: CashSession; onClose: () => void; onDone: () => void }) {
  const [counted, setCounted] = useState<number | null>(null);
  const [result, setResult] = useState<CashSession | null>(null);
  const diff = counted == null ? null : counted - session.expected_cash;
  if (result) return (
    <Modal title="Caixa fechado" onClose={() => { onClose(); onDone(); }}>
      <div className="sum-row"><span>Esperado em dinheiro</span><b>{brl(result.expected_cash)}</b></div>
      <div className="sum-row"><span>Contado</span><b>{brl(result.counted_cash)}</b></div>
      <div className={`sum-row total ${result.difference ? 'err' : ''}`}><span>Diferença</span><span>{brl(result.difference)}</span></div>
      <button className="btn primary lg mt" onClick={() => { onClose(); onDone(); }}>Ok</button>
    </Modal>
  );
  return (
    <Modal title="Fechar caixa" onClose={onClose}>
      <div className="sum-row"><span>Recebido no dia (todas as formas)</span><b>{brl(session.received)}</b></div>
      <div className="sum-row"><span>Dinheiro esperado na gaveta</span><b>{brl(session.expected_cash)}</b></div>
      <Field label="Dinheiro contado na gaveta"><MoneyInput value={counted} onChange={setCounted} autoFocus /></Field>
      {diff != null && <p className={diff === 0 ? 'bold' : 'err'}>{diff === 0 ? 'Confere ✓' : diff > 0 ? `Sobra de ${brl(diff)}` : `Falta de ${brl(-diff)}`}</p>}
      <button className="btn primary lg" disabled={counted == null} onClick={async () => { const r = await act(() => post<{ session: CashSession }>('/cash/close', { counted_cash: counted })); if (r) setResult(r.session); }}>Fechar caixa</button>
    </Modal>
  );
}
