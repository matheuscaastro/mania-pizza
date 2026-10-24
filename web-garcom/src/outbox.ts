import { useCallback, useEffect, useState } from 'react';
import { ApiError, get, post } from 'shared';

const KEY = 'mania.outbox';
const FAILED = 'mania.outbox.failed';

export interface Pending {
  client_id: string;
  payload: Record<string, any>;
  label: string;
  at: number;
}
export interface Failed extends Pending {
  error: string;
}

const read = <T,>(k: string): T[] => {
  try {
    return JSON.parse(localStorage.getItem(k) ?? '[]');
  } catch {
    return [];
  }
};
const write = (k: string, v: unknown) => {
  try {
    localStorage.setItem(k, JSON.stringify(v));
  } catch {
    /* sem armazenamento */
  }
  window.dispatchEvent(new Event('mania:outbox'));
};

export const uid = () => (typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`);

/** Envia o pedido; sem internet, guarda na fila (o app reenvia sozinho e o servidor ignora duplicados). */
export async function submitOrder(payload: Record<string, any>, label: string): Promise<'sent' | 'queued'> {
  const body = { ...payload, client_id: payload.client_id ?? uid() };
  try {
    await post('/orders', body);
    return 'sent';
  } catch (e) {
    if (e instanceof ApiError && e.offline) {
      write(KEY, [...read<Pending>(KEY), { client_id: body.client_id, payload: body, label, at: Date.now() }]);
      return 'queued';
    }
    throw e;
  }
}

let flushing = false;
export async function flushOutbox(): Promise<number> {
  if (flushing) return 0;
  flushing = true;
  let sent = 0;
  try {
    for (const p of read<Pending>(KEY)) {
      try {
        await post('/orders', p.payload);
        sent++;
        write(KEY, read<Pending>(KEY).filter((x) => x.client_id !== p.client_id));
      } catch (e) {
        if (e instanceof ApiError && (e.offline || e.status === 401 || e.status >= 500)) break;
        // pedido recusado pelo servidor (ex.: item indisponível): sai da fila e avisa
        write(KEY, read<Pending>(KEY).filter((x) => x.client_id !== p.client_id));
        write(FAILED, [...read<Failed>(FAILED), { ...p, error: e instanceof Error ? e.message : 'Erro' }]);
      }
    }
  } finally {
    flushing = false;
  }
  return sent;
}

export function useOutbox() {
  const [state, setState] = useState({ pending: read<Pending>(KEY), failed: read<Failed>(FAILED) });
  const refresh = useCallback(() => setState({ pending: read<Pending>(KEY), failed: read<Failed>(FAILED) }), []);
  useEffect(() => {
    window.addEventListener('mania:outbox', refresh);
    const run = () => void flushOutbox();
    window.addEventListener('online', run);
    const t = setInterval(run, 15000);
    run();
    return () => {
      window.removeEventListener('mania:outbox', refresh);
      window.removeEventListener('online', run);
      clearInterval(t);
    };
  }, [refresh]);
  return {
    ...state,
    flush: flushOutbox,
    dismissFailed: () => write(FAILED, []),
  };
}

/** GET com cópia local: sem internet, usa a última resposta guardada (cardápio e mesas). */
export async function cachedGet<T>(key: string, path: string): Promise<{ data: T; stale: boolean }> {
  try {
    const data = await get<T>(path);
    try {
      localStorage.setItem('mania.cache.' + key, JSON.stringify(data));
    } catch {
      /* ok */
    }
    return { data, stale: false };
  } catch (e) {
    if (e instanceof ApiError && e.offline) {
      const raw = localStorage.getItem('mania.cache.' + key);
      if (raw) return { data: JSON.parse(raw) as T, stale: true };
    }
    throw e;
  }
}
