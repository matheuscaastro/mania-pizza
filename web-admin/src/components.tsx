import { useState } from 'react';
import { act, brl, dateTime, Field, itemTitle, METHOD_LABEL, Modal, MoneyInput, post, StatusChip, TYPE_LABEL, formatPhone, type Account, type Order, type OrderStatus, type PayMethod } from 'shared';

export function orderWhere(o: Order): string {
  if (o.type === 'mesa') return `Mesa ${o.table_number}`;
  if (o.type === 'entrega') return `Entrega · ${o.customer_name ?? ''}`;
  return `Balcão${o.customer_name ? ' · ' + o.customer_name : ''}`;
}

export function ItemsMini({ order }: { order: Order }) {
  return (
    <div className="items-mini">
      {order.items.map((i) => (
        <div key={i.id}>
          {i.qty}× {itemTitle(i)}
          {i.notes && <span className="obs"> — {i.notes}</span>}
        </div>
      ))}
      {order.notes && <div className="obs">Pedido: {order.notes}</div>}
    </div>
  );
}

export async function setStatus(id: number, status: OrderStatus, reason?: string) {
  return act(() => post<{ auto_paid: boolean }>(`/orders/${id}/status`, { status, reason }));
}

const NEXT: Partial<Record<OrderStatus, { to: OrderStatus; label: string }>> = {
  novo: { to: 'em_preparo', label: 'Iniciar preparo' },
  em_preparo: { to: 'pronto', label: 'Marcar pronto' },
  em_rota: { to: 'entregue', label: 'Marcar entregue' },
};

export function OrderActions({ order, onChange }: { order: Order; onChange: () => void }) {
  const [cancel, setCancel] = useState(false);
  let next = NEXT[order.status];
  if (order.status === 'pronto') next = order.type === 'entrega' ? { to: 'em_rota', label: 'Saiu para entrega' } : { to: 'entregue', label: order.type === 'mesa' ? 'Servido' : 'Entregue ao cliente' };
  const needsDeliverer = next?.to === 'em_rota' && !order.deliverer_id;
  const final = order.status === 'entregue' || order.status === 'cancelado';
  return (
    <>
      {next && (
        <button className="btn primary sm" disabled={needsDeliverer} title={needsDeliverer ? 'Escolha o entregador na tela de Entregas' : undefined} onClick={async () => (await setStatus(order.id, next!.to)) && onChange()}>
          {next.label}
        </button>
      )}
      {!final && (
        <button className="btn danger sm" onClick={() => setCancel(true)}>
          Cancelar
        </button>
      )}
      {cancel && <CancelModal order={order} onClose={() => setCancel(false)} onDone={onChange} />}
    </>
  );
}

export function CancelModal({ order, onClose, onDone }: { order: Order; onClose: () => void; onDone: () => void }) {
  const [reason, setReason] = useState('');
  return (
    <Modal title={`Cancelar pedido #${order.number}`} onClose={onClose}>
      <Field label="Motivo do cancelamento" hint="Fica registrado no histórico.">
        <textarea value={reason} onChange={(e) => setReason(e.target.value)} autoFocus />
      </Field>
      <div className="row">
        <button className="btn grow" onClick={onClose}>Voltar</button>
        <button
          className="btn primary grow"
          disabled={reason.trim().length < 3}
          onClick={async () => {
            if (await setStatus(order.id, 'cancelado', reason)) {
              onClose();
              onDone();
            }
          }}
        >
          Cancelar pedido
        </button>
      </div>
    </Modal>
  );
}

export function OrderDetail({ order, onClose }: { order: Order; onClose: () => void }) {
  return (
    <Modal title={`Pedido #${order.number} · ${TYPE_LABEL[order.type]}`} onClose={onClose}>
      <div className="row between mb">
        <StatusChip status={order.status} />
        <span className="muted">{dateTime(order.created_at)}{order.created_by_name ? ` · ${order.created_by_name}` : ''}</span>
      </div>
      <p className="bold">{orderWhere(order)}</p>
      {order.type === 'entrega' && (
        <p className="muted">
          {order.address} — {order.neighborhood_name}
          <br />
          {formatPhone(order.customer_phone)}
          {order.deliverer_name && <><br />Entregador: {order.deliverer_name}</>}
          {order.pay_on_delivery_method && <><br />Pagamento na entrega: {METHOD_LABEL[order.pay_on_delivery_method]}{order.change_for ? ` (troco para ${brl(order.change_for)})` : ''}</>}
        </p>
      )}
      <ItemsMini order={order} />
      <div className="sum-row mt"><span>Itens</span><span>{brl(order.items_total)}</span></div>
      {order.delivery_fee > 0 && <div className="sum-row"><span>Taxa de entrega</span><span>{brl(order.delivery_fee)}</span></div>}
      <div className="sum-row total"><span>Total</span><span>{brl(order.total)}</span></div>
      {order.cancel_reason && <p className="err mt">Cancelado: {order.cancel_reason}</p>}
    </Modal>
  );
}

/** Cobrança da conta: desconto, divisão em formas de pagamento. */
export function PayModal({ account, onClose, onDone }: { account: Account; onClose: () => void; onDone: () => void }) {
  const [acc, setAcc] = useState(account);
  const [lines, setLines] = useState<{ method: PayMethod; amount: number | null }[]>([{ method: 'pix', amount: account.total }]);
  const [disc, setDisc] = useState<number | null>(account.discount || null);
  const [reason, setReason] = useState(account.discount_reason ?? '');
  const sum = lines.reduce((s, l) => s + (l.amount ?? 0), 0);
  const diff = acc.total - sum;

  async function applyDiscount() {
    const r = await act(() => post<{ account: Account }>(`/accounts/${acc.id}/discount`, { amount: disc ?? 0, reason: reason || null }), 'Desconto aplicado');
    if (r) {
      setAcc(r.account);
      setLines([{ method: 'pix', amount: r.account.total }]);
    }
  }
  async function pay() {
    const payments = lines.filter((l) => l.amount).map((l) => ({ method: l.method, amount: l.amount! }));
    if (await act(() => post(`/accounts/${acc.id}/pay`, { payments }), 'Pagamento registrado')) {
      onClose();
      onDone();
    }
  }
  return (
    <Modal title={acc.table_number ? `Cobrar · Mesa ${acc.table_number}` : `Cobrar · conta #${acc.id}`} onClose={onClose}>
      {acc.orders.filter((o) => o.status !== 'cancelado').map((o) => (
        <div key={o.id} className="mb">
          <b>#{o.number}</b> <span className="muted">{orderWhere(o)}</span>
          <ItemsMini order={o} />
        </div>
      ))}
      <div className="sum-row"><span>Subtotal</span><span>{brl(acc.subtotal)}</span></div>
      {acc.delivery_fee > 0 && <div className="sum-row"><span>Taxa de entrega</span><span>{brl(acc.delivery_fee)}</span></div>}
      {acc.discount > 0 && <div className="sum-row"><span>Desconto</span><span>− {brl(acc.discount)}</span></div>}
      <div className="sum-row total"><span>Total</span><span>{brl(acc.total)}</span></div>

      <details className="mt">
        <summary className="bold">Aplicar desconto</summary>
        <div className="row mt">
          <div className="grow"><MoneyInput value={disc} onChange={setDisc} /></div>
          <input className="grow" placeholder="Motivo" value={reason} onChange={(e) => setReason(e.target.value)} />
          <button className="btn sm" onClick={applyDiscount}>Aplicar</button>
        </div>
      </details>

      <div className="label mt">Forma de pagamento</div>
      {lines.map((l, i) => (
        <div key={i} className="payline">
          <select value={l.method} onChange={(e) => setLines(lines.map((x, j) => (j === i ? { ...x, method: e.target.value as PayMethod } : x)))}>
            {(Object.keys(METHOD_LABEL) as PayMethod[]).map((m) => <option key={m} value={m}>{METHOD_LABEL[m]}</option>)}
          </select>
          <MoneyInput value={l.amount} onChange={(v) => setLines(lines.map((x, j) => (j === i ? { ...x, amount: v } : x)))} />
          {lines.length > 1 ? <button className="btn ghost sm" onClick={() => setLines(lines.filter((_, j) => j !== i))}>✕</button> : <span />}
        </div>
      ))}
      <div className="row between">
        <button className="btn sm" onClick={() => setLines([...lines, { method: 'dinheiro', amount: diff > 0 ? diff : null }])}>+ Dividir pagamento</button>
        <span className={diff === 0 ? 'bold' : 'err'}>{diff === 0 ? 'Confere ✓' : diff > 0 ? `Faltam ${brl(diff)}` : `Passou ${brl(-diff)}`}</span>
      </div>
      <button className="btn primary lg mt" disabled={diff !== 0 || acc.total <= 0} onClick={pay}>Confirmar pagamento · {brl(acc.total)}</button>
    </Modal>
  );
}
