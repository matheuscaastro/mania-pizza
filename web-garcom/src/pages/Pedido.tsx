import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { brl, CartList, cartToPayload, cartTotal, ErrorBox, Field, MenuPicker, Modal, Spinner, toast, useLoad, type CartItem, type Category, type DiningTable } from 'shared';
import { cachedGet, submitOrder } from '../outbox';

export default function Pedido() {
  const id = Number(useParams().id);
  const nav = useNavigate();
  const menu = useLoad(() => cachedGet<{ categories: Category[] }>('menu', '/menu'));
  const settings = useLoad(() => cachedGet<{ half_rule: 'maior' | 'media' }>('settings', '/settings'));
  const tables = useLoad(() => cachedGet<{ tables: DiningTable[] }>('tables', '/tables'));
  const [cart, setCart] = useState<CartItem[]>([]);
  const [review, setReview] = useState(false);
  const [notes, setNotes] = useState('');
  const [people, setPeople] = useState('');
  const [busy, setBusy] = useState(false);
  // um identificador por pedido: reenviar não duplica
  const [clientId] = useState(() => (typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`));

  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => cart.length && e.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [cart.length]);

  if (menu.error && !menu.data) return <ErrorBox message={menu.error} retry={menu.reload} />;
  if (!menu.data || !settings.data || !tables.data) return <Spinner />;
  const table = tables.data.data.tables.find((t) => t.id === id);
  const total = cartTotal(cart);

  async function send() {
    setBusy(true);
    try {
      const r = await submitOrder(
        { client_id: clientId, type: 'mesa', table_id: id, items: cartToPayload(cart), notes: notes.trim() || null, people: !table?.account_id && Number(people) > 0 ? Number(people) : null },
        `Mesa ${table?.number ?? id}`,
      );
      toast(r === 'sent' ? 'Pedido enviado para a cozinha' : 'Sem internet — pedido guardado e será enviado assim que voltar');
      setCart([]);
      nav(`/mesa/${id}`, { replace: true });
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Não foi possível enviar', 'erro');
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Link to={`/mesa/${id}`}>← Mesa {table?.number}</Link>
      <h1 className="mb mt">Novo pedido · Mesa {table?.number}</h1>
      {(menu.data.stale) && <div className="banner warn">Sem conexão — usando o último cardápio salvo.</div>}
      <MenuPicker categories={menu.data.data.categories} rule={settings.data.data.half_rule} onAdd={(i) => { setCart((c) => [...c, i]); toast('Adicionado'); }} />
      {cart.length > 0 && (
        <div className="cartbar">
          <button className="btn primary lg" onClick={() => setReview(true)}>Revisar pedido ({cart.reduce((s, i) => s + i.qty, 0)}) · {brl(total)}</button>
        </div>
      )}
      {review && (
        <Modal title="Revisar pedido" onClose={() => setReview(false)}>
          <CartList items={cart} onChange={(c) => { setCart(c); if (!c.length) setReview(false); }} />
          {!table?.account_id && <Field label="Quantas pessoas? (opcional)"><input inputMode="numeric" value={people} onChange={(e) => setPeople(e.target.value.replace(/\D/g, ''))} /></Field>}
          <div className="mt"><Field label="Observação do pedido (opcional)"><textarea value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={500} /></Field></div>
          <div className="sum-row total"><span>Total</span><span>{brl(total)}</span></div>
          <button className="btn primary lg mt" disabled={busy || !cart.length} onClick={send}>{busy ? 'Enviando…' : 'Enviar para a cozinha'}</button>
        </Modal>
      )}
    </>
  );
}
