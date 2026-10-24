import type { FastifyReply, FastifyRequest } from 'fastify';
import { query } from './db.js';
import { HttpError } from './errors.js';

export type Role = 'admin' | 'caixa' | 'garcom' | 'entregador' | 'cozinha';
export type AuthUser = { id: number; role: Role; name: string };

declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: AuthUser;
    user: AuthUser;
  }
}

/** Exige login e um dos papéis informados (admin sempre pode). Sem papéis: somente admin. */
export function requireRole(...roles: Role[]) {
  return guard(roles);
}

/** Qualquer usuário logado e ativo. */
export function requireAuth() {
  return guard(null);
}

function guard(roles: Role[] | null) {
  return async (req: FastifyRequest, _reply: FastifyReply) => {
    try {
      await req.jwtVerify();
    } catch {
      throw new HttpError(401, 'Sessão expirada. Entre novamente.');
    }
    const rows = await query('select active, role, name from users where id=$1', [req.user.id]);
    if (!rows[0] || !rows[0].active) throw new HttpError(401, 'Usuário inativo.');
    const user: AuthUser = { id: req.user.id, role: rows[0].role, name: rows[0].name };
    req.user = user;
    if (roles && user.role !== 'admin' && !roles.includes(user.role)) {
      throw new HttpError(403, 'Sem permissão para esta ação.');
    }
  };
}

export function idParam(req: FastifyRequest, name = 'id'): number {
  const id = Number((req.params as Record<string, string>)[name]);
  if (!Number.isInteger(id) || id <= 0) throw new HttpError(400, 'ID inválido.');
  return id;
}
