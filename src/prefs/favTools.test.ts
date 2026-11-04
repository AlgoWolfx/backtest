import { describe, expect, it } from 'vitest';
import { clampPos, DEFAULT_FAVS, parseFavs, parsePos } from './favTools';

describe('parseFavs', () => {
  it('kayıt yoksa veya bozuksa varsayılan', () => {
    expect(parseFavs(null)).toEqual(DEFAULT_FAVS);
    expect(parseFavs('{bozuk')).toEqual(DEFAULT_FAVS);
    expect(parseFavs('{"a":1}')).toEqual(DEFAULT_FAVS);
  });
  it('boş liste geçerlidir (kullanıcı hepsini kaldırmış)', () => {
    expect(parseFavs('[]')).toEqual([]);
  });
  it('geçersiz ve tekrarlı araçlar atılır, sıra sabit', () => {
    expect(parseFavs('["short","cursor","trend","trend","xyz"]')).toEqual(['trend', 'short']);
  });
});

describe('parsePos / clampPos', () => {
  it('geçerli konumu çözer, geçersizi reddeder', () => {
    expect(parsePos('{"x":10,"y":20}')).toEqual({ x: 10, y: 20 });
    expect(parsePos('null')).toBeNull();
    expect(parsePos('{"x":"a","y":1}')).toBeNull();
    expect(parsePos(null)).toBeNull();
  });
  it('çubuk alanın dışına çıkamaz', () => {
    const box = { w: 800, h: 500 };
    const size = { w: 300, h: 40 };
    expect(clampPos({ x: -50, y: -9 }, box, size)).toEqual({ x: 0, y: 0 });
    expect(clampPos({ x: 9999, y: 9999 }, box, size)).toEqual({ x: 500, y: 460 });
    expect(clampPos({ x: 120, y: 30 }, box, size)).toEqual({ x: 120, y: 30 });
  });
  it('alan çubuktan küçükse sol üste yapışır', () => {
    expect(clampPos({ x: 50, y: 50 }, { w: 100, h: 20 }, { w: 300, h: 40 })).toEqual({ x: 0, y: 0 });
  });
});
