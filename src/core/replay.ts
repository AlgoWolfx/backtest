// Replay zaman hesapları (saf fonksiyonlar).

import { DAY, nyLocalToUtc, toNyLocal } from '../../shared/nytime.js';
import { upperBound, type M1Data } from './data';
import { bucketKey, type TF } from './timeframes';

/** Sık kullanılan New York saatleri (ICT / seans açılışları). */
export const NY_PRESETS: { h: number; m: number; label: string; hint: string }[] = [
  { h: 0, m: 0, label: '00:00', hint: 'Gece yarısı açılışı' },
  { h: 2, m: 0, label: '02:00', hint: 'Londra açılışı / killzone' },
  { h: 7, m: 0, label: '07:00', hint: 'NY killzone' },
  { h: 8, m: 30, label: '08:30', hint: 'NY haber saati' },
  { h: 9, m: 30, label: '09:30', hint: 'NY borsa açılışı' },
  { h: 10, m: 0, label: '10:00', hint: 'NY 10:00' },
  { h: 13, m: 30, label: '13:30', hint: 'NY öğleden sonra' },
  { h: 17, m: 0, label: '17:00', hint: 'Günlük kapanış' },
  { h: 20, m: 0, label: '20:00', hint: 'Asya seansı' },
];

/**
 * replayTime'dan SONRA gelen ilk "NY hh:mm" anı (UTC). Piyasanın kapalı olduğu günler
 * (hafta sonu, tatil, veri boşluğu) atlanır: hedeften sonra 90 dk içinde veri yoksa ertesi güne geçilir.
 * Dönen zamana ilerlenince grafikte o saatten ÖNCEKİ son mum kapanmış olur (ör. 08:30 -> 08:29 mumu).
 */
export function nextNyTime(d: M1Data, after: number, h: number, m: number): number | null {
  const day = Math.floor(toNyLocal(after) / DAY);
  for (let k = 0; k < 21; k++) {
    const target = nyLocalToUtc((day + k) * DAY + h * 3600 + m * 60);
    if (target <= after) continue;
    const i = upperBound(d.t, target - 1); // target'tan itibaren ilk mum
    if (i >= d.n) return null;
    if (d.t[i] - target <= 90 * 60) return target;
  }
  return null;
}

/** Sonraki açıklanmamış 1m mumu içeren tf mumunun sonuna kadar olan zaman (mumu tamamlamak / bir adım). */
export function bucketEndAfter(d: M1Data, after: number, tf: TF): number | null {
  const i = upperBound(d.t, after - 60);
  if (i >= d.n) return null;
  const key = bucketKey(tf, d.t[i]);
  let j = i + 1;
  while (j < d.n && bucketKey(tf, d.t[j]) === key) j++;
  return d.t[j - 1] + 60;
}
