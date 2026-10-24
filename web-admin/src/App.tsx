import { Navigate, NavLink, Route, Routes } from 'react-router-dom';
import { Logo, LoginPage, ROLE_LABEL, Spinner, useAuth, type Role } from 'shared';
import Dashboard from './pages/Dashboard';
import Mesas from './pages/Mesas';
import Pedidos from './pages/Pedidos';
import NovoPedido from './pages/NovoPedido';
import Caixa from './pages/Caixa';
import Entregas from './pages/Entregas';
import Cardapio from './pages/Cardapio';
import Usuarios from './pages/Usuarios';
import Config from './pages/Config';
import Relatorios from './pages/Relatorios';
import Cozinha from './pages/Cozinha';

const NAV: { to: string; label: string; roles: Role[] }[] = [
  { to: '/', label: 'Painel', roles: ['caixa'] },
  { to: '/mesas', label: 'Mesas', roles: ['caixa'] },
  { to: '/pedidos', label: 'Pedidos', roles: ['caixa'] },
  { to: '/pedidos/novo', label: '+ Novo pedido', roles: ['caixa'] },
  { to: '/entregas', label: 'Entregas', roles: ['caixa'] },
  { to: '/caixa', label: 'Caixa', roles: ['caixa'] },
  { to: '/cardapio', label: 'Cardápio', roles: ['caixa'] },
  { to: '/relatorios', label: 'Relatórios', roles: [] },
  { to: '/usuarios', label: 'Usuários', roles: [] },
  { to: '/config', label: 'Configurações', roles: [] },
  { to: '/cozinha', label: 'Tela da cozinha', roles: ['caixa', 'cozinha'] },
];

export default function App() {
  const { user, loading, logout } = useAuth();
  if (loading) return <Spinner />;
  if (!user) return <LoginPage title="Mania de Pizza" subtitle="Painel de gestão" allowed={['caixa', 'cozinha']} />;
  if (!['admin', 'caixa', 'cozinha'].includes(user.role)) {
    return (
      <div className="pad center">
        <p>Seu usuário ({ROLE_LABEL[user.role]}) usa o aplicativo do garçom/entregador.</p>
        <button className="btn" onClick={logout}>Sair</button>
      </div>
    );
  }
  const items = NAV.filter((n) => user.role === 'admin' || n.roles.includes(user.role));
  const home = user.role === 'cozinha' ? '/cozinha' : '/';

  return (
    <Routes>
      <Route path="/cozinha" element={<Cozinha />} />
      <Route
        path="*"
        element={
          user.role === 'cozinha' ? (
            <Navigate to="/cozinha" replace />
          ) : (
            <div className="shell">
              <aside className="side">
                <div className="brand">
                  <Logo size={40} />
                  <span>Mania de Pizza</span>
                </div>
                <nav>
                  {items.map((n) => (
                    <NavLink key={n.to} to={n.to} end={n.to === '/' || n.to === '/pedidos'} className={({ isActive }) => (isActive ? 'on' : '')} target={n.to === '/cozinha' ? '_blank' : undefined}>
                      {n.label}
                    </NavLink>
                  ))}
                </nav>
                <div className="who">
                  <div>
                    <b>{user.name}</b>
                    <small>{ROLE_LABEL[user.role]}</small>
                  </div>
                  <button className="btn sm" onClick={logout}>Sair</button>
                </div>
              </aside>
              <main className="main">
                <Routes>
                  <Route path="/" element={<Dashboard />} />
                  <Route path="/mesas" element={<Mesas />} />
                  <Route path="/pedidos" element={<Pedidos />} />
                  <Route path="/pedidos/novo" element={<NovoPedido />} />
                  <Route path="/entregas" element={<Entregas />} />
                  <Route path="/caixa" element={<Caixa />} />
                  <Route path="/cardapio" element={<Cardapio />} />
                  {user.role === 'admin' && <Route path="/relatorios" element={<Relatorios />} />}
                  {user.role === 'admin' && <Route path="/usuarios" element={<Usuarios />} />}
                  {user.role === 'admin' && <Route path="/config" element={<Config />} />}
                  <Route path="*" element={<Navigate to={home} replace />} />
                </Routes>
              </main>
            </div>
          )
        }
      />
    </Routes>
  );
}
