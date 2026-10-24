import { Navigate, NavLink, Route, Routes } from 'react-router-dom';
import { Logo, LoginPage, ROLE_LABEL, Spinner, useAuth } from 'shared';
import { useOutbox } from './outbox';
import Mesas from './pages/Mesas';
import Mesa from './pages/Mesa';
import Pedido from './pages/Pedido';
import Prontos from './pages/Prontos';
import Entregas from './pages/Entregas';

export default function App() {
  const { user, loading, logout } = useAuth();
  const outbox = useOutbox();
  if (loading) return <Spinner />;
  if (!user) return <LoginPage title="Mania de Pizza" subtitle="Garçom e entregas" allowed={['garcom', 'entregador']} />;
  if (!['admin', 'garcom', 'entregador'].includes(user.role)) {
    return (
      <div className="pad center">
        <p>O usuário {user.name} ({ROLE_LABEL[user.role]}) usa o painel de gestão, não este aplicativo.</p>
        <button className="btn" onClick={logout}>Sair</button>
      </div>
    );
  }
  const isWaiter = user.role === 'garcom' || user.role === 'admin';

  return (
    <div className="app">
      <header className="top">
        <div className="row"><Logo size={34} /><b>{user.name}</b></div>
        <button className="btn sm" onClick={logout}>Sair</button>
      </header>
      {outbox.pending.length > 0 && (
        <div className="banner warn">
          {outbox.pending.length} pedido(s) aguardando envio — sem conexão. Reenviando automaticamente…
          <button className="btn sm" onClick={() => outbox.flush()}>Tentar agora</button>
        </div>
      )}
      {outbox.failed.length > 0 && (
        <div className="banner bad">
          {outbox.failed.map((f) => <div key={f.client_id}><b>{f.label}</b> não foi aceito: {f.error}</div>)}
          <button className="btn sm" onClick={outbox.dismissFailed}>Entendi</button>
        </div>
      )}
      <main className="content">
        <Routes>
          {isWaiter && <Route path="/" element={<Mesas />} />}
          {isWaiter && <Route path="/mesa/:id" element={<Mesa />} />}
          {isWaiter && <Route path="/mesa/:id/pedido" element={<Pedido />} />}
          {isWaiter && <Route path="/prontos" element={<Prontos />} />}
          {user.role === 'entregador' && <Route path="/" element={<Entregas />} />}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
      {isWaiter && (
        <nav className="bottom">
          <NavLink to="/" end>Mesas</NavLink>
          <NavLink to="/prontos">Prontos</NavLink>
        </nav>
      )}
    </div>
  );
}
