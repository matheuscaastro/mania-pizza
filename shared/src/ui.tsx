import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { useAuth } from './hooks';
import { centsToInput, parseBRL, STATUS_LABEL } from './format';
import type { OrderStatus, Role } from './types';

/* ---------- avisos ---------- */
export function toast(message: string, kind: 'ok' | 'erro' = 'ok') {
  window.dispatchEvent(new CustomEvent('mania:toast', { detail: { message, kind } }));
}

export function ToastHost() {
  const [items, setItems] = useState<{ id: number; message: string; kind: string }[]>([]);
  useEffect(() => {
    const on = (e: Event) => {
      const d = (e as CustomEvent).detail;
      const id = Math.random();
      setItems((l) => [...l, { id, ...d }]);
      setTimeout(() => setItems((l) => l.filter((x) => x.id !== id)), 4500);
    };
    window.addEventListener('mania:toast', on);
    return () => window.removeEventListener('mania:toast', on);
  }, []);
  return (
    <div className="toasts" role="status" aria-live="polite">
      {items.map((t) => (
        <div key={t.id} className={`toast ${t.kind}`}>
          {t.message}
        </div>
      ))}
    </div>
  );
}

/** Executa uma ação e mostra o erro como aviso. Retorna o resultado ou undefined se falhou. */
export async function act<T>(fn: () => Promise<T>, okMessage?: string): Promise<T | undefined> {
  try {
    const r = await fn();
    if (okMessage) toast(okMessage);
    return r;
  } catch (e) {
    toast(e instanceof Error ? e.message : 'Algo deu errado', 'erro');
    return undefined;
  }
}

/* ---------- peças ---------- */
export function Modal({ title, onClose, children, wide }: { title: string; onClose: () => void; children: ReactNode; wide?: boolean }) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [onClose]);
  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`modal ${wide ? 'wide' : ''}`} role="dialog" aria-modal="true" aria-label={title}>
        <div className="modal-head">
          <h2>{title}</h2>
          <button className="btn ghost sm" onClick={onClose} aria-label="Fechar">
            ✕
          </button>
        </div>
        <div className="modal-body">{children}</div>
      </div>
    </div>
  );
}

export function StatusChip({ status }: { status: OrderStatus }) {
  return <span className={`chip st-${status}`}>{STATUS_LABEL[status]}</span>;
}

export function Spinner({ label = 'Carregando…' }: { label?: string }) {
  return <div className="muted center pad">{label}</div>;
}

export function ErrorBox({ message, retry }: { message: string; retry?: () => void }) {
  return (
    <div className="card error-box">
      <p>{message}</p>
      {retry && (
        <button className="btn" onClick={retry}>
          Tentar de novo
        </button>
      )}
    </div>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="empty">{children}</div>;
}

/** Campo de valor em reais; guarda centavos. */
export function MoneyInput({ value, onChange, placeholder = '0,00', autoFocus, id }: { value: number | null; onChange: (c: number | null) => void; placeholder?: string; autoFocus?: boolean; id?: string }) {
  const [text, setText] = useState(centsToInput(value));
  useEffect(() => {
    if (parseBRL(text) !== value) setText(centsToInput(value));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);
  return (
    <div className="money">
      <span>R$</span>
      <input
        id={id}
        inputMode="decimal"
        autoFocus={autoFocus}
        value={text}
        placeholder={placeholder}
        onChange={(e) => {
          setText(e.target.value);
          onChange(e.target.value.trim() ? parseBRL(e.target.value) : null);
        }}
      />
    </div>
  );
}

export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
      {hint && <small className="muted">{hint}</small>}
    </label>
  );
}

export function Logo({ size = 44 }: { size?: number }) {
  return <img src="/logo.jpg" alt="Mania de Pizza" width={size} height={size} className="logo" />;
}

/* ---------- login ---------- */
export function LoginPage({ title, subtitle, allowed }: { title: string; subtitle: string; allowed: Role[] }) {
  const { login, logout } = useAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const u = await login(username, password);
      if (u.role !== 'admin' && !allowed.includes(u.role)) {
        logout();
        setError('Este usuário não tem acesso a este aplicativo.');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível entrar.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="login-wrap">
      <form className="card login" onSubmit={submit}>
        <Logo size={88} />
        <h1>{title}</h1>
        <p className="muted">{subtitle}</p>
        <Field label="Usuário">
          <input value={username} onChange={(e) => setUsername(e.target.value)} autoCapitalize="none" autoComplete="username" autoFocus />
        </Field>
        <Field label="Senha">
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" />
        </Field>
        {error && <p className="err">{error}</p>}
        <button className="btn primary lg" disabled={busy || !username || !password}>
          {busy ? 'Entrando…' : 'Entrar'}
        </button>
      </form>
    </div>
  );
}
