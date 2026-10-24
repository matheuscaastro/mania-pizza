import { useState } from 'react';
import { act, ErrorBox, Field, get, Modal, patch, post, ROLE_LABEL, Spinner, useAuth, useLoad, type Role, type User } from 'shared';

export default function Usuarios() {
  const { user: me } = useAuth();
  const { data, error, reload } = useLoad(() => get<{ users: User[] }>('/users'));
  const [edit, setEdit] = useState<(Partial<User> & { password?: string }) | null>(null);
  if (error && !data) return <ErrorBox message={error} retry={reload} />;
  if (!data) return <Spinner />;
  return (
    <>
      <div className="page-head"><h1>Usuários</h1><button className="btn primary" onClick={() => setEdit({ role: 'garcom' })}>+ Novo usuário</button></div>
      <div className="card tbl-wrap"><table className="tbl"><thead><tr><th>Nome</th><th>Usuário</th><th>Função</th><th>Ativo</th><th /></tr></thead>
        <tbody>{data.users.map((u) => (
          <tr key={u.id} className={u.active ? '' : 'off'}><td><b>{u.name}</b></td><td>{u.username}</td>
            <td>{ROLE_LABEL[u.role]}{u.role === 'entregador' && ` · ${u.deliverer_type === 'autonomo' ? 'autônomo' : 'funcionário'}`}</td><td>{u.active ? 'Sim' : 'Não'}</td>
            <td className="right"><button className="btn sm" onClick={() => setEdit(u)}>Editar</button></td></tr>))}</tbody></table></div>
      {edit && <UserModal initial={edit} self={edit.id === me?.id} onClose={() => setEdit(null)} onDone={reload} />}
    </>
  );
}

function UserModal({ initial, self, onClose, onDone }: { initial: Partial<User> & { password?: string }; self: boolean; onClose: () => void; onDone: () => void }) {
  const [u, setU] = useState(initial);
  const isNew = !u.id;
  return (
    <Modal title={isNew ? 'Novo usuário' : 'Editar usuário'} onClose={onClose}>
      <Field label="Nome"><input value={u.name ?? ''} onChange={(e) => setU({ ...u, name: e.target.value })} /></Field>
      <Field label="Usuário de login"><input value={u.username ?? ''} onChange={(e) => setU({ ...u, username: e.target.value })} autoCapitalize="none" /></Field>
      <Field label={isNew ? 'Senha (mín. 6 caracteres)' : 'Nova senha (deixe vazio para manter)'}><input type="password" value={u.password ?? ''} onChange={(e) => setU({ ...u, password: e.target.value })} autoComplete="new-password" /></Field>
      <Field label="Função"><select value={u.role} disabled={self} onChange={(e) => setU({ ...u, role: e.target.value as Role })}>{(Object.keys(ROLE_LABEL) as Role[]).map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}</select></Field>
      {u.role === 'entregador' && <Field label="Tipo de entregador"><select value={u.deliverer_type ?? 'funcionario'} onChange={(e) => setU({ ...u, deliverer_type: e.target.value as 'funcionario' | 'autonomo' })}><option value="funcionario">Funcionário</option><option value="autonomo">Autônomo</option></select></Field>}
      {!isNew && <label className="check"><input type="checkbox" checked={u.active !== false} disabled={self} onChange={(e) => setU({ ...u, active: e.target.checked })} />Usuário ativo</label>}
      <button className="btn primary lg" disabled={!u.name || !u.username || (isNew && (u.password?.length ?? 0) < 6)} onClick={async () => {
        const body: Record<string, unknown> = { name: u.name, username: u.username, role: u.role, deliverer_type: u.role === 'entregador' ? u.deliverer_type ?? 'funcionario' : null };
        if (u.password) body.password = u.password;
        if (!isNew) body.active = u.active !== false;
        if (await act(() => (isNew ? post('/users', body) : patch(`/users/${u.id}`, body)), 'Salvo')) { onClose(); onDone(); }
      }}>Salvar</button>
    </Modal>
  );
}
