import { describe, expect, it } from 'vitest';
import { arrowHead, channelOffset, distToSegment, ellipseEdgeDist, extendedEnds, farPoint, fmtDuration, polygonContains, priceOnLine, rayEnds, screenAngleDeg, shiftPoints } from './geometry';

describe('çizim geometrisi', () => {
  it('doğru parçasına uzaklık: uç noktalar ve dik uzaklık', () => {
    expect(distToSegment(5, 5, 0, 0, 10, 0)).toBe(5);
    expect(distToSegment(-3, 0, 0, 0, 10, 0)).toBe(3);
    expect(distToSegment(13, 4, 0, 0, 10, 0)).toBeCloseTo(5, 9);
    expect(distToSegment(1, 1, 2, 2, 2, 2)).toBeCloseTo(Math.SQRT2, 9); // sıfır uzunluk
  });

  it('ışın a başlar ve b yönünde uzar; uzatılmış çizgi iki yönde', () => {
    const [s, e] = rayEnds({ x: 0, y: 0 }, { x: 3, y: 4 }, 1000);
    expect(s).toEqual({ x: 0, y: 0 });
    expect(e.x).toBeCloseTo(600, 6);
    expect(e.y).toBeCloseTo(800, 6);
    const [l, r] = extendedEnds({ x: 0, y: 0 }, { x: 3, y: 4 }, 1000);
    expect(l.x).toBeCloseTo(-597, 6); // b'den a yönüne reach
    expect(r.x).toBeCloseTo(600, 6);
    expect(farPoint({ x: 1, y: 1 }, { x: 1, y: 1 }, 50)).toEqual({ x: 1, y: 1 });
  });

  it('ok başı: iki kanat noktası uca eşit uzaklıkta', () => {
    const [p, q] = arrowHead({ x: 0, y: 0 }, { x: 100, y: 0 }, 10);
    expect(Math.hypot(p.x - 100, p.y)).toBeCloseTo(10, 9);
    expect(Math.hypot(q.x - 100, q.y)).toBeCloseTo(10, 9);
    expect(p.y).toBeCloseTo(-q.y, 9);
  });

  it('ekran açısı: yukarı pozitif', () => {
    expect(screenAngleDeg({ x: 0, y: 0 }, { x: 10, y: -10 })).toBeCloseTo(45, 9);
    expect(screenAngleDeg({ x: 0, y: 0 }, { x: 10, y: 10 })).toBeCloseTo(-45, 9);
  });

  it('çokgen içinde mi (üçgen)', () => {
    const tri = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 5, y: 10 }];
    expect(polygonContains(tri, 5, 3)).toBe(true);
    expect(polygonContains(tri, 9, 9)).toBe(false);
  });

  it('elips kenarı uzaklığı: kenarda ~0, merkezde büyük', () => {
    expect(ellipseEdgeDist(10, 0, 0, 0, 10, 5)).toBeCloseTo(0, 9);
    expect(ellipseEdgeDist(0, 0, 0, 0, 10, 5)).toBeGreaterThan(3);
  });

  it('doğru üzerinde fiyat ve paralel kanal kayması', () => {
    expect(priceOnLine(0, 100, 10, 110, 5)).toBe(105);
    expect(priceOnLine(0, 100, 10, 110, 20)).toBe(120); // ekstrapolasyon
    expect(priceOnLine(3, 100, 3, 200, 9)).toBe(100);
    // taban (0,100)-(10,110); üçüncü nokta (5, 112) -> doğrudan 105 -> kayma +7
    expect(channelOffset(0, 100, 10, 110, 5, 112)).toBe(7);
    expect(channelOffset(0, 100, 10, 110, 5, 100)).toBe(-5);
  });

  it('noktaları öteleme ve süre metni', () => {
    const out = shiftPoints([{ t: 10, p: 1 }, { t: 20, p: 2 }], (t) => t + 5, 0.5, (p) => Math.round(p * 100) / 100);
    expect(out).toEqual([{ t: 15, p: 1.5 }, { t: 25, p: 2.5 }]);
    expect(fmtDuration(0)).toBe('0dk');
    expect(fmtDuration(90 * 60)).toBe('1sa 30dk');
    expect(fmtDuration(86400 + 3600)).toBe('1g 1sa');
  });
});
