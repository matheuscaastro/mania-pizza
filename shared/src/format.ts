import type { OrderStatus, OrderType, PayMethod, Role, TableStatus } from './types';

const fmt = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
export const brl = (cents: number | null | undefined) => fmt.format((cents ?? 0) / 100);

/** "12,50" / "12.5" / "1.250,00" → centavos. Retorna null se inválido. */
export function parseBRL(text: string): number | null {
  const t = text.trim().replace(/[R$\s]/g, '');
  if (!t) return null;
  const norm = t.includes(',') ? t.replace(/\./g, '').replace(',', '.') : t;
  const n = Number(norm);
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) : null;
}

/** Texto para preencher um input de valor a partir de centavos. */
export const centsToInput = (c: number | null | undefined) => (c == null ? '' : (c / 100).toFixed(2).replace('.', ','));

export const time = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' }) : '—';
export const dateTime = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' }) : '—';

export function minutesSince(iso: string | null | undefined, now = Date.now()): number {
  return iso ? Math.max(0, Math.floor((now - new Date(iso).getTime()) / 60000)) : 0;
}

export function formatPhone(p: string | null | undefined): string {
  const d = (p ?? '').replace(/\D/g, '');
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return p ?? '';
}

export const STATUS_LABEL: Record<OrderStatus, string> = {
  novo: 'Novo',
  em_preparo: 'Em preparo',
  pronto: 'Pronto',
  em_rota: 'Em rota',
  entregue: 'Entregue',
  cancelado: 'Cancelado',
};
export const TYPE_LABEL: Record<OrderType, string> = { mesa: 'Mesa', balcao: 'Balcão', entrega: 'Entrega' };
export const METHOD_LABEL: Record<PayMethod, string> = { dinheiro: 'Dinheiro', debito: 'Débito', credito: 'Crédito', pix: 'Pix' };
export const TABLE_STATUS_LABEL: Record<TableStatus, string> = { livre: 'Livre', ocupada: 'Ocupada', aguardando_conta: 'Pediu a conta', reservada: 'Reservada' };
export const ROLE_LABEL: Record<Role, string> = { admin: 'Administrador', caixa: 'Caixa', garcom: 'Garçom', entregador: 'Entregador', cozinha: 'Cozinha' };

/** Descrição de um item: "Pizza GG · meio Mussarela / meio Calabresa". */
export function itemTitle(i: { name: string; size: string | null; half_name: string | null }): string {
  if (i.half_name) return `Meia ${i.name} + meia ${i.half_name}${i.size ? ` (${i.size})` : ''}`;
  return i.size ? `${i.name} (${i.size})` : i.name;
}
