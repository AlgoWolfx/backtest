// İşlem sonrası değerlendirme: hata etiketleri ve Performans sayfası için toplamlar (saf fonksiyonlar).

import { closedTrades, type BreakdownRow } from './stats';
import type { Trade } from './trading';

/** Hızlı seçilen hata etiketleri (serbest metinle birlikte kullanılır). */
export const MISTAKE_TAGS = [
  'Erken giriş',
  'Geç giriş',
  'Setup yoktu / plansız',
  'FOMO',
  'İntikam işlemi',
  'Karşı trend',
  'Stop çok dar',
  'Stop çok geniş',
  'Stopu oynattım',
  'Erken çıktım',
  'Çok geç çıktım',
  'Aşırı risk / lot',
  'Haber / seans dışı',
] as const;

/** Hata yoksa seçilen etiket: işlem kurala uygundu. */
export const NO_MISTAKE = 'Hata yok';

/** İşleme yazılmış değerlendirme içeriği var mı (yalnızca atlanmış / boş kayıt değil). */
export function hasReview(t: Trade): boolean {
  const r = t.review;
  if (!r) return false;
  return !!(r.reason.trim() || r.mistakeText.trim() || r.lesson.trim() || r.mistakes.length || r.rating);
}

/**
 * Hata etiketlerine göre döküm: etiket başına işlem sayısı, kazanma oranı, toplam R ve net K/Z.
 * Bir işlem birden fazla etikete sayılır. Çok işlem yapılan (maliyetli) hatalar üstte.
 */
export function mistakeBreakdown(trades: Trade[]): BreakdownRow[] {
  const groups = new Map<string, Trade[]>();
  for (const t of closedTrades(trades)) {
    for (const tag of new Set(t.review?.mistakes ?? [])) {
      const g = groups.get(tag);
      if (g) g.push(t);
      else groups.set(tag, [t]);
    }
  }
  const rows: BreakdownRow[] = [...groups.entries()].map(([key, g]) => ({
    key,
    trades: g.length,
    winRate: (g.filter((t) => t.result === 'win').length / g.length) * 100,
    totalR: g.reduce((a, t) => a + (t.r ?? 0), 0),
    net: g.reduce((a, t) => a + (t.pnl ?? 0), 0),
  }));
  // "Hata yok" en sona; diğerleri en çok zarar ettirenden başlayarak
  return rows.sort((a, b) => (a.key === NO_MISTAKE ? 1 : 0) - (b.key === NO_MISTAKE ? 1 : 0) || a.net - b.net);
}

export interface ReviewSummary {
  closed: number;
  reviewed: number;
  /** Puan verilen işlemlerin ortalaması (1-5); hiç yoksa null */
  avgRating: number | null;
}

export function reviewSummary(trades: Trade[]): ReviewSummary {
  const closed = closedTrades(trades);
  const rated = closed.filter((t) => t.review?.rating);
  return {
    closed: closed.length,
    reviewed: closed.filter(hasReview).length,
    avgRating: rated.length ? rated.reduce((a, t) => a + t.review!.rating!, 0) / rated.length : null,
  };
}
