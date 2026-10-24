import { useState } from 'react';
import { act, brl, ErrorBox, Field, get, Modal, MoneyInput, patch, post, Spinner, useLoad, type Category, type Product } from 'shared';

export default function Cardapio() {
  const { data, error, reload } = useLoad(() => get<{ categories: Category[] }>('/menu?all=1'));
  const [prod, setProd] = useState<Partial<Product> | null>(null);
  const [cat, setCat] = useState<Partial<Category> | null>(null);
  if (error && !data) return <ErrorBox message={error} retry={reload} />;
  if (!data) return <Spinner />;
  return (
    <>
      <div className="page-head">
        <h1>Cardápio</h1>
        <div className="row"><button className="btn" onClick={() => setCat({ kind: 'pizza', sort: data.categories.length + 1 })}>+ Categoria</button>
          <button className="btn primary" onClick={() => setProd({ category_id: data.categories[0]?.id, allows_half: true, active: true })} disabled={!data.categories.length}>+ Produto</button></div>
      </div>
      {data.categories.map((c) => (
        <div key={c.id} className="card mb">
          <div className="row between mb"><h2>{c.name} <small className="muted">({c.kind === 'pizza' ? 'pizzas G/GG' : 'preço único'}){!c.active && ' · oculta'}</small></h2><button className="btn sm" onClick={() => setCat(c)}>Editar</button></div>
          <div className="tbl-wrap"><table className="tbl"><thead><tr><th>Nome</th><th>{c.kind === 'pizza' ? 'G' : 'Preço'}</th>{c.kind === 'pizza' && <th>GG</th>}{c.kind === 'pizza' && <th>Meio a meio</th>}<th>Ativo</th><th /></tr></thead>
            <tbody>{c.products.map((p) => (
              <tr key={p.id} className={p.active ? '' : 'off'}>
                <td><b>{p.name}</b><br /><small className="muted">{p.description}</small></td><td>{brl(p.price_g)}</td>{c.kind === 'pizza' && <td>{p.price_gg != null ? brl(p.price_gg) : '—'}</td>}{c.kind === 'pizza' && <td>{p.allows_half ? 'Sim' : 'Não'}</td>}
                <td><input type="checkbox" checked={p.active} onChange={async (e) => { await act(() => patch(`/menu/products/${p.id}`, { active: e.target.checked })); reload(); }} aria-label="Ativo" /></td>
                <td className="right"><button className="btn sm" onClick={() => setProd(p)}>Editar</button></td></tr>))}</tbody></table></div>
          {c.products.length === 0 && <p className="muted">Sem produtos.</p>}
        </div>
      ))}
      {prod && <ProductModal initial={prod} categories={data.categories} onClose={() => setProd(null)} onDone={reload} />}
      {cat && <CategoryModal initial={cat} onClose={() => setCat(null)} onDone={reload} />}
    </>
  );
}

function ProductModal({ initial, categories, onClose, onDone }: { initial: Partial<Product>; categories: Category[]; onClose: () => void; onDone: () => void }) {
  const [p, setP] = useState<Partial<Product>>(initial);
  const kind = categories.find((c) => c.id === p.category_id)?.kind ?? 'pizza';
  return (
    <Modal title={p.id ? 'Editar produto' : 'Novo produto'} onClose={onClose}>
      <Field label="Categoria"><select value={p.category_id ?? ''} onChange={(e) => setP({ ...p, category_id: Number(e.target.value) })}>{categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></Field>
      <Field label="Nome"><input value={p.name ?? ''} onChange={(e) => setP({ ...p, name: e.target.value })} /></Field>
      <Field label="Descrição / ingredientes"><textarea value={p.description ?? ''} onChange={(e) => setP({ ...p, description: e.target.value })} /></Field>
      <div className="row">
        <div className="grow"><Field label={kind === 'pizza' ? 'Preço G' : 'Preço'}><MoneyInput value={p.price_g ?? null} onChange={(v) => setP({ ...p, price_g: v ?? undefined })} /></Field></div>
        {kind === 'pizza' && <div className="grow"><Field label="Preço GG" hint="Vazio = não existe GG"><MoneyInput value={p.price_gg ?? null} onChange={(v) => setP({ ...p, price_gg: v })} /></Field></div>}
      </div>
      {kind === 'pizza' && <label className="check"><input type="checkbox" checked={!!p.allows_half} onChange={(e) => setP({ ...p, allows_half: e.target.checked })} />Pode ser meio a meio</label>}
      <label className="check"><input type="checkbox" checked={p.active !== false} onChange={(e) => setP({ ...p, active: e.target.checked })} />Disponível no cardápio</label>
      <button className="btn primary lg" disabled={!p.name || p.price_g == null} onClick={async () => {
        const body = { category_id: p.category_id, name: p.name, description: p.description ?? '', price_g: p.price_g, price_gg: kind === 'pizza' ? p.price_gg ?? null : null, allows_half: kind === 'pizza' && !!p.allows_half, active: p.active !== false };
        if (await act(() => (p.id ? patch(`/menu/products/${p.id}`, body) : post('/menu/products', body)), 'Salvo')) { onClose(); onDone(); }
      }}>Salvar</button>
    </Modal>
  );
}

function CategoryModal({ initial, onClose, onDone }: { initial: Partial<Category>; onClose: () => void; onDone: () => void }) {
  const [c, setC] = useState<Partial<Category>>(initial);
  return (
    <Modal title={c.id ? 'Editar categoria' : 'Nova categoria'} onClose={onClose}>
      <Field label="Nome"><input value={c.name ?? ''} onChange={(e) => setC({ ...c, name: e.target.value })} /></Field>
      <Field label="Tipo"><select value={c.kind} disabled={!!c.id} onChange={(e) => setC({ ...c, kind: e.target.value as Category['kind'] })}><option value="pizza">Pizzas (tamanhos G e GG, meio a meio)</option><option value="simples">Itens simples (bebidas, sobremesas…)</option></select></Field>
      <Field label="Ordem no cardápio"><input type="number" value={c.sort ?? 0} onChange={(e) => setC({ ...c, sort: Number(e.target.value) })} /></Field>
      <label className="check"><input type="checkbox" checked={c.active !== false} onChange={(e) => setC({ ...c, active: e.target.checked })} />Visível</label>
      <button className="btn primary lg" disabled={!c.name} onClick={async () => {
        const body = { name: c.name, kind: c.kind, sort: c.sort ?? 0, active: c.active !== false };
        if (await act(() => (c.id ? patch(`/menu/categories/${c.id}`, { name: body.name, sort: body.sort, active: body.active }) : post('/menu/categories', body)), 'Salvo')) { onClose(); onDone(); }
      }}>Salvar</button>
    </Modal>
  );
}
