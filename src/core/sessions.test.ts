// GERALT Session Liquidity (geralt.pine) davranışının testleri.
import { describe, expect, it } from 'vitest';
import { nyLocalToUtc } from '../../shared/nytime.js';
import type { M1Data } from './data';
import { advanceSweep, alphaOf, computeOverlay, DEFAULT_SESSION_SETTINGS, nextBoundary, parseHm, rangeStats, sessionBoundaries, sessionWindows, type OverlayCache, type SessionSettings } from './sessions';

const utc = (s: string) => Date.parse(s + 'Z') / 1000;
const ny = (s: string) => nyLocalToUtc(utc(s.replace(' ', 'T')));
const SCALE = 100000;
const M15 = 15 * 60;

type Px = Partial<{ o: number; h: number; l: number; c: number }>;

/** from..to arası her dakika için mum; fn(t) bazı mumları değiştirebilir. */
function minutes(from: number, to: number, fn: (t: number) => Px = () => ({})): M1Data {
  const ts: number[] = [];
  for (let t = from; t < to; t += 60) ts.push(t);
  const f = (get: (t: number) => number) => Int32Array.from(ts.map((t) => Math.round(get(t) * SCALE)));
  const base = 1.1;
  return {
    id: 'EURUSD', source: 'dukascopy', n: ts.length, scale: SCALE, t: Int32Array.from(ts),
    o: f((t) => fn(t).o ?? base), h: f((t) => fn(t).h ?? fn(t).o ?? base), l: f((t) => fn(t).l ?? fn(t).o ?? base), c: f((t) => fn(t).c ?? fn(t).o ?? base),
    src: new Uint8Array(ts.length), meta: {} as M1Data['meta'],
  } as unknown as M1Data;
}

/** Yalnızca verilen seans id'leri açık, TDO kapalı; diğer özellikler geralt.pine varsayılanı (override ile değişir). */
const only = (ids: string[], over: Partial<SessionSettings> = {}): SessionSettings => ({
  ...DEFAULT_SESSION_SETTINGS,
  ...over,
  sessions: DEFAULT_SESSION_SETTINGS.sessions.map((s) => ({ ...s, show: ids.includes(s.id) })),
  tdo: { ...DEFAULT_SESSION_SETTINGS.tdo, ...(over.tdo ?? {}), show: over.tdo?.show ?? false },
});

describe('seans pencereleri', () => {
  it('"HH:MM" ayrıştırılır, geçersiz null', () => {
    expect(parseHm('20:00')).toBe(1200);
    expect(parseHm('7:05')).toBe(425);
    expect(parseHm('24:00')).toBeNull();
    expect(parseHm('abc')).toBeNull();
  });

  it('Asia 20:00-00:00 NY: 4 saat, yaz ve kış (Pine "2000-0000")', () => {
    const asia = { start: '20:00', end: '00:00' };
    const [w] = sessionWindows(asia, ny('2024-07-10 12:00'), ny('2024-07-11 12:00'));
    expect(w.start).toBe(ny('2024-07-10 20:00'));
    expect(w.end).toBe(ny('2024-07-11 00:00'));
    const [k] = sessionWindows(asia, ny('2024-01-10 12:00'), ny('2024-01-11 12:00'));
    expect(k.end - k.start).toBe(4 * 3600);
  });

  it('gece yarısını aşan özel seans (22:00-02:00) 4 saat sürer; geçersiz/sıfır uzunluklu pencere üretmez', () => {
    const [w] = sessionWindows({ start: '22:00', end: '02:00' }, ny('2024-07-10 12:00'), ny('2024-07-11 12:00'));
    expect(w.end - w.start).toBe(4 * 3600);
    expect(sessionWindows({ start: 'x', end: '05:00' }, 0, 1e9)).toEqual([]);
    expect(sessionWindows({ start: '05:00', end: '05:00' }, 0, 1e9)).toEqual([]);
  });

  it('Pine şeffaflığı alfaya çevrilir (0 opak, 100 görünmez)', () => {
    expect(alphaOf(0)).toBe(1);
    expect(alphaOf(85)).toBeCloseTo(0.15, 9);
    expect(alphaOf(100)).toBe(0);
  });
});

describe('geleceğe bakmama', () => {
  const start = ny('2024-07-10 02:00');
  const end = ny('2024-07-10 05:00');
  const d = minutes(ny('2024-07-10 00:00'), ny('2024-07-10 08:00'), (t) => (t === ny('2024-07-10 03:30') ? { h: 1.2 } : t === ny('2024-07-10 03:00') ? { h: 1.11 } : {}));

  it('devam eden seansın high/low değeri yalnızca replay zamanına kadar olandır', () => {
    expect(rangeStats(d, start, end, ny('2024-07-10 03:10'))!.hi).toBeCloseTo(1.11, 6);
    expect(rangeStats(d, start, end, ny('2024-07-10 03:31'))!.hi).toBeCloseTo(1.2, 6); // 03:30 mumu 03:31'de kapandı
    expect(rangeStats(d, start, end, ny('2024-07-10 03:30'))!.hi).toBeCloseTo(1.11, 6); // 03:30 mumu henüz yok
  });

  it('devam eden seans: kutu + canlı çizgi var, likidite seviyesi yok; başlamamış seans çizilmez', () => {
    const o = computeOverlay(d, only(['london', 'nyam']), ny('2024-07-10 03:10'), M15, new Map());
    expect(o.boxes.map((b) => b.def.id)).toEqual(['london']);
    expect(o.boxes[0].inProgress).toBe(true);
    expect(o.boxes[0].hi).toBeCloseTo(1.11, 6);
    expect(o.live.length).toBe(1);
    expect(o.live[0].hi).toBeCloseTo(1.11, 6);
    expect(o.levels).toEqual([]);
  });
});

describe('likidite seviyeleri (bitmiş seans)', () => {
  // London 02-05: high 1.1050 @03:00, low 1.0950 @04:00. 08:30'da high'a dokunan (eşit) mum, 09:00'da low'u geçen mum.
  const fn = (t: number): Px =>
    t === ny('2024-07-10 03:00') ? { h: 1.105 } : t === ny('2024-07-10 04:00') ? { l: 1.095 } : t === ny('2024-07-10 08:30') ? { h: 1.105 } : t === ny('2024-07-10 09:00') ? { l: 1.0949 } : {};
  const d = minutes(ny('2024-07-10 00:00'), ny('2024-07-12 00:00'), fn);
  const s = only(['london']);

  it('seans bitince high ve low seviyesi extreme mumdan başlar, aktif kalır', () => {
    const o = computeOverlay(d, s, ny('2024-07-10 06:00'), M15, new Map());
    const h = o.levels.find((l) => l.isHigh)!;
    const l = o.levels.find((x) => !x.isHigh)!;
    expect(h.price).toBeCloseTo(1.105, 6);
    expect(h.startT).toBe(ny('2024-07-10 03:00'));
    expect(h.takenAt).toBeNull();
    expect(l.startT).toBe(ny('2024-07-10 04:00'));
    expect(h.text).toBe('London High');
    expect(l.text).toBe('London Low');
    expect(o.boxes[0].inProgress).toBe(false);
    expect(o.live).toEqual([]);
  });

  it('dokunuş da "alındı" sayılır (high >= seviye): çizgi o mumda biter; low, 1.0950 altına inen mumda', () => {
    const o = computeOverlay(d, s, ny('2024-07-10 12:00'), M15, new Map());
    expect(o.levels.find((l) => l.isHigh)!.takenAt).toBe(ny('2024-07-10 08:30'));
    expect(o.levels.find((l) => !l.isHigh)!.takenAt).toBe(ny('2024-07-10 09:00'));
  });

  it('alınma yalnızca seans bittikten sonraki mumlara bakar; replay alan mumdan önceyse seviye aktif (geleceğe bakılmaz)', () => {
    const early = computeOverlay(d, s, ny('2024-07-10 08:00'), M15, new Map());
    expect(early.levels.find((l) => l.isHigh)!.takenAt).toBeNull();
    // seansın kendi mumu (03:00 high) seviyeyi "almış" sayılmaz
    expect(early.levels.find((l) => !l.isHigh)!.takenAt).toBeNull();
  });

  it('historyDays sonra seviyeler silinir (oluşumdan itibaren, replay saatine göre)', () => {
    const within = computeOverlay(d, only(['london'], { historyDays: 1 }), ny('2024-07-11 04:00'), M15, new Map());
    expect(within.levels.filter((l) => l.startT < ny('2024-07-11 00:00')).length).toBe(2); // Çar seansı bitişten 23 saat sonra hâlâ var
    const after = computeOverlay(d, only(['london'], { historyDays: 1 }), ny('2024-07-11 06:00'), M15, new Map());
    expect(after.levels.filter((l) => l.startT < ny('2024-07-11 00:00'))).toEqual([]); // 25 saat sonra silinmiş (Per seansı ayrı ve güncel)
  });

  it('artımlı tarama: replay ilerledikçe devam eder, geri alınınca sıfırlanır', () => {
    const cache: OverlayCache = new Map();
    expect(computeOverlay(d, s, ny('2024-07-10 08:00'), M15, cache).levels.find((l) => l.isHigh)!.takenAt).toBeNull();
    expect(computeOverlay(d, s, ny('2024-07-10 09:00'), M15, cache).levels.find((l) => l.isHigh)!.takenAt).toBe(ny('2024-07-10 08:30'));
    expect(computeOverlay(d, s, ny('2024-07-10 08:00'), M15, cache).levels.find((l) => l.isHigh)!.takenAt).toBeNull();
  });

  it('advanceSweep: seviyenin altında kalan mumlar almaz, eşit olan alır', () => {
    const flat = minutes(ny('2024-07-10 05:00'), ny('2024-07-10 06:00'));
    expect(advanceSweep(flat, undefined, true, 1.1001, ny('2024-07-10 05:00'), ny('2024-07-10 06:00'), ny('2024-07-10 06:00')).at).toBeNull();
    expect(advanceSweep(flat, undefined, true, 1.1, ny('2024-07-10 05:00'), ny('2024-07-10 06:00'), ny('2024-07-10 06:00')).at).toBe(ny('2024-07-10 05:00'));
  });

  it('ayarlar: kutu / canlı kapatılabilir, seans gizlenebilir, ana anahtar kapalıysa boş', () => {
    const mid = ny('2024-07-10 03:10');
    expect(computeOverlay(d, only(['london'], { showBox: false }), mid, M15, new Map()).boxes).toEqual([]);
    expect(computeOverlay(d, only(['london'], { showLive: false }), mid, M15, new Map()).live).toEqual([]);
    expect(computeOverlay(d, only([]), mid, M15, new Map()).boxes).toEqual([]);
    const off = computeOverlay(d, { ...s, enabled: false }, mid, M15, new Map());
    expect(off.boxes.length + off.live.length + off.levels.length + off.tdo.length).toBe(0);
  });

  it('zaman dilimi sınırı: 15 dk üstünde seanslar çizilmez, ayarla değiştirilebilir', () => {
    const t = ny('2024-07-10 06:00');
    expect(computeOverlay(d, s, t, 1800, new Map()).levels).toEqual([]);
    expect(computeOverlay(d, only(['london'], { maxTfMinutes: 60 }), t, 1800, new Map()).levels.length).toBe(2);
  });
});

describe('True Day Open', () => {
  // 00:00 NY mumlarının açılışı: Sal 1.10, Çar 1.11, Per 1.12; diğer mumlar 1.105
  const open = (t: number): Px => {
    if (t === ny('2024-07-09 00:00')) return { o: 1.1 };
    if (t === ny('2024-07-10 00:00')) return { o: 1.11 };
    if (t === ny('2024-07-11 00:00')) return { o: 1.12 };
    return { o: 1.105 };
  };
  const d = minutes(ny('2024-07-08 17:00'), ny('2024-07-11 12:00'), open);
  const tdoOn = (over: Partial<SessionSettings['tdo']> = {}, tf = M15) => computeOverlay(d, only([], { tdo: { ...DEFAULT_SESSION_SETTINGS.tdo, show: true, ...over } }), ny('2024-07-11 09:00'), tf, new Map()).tdo;

  it('bugün sağa uzar; geçmiş günler günün son mumunda biter (days=3: bugün + 3 gün)', () => {
    const t = tdoOn();
    expect(t.map((x) => x.price)).toEqual([1.12, 1.11, 1.1, 1.105]); // Per, Çar, Sal, Pzt (Pzt 17:00 ilk mum)
    expect(t[0].today).toBe(true);
    expect(t[0].to).toBeNull();
    expect(t[1].today).toBe(false);
    expect(t[1].to).toBe(ny('2024-07-11 00:00'));
  });

  it('days=0: yalnızca bugünün çizgisi', () => {
    expect(tdoOn({ days: 0 }).length).toBe(1);
  });

  it('bugünün açılışı bugünün ilk açıklanmış mumundan alınır', () => {
    const cfg = only([], { tdo: { ...DEFAULT_SESSION_SETTINGS.tdo, show: true, days: 0 } });
    expect(computeOverlay(d, cfg, ny('2024-07-11 00:30'), M15, new Map()).tdo[0].price).toBeCloseTo(1.12, 6);
    expect(computeOverlay(d, cfg, ny('2024-07-10 23:59'), M15, new Map()).tdo[0].price).toBeCloseTo(1.11, 6);
  });

  it('yüksek zaman diliminde (1H) yalnızca showHtf açıksa; 4 saatin üstünde hiç', () => {
    expect(tdoOn({}, 3600).length).toBeGreaterThan(0);
    expect(tdoOn({ showHtf: false }, 3600)).toEqual([]);
    expect(tdoOn({}, 4 * 3600 + 1)).toEqual([]);
  });
});

describe('seans seans ilerleme', () => {
  it('sınırlar saate göre sıralı; gizli seans dahil değil', () => {
    const b = sessionBoundaries(DEFAULT_SESSION_SETTINGS);
    const labels = b.map((x) => `${String(x.h).padStart(2, '0')}:${String(x.m).padStart(2, '0')}`);
    expect(labels).toEqual([...labels].sort());
    const hidden = sessionBoundaries({ sessions: DEFAULT_SESSION_SETTINGS.sessions.map((x) => ({ ...x, show: x.id !== 'cbdr' })) });
    expect(hidden.some((x) => x.sessionId === 'cbdr')).toBe(false);
  });

  it('sonraki sınır: 01:30 -> London 02:00; 22:00 -> gece yarısı (Asia bitişi); 09:30 -> NY AM bitişi 12:00', () => {
    const s = DEFAULT_SESSION_SETTINGS;
    expect(nextBoundary(s, ny('2024-07-10 01:30'))).toMatchObject({ h: 2, m: 0, kind: 'start', sessionId: 'london' });
    expect(nextBoundary(s, ny('2024-07-10 22:00'))).toMatchObject({ h: 0, m: 0, kind: 'end', sessionId: 'asia' });
    expect(nextBoundary(s, ny('2024-07-10 09:30'))).toMatchObject({ h: 12, m: 0, kind: 'end', sessionId: 'nyam' });
  });

  it('hiç seans yoksa null', () => {
    expect(nextBoundary({ sessions: [] }, 0)).toBeNull();
  });
});
