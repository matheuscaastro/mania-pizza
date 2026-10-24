const TOKEN_KEY = 'mania.token';

export const API_URL: string = ((import.meta as any).env?.VITE_API_URL ?? 'http://localhost:3000').replace(/\/$/, '');

export const getToken = () => {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
};
export const setToken = (t: string | null) => {
  try {
    if (t) localStorage.setItem(TOKEN_KEY, t);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* sem armazenamento */
  }
};

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
  /** Sem internet / servidor fora do ar. */
  get offline() {
    return this.status === 0;
  }
}

export async function api<T = any>(method: 'GET' | 'POST' | 'PUT' | 'PATCH', path: string, body?: unknown): Promise<T> {
  const token = getToken();
  let res: Response;
  try {
    res = await fetch(`${API_URL}/api${path}`, {
      method,
      headers: { ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ApiError(0, 'Sem conexão com o servidor.');
  }
  let data: any = null;
  try {
    data = await res.json();
  } catch {
    /* corpo vazio */
  }
  if (!res.ok) {
    if (res.status === 401 && token) window.dispatchEvent(new Event('mania:unauthorized'));
    throw new ApiError(res.status, data?.error ?? `Erro ${res.status}`);
  }
  return data as T;
}

export const get = <T = any>(p: string) => api<T>('GET', p);
export const post = <T = any>(p: string, b?: unknown) => api<T>('POST', p, b ?? {});
export const patch = <T = any>(p: string, b: unknown) => api<T>('PATCH', p, b);
export const put = <T = any>(p: string, b: unknown) => api<T>('PUT', p, b);
