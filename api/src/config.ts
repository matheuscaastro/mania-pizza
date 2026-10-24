export function corsOrigin(): string[] | boolean {
  const v = process.env.CORS_ORIGIN?.trim();
  if (!v || v === '*') return true;
  return v.split(',').map((s) => s.trim().replace(/\/$/, '')).filter(Boolean);
}

export function jwtSecret(): string {
  const s = process.env.JWT_SECRET;
  if (!s && process.env.NODE_ENV === 'production') throw new Error('JWT_SECRET é obrigatório em produção');
  return s ?? 'dev-secret-troque-em-producao';
}
