import { describe, expect, it } from 'vitest';
import { clampOffset } from '../useWindow';
import { hasReview, mistakeBreakdown, MISTAKE_TAGS, NO_MISTAKE, reviewSummary } from './review';
import type { Trade, TradeReview } from './trading';

const rv = (p: Partial<TradeReview> = {}): TradeReview => ({ reason: '', mistakes: [], mistakeText: '', lesson: '', reviewedAt: 1, ...p });
const tr = (id: string, pnl: number, r: number, review?: TradeReview): Trade =>
  ({ id, symbol: 'EURUSD', side: 'long', status: 'closed', orderType: 'market', createdAt: 0, closedAt: Number(id.slice(1)), entry: 1, sl: 0.99, tp: 1.02, initialSl: 0.99, lots: 1, pnl, r, result: pnl > 0 ? 'win' : pnl < 0 ? 'loss' : 'be', review }) as Trade;

describe('hasReview', () => {
  it('boş / atlanmış kayıt değerlendirme sayılmaz', () => {
    expect(hasReview(tr('t1', 1, 1))).toBe(false);
    expect(hasReview(tr('t2', 1, 1, rv()))).toBe(false);
    expect(hasReview(tr('t3', 1, 1, rv({ reason: '  ' })))).toBe(false);
  });
  it('herhangi bir içerik sayılır', () => {
    expect(hasReview(tr('t1', 1, 1, rv({ lesson: 'x' })))).toBe(true);
    expect(hasReview(tr('t2', 1, 1, rv({ mistakes: [NO_MISTAKE] })))).toBe(true);
    expect(hasReview(tr('t3', 1, 1, rv({ rating: 3 })))).toBe(true);
  });
});

describe('mistakeBreakdown', () => {
  const trades = [
    tr('t1', -100, -1, rv({ mistakes: ['FOMO', 'Erken giriş'] })),
    tr('t2', -50, -0.5, rv({ mistakes: ['FOMO'] })),
    tr('t3', 200, 2, rv({ mistakes: [NO_MISTAKE] })),
    tr('t4', 30, 0.3), // değerlendirilmemiş
  ];
  const rows = mistakeBreakdown(trades);

  it('işlem birden fazla etikete sayılır, toplamlar doğru', () => {
    const fomo = rows.find((r) => r.key === 'FOMO')!;
    expect(fomo.trades).toBe(2);
    expect(fomo.net).toBe(-150);
    expect(fomo.totalR).toBeCloseTo(-1.5);
    expect(fomo.winRate).toBe(0);
    expect(rows.find((r) => r.key === 'Erken giriş')!.trades).toBe(1);
  });
  it('değerlendirilmemiş işlem sayılmaz; "Hata yok" en sonda, en çok zarar ettiren başta', () => {
    expect(rows.map((r) => r.key)).toEqual(['FOMO', 'Erken giriş', NO_MISTAKE]);
  });
  it('etiket listesi tekrarsız ve "Hata yok" içermez', () => {
    expect(new Set(MISTAKE_TAGS).size).toBe(MISTAKE_TAGS.length);
    expect(MISTAKE_TAGS as readonly string[]).not.toContain(NO_MISTAKE);
  });
});

describe('reviewSummary', () => {
  it('sayar ve puan ortalamasını yalnızca puan verilenlerden alır', () => {
    const s = reviewSummary([tr('t1', 1, 1, rv({ rating: 4 })), tr('t2', 1, 1, rv({ rating: 2, lesson: 'a' })), tr('t3', 1, 1, rv({ lesson: 'b' })), tr('t4', 1, 1)]);
    expect(s).toEqual({ closed: 4, reviewed: 3, avgRating: 3 });
  });
  it('puan yoksa null', () => {
    expect(reviewSummary([tr('t1', 1, 1)]).avgRating).toBeNull();
  });
});

describe('clampOffset (taşınan pencere ekranda kalır)', () => {
  const base = { left: 100, top: 50, width: 400 };
  it('sınır içindeyse değişmez', () => {
    expect(clampOffset(30, 20, base, 1200, 800)).toEqual({ x: 30, y: 20 });
  });
  it('başlık ekranın dışına çıkamaz', () => {
    const c = clampOffset(-5000, -5000, base, 1200, 800);
    expect(100 + c.x + 400).toBeGreaterThanOrEqual(80); // sağ kenar en az 80px görünür
    expect(50 + c.y).toBe(0); // üstten taşmaz
    const d = clampOffset(5000, 5000, base, 1200, 800);
    expect(100 + d.x).toBe(1200 - 80);
    expect(50 + d.y).toBe(800 - 40);
  });
});
