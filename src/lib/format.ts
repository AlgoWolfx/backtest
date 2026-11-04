import type { SymbolSpec } from '../../shared/symbols.js';
import { nyOffset, toNyLocal } from '../../shared/nytime.js';

const DAYS = ['Paz', 'Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt'];
const MONTHS = ['Oca', 'Şub', 'Mar', 'Nis', 'May', 'Haz', 'Tem', 'Ağu', 'Eyl', 'Eki', 'Kas', 'Ara'];

export const pad = (n: number) => String(n).padStart(2, '0');

export function fmtPrice(p: number, spec: SymbolSpec): string {
  return p.toFixed(spec.digits);
}

/** "Kaydırılmış" saniyeyi (UTC getter'larıyla okunacak) biçimlendirir. */
export function fmtShifted(s: number, withTime = true): string {
  const d = new Date(s * 1000);
  const date = `${DAYS[d.getUTCDay()]} ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} '${String(d.getUTCFullYear()).slice(2)}`;
  return withTime ? `${date} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}` : date;
}

/** Gerçek UTC zamanı NY saatine göre biçimlendirir. */
export function fmtNy(utc: number, withTime = true): string {
  return fmtShifted(toNyLocal(utc), withTime);
}

export function fmtNyShort(utc: number): string {
  const d = new Date(toNyLocal(utc) * 1000);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
}

export function nyOffsetLabel(utc: number): string {
  return `UTC${nyOffset(utc) / 3600}`;
}

export function fmtMoney(v: number, sign = false): string {
  const s = Math.abs(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return `${v < 0 ? '-' : sign && v > 0 ? '+' : ''}$${s}`;
}

export function fmtR(r: number | null | undefined): string {
  if (r == null) return '—';
  return `${r > 0 ? '+' : ''}${r.toFixed(2)}R`;
}

export function fmtDistance(d: number, spec: SymbolSpec): string {
  const v = Math.abs(d) / spec.pip;
  return `${v.toFixed(v >= 100 ? 0 : 1)} ${spec.pipLabel}`;
}

/** İşlem kapanış nedeni etiketi. */
export function reasonLabel(r: string | undefined): string {
  return r === 'tp' ? 'TP' : r === 'sl' ? 'SL' : r === 'breach' ? 'Limit ihlali' : r === 'manual' ? 'Manuel' : '—';
}

/** Mum içi sıra belirsizliği nedeniyle yapılan varsayımların kullanıcıya açıklaması. */
export function flagLabel(f: string): string {
  return f === 'sl-tp-same-bar'
    ? 'Aynı 1m mumda SL ve TP ikisi de görüldü; sıra bilinemez, SL-önce varsayıldı.'
    : f === 'fill-bar-tp-unknown'
      ? 'Emir mum içinde doldu ve aynı mumda TP seviyesi de görüldü; sıra bilinemez, TP sayılmadı.'
      : f;
}

export { MONTHS, DAYS };
