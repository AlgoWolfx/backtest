// Zaman dilimleri ve New York saatine göre mum kovaları.
//
// Kurallar (TradingView forex grafikleriyle aynı):
//   - Dakikalık ve 1H mumlar saat başına hizalıdır (NY farkı tam saat olduğu için UTC ile aynı).
//   - 4H mumlar NY saatiyle 01, 05, 09, 13, 17, 21'de başlar.
//   - Günlük mum NY 17:00'de başlar (Pazar 17:00 açılışı Pazartesi mumuna aittir).
//   - Haftalık mum Pazar 17:00 NY'de, aylık mum ayın ilk işlem gününde başlar.

import { nyOffset, toNyLocal, nyLocalToUtc, tradingDay, HOUR, DAY } from '../../shared/nytime.js';

export type TF = '1m' | '2m' | '3m' | '5m' | '15m' | '30m' | '1h' | '4h' | '1D' | '1W' | '1M';

export interface TFInfo {
  id: TF;
  label: string;
  /** Nominal süre (saniye). Gelecek/boşluk tahmini için kullanılır. */
  seconds: number;
  intraday: boolean;
}

export const TIMEFRAMES: TFInfo[] = [
  { id: '1m', label: '1m', seconds: 60, intraday: true },
  { id: '2m', label: '2m', seconds: 120, intraday: true },
  { id: '3m', label: '3m', seconds: 180, intraday: true },
  { id: '5m', label: '5m', seconds: 300, intraday: true },
  { id: '15m', label: '15m', seconds: 900, intraday: true },
  { id: '30m', label: '30m', seconds: 1800, intraday: true },
  { id: '1h', label: '1H', seconds: 3600, intraday: true },
  { id: '4h', label: '4H', seconds: 4 * 3600, intraday: true },
  { id: '1D', label: '1D', seconds: DAY, intraday: false },
  { id: '1W', label: '1W', seconds: 7 * DAY, intraday: false },
  { id: '1M', label: '1M', seconds: 30 * DAY, intraday: false },
];

export const tfInfo = (tf: TF): TFInfo => TIMEFRAMES.find((x) => x.id === tf)!;

const MINUTE_TF: Partial<Record<TF, number>> = { '1m': 60, '2m': 120, '3m': 180, '5m': 300, '15m': 900, '30m': 1800, '1h': 3600 };

/** Ay anahtarı hesaplarken Date nesnesi üretmemek için önbellek. */
let lastDayForMonth = NaN;
let lastMonthKey = 0;
function monthKeyOfDay(day: number): number {
  if (day !== lastDayForMonth) {
    const d = new Date(day * DAY * 1000);
    lastMonthKey = d.getUTCFullYear() * 12 + d.getUTCMonth();
    lastDayForMonth = day;
  }
  return lastMonthKey;
}

/**
 * Bir 1m mumun (UTC başlangıç zamanı t) ait olduğu kova anahtarı.
 * Anahtarlar zamanla birlikte artar; aynı anahtar = aynı mum.
 */
export function bucketKey(tf: TF, t: number): number {
  const sec = MINUTE_TF[tf];
  if (sec) return Math.floor(t / sec);
  switch (tf) {
    case '4h':
      return Math.floor((toNyLocal(t) - HOUR) / (4 * HOUR));
    case '1D':
      return tradingDay(t);
    case '1W':
      return Math.floor((tradingDay(t) + 3) / 7); // Pazartesi başlangıçlı hafta (işlem günü)
    case '1M':
      return monthKeyOfDay(tradingDay(t));
    default:
      throw new Error(tf);
  }
}

/** Kovanın gerçek UTC başlangıcı. */
export function bucketStartUtc(tf: TF, key: number): number {
  const sec = MINUTE_TF[tf];
  if (sec) return key * sec;
  switch (tf) {
    case '4h':
      return nyLocalToUtc(key * 4 * HOUR + HOUR);
    case '1D':
      return nyLocalToUtc(key * DAY - 7 * HOUR);
    case '1W':
      return nyLocalToUtc((key * 7 - 3) * DAY - 7 * HOUR);
    case '1M': {
      const y = Math.floor(key / 12);
      const m = key % 12;
      const firstDay = Date.UTC(y, m, 1) / 1000 / DAY;
      return nyLocalToUtc(firstDay * DAY - 7 * HOUR);
    }
    default:
      throw new Error(tf);
  }
}

/**
 * Grafikte gösterilecek zaman. Grafik kütüphanesi saati UTC gibi gösterdiği için
 * gün içi mumlarda NY yerel saatine kaydırılmış değer, D/W/M mumlarda işlem gününün tarihi verilir.
 */
export function bucketChartTime(tf: TF, key: number): number {
  const sec = MINUTE_TF[tf];
  if (sec) {
    const utc = key * sec;
    return utc + nyOffset(utc);
  }
  switch (tf) {
    case '4h':
      return key * 4 * HOUR + HOUR;
    case '1D':
      return key * DAY;
    case '1W':
      return (key * 7 - 3) * DAY;
    case '1M': {
      const y = Math.floor(key / 12);
      return Date.UTC(y, key % 12, 1) / 1000;
    }
    default:
      throw new Error(tf);
  }
}
