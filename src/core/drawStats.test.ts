import { describe, expect, it } from 'vitest';
import { fibLabel, fibValue, trendStatsLines, type TrendStatsInput } from './drawStats';

const base: TrendStatsInput = {
  dp: 0.002,
  p0: 1.1,
  bars: 12,
  secs: 3 * 3600,
  angleDeg: 14.04,
  fmtPrice: (p) => p.toFixed(5),
  fmtDistance: (dp) => `${(dp / 0.0001).toFixed(1)} pip`,
  fmtDuration: (s) => `${s / 3600}sa`,
};

describe('trend çizgisi istatistikleri', () => {
  it('varsayılan: fiyat farkı, % değişim ve mum sayısı', () => {
    expect(trendStatsLines({}, base)).toEqual(['+0.00200 (+0.18%) · 12 mum']);
  });

  it('kalemler tek tek açılıp kapanır; süre, mesafe ve açı ikinci satıra/ilk satıra girer', () => {
    const all = trendStatsLines({ statTime: true, statDist: true, statAngle: true }, base);
    expect(all).toEqual(['+0.00200 (+0.18%) · 12 mum · 3sa', 'Mesafe: 20.0 pip · Açı: 14.0°']);
    expect(trendStatsLines({ statPrice: false, statPct: false, statBars: false }, base)).toEqual([]);
    expect(trendStatsLines({ statPrice: false, statBars: false }, base)).toEqual(['(+0.18%)']);
  });

  it('negatif hareket işaretlenir; başlangıç fiyatı 0 ise yüzde gösterilmez', () => {
    expect(trendStatsLines({}, { ...base, dp: -0.001, bars: -5 })[0]).toBe('-0.00100 (-0.09%) · 5 mum');
    expect(trendStatsLines({ statBars: false }, { ...base, p0: 0 })[0]).toBe('+0.00200 (—)');
  });
});

describe('Fibonacci yardımcıları', () => {
  it('ters çevirme 0 ile 1\'i değiştirir', () => {
    expect(fibValue(0.618, true)).toBeCloseTo(0.382, 9);
    expect(fibValue(0.618, false)).toBe(0.618);
    expect(fibValue(0, true)).toBe(1);
  });

  it('seviye yazısı: seviye ve fiyat birlikte, ayrı ayrı veya hiç', () => {
    expect(fibLabel(0.618, '1.10000', {})).toBe('0.618 (1.10000)');
    expect(fibLabel(0.5, '1.10000', { showPrices: false })).toBe('0.5');
    expect(fibLabel(0.5, '1.10000', { showLevels: false })).toBe('1.10000');
    expect(fibLabel(0.5, '1.10000', { showLevels: false, showPrices: false })).toBe('');
  });
});
