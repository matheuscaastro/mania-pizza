import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { io, type Socket } from 'socket.io-client';
import { API_URL, ApiError, get, getToken, post, setToken } from './api';
import type { User } from './types';

type AuthCtx = {
  user: User | null;
  loading: boolean;
  login: (username: string, password: string) => Promise<User>;
  logout: () => void;
};
const Ctx = createContext<AuthCtx>(null as unknown as AuthCtx);
export const useAuth = () => useContext(Ctx);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(!!getToken());

  useEffect(() => {
    if (!getToken()) return;
    get<{ user: User }>('/auth/me')
      .then((r) => setUser(r.user))
      .catch((e) => {
        if (!(e instanceof ApiError) || e.status === 401) setToken(null);
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    const onUnauthorized = () => {
      setToken(null);
      setUser(null);
    };
    window.addEventListener('mania:unauthorized', onUnauthorized);
    return () => window.removeEventListener('mania:unauthorized', onUnauthorized);
  }, []);

  const login = useCallback(async (username: string, password: string) => {
    const r = await post<{ token: string; user: User }>('/auth/login', { username, password });
    setToken(r.token);
    setUser(r.user);
    return r.user;
  }, []);
  const logout = useCallback(() => {
    setToken(null);
    setUser(null);
  }, []);

  return <Ctx.Provider value={{ user, loading, login, logout }}>{children}</Ctx.Provider>;
}

let socket: Socket | null = null;
function getSocket(): Socket {
  if (!socket) socket = io(API_URL, { auth: (cb) => cb({ token: getToken() }), transports: ['websocket', 'polling'] });
  return socket;
}

type Evt = 'order:new' | 'order:updated' | 'tables:changed' | 'cash:updated';

/** Executa `fn` quando o servidor avisar de mudanças (e a cada `pollMs` como garantia). */
export function useRealtime(events: Evt[], fn: () => void, pollMs = 30000) {
  const ref = useRef(fn);
  ref.current = fn;
  const key = events.join(',');
  useEffect(() => {
    const s = getSocket();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const run = () => {
      clearTimeout(timer);
      timer = setTimeout(() => ref.current(), 150);
    };
    for (const e of events) s.on(e, run);
    s.on('connect', run);
    const poll = setInterval(() => ref.current(), pollMs);
    const onVisible = () => document.visibilityState === 'visible' && ref.current();
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      for (const e of events) s.off(e, run);
      s.off('connect', run);
      clearInterval(poll);
      clearTimeout(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, pollMs]);
}

/** Carrega dados de uma função async, com estado de carregando/erro e recarga manual. */
export function useLoad<T>(loader: () => Promise<T>, deps: unknown[] = []) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const ref = useRef(loader);
  ref.current = loader;
  const reload = useCallback(async () => {
    try {
      setData(await ref.current());
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro ao carregar');
    } finally {
      setLoading(false);
    }
  }, []);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => void reload(), deps);
  return { data, error, loading, reload, setData };
}

/** Relógio que atualiza a cada 30s (para "há X min"). */
export function useNow(ms = 30000) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(t);
  }, [ms]);
  return now;
}
