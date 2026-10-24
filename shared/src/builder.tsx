import { useMemo, useState } from 'react';
import { brl } from './format';
import { Modal, Empty } from './ui';
import type { Category, Product, Size } from './types';

export type HalfRule = 'maior' | 'media';

export interface CartItem {
  key: string;
  product: Product;
  kind: 'pizza' | 'simples';
  size: Size | null;
  half: Product | null;
  qty: number;
  notes: string;
  unit: number;
}

/** Preço unitário (centavos) — igual à regra do servidor, que sempre recalcula. */
export function unitPrice(p: Product, kind: 'pizza' | 'simples', size: Size | null, half: Product | null, rule: HalfRule): number | null {
  if (kind === 'simples') return p.price_g;
  if (!size) return null;
  const base = size === 'G' ? p.price_g : p.price_gg;
  if (base == null) return null;
  if (!half) return base;
  const hp = size === 'G' ? half.price_g : half.price_gg;
  if (hp == null) return null;
  return rule === 'media' ? Math.round((base + hp) / 2) : Math.max(base, hp);
}

export const cartTotal = (items: CartItem[]) => items.reduce((s, i) => s + i.unit * i.qty, 0);

export function cartToPayload(items: CartItem[]) {
  return items.map((i) => ({
    product_id: i.product.id,
    size: i.size,
    half_product_id: i.half?.id ?? null,
    qty: i.qty,
    notes: i.notes.trim() || null,
  }));
}

export function cartLabel(i: CartItem): string {
  if (i.half) return `Meia ${i.product.name} + meia ${i.half.name}${i.size ? ` (${i.size})` : ''}`;
  return i.size ? `${i.product.name} (${i.size})` : i.product.name;
}

/* ---------- escolha de item ---------- */
export function MenuPicker({ categories, rule, onAdd }: { categories: Category[]; rule: HalfRule; onAdd: (i: CartItem) => void }) {
  const [catId, setCatId] = useState<number | null>(categories[0]?.id ?? null);
  const [search, setSearch] = useState('');
  const [sheet, setSheet] = useState<{ product: Product; cat: Category } | null>(null);

  const visible = useMemo(() => {
    const s = search.trim().toLowerCase();
    if (s) return categories.flatMap((c) => c.products.filter((p) => p.name.toLowerCase().includes(s)).map((p) => ({ p, c })));
    const cat = categories.find((c) => c.id === (catId ?? categories[0]?.id));
    return (cat?.products ?? []).map((p) => ({ p, c: cat! }));
  }, [categories, catId, search]);

  return (
    <div className="picker">
      <input className="mb" placeholder="Buscar no cardápio…" value={search} onChange={(e) => setSearch(e.target.value)} />
      {!search && (
        <div className="tabs">
          {categories.map((c) => (
            <button key={c.id} className={`tab ${c.id === (catId ?? categories[0]?.id) ? 'on' : ''}`} onClick={() => setCatId(c.id)}>
              {c.name}
            </button>
          ))}
        </div>
      )}
      <div className="col">
        {visible.length === 0 && <Empty>Nenhum item encontrado.</Empty>}
        {visible.map(({ p, c }) => (
          <button key={p.id} className="prod" onClick={() => setSheet({ product: p, cat: c })}>
            <span className="grow">
              <b>{p.name}</b>
              {p.description && <small className="muted block">{p.description}</small>}
            </span>
            <span className="price">
              {c.kind === 'pizza' ? (
                <>
                  <small>G</small> {brl(p.price_g)}
                  {p.price_gg != null && (
                    <>
                      <br />
                      <small>GG</small> {brl(p.price_gg)}
                    </>
                  )}
                </>
              ) : (
                brl(p.price_g)
              )}
            </span>
          </button>
        ))}
      </div>
      {sheet && (
        <ItemSheet
          product={sheet.product}
          category={sheet.cat}
          categories={categories}
          rule={rule}
          onClose={() => setSheet(null)}
          onAdd={(i) => {
            onAdd(i);
            setSheet(null);
          }}
        />
      )}
    </div>
  );
}

function ItemSheet({ product, category, categories, rule, onClose, onAdd }: { product: Product; category: Category; categories: Category[]; rule: HalfRule; onClose: () => void; onAdd: (i: CartItem) => void }) {
  const isPizza = category.kind === 'pizza';
  const [size, setSize] = useState<Size | null>(isPizza ? 'G' : null);
  const [halfOn, setHalfOn] = useState(false);
  const [halfId, setHalfId] = useState<number | null>(null);
  const [qty, setQty] = useState(1);
  const [notes, setNotes] = useState('');

  const halves = categories.filter((c) => c.kind === 'pizza').flatMap((c) => c.products).filter((p) => p.allows_half && p.id !== product.id);
  const half = halfOn ? halves.find((h) => h.id === halfId) ?? null : null;
  const unit = unitPrice(product, category.kind, size, half, rule);
  const canHalf = isPizza && product.allows_half && halves.length > 0;

  return (
    <Modal title={product.name} onClose={onClose}>
      {product.description && <p className="muted">{product.description}</p>}
      {isPizza && (
        <>
          <div className="label">Tamanho</div>
          <div className="seg mb">
            {(['G', 'GG'] as Size[]).map((s) => {
              const price = s === 'G' ? product.price_g : product.price_gg;
              return (
                <button key={s} disabled={price == null} className={size === s ? 'on' : ''} onClick={() => setSize(s)}>
                  {s}
                  <small>{price == null ? 'indisponível' : brl(price)}</small>
                </button>
              );
            })}
          </div>
        </>
      )}
      {canHalf && (
        <>
          <label className="check">
            <input type="checkbox" checked={halfOn} onChange={(e) => setHalfOn(e.target.checked)} />
            Meio a meio
          </label>
          {halfOn && (
            <select className="mb" value={halfId ?? ''} onChange={(e) => setHalfId(Number(e.target.value) || null)}>
              <option value="">Escolha o outro sabor…</option>
              {halves.map((h) => (
                <option key={h.id} value={h.id}>
                  {h.name}
                </option>
              ))}
            </select>
          )}
        </>
      )}
      <div className="label">Observação (opcional)</div>
      <textarea placeholder="Ex.: sem cebola, bem assada…" value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={300} />
      <div className="row between mt">
        <div className="stepper">
          <button onClick={() => setQty(Math.max(1, qty - 1))} aria-label="Menos">−</button>
          <b>{qty}</b>
          <button onClick={() => setQty(Math.min(50, qty + 1))} aria-label="Mais">+</button>
        </div>
        <button
          className="btn primary"
          disabled={unit == null || (halfOn && !half)}
          onClick={() => onAdd({ key: crypto.randomUUID?.() ?? String(Math.random()), product, kind: category.kind, size, half, qty, notes, unit: unit! })}
        >
          Adicionar · {brl((unit ?? 0) * qty)}
        </button>
      </div>
    </Modal>
  );
}

/* ---------- carrinho ---------- */
export function CartList({ items, onChange }: { items: CartItem[]; onChange: (items: CartItem[]) => void }) {
  if (!items.length) return <Empty>Nenhum item ainda.</Empty>;
  const set = (key: string, patch: Partial<CartItem>) => onChange(items.map((i) => (i.key === key ? { ...i, ...patch } : i)));
  return (
    <div className="col">
      {items.map((i) => (
        <div key={i.key} className="card flat cart-item">
          <div className="row between">
            <b>{cartLabel(i)}</b>
            <b className="nowrap">{brl(i.unit * i.qty)}</b>
          </div>
          {i.notes && <div className="obs">Obs.: {i.notes}</div>}
          <div className="row between mt">
            <div className="stepper sm">
              <button onClick={() => (i.qty > 1 ? set(i.key, { qty: i.qty - 1 }) : onChange(items.filter((x) => x.key !== i.key)))} aria-label="Menos">−</button>
              <b>{i.qty}</b>
              <button onClick={() => set(i.key, { qty: Math.min(50, i.qty + 1) })} aria-label="Mais">+</button>
            </div>
            <button className="btn ghost sm" onClick={() => onChange(items.filter((x) => x.key !== i.key))}>
              Remover
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
