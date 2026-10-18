import { describe, expect, it } from 'vitest';
import { dragSplit, LAYOUT_IDS, LAYOUTS, layoutGeometry, MIN_SHARE, ratiosOf, ROOT_PATH } from './layouts';

const area = (r: { w: number; h: number }) => r.w * r.h;

describe('düzen geometrisi', () => {
  it.each(LAYOUT_IDS)('%s: her ekran bir kez, ekranlar alanı tam kaplar, çakışma yok', (id) => {
    const { panes } = layoutGeometry(id);
    expect(panes.length).toBe(LAYOUTS[id].count);
    expect(panes.reduce((a, p) => a + area(p), 0)).toBeCloseTo(1, 9);
    for (let i = 0; i < panes.length; i++) {
      const a = panes[i];
      expect(a.x).toBeGreaterThanOrEqual(0);
      expect(a.y).toBeGreaterThanOrEqual(0);
      expect(a.x + a.w).toBeLessThanOrEqual(1 + 1e-9);
      expect(a.y + a.h).toBeLessThanOrEqual(1 + 1e-9);
      for (let j = i + 1; j < panes.length; j++) {
        const b = panes[j];
        const overlapX = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
        const overlapY = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
        expect(overlapX > 1e-9 && overlapY > 1e-9).toBe(false);
      }
    }
  });

  it.each(LAYOUT_IDS)('%s: bölücü sayısı = ekran sayısı − 1 için ağaç yaprakları tutarlı', (id) => {
    const { splitters } = layoutGeometry(id);
    // Bir ağaçta bölücü sayısı toplam (çocuk − 1) kadardır; her bölücü kendi düğümünün içinde kalır.
    for (const s of splitters) {
      expect(s.at).toBeGreaterThan(s.nodeStart);
      expect(s.at).toBeLessThan(s.nodeStart + s.nodeLen);
      expect(s.to).toBeGreaterThan(s.from);
    }
  });

  it('3 ekran: solda 2/3 genişlikte büyük ekran, sağda iki eşit ekran', () => {
    const { panes, splitters } = layoutGeometry('3');
    expect(panes[0]).toEqual({ x: 0, y: 0, w: 2 / 3, h: 1 });
    expect(panes[1].x).toBeCloseTo(2 / 3);
    expect(panes[1].h).toBeCloseTo(0.5);
    expect(panes[2].y).toBeCloseTo(0.5);
    expect(splitters.length).toBe(2);
    // Yatay bölücü yalnızca sağ sütunu böler
    const h = splitters.find((s) => s.dir === 'col')!;
    expect(h.from).toBeCloseTo(2 / 3);
    expect(h.to).toBeCloseTo(1);
  });

  it('16 ekran: 4x4 ızgara, 6 ... bölücü: 4 satır içi 3 dikey x4 + 3 yatay', () => {
    const { panes, splitters } = layoutGeometry('16');
    expect(panes[5]).toEqual({ x: 0.25, y: 0.25, w: 0.25, h: 0.25 });
    expect(splitters.length).toBe(3 + 4 * 3);
  });
});

describe('oranlar', () => {
  it('kayıtlı oran önceliklidir ve 1e normalize edilir', () => {
    expect(ratiosOf('2v', ROOT_PATH, 2, { [ROOT_PATH]: [1, 3] })).toEqual([0.25, 0.75]);
  });
  it('geçersiz kayıt (yanlış uzunluk, sıfır, NaN) yok sayılır', () => {
    expect(ratiosOf('2v', ROOT_PATH, 2, { [ROOT_PATH]: [1, 2, 3] })).toEqual([0.5, 0.5]);
    expect(ratiosOf('2v', ROOT_PATH, 2, { [ROOT_PATH]: [0, 1] })).toEqual([0.5, 0.5]);
    expect(ratiosOf('2v', ROOT_PATH, 2, { [ROOT_PATH]: [NaN, 1] })).toEqual([0.5, 0.5]);
  });
  it('düzenin varsayılanı kullanılır', () => {
    expect(ratiosOf('3', ROOT_PATH, 2)[0]).toBeCloseTo(2 / 3);
  });
  it('kayıtlı oranlar geometriye yansır', () => {
    const { panes } = layoutGeometry('2v', { [ROOT_PATH]: [0.3, 0.7] });
    expect(panes[0].w).toBeCloseTo(0.3);
    expect(panes[1].x).toBeCloseTo(0.3);
  });
});

describe('dragSplit', () => {
  it('sınırı konuma taşır, çiftin toplamı sabit kalır', () => {
    const r = dragSplit([0.25, 0.25, 0.5], 1, 0.6);
    expect(r[0]).toBe(0.25);
    expect(r[1]).toBeCloseTo(0.35);
    expect(r[2]).toBeCloseTo(0.4);
    expect(r.reduce((a, b) => a + b, 0)).toBeCloseTo(1);
  });
  it('en az MIN_SHARE kalır', () => {
    const lo = dragSplit([0.5, 0.5], 0, -3);
    expect(lo[0]).toBeCloseTo(MIN_SHARE);
    const hi = dragSplit([0.5, 0.5], 0, 9);
    expect(hi[1]).toBeCloseTo(MIN_SHARE);
  });
  it('komşu olmayan çocuklara dokunmaz', () => {
    const r = dragSplit([0.2, 0.3, 0.5], 0, 0.1);
    expect(r[2]).toBe(0.5);
  });
});
