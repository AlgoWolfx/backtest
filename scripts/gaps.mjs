// Veri boşluğu tespiti: tüm kaynaklar aynı kuralı kullanır.

import { toNyLocal, HOUR } from '../shared/nytime.js';

/**
 * Piyasanın normalde kapalı olduğu bir aralık mı?
 *   - hafta sonu: Cuma akşamı -> Pazar akşamı NY
 *   - günlük ara: NY 15:00-17:05 arasında başlayıp en fazla 5 saat süren (endeks/metal/DXY araları)
 * a: son mumun başlangıcı, b: sonraki mumun başlangıcı (UTC)
 */
export function isNormalClosure(a, b) {
  const la = new Date(toNyLocal(a) * 1000);
  const lb = new Date(toNyLocal(b) * 1000);
  const dowA = la.getUTCDay();
  const dowB = lb.getUTCDay();
  if ((dowA === 5 || dowA === 6) && (dowB === 0 || dowB === 1) && b - a < 70 * HOUR) return true;
  const hm = la.getUTCHours() * 60 + la.getUTCMinutes();
  return hm >= 15 * 60 && hm <= 17 * 60 + 5 && b - a <= 5 * HOUR;
}

/** Normal işlem saatleri içinde 30 dakikadan uzun boşluklar (tatiller dahil). */
export function findGaps(t, k) {
  const gaps = [];
  const missingHoursByYear = {};
  for (let i = 1; i < k; i++) {
    const d = t[i] - t[i - 1];
    if (d > 30 * 60 && !isNormalClosure(t[i - 1], t[i])) {
      const minutes = Math.round(d / 60) - 1;
      gaps.push({ from: t[i - 1] + 60, to: t[i], minutes });
      const y = new Date(toNyLocal(t[i - 1]) * 1000).getUTCFullYear();
      missingHoursByYear[y] = Math.round(((missingHoursByYear[y] || 0) + minutes / 60) * 10) / 10;
    }
  }
  return { gaps, missingHoursByYear };
}

/** Boşlukların dokunduğu UTC günleri (Cumartesi hariç); Dukascopy'den bu günler istenir. */
export function gapDays(gaps) {
  const days = new Set();
  for (const g of gaps) {
    for (let d = g.from - (g.from % 86400); d < g.to; d += 86400) {
      if (new Date(d * 1000).getUTCDay() !== 6) days.add(new Date(d * 1000).toISOString().slice(0, 10));
    }
  }
  return [...days].sort();
}

