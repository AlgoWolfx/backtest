// Çizim istatistikleri ve etiketleri (saf, testli): trend çizgisi istatistik kutusu, Fibonacci seviye yazıları.

import type { Fib, TrendLine } from './types';

export interface TrendStatsInput {
  /** a'dan b'ye fiyat farkı ve başlangıç fiyatı */
  dp: number;
  p0: number;
  /** a'dan b'ye mum sayısı (işaretli) ve saniye farkı */
  bars: number;
  secs: number;
  /** Ekran açısı (derece, yukarı pozitif) */
  angleDeg: number;
  /** Fiyatı / mesafeyi biçimleyen işlevler (sembole göre) */
  fmtPrice: (p: number) => string;
  fmtDistance: (dp: number) => string;
  fmtDuration: (secs: number) => string;
}

const on = (v: boolean | undefined, def: boolean) => v ?? def;

/**
 * İstatistik kutusunun satırları. Varsayılanlar (TradingView): fiyat aralığı, % değişim ve mum sayısı açık;
 * süre, mesafe ve açı kapalı. Hiçbir kalem seçili değilse boş döner.
 */
export function trendStatsLines(d: Pick<TrendLine, 'statPrice' | 'statPct' | 'statBars' | 'statTime' | 'statDist' | 'statAngle'>, i: TrendStatsInput): string[] {
  const l1: string[] = [];
  const sign = i.dp >= 0 ? '+' : '-';
  const price = on(d.statPrice, true);
  const pct = on(d.statPct, true);
  if (price || pct) {
    const parts: string[] = [];
    if (price) parts.push(`${sign}${i.fmtPrice(Math.abs(i.dp))}`);
    if (pct) parts.push(i.p0 ? `(${sign}${Math.abs((i.dp / i.p0) * 100).toFixed(2)}%)` : '(—)');
    l1.push(parts.join(' '));
  }
  if (on(d.statBars, true)) l1.push(`${Math.abs(i.bars)} mum`);
  if (on(d.statTime, false)) l1.push(i.fmtDuration(i.secs));
  const l2: string[] = [];
  if (on(d.statDist, false)) l2.push(`Mesafe: ${i.fmtDistance(i.dp)}`);
  if (on(d.statAngle, false)) l2.push(`Açı: ${i.angleDeg.toFixed(1)}°`);
  return [l1.join(' · '), l2.join(' · ')].filter(Boolean);
}

/** Fibonacci seviye değerleri: ters çevirme varsa 0 ↔ 1 yer değiştirir. */
export function fibValue(v: number, reverse: boolean | undefined): number {
  return reverse ? 1 - v : v;
}

/** Seviye yazısı: "0.618 (1.12345)"; seviye ve/veya fiyat gizlenebilir. */
export function fibLabel(v: number, price: string, d: Pick<Fib, 'showLevels' | 'showPrices'>): string {
  const lv = d.showLevels !== false;
  const pr = d.showPrices !== false;
  const lvText = `${+v.toFixed(3)}`;
  if (lv && pr) return `${lvText} (${price})`;
  if (lv) return lvText;
  if (pr) return price;
  return '';
}
