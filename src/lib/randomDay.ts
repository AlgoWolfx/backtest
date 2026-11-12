// "Rastgele" tarih: aralık seçmeden backtest için rastgele bir işlem günü (NY). Saat kullanıcının yazdığıdır.

import { nyLocalToUtc, toNyLocal } from '../../shared/nytime.js';

const DAY = 86400;
/** Piyasanın kapalı / verinin çok ince olduğu günler (AA-GG). */
const CLOSED = new Set(['12-24', '12-25', '12-26', '12-31', '01-01']);

/**
 * from..to (UTC sn) aralığında, saati `time` (NY, SS:DD) olan rastgele bir hafta içi gün döndürür (YYYY-AA-GG).
 * minFrom: grafikte geçmiş görünsün diye başlangıçtan en az bu kadar sonra (varsayılan 30 gün).
 * Uygun gün yoksa null.
 */
export function randomTradingDay(from: number, to: number, time: string, rand: () => number = Math.random, minFrom = 30 * DAY): string | null {
  const lo = Math.min(from + minFrom, to);
  if (!(to > lo)) return null;
  for (let i = 0; i < 500; i++) {
    const date = new Date(toNyLocal(Math.floor(lo + rand() * (to - lo))) * 1000).toISOString().slice(0, 10);
    const [y, m, d] = date.split('-').map(Number);
    const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay(); // 0 Pazar, 6 Cumartesi
    if (dow === 0 || dow === 6 || CLOSED.has(date.slice(5))) continue;
    const hm = time.match(/^(\d{1,2}):(\d{2})$/);
    const t = hm ? nyLocalToUtc(Date.UTC(y, m - 1, d, +hm[1], +hm[2]) / 1000) : null;
    if (t != null && t > lo && t < to) return date;
  }
  return null;
}
