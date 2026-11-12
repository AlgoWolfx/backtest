import { describe, expect, it } from 'vitest';
import { randomTradingDay } from './randomDay';
import { nyLocalToUtc } from '../../shared/nytime.js';

const fromNyInputs = (date: string, time: string) => {
  const [y, m, d] = date.split('-').map(Number);
  const [h, mi] = time.split(':').map(Number);
  return nyLocalToUtc(Date.UTC(y, m - 1, d, h, mi) / 1000);
};

const from = fromNyInputs('2020-01-02', '00:00')!;
const to = fromNyInputs('2026-10-30', '17:00')!;

describe('rastgele işlem günü', () => {
  it('hep hafta içi, kapalı günler dışında ve veri aralığında', () => {
    let seed = 7;
    const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < 300; i++) {
      const date = randomTradingDay(from, to, '02:00', rand)!;
      const [y, m, d] = date.split('-').map(Number);
      const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
      expect(dow).toBeGreaterThanOrEqual(1);
      expect(dow).toBeLessThanOrEqual(5);
      expect(['12-24', '12-25', '12-26', '12-31', '01-01']).not.toContain(date.slice(5));
      const t = fromNyInputs(date, '02:00')!;
      expect(t).toBeGreaterThan(from + 30 * 86400);
      expect(t).toBeLessThan(to);
    }
  });
  it('farklı günler üretir', () => {
    const days = new Set(Array.from({ length: 50 }, () => randomTradingDay(from, to, '09:30')));
    expect(days.size).toBeGreaterThan(40);
  });
  it('aralık yoksa null', () => {
    expect(randomTradingDay(to, to, '02:00')).toBeNull();
  });
});
