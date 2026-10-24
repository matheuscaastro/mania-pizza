import { useState } from 'react';
import { act, brl, ErrorBox, Field, get, Modal, MoneyInput, patch, post, put, Spinner, useLoad, type DiningTable, type Neighborhood } from 'shared';

export default function Config() {
  const settings = useLoad(() => get<{ half_rule: 'maior' | 'media' }>('/settings'));
  const hoods = useLoad(() => get<{ neighborhoods: Neighborhood[] }>('/neighborhoods?all=1'));
  const tables = useLoad(() => get<{ tables: DiningTable[] }>('/tables'));
  const [h, setH] = useState<Partial<Neighborhood> | null>(null);
  const [num, setNum] = useState('');
  if (settings.error) return <ErrorBox message={settings.error} retry={settings.reload} />;
  if (!settings.data || !hoods.data || !tables.data) return <Spinner />;
  return (
    <>
      <div className="page-head"><h1>Configurações</h1></div>
      <div className="grid2">
        <div className="card">
          <h2 className="mb">Preço do meio a meio</h2>
          {(['maior', 'media'] as const).map((r) => (
            <label key={r} className="check"><input type="radio" name="half" checked={settings.data!.half_rule === r} onChange={async () => { await act(() => put('/settings', { half_rule: r }), 'Regra atualizada'); settings.reload(); }} />
              {r === 'maior' ? 'Cobrar o preço do sabor mais caro' : 'Cobrar a média dos dois sabores'}</label>
          ))}
        </div>
        <div className="card">
          <h2 className="mb">Mesas ({tables.data.tables.length})</h2>
          <p className="muted">{tables.data.tables.map((t) => t.number).join(', ')}</p>
          <div className="row"><input type="number" placeholder="Número da nova mesa" value={num} onChange={(e) => setNum(e.target.value)} /><button className="btn" disabled={!num} onClick={async () => { if (await act(() => post('/tables', { number: Number(num) }), 'Mesa criada')) { setNum(''); tables.reload(); } }}>Adicionar</button></div>
        </div>
      </div>
      <div className="card mt">
        <div className="row between mb"><h2>Bairros e taxas de entrega</h2><button className="btn primary sm" onClick={() => setH({ eta_minutes: 30, active: true })}>+ Bairro</button></div>
        <div className="tbl-wrap"><table className="tbl"><thead><tr><th>Bairro</th><th>Taxa</th><th>Tempo</th><th>Ativo</th><th /></tr></thead>
          <tbody>{hoods.data.neighborhoods.map((n) => <tr key={n.id} className={n.active ? '' : 'off'}><td><b>{n.name}</b></td><td>{brl(n.fee)}</td><td>{n.eta_minutes} min</td><td>{n.active ? 'Sim' : 'Não'}</td><td className="right"><button className="btn sm" onClick={() => setH(n)}>Editar</button></td></tr>)}</tbody></table></div>
      </div>
      {h && (
        <Modal title={h.id ? 'Editar bairro' : 'Novo bairro'} onClose={() => setH(null)}>
          <Field label="Nome"><input value={h.name ?? ''} onChange={(e) => setH({ ...h, name: e.target.value })} /></Field>
          <Field label="Taxa de entrega"><MoneyInput value={h.fee ?? null} onChange={(v) => setH({ ...h, fee: v ?? undefined })} /></Field>
          <Field label="Tempo estimado (minutos)"><input type="number" value={h.eta_minutes ?? 30} onChange={(e) => setH({ ...h, eta_minutes: Number(e.target.value) })} /></Field>
          <label className="check"><input type="checkbox" checked={h.active !== false} onChange={(e) => setH({ ...h, active: e.target.checked })} />Atendemos este bairro</label>
          <button className="btn primary lg" disabled={!h.name || h.fee == null} onClick={async () => {
            const body = { name: h.name, fee: h.fee, eta_minutes: h.eta_minutes ?? 30, active: h.active !== false };
            if (await act(() => (h.id ? patch(`/neighborhoods/${h.id}`, body) : post('/neighborhoods', body)), 'Salvo')) { setH(null); hoods.reload(); }
          }}>Salvar</button>
        </Modal>
      )}
    </>
  );
}
