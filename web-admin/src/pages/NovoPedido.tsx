import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { act, brl, CartList, cartToPayload, cartTotal, ErrorBox, Field, formatPhone, get, MenuPicker, METHOD_LABEL, MoneyInput, post, Spinner, TYPE_LABEL, useLoad, type Category, type CartItem, type DiningTable, type Neighborhood, type OrderType, type PayMethod } from 'shared';

export default function NovoPedido() {
  const nav = useNavigate();
  const [params] = useSearchParams();
  const menu = useLoad(() => get<{ categories: Category[] }>('/menu'));
  const settings = useLoad(() => get<{ half_rule: 'maior' | 'media' }>('/settings'));
  const tables = useLoad(() => get<{ tables: DiningTable[] }>('/tables'));
  const hoods = useLoad(() => get<{ neighborhoods: Neighborhood[] }>('/neighborhoods'));

  const [type, setType] = useState<OrderType>(params.get('mesa') ? 'mesa' : 'balcao');
  const [tableId, setTableId] = useState(params.get('mesa') ?? '');
  const [cart, setCart] = useState<CartItem[]>([]);
  const [notes, setNotes] = useState('');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [hoodId, setHoodId] = useState('');
  const [method, setMethod] = useState<PayMethod | ''>('');
  const [change, setChange] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const digits = phone.replace(/\D/g, '');
    if (type !== 'entrega' || digits.length < 8) return;
    const t = setTimeout(async () => {
      try {
        const r = await get<{ customers: any[] }>(`/customers?phone=${digits}`);
        const c = r.customers.find((x) => x.phone === digits) ?? (r.customers.length === 1 ? r.customers[0] : null);
        if (c && !name && !address) { setName(c.name); setAddress(c.address ?? ''); if (c.neighborhood_id) setHoodId(String(c.neighborhood_id)); }
      } catch { /* ignora */ }
    }, 400);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phone, type]);

  if (menu.error) return <ErrorBox message={menu.error} retry={menu.reload} />;
  if (!menu.data || !settings.data || !tables.data || !hoods.data) return <Spinner />;
  const hood = hoods.data.neighborhoods.find((h) => String(h.id) === hoodId);
  const fee = type === 'entrega' ? hood?.fee ?? 0 : 0;
  const total = cartTotal(cart) + fee;
  const ready = cart.length > 0 && (type === 'balcao' || (type === 'mesa' && tableId) || (type === 'entrega' && name.trim() && address.trim() && hoodId && phone.replace(/\D/g, '').length >= 10));

  async function send() {
    setBusy(true);
    const r = await act(() => post('/orders', {
      type, table_id: type === 'mesa' ? Number(tableId) : null, items: cartToPayload(cart), notes: notes || null,
      customer_name: name || null, customer_phone: phone || null, address: type === 'entrega' ? address : null,
      neighborhood_id: type === 'entrega' ? Number(hoodId) : null, pay_on_delivery_method: type === 'entrega' ? method || null : null,
      change_for: type === 'entrega' && method === 'dinheiro' ? change : null,
    }), 'Pedido enviado para a cozinha');
    setBusy(false);
    if (r) nav(type === 'mesa' ? '/mesas' : type === 'entrega' ? '/entregas' : '/pedidos');
  }

  return (
    <>
      <div className="page-head"><h1>Novo pedido</h1></div>
      <div className="split">
        <div className="card"><MenuPicker categories={menu.data.categories} rule={settings.data.half_rule} onAdd={(i) => setCart((c) => [...c, i])} /></div>
        <div className="card sticky">
          <div className="seg-inline mb">
            {(['mesa', 'balcao', 'entrega'] as OrderType[]).map((t) => <button key={t} className={type === t ? 'on' : ''} onClick={() => setType(t)}>{TYPE_LABEL[t]}</button>)}
          </div>
          {type === 'mesa' && (
            <Field label="Mesa"><select value={tableId} onChange={(e) => setTableId(e.target.value)}><option value="">Escolha…</option>
              {tables.data.tables.filter((t) => t.status !== 'reservada' || String(t.id) === tableId).map((t) => <option key={t.id} value={t.id}>Mesa {t.number}{t.account_id ? ' (com conta aberta)' : ''}</option>)}</select></Field>
          )}
          {type === 'balcao' && <Field label="Nome do cliente (opcional)"><input value={name} onChange={(e) => setName(e.target.value)} /></Field>}
          {type === 'entrega' && (
            <>
              <Field label="Telefone"><input inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} onBlur={() => setPhone(formatPhone(phone))} /></Field>
              <Field label="Nome"><input value={name} onChange={(e) => setName(e.target.value)} /></Field>
              <Field label="Endereço"><input value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Rua, número, complemento" /></Field>
              <Field label="Bairro" hint={hood ? `Taxa ${brl(hood.fee)} · cerca de ${hood.eta_minutes} min` : undefined}>
                <select value={hoodId} onChange={(e) => setHoodId(e.target.value)}><option value="">Escolha…</option>{hoods.data.neighborhoods.map((h) => <option key={h.id} value={h.id}>{h.name} ({brl(h.fee)})</option>)}</select></Field>
              <Field label="Pagamento na entrega"><select value={method} onChange={(e) => setMethod(e.target.value as PayMethod | '')}><option value="">Já pago / definir depois</option>{(Object.keys(METHOD_LABEL) as PayMethod[]).map((m) => <option key={m} value={m}>{METHOD_LABEL[m]}</option>)}</select></Field>
              {method === 'dinheiro' && <Field label="Troco para (opcional)"><MoneyInput value={change} onChange={setChange} /></Field>}
            </>
          )}
          <CartList items={cart} onChange={setCart} />
          <Field label="Observação do pedido (opcional)"><textarea value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={500} /></Field>
          {fee > 0 && <div className="sum-row"><span>Taxa de entrega</span><span>{brl(fee)}</span></div>}
          <div className="sum-row total"><span>Total</span><span>{brl(total)}</span></div>
          <button className="btn primary lg mt" disabled={!ready || busy} onClick={send}>{busy ? 'Enviando…' : 'Enviar para a cozinha'}</button>
        </div>
      </div>
    </>
  );
}
