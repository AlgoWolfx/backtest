import { describe, expect, it } from 'vitest';
import { getSymbol } from '../../shared/symbols.js';
import { cetOffset, nyLocalToUtc, nyOffset, resetDay, tradingDay } from '../../shared/nytime.js';
import { aggregate, revealedCount, visibleBar, type M1Data } from './data';
import { bucketChartTime, bucketKey, bucketStartUtc, TIMEFRAMES } from './timeframes';
import { bucketEndAfter, nextNyTime } from './replay';
import { breakdown, computeStats, sessionOf, SESSIONS, weekdayOf } from './stats';
import { afterBalanceChange, evaluate, levels, newAccount, noteTradingDay, rollDay, type AccountRules } from './account';
import { applyCandle, calcPnl, calcR, decideLots, entryTime, lastTradeEvent, lotsForRisk, normalizeLots, rewindBlockedBy, type Trade } from './trading';

const utc = (s: string) => Date.parse(s + 'Z') / 1000;
/** NY yerel saatini ("2024-07-10 09:30") gerçek UTC'ye çevirir. */
const ny = (s: string) => nyLocalToUtc(utc(s.replace(' ', 'T')));

describe('New York saati', () => {
  it('ABD yaz saati geçişlerini doğru hesaplar', () => {
    expect(nyOffset(utc('2024-03-10T06:59:00'))).toBe(-5 * 3600);
    expect(nyOffset(utc('2024-03-10T07:00:00'))).toBe(-4 * 3600);
    expect(nyOffset(utc('2024-11-03T05:59:00'))).toBe(-4 * 3600);
    expect(nyOffset(utc('2024-11-03T06:00:00'))).toBe(-5 * 3600);
  });

  it('NY yerel saatinden UTCye çevirir', () => {
    expect(ny('2024-07-10 09:30')).toBe(utc('2024-07-10T13:30:00'));
    expect(ny('2024-01-10 09:30')).toBe(utc('2024-01-10T14:30:00'));
  });

  it('Pazar 17:00 açılışı Pazartesi işlem gününe aittir', () => {
    expect(tradingDay(ny('2024-07-07 17:00'))).toBe(tradingDay(ny('2024-07-08 10:00')));
    expect(tradingDay(ny('2024-07-08 16:59'))).not.toBe(tradingDay(ny('2024-07-08 17:00')));
  });
});

describe('zaman dilimi kovaları', () => {
  it('4H mumlar NY 01/05/09/13/17/21de başlar (yaz ve kış)', () => {
    for (const day of ['2024-07-10', '2024-01-10']) {
      const k = bucketKey('4h', ny(`${day} 09:00`));
      expect(bucketKey('4h', ny(`${day} 12:59`))).toBe(k);
      expect(bucketKey('4h', ny(`${day} 13:00`))).toBe(k + 1);
      expect(bucketKey('4h', ny(`${day} 08:59`))).toBe(k - 1);
      expect(bucketStartUtc('4h', k)).toBe(ny(`${day} 09:00`));
    }
  });

  it('günlük mum NY 17:00de başlar ve grafikte işlem gününün tarihiyle gösterilir', () => {
    const k = bucketKey('1D', ny('2024-07-09 03:00'));
    expect(bucketStartUtc('1D', k)).toBe(ny('2024-07-08 17:00'));
    expect(bucketChartTime('1D', k)).toBe(utc('2024-07-09T00:00:00'));
  });

  it('haftalık mum Pazar 17:00 NY ile Cuma kapanışını kapsar', () => {
    const k = bucketKey('1W', ny('2024-07-07 17:00'));
    expect(bucketKey('1W', ny('2024-07-12 16:59'))).toBe(k);
    expect(bucketKey('1W', ny('2024-07-05 16:59'))).toBe(k - 1);
    expect(bucketStartUtc('1W', k)).toBe(ny('2024-07-07 17:00'));
  });

  it('aylık mum ayın ilk işlem gününden başlar', () => {
    // 31 Mart 2024 Pazar 17:00 NY -> 1 Nisan işlem günü
    expect(bucketKey('1M', ny('2024-03-31 17:00'))).toBe(bucketKey('1M', ny('2024-04-15 10:00')));
    expect(bucketKey('1M', ny('2024-03-29 16:59'))).toBe(bucketKey('1M', ny('2024-03-15 10:00')));
  });

  it('her zaman dilimi için kova başlangıcı aynı kovaya düşer', () => {
    const times = [ny('2024-03-11 02:00'), ny('2024-11-04 09:30'), ny('2025-06-02 17:00'), ny('2023-12-29 16:00')];
    for (const tf of TIMEFRAMES) {
      for (const t of times) {
        const k = bucketKey(tf.id, t);
        expect(bucketKey(tf.id, bucketStartUtc(tf.id, k))).toBe(k);
        expect(bucketStartUtc(tf.id, k)).toBeLessThanOrEqual(t);
      }
    }
  });
});

/** Basit sentetik veri: start'tan itibaren n adet 1m mum, her mumun yükseği bir öncekinden büyük. */
function synthetic(start: number, n: number): M1Data {
  const t = new Int32Array(n), o = new Int32Array(n), h = new Int32Array(n), l = new Int32Array(n), c = new Int32Array(n);
  for (let i = 0; i < n; i++) {
    t[i] = start + i * 60;
    o[i] = 100000 + i;
    c[i] = 100000 + i + 1;
    h[i] = 100000 + i + 5;
    l[i] = 100000 + i - 5;
  }
  return { id: `TEST${start}`, source: 'dukascopy', n, scale: 1e5, t, o, h, l, c, src: new Uint8Array(n), meta: { id: 'TEST', count: n, scale: 1e5, from: start, to: start + n * 60, gaps: [], missingHoursByYear: {}, builtAt: '', source: '' } };
}

describe('replay ve geleceğe bakmama', () => {
  const start = ny('2024-07-10 09:00');
  const d = synthetic(start, 180); // 09:00 - 11:59

  it('replay zamanına kadar kapanmış mumları sayar', () => {
    expect(revealedCount(d, start)).toBe(0);
    expect(revealedCount(d, start + 60)).toBe(1);
    expect(revealedCount(d, start + 40 * 60)).toBe(40);
  });

  it('tamamlanmamış 1H mum yalnızca açıklanmış dakikalardan oluşur', () => {
    const agg = aggregate(d, '1h');
    expect(agg.n).toBe(3);
    const r = revealedCount(d, start + 40 * 60); // 09:40, 1H mumun bitmesine 20 dk var
    const bar = visibleBar(d, agg, 0, r);
    expect(bar.open).toBe(d.o[0] / 1e5);
    expect(bar.close).toBe(d.c[39] / 1e5);
    expect(bar.high).toBe(d.h[39] / 1e5); // 40. dakikadan sonraki yüksekler dahil değil
    expect(bar.high).toBeLessThan(agg.h[0] / 1e5);
  });

  it('tamamlanan mum tam hâliyle gösterilir', () => {
    const agg = aggregate(d, '1h');
    const bar = visibleBar(d, agg, 0, 60);
    expect(bar.high).toBe(agg.h[0] / 1e5);
    expect(bar.close).toBe(d.c[59] / 1e5);
  });
});

/** NY yerel saat aralıklarından ("2024-07-12 08:00" - "2024-07-12 16:59") 1m sentetik veri. */
function fromRanges(ranges: [string, string][]): M1Data {
  const ts: number[] = [];
  for (const [a, b] of ranges) for (let t = ny(a); t <= ny(b); t += 60) ts.push(t);
  const d = synthetic(0, ts.length);
  d.t.set(ts);
  return { ...d, id: `R${ts[0]}` };
}

describe('NY saatine ileri sarma', () => {
  // Cuma 08:00-16:59 NY, hafta sonu kapalı, Pazar 17:00 - Pazartesi 12:00 NY
  const d = fromRanges([
    ['2024-07-12 08:00', '2024-07-12 16:59'],
    ['2024-07-14 17:00', '2024-07-15 12:00'],
  ]);
  const fri0900 = ny('2024-07-12 09:00');

  it('aynı gün ileriki saate gider', () => {
    expect(nextNyTime(d, fri0900, 9, 30)).toBe(ny('2024-07-12 09:30'));
  });
  it('geçmiş saat için hafta sonunu atlayıp Pazartesiye gider', () => {
    expect(nextNyTime(d, fri0900, 8, 30)).toBe(ny('2024-07-15 08:30'));
  });
  it('Asya açılışı (20:00) Cuma akşamı yerine Pazar akşamına düşer', () => {
    expect(nextNyTime(d, fri0900, 20, 0)).toBe(ny('2024-07-14 20:00'));
  });
  it('gece yarısı açılışı Pazartesi 00:00', () => {
    expect(nextNyTime(d, fri0900, 0, 0)).toBe(ny('2024-07-15 00:00'));
  });
  it('veri bittikten sonrası için null döner', () => {
    expect(nextNyTime(d, ny('2024-07-15 11:00'), 13, 30)).toBeNull();
  });
  it('mum kapanışına sarma: 15m mumu tamamlar', () => {
    // 09:07'deyiz -> 09:00 mumu 09:15'te kapanır
    expect(bucketEndAfter(d, ny('2024-07-12 09:07'), '15m')).toBe(ny('2024-07-12 09:15'));
    // tam kapanıştaysak bir sonraki mumun sonuna
    expect(bucketEndAfter(d, ny('2024-07-12 09:15'), '15m')).toBe(ny('2024-07-12 09:30'));
    // Cuma son mumdan sonra Pazar açılışının ilk 1H mumuna
    expect(bucketEndAfter(d, ny('2024-07-12 17:00'), '1h')).toBe(ny('2024-07-14 18:00'));
  });
});

describe('performans istatistikleri', () => {
  const mk = (i: number, pnl: number, r: number, result: Trade['result'], openNy = '2024-07-10 09:30'): Trade => ({
    id: `t${i}`, symbol: 'EURUSD', side: 'long', status: 'closed', orderType: 'market', createdAt: 0,
    openedAt: ny(openNy), closedAt: ny(openNy) + 3600 + i, entry: 1, sl: 0.99, tp: 1.02, initialSl: 0.99, lots: 1, pnl, r, result,
  });
  // +2R, -1R, -1R, +3R, BE
  const trades = [mk(1, 2000, 2, 'win'), mk(2, -1000, -1, 'loss'), mk(3, -1000, -1, 'loss', '2024-07-11 02:30'), mk(4, 3000, 3, 'win'), mk(5, 0, 0, 'be')];
  const st = computeStats(trades, 100000);

  it('temel metrikler', () => {
    expect(st.trades).toBe(5);
    expect(st.winRate).toBe(40);
    expect(st.net).toBe(3000);
    expect(st.totalR).toBe(3);
    expect(st.profitFactor).toBe(2.5);
    expect(st.avgWinR).toBe(2.5);
    expect(st.avgLossR).toBe(-1);
  });
  it('maksimum düşüş ve seriler', () => {
    // Kapanış sırası: t1 +2000, t2 -1000, t4 +3000, t5 0, t3 -1000 (t3 ertesi gün kapanır)
    // Bakiye: 102k (zirve) -> 101k -> 104k (zirve) -> 104k -> 103k: en büyük düşüş 1000 (102k zirveden)
    expect(st.maxDrawdown).toBe(1000);
    expect(st.maxDrawdownPct).toBeCloseTo((1000 / 102000) * 100, 6);
    expect(st.maxLossStreak).toBe(1);
    expect(st.maxWinStreak).toBe(1);
    expect(computeStats([mk(1, -500, -0.5, 'loss'), mk(2, -500, -0.5, 'loss'), mk(3, 800, 0.8, 'win')], 1000).maxLossStreak).toBe(2);
    expect(st.equity.at(-1)!.balance).toBe(103000);
  });
  it('seans ve gün kırılımı NY saatine göre', () => {
    expect(sessionOf(ny('2024-07-10 09:30'))).toBe('NY sabah 07-12');
    expect(sessionOf(ny('2024-07-11 02:30'))).toBe('Londra 02-07');
    expect(sessionOf(ny('2024-07-10 21:00'))).toBe('Asya 20-02');
    expect(weekdayOf(ny('2024-07-10 09:30'))).toBe('Çarşamba');
    const rows = breakdown(trades, (t) => sessionOf(t.openedAt!), SESSIONS);
    expect(rows.map((r) => [r.key, r.trades])).toEqual([['Londra 02-07', 1], ['NY sabah 07-12', 4]]);
  });
});

describe('hesap kuralları (fon / kişisel)', () => {
  const rules = (o: Partial<AccountRules> = {}): AccountRules => ({ type: 'prop', profitTargetPct: 10, dailyLossPct: 5, maxLossPct: 10, drawdownType: 'static', minTradingDays: 0, ...o });
  const t0 = ny('2024-07-10 09:00');

  it('statik maks. kayıp: equity %10 altına inince patlar', () => {
    const a = newAccount(rules({ dailyLossPct: null }), 100000, t0);
    expect(evaluate(a, 100000, t0, 100000, 90001).breach).toBeNull();
    const r = evaluate(a, 100000, t0, 100000, 90000);
    expect(r.breach).toMatch(/Maks/);
    expect(r.account.state.status).toBe('failed');
  });

  it('günlük kayıp: işlem günü başındaki bakiyeye göre, NY 17:00de sıfırlanır', () => {
    let a = newAccount(rules(), 100000, t0);
    // Gün içinde kapanmış zararla bakiye 97k, açık pozisyon equity 95.1k -> limit 95k, henüz değil
    expect(evaluate(a, 100000, t0, 97000, 95100).breach).toBeNull();
    // Ertesi işlem günü (NY 17:00 sonrası) başlangıç bakiyesi 97k -> limit 92k
    a = { ...a, state: rollDay(a.state, ny('2024-07-10 17:05'), 97000) };
    expect(a.state.dayStartBalance).toBe(97000);
    expect(evaluate(a, 100000, ny('2024-07-10 17:05'), 97000, 92100).breach).toBeNull();
    expect(evaluate(a, 100000, ny('2024-07-10 17:05'), 97000, 92000).breach).toMatch(/Günlük/);
  });

  it('trailing maks. kayıp zirveyi takip eder ama başlangıcı geçmez', () => {
    let a = newAccount(rules({ maxLossPct: 6, drawdownType: 'trailing', dailyLossPct: null, profitTargetPct: null }), 100000, t0);
    a = afterBalanceChange(a, 100000, t0, 103000, false);
    expect(levels(a, 100000).maxLoss).toBe(97000);
    a = afterBalanceChange(a, 100000, t0, 110000, false);
    expect(levels(a, 100000).maxLoss).toBe(100000); // başlangıçta kilitlenir
  });

  it('hedef: açık işlem yok ve min. gün sağlanınca geçilir', () => {
    let a = newAccount(rules({ minTradingDays: 2 }), 100000, t0);
    a = noteTradingDay(a, t0);
    expect(afterBalanceChange(a, 100000, t0, 110000, false).state.status).toBe('active'); // 1 gün < 2
    a = noteTradingDay(a, ny('2024-07-11 09:00'));
    expect(afterBalanceChange(a, 100000, t0, 110000, true).state.status).toBe('active'); // açık işlem var
    expect(afterBalanceChange(a, 100000, t0, 110000, false).state.status).toBe('passed');
  });

  it('kişisel hesapta limit yoksa hiç patlamaz', () => {
    const a = newAccount(rules({ type: 'personal', profitTargetPct: null, dailyLossPct: null, maxLossPct: null }), 100000, t0);
    expect(evaluate(a, 100000, t0, 50000, 1000).breach).toBeNull();
  });
});

describe('işlem simülasyonu', () => {
  const eur = getSymbol('EURUSD');
  const base: Trade = { id: 't1', symbol: 'EURUSD', side: 'long', status: 'open', orderType: 'market', createdAt: 0, openedAt: 0, entry: 1.1, sl: 1.099, tp: 1.102, initialSl: 1.099, lots: 1 };
  const k = (o: number, h: number, l: number, c: number) => ({ t: 1000, o, h, l, c });

  it('TP vurulunca +2R ile kapanır', () => {
    const r = applyCandle(eur, base, k(1.1005, 1.1021, 1.1003, 1.1015));
    expect(r.status).toBe('closed');
    expect(r.exitReason).toBe('tp');
    expect(r.r).toBeCloseTo(2);
    expect(r.pnl).toBeCloseTo(200);
    expect(r.result).toBe('win');
  });

  it('aynı mumda hem SL hem TP görülürse SL sayılır', () => {
    const r = applyCandle(eur, base, k(1.1, 1.103, 1.098, 1.1));
    expect(r.exitReason).toBe('sl');
    expect(r.r).toBeCloseTo(-1);
  });

  it('fiyat SLnin ötesinde açılırsa açılıştan çıkar (gap)', () => {
    const r = applyCandle(eur, base, k(1.0985, 1.099, 1.098, 1.0988));
    expect(r.exit).toBe(1.0985);
    expect(r.r).toBeCloseTo(-1.5);
  });

  it('SL girişe çekilmişse başabaş sayılır', () => {
    const r = applyCandle(eur, { ...base, sl: 1.1 }, k(1.1005, 1.1006, 1.0995, 1.1));
    expect(r.result).toBe('be');
    expect(r.r).toBeCloseTo(0);
  });

  it('bekleyen limit emri dolar; dolduğu mumda SL de görülürse zarar yazılır', () => {
    const pending: Trade = { ...base, status: 'pending', orderType: 'limit', openedAt: undefined };
    const filled = applyCandle(eur, pending, k(1.1005, 1.1008, 1.0999, 1.1002));
    expect(filled.status).toBe('open');
    expect(filled.entry).toBe(1.1);
    const stopped = applyCandle(eur, pending, k(1.1005, 1.1008, 1.0985, 1.099));
    expect(stopped.status).toBe('closed');
    expect(stopped.exitReason).toBe('sl');
  });

  it('USDJPY kârı USDye çevrilir', () => {
    const jpy = getSymbol('USDJPY');
    // 1 lot, 150.00 -> 150.50: 50 pip = 50.000 JPY = ~332 USD
    expect(calcPnl(jpy, 'long', 150, 150.5, 1)).toBeCloseTo(50000 / 150.5, 2);
  });

  it('risk yüzdesinden lot hesaplar', () => {
    // 100k bakiye, %1 = 1000$, 10 pip stop EURUSD -> 10 lot
    expect(lotsForRisk(eur, 100000, 1, 1.1, 1.099)).toBeCloseTo(10, 2);
    // US100: 1 lot = 1$/puan, 50 puan stop, 1000$ risk -> 20 lot
    expect(lotsForRisk(getSymbol('US100'), 100000, 1, 20000, 19950)).toBeCloseTo(20, 2);
  });

  it('ask verisi varsa short SL ask ile tetiklenir (bid SLye değmese bile)', () => {
    const short: Trade = { ...base, side: 'short', entry: 1.1, sl: 1.101, tp: 1.098, initialSl: 1.101 };
    const bidOnly = applyCandle(eur, short, k(1.1, 1.1008, 1.0995, 1.1));
    expect(bidOnly.status).toBe('open');
    const withAsk = applyCandle(eur, short, { ...k(1.1, 1.1008, 1.0995, 1.1), ask: { o: 1.1002, h: 1.101, l: 1.0997, c: 1.1002 } });
    expect(withAsk.exitReason).toBe('sl');
    expect(withAsk.exit).toBe(1.101);
  });

  it('ask verisi varsa long limit emri ask ile dolar, long TP bid ile tetiklenir', () => {
    const pending: Trade = { ...base, status: 'pending', orderType: 'limit', openedAt: undefined };
    // bid low girişe değiyor ama ask değmiyor -> dolmaz
    const notFilled = applyCandle(eur, pending, { ...k(1.1005, 1.1008, 1.1, 1.1003), ask: { o: 1.1007, h: 1.101, l: 1.1002, c: 1.1005 } });
    expect(notFilled.status).toBe('pending');
    const filled = applyCandle(eur, pending, { ...k(1.1003, 1.1006, 1.0998, 1.1003), ask: { o: 1.1005, h: 1.1008, l: 1.1, c: 1.1005 } });
    expect(filled.status).toBe('open');
    // ask TP'ye değiyor ama bid değmiyor -> long kapanmaz
    const stillOpen = applyCandle(eur, base, { ...k(1.1015, 1.1019, 1.1012, 1.1018), ask: { o: 1.1017, h: 1.1021, l: 1.1014, c: 1.102 } });
    expect(stillOpen.status).toBe('open');
  });

  it('short için R doğru işaretlidir', () => {
    expect(calcR('short', 1.1, 1.098, 1.101)).toBeCloseTo(2);
  });
});

describe('bekleyen emir dolumu (gap / açılış dolumu) — issue #1, #2', () => {
  const eur = getSymbol('EURUSD');
  const pend = (side: 'long' | 'short', orderType: 'limit' | 'stop', entry: number, sl: number, tp: number): Trade => ({
    id: 'p1', symbol: 'EURUSD', side, status: 'pending', orderType, createdAt: 0, entry, sl, tp, initialSl: sl, lots: 1,
  });
  const k = (o: number, h: number, l: number, c: number, ask?: { o: number; h: number; l: number; c: number }) => ({ t: 60, o, h, l, c, ask });

  it('#1 long limit gap ile SL ötesinde dolarsa çıkış mumda görülmeyen SL fiyatından olmaz', () => {
    const r = applyCandle(eur, pend('long', 'limit', 1.1, 1.095, 1.11), k(1.09, 1.092, 1.085, 1.088));
    expect(r.status).toBe('closed');
    expect(r.exitReason).toBe('sl');
    // 1.095 bu mumda hiç işlem görmedi (high = 1.092): çıkış erişilebilir açılış fiyatı olmalı
    expect(r.exit).toBe(1.09);
    expect(r.pnl).toBeCloseTo(0);
  });

  it('#1 simetri: short limit, long stop, short stop gap matrisi', () => {
    // short limit entry 1.10, SL 1.105; mum 1.11'de açılır (gap yukarı, SL ötesi)
    const a = applyCandle(eur, pend('short', 'limit', 1.1, 1.105, 1.09), k(1.11, 1.115, 1.108, 1.112));
    expect(a.exit).toBe(1.11);
    expect(a.pnl).toBeCloseTo(0);
    // long stop entry 1.10, SL 1.095; mum 1.12'de açılır, SL'ye hiç inmez -> açık kalır, giriş 1.12
    const b = applyCandle(eur, pend('long', 'stop', 1.1, 1.095, 1.15), k(1.12, 1.125, 1.118, 1.121));
    expect(b.status).toBe('open');
    expect(b.entry).toBe(1.12);
    // short stop entry 1.10, SL 1.105; mum 1.08'de açılır, SL'ye hiç çıkmaz
    const c = applyCandle(eur, pend('short', 'stop', 1.1, 1.105, 1.05), k(1.08, 1.082, 1.078, 1.079));
    expect(c.status).toBe('open');
    expect(c.entry).toBe(1.08);
  });

  it('#1 spreadli: çıkış bid açılışından, giriş ask açılışından', () => {
    const r = applyCandle(eur, pend('long', 'limit', 1.1, 1.095, 1.11), k(1.09, 1.092, 1.085, 1.088, { o: 1.0902, h: 1.0922, l: 1.0852, c: 1.0882 }));
    expect(r.entry).toBe(1.0902);
    expect(r.exit).toBe(1.09);
    expect(r.pnl).toBeCloseTo(-20); // 2 pip spread × 1 lot
  });

  it('#2 açılışta dolan emir aynı mumda TP görüldüyse TP ile kapanır', () => {
    const r = applyCandle(eur, pend('long', 'limit', 1.1, 1.09, 1.105), k(1.1, 1.106, 1.099, 1.104));
    expect(r.status).toBe('closed');
    expect(r.exitReason).toBe('tp');
    expect(r.exit).toBe(1.105);
  });

  it('#2 açılışta dolan emirde aynı mumda SL ve TP ikisi de görülürse SL sayılır ve belirsizlik işaretlenir', () => {
    const r = applyCandle(eur, pend('long', 'limit', 1.1, 1.095, 1.105), k(1.1, 1.106, 1.094, 1.1));
    expect(r.exitReason).toBe('sl');
    expect(r.flags).toContain('sl-tp-same-bar');
  });

  it('#2 mum içinde dolan emirde TP sayılmaz (sıra bilinmiyor) ama işaretlenir', () => {
    // open 1.103 > entry 1.100: önce high sonra low mu, tersi mi bilinmez
    const r = applyCandle(eur, pend('long', 'limit', 1.1, 1.09, 1.105), k(1.103, 1.106, 1.0995, 1.104));
    expect(r.status).toBe('open');
    expect(r.entry).toBe(1.1);
    expect(r.flags).toContain('fill-bar-tp-unknown');
  });

  it('#2 mum içinde dolan emirde SL görüldüyse hâlâ SL (muhafazakâr) ve TP de görüldüyse işaretlenir', () => {
    const r = applyCandle(eur, pend('long', 'limit', 1.1, 1.095, 1.105), k(1.103, 1.106, 1.094, 1.1));
    expect(r.exitReason).toBe('sl');
    expect(r.exit).toBe(1.095);
    expect(r.flags).toContain('fill-bar-tp-unknown');
  });

  it('#2 açık pozisyonda yalnızca SL görüldüyse işaret yoktur', () => {
    const open: Trade = { id: 't', symbol: 'EURUSD', side: 'long', status: 'open', orderType: 'market', createdAt: 0, openedAt: 0, entry: 1.1, sl: 1.095, tp: 1.105, initialSl: 1.095, lots: 1 };
    const r = applyCandle(eur, open, k(1.1, 1.102, 1.094, 1.1));
    expect(r.exitReason).toBe('sl');
    expect(r.flags).toBeUndefined();
  });
});

describe('pozisyon boyutlandırma — issue #5, #6', () => {
  const eur = getSymbol('EURUSD');

  it('#6 bütçeye sığmayan minimum lot sessizce 0.01e yükseltilmez', () => {
    // $100 hesap, %1 = $1 bütçe; 200 pip stopta 0.01 lot = $20 risk
    expect(lotsForRisk(eur, 100, 1, 1.1, 1.08)).toBeNull();
    // bütçeye sığan sınır: 0.01 lot = $20 risk -> %1'in $20 olduğu hesap
    expect(lotsForRisk(eur, 2000, 1, 1.1, 1.08)).toBeCloseTo(0.01, 6);
    expect(lotsForRisk(eur, 1999, 1, 1.1, 1.08)).toBeNull();
  });

  it('#6 lot adımına aşağı yuvarlama bütçeyi aşmaz; kayan nokta farkı 10 lotu 9.99a düşürmez', () => {
    expect(lotsForRisk(eur, 100000, 1, 1.1, 1.099)).toBeCloseTo(10, 6);
    // 7.29x lot: 13.7 pip, %1 -> 7.29 (7.2992...) aşağı yuvarlanır
    expect(lotsForRisk(eur, 100000, 1, 1.03129, 1.02992)).toBe(7.29);
    for (const [bal, pct, e, s] of [[100000, 1, 1.0931, 1.0902], [54321, 0.37, 1.2345, 1.2301], [250000, 2.5, 1.1, 1.0987]] as const) {
      const l = lotsForRisk(eur, bal, pct, e, s)!;
      expect(Math.abs(e - s) * 100000 * l).toBeLessThanOrEqual((bal * pct) / 100 + 1e-4);
    }
  });

  it('#6 geçersiz girdilerde null döner (sıfır stop, NaN, Infinity, sıfır/negatif)', () => {
    expect(lotsForRisk(eur, 100000, 1, 1.1, 1.1)).toBeNull();
    expect(lotsForRisk(eur, NaN, 1, 1.1, 1.099)).toBeNull();
    expect(lotsForRisk(eur, 100000, Infinity, 1.1, 1.099)).toBeNull();
    expect(lotsForRisk(eur, 100000, 1, 1.1, NaN)).toBeNull();
    expect(lotsForRisk(eur, 0, 1, 1.1, 1.099)).toBeNull();
    expect(lotsForRisk(eur, -5, 1, 1.1, 1.099)).toBeNull();
    expect(lotsForRisk(eur, 100000, 0, 1.1, 1.099)).toBeNull();
    expect(lotsForRisk(eur, 100000, 1, 0, 1.099)).toBeNull();
  });

  it('#6 sembolde tanımlıysa minLot / lotStep kullanılır', () => {
    const spec = { ...eur, minLot: 0.1, lotStep: 0.1 };
    expect(lotsForRisk(spec, 100000, 1, 1.1, 1.099)).toBeCloseTo(10, 6);
    expect(lotsForRisk(spec, 3000, 1, 1.1, 1.099)).toBeCloseTo(0.3, 6);
    expect(lotsForRisk(spec, 900, 1, 1.1, 1.099)).toBeNull(); // 0.09 lot < minLot 0.1
  });

  it('#6 elle lot adıma indirilir, geçersizse reddedilir', () => {
    expect(normalizeLots(eur, 1.239)).toBe(1.23);
    expect(normalizeLots(eur, 0.004)).toBeNull();
    expect(normalizeLots(eur, NaN)).toBeNull();
    expect(normalizeLots(eur, -1)).toBeNull();
  });

  it('#5 tüm emir yolları aynı karar fonksiyonunu kullanır: risk modunda hızlı emir sabit lot kullanmaz', () => {
    const base = { riskPct: 1, balance: 100000, entry: 1.1, sl: 1.099 };
    // kayıtlı lots=1 olsa bile risk modunda 10 lot (bütçe $1000)
    expect(decideLots(eur, { ...base, mode: 'risk', lots: 1 })).toEqual({ lots: 10 });
    // lot modunda seçilen lot korunur
    expect(decideLots(eur, { ...base, mode: 'lots', lots: 1 })).toEqual({ lots: 1 });
    // risk modunda bütçeye sığmıyorsa açıklama döner
    const bad = decideLots(eur, { ...base, mode: 'risk', lots: 1, balance: 100, sl: 1.08 });
    expect(bad.lots).toBeUndefined();
    expect(bad.error).toMatch(/sığan lot yok/);
  });

  it('#5 US100 / XAUUSD / USDJPY için aynı bütçe kuralı', () => {
    expect(lotsForRisk(getSymbol('US100'), 100000, 1, 20000, 19950)).toBeCloseTo(20, 6);
    expect(lotsForRisk(getSymbol('XAUUSD'), 100000, 1, 2000, 1995)).toBeCloseTo(2, 6); // 5$ × 100 oz = 500$/lot
    // USDJPY: 0.50 JPY × 100000 / 149.5 (SL kuru) = 334.45$/lot -> 2.99 lot (3 lot SL'de bütçeyi aşardı)
    expect(lotsForRisk(getSymbol('USDJPY'), 100000, 1, 150, 149.5)).toBe(2.99);
  });
});

describe('replay kronolojisi — issue #7', () => {
  const closed = (createdAt: number, openedAt: number, closedAt: number, pnl: number): Trade => ({
    id: 'c', symbol: 'EURUSD', side: 'long', status: 'closed', orderType: 'market', createdAt, openedAt, closedAt, entry: 1.1, sl: 1.099, tp: 1.102, initialSl: 1.099, lots: 1, exit: 1.11, pnl, r: 1, result: 'win',
  });

  it('işlem yokken geri almak serbest', () => {
    expect(lastTradeEvent([])).toBeNull();
    expect(rewindBlockedBy([], 0)).toBeNull();
  });

  it('kapanmış işlemden önceye geri almak engellenir (gelecekteki kâr bakiyede kalmaz)', () => {
    const t = closed(900, 900, 1200, 1000);
    // replay 1200'de (kapanış); 1140'a (kapanıştan önce) dönmek engelli
    expect(lastTradeEvent([t])).toBe(1200);
    expect(rewindBlockedBy([t], 1140)).toBe(1200);
    expect(rewindBlockedBy([t], 899)).toBe(1200);
  });

  it('son işlem olayının kendisine veya sonrasına gitmek engellenmez', () => {
    const t = closed(900, 900, 1200, 1000);
    expect(rewindBlockedBy([t], 1200)).toBeNull();
    expect(rewindBlockedBy([t], 5000)).toBeNull();
  });

  it('birden çok işlemde en son olay esas alınır; iptal edilen emir de olaydır', () => {
    const a = closed(100, 100, 200, 50);
    const b: Trade = { ...closed(300, 300, 400, -20), status: 'cancelled', result: undefined, pnl: undefined };
    expect(lastTradeEvent([a, b])).toBe(400);
    expect(rewindBlockedBy([a, b], 250)).toBe(400);
  });
});

describe('işlem günü / seans: piyasa emri giriş zamanı — issue #11', () => {
  it('17:00da verilen piyasa emri (16:59 mumundan girer) yeni işlem gününe ve 17:00 seansına yazılır', () => {
    const replay = ny('2024-07-10 17:00');
    const barT = ny('2024-07-10 16:59');
    const t: Trade = { id: 'm', symbol: 'EURUSD', side: 'long', status: 'open', orderType: 'market', createdAt: replay, openedAt: barT, entry: 1.1, sl: 1.099, tp: 1.102, initialSl: 1.099, lots: 1 };
    expect(tradingDay(barT)).not.toBe(tradingDay(replay));
    expect(tradingDay(entryTime(t))).toBe(tradingDay(replay));
    expect(sessionOf(barT)).not.toBe(sessionOf(entryTime(t)));
    expect(sessionOf(entryTime(t))).toBe(SESSIONS[4]); // Kapanış 17-20
  });

  it('bekleyen emir dolum mumunun başlangıcına göre sayılır', () => {
    const k = ny('2024-07-10 07:00');
    const t: Trade = { id: 'p', symbol: 'EURUSD', side: 'long', status: 'open', orderType: 'limit', createdAt: ny('2024-07-10 03:00'), openedAt: k, entry: 1.1, sl: 1.099, tp: 1.102, initialSl: 1.099, lots: 1 };
    expect(entryTime(t)).toBe(k);
  });
});

describe('komisyon ve hesap günü sıfırlaması — issue #8, #11', () => {
  const eur = getSymbol('EURUSD');
  const base: Trade = { id: 't', symbol: 'EURUSD', side: 'long', status: 'open', orderType: 'market', createdAt: 0, openedAt: 0, entry: 1.1, sl: 1.099, tp: 1.102, initialSl: 1.099, lots: 2 };
  const k = (o: number, h: number, l: number, c: number) => ({ t: 60, o, h, l, c });

  it('#8 komisyonsuz sonuç eskisiyle birebir aynıdır', () => {
    const r = applyCandle(eur, base, k(1.1005, 1.1021, 1.1003, 1.1015));
    expect(r.pnl).toBeCloseTo(400);
    expect(r.r).toBeCloseTo(2);
    expect(r.commission).toBeUndefined();
    expect(r.grossPnl).toBeUndefined();
  });

  it('#8 brüt, komisyon ve net uzlaşır: 2 lot, $7/lot gidiş-dönüş', () => {
    const r = applyCandle(eur, { ...base, commissionPerLot: 7 }, k(1.1005, 1.1021, 1.1003, 1.1015));
    expect(r.grossPnl).toBeCloseTo(400);
    expect(r.commission).toBeCloseTo(14);
    expect(r.pnl).toBeCloseTo(386);
    expect(r.pnl).toBeCloseTo(r.grossPnl! - r.commission!);
    // ilk parasal risk = 10 pip x 2 lot = $200 -> net R = 2 - 14/200
    expect(r.r).toBeCloseTo(2 - 14 / 200);
  });

  it('#8 SL, komisyonla net zarar derinleşir; başabaş stopu komisyonla net zarar gösterebilir', () => {
    const sl = applyCandle(eur, { ...base, commissionPerLot: 7 }, k(1.1, 1.1005, 1.0985, 1.099));
    expect(sl.pnl).toBeCloseTo(-200 - 14);
    expect(sl.r).toBeCloseTo(-1 - 14 / 200);
    // SL girişte: brüt 0, net -14 -> R = -0.07 (BE eşiği 0.1 içinde, BE sayılır; para negatif)
    const be = applyCandle(eur, { ...base, sl: 1.1, commissionPerLot: 7 }, k(1.1005, 1.1006, 1.0995, 1.1));
    expect(be.pnl).toBeCloseTo(-14);
    expect(be.result).toBe('be');
  });

  it('#8 komisyon bütçeye dahildir: lot, stop riski + komisyonla hesaplanır', () => {
    // $1000 bütçe, 10 pip stop = $100/lot (+ $7 komisyon) -> 1000/107 = 9.34 lot
    expect(lotsForRisk(eur, 100000, 1, 1.1, 1.099)).toBeCloseTo(10, 6);
    expect(lotsForRisk(eur, 100000, 1, 1.1, 1.099, 10)).toBeCloseTo(9.09, 6); // 1000/110
    const l = lotsForRisk(eur, 100000, 1, 1.1, 1.099, 7)!;
    expect(l * (100 + 7)).toBeLessThanOrEqual(1000 + 1e-6);
  });

  it('#11 CE(S)T gece yarısı: yaz ve kış saatinde doğru sınır, geçiş haftasında da', () => {
    // Yaz (CEST, UTC+2): 11 Tem 00:00 CEST = 10 Tem 22:00 UTC
    expect(resetDay(utc('2024-07-10T21:59:00'), 'cet0')).not.toBe(resetDay(utc('2024-07-10T22:00:00'), 'cet0'));
    // Kış (CET, UTC+1): 11 Oca 00:00 CET = 10 Oca 23:00 UTC
    expect(resetDay(utc('2024-01-10T22:59:00'), 'cet0')).not.toBe(resetDay(utc('2024-01-10T23:00:00'), 'cet0'));
    expect(resetDay(utc('2024-01-10T22:00:00'), 'cet0')).toBe(resetDay(utc('2024-01-10T22:59:00'), 'cet0'));
    // AB geçişi 31 Mar 2024 01:00 UTC; ABD geçişi 10 Mar 2024: aradaki haftalarda NY 17:00 ile CE(S)T 00:00 arası 1 saat değil 2 saat
    expect(cetOffset(utc('2024-03-30T12:00:00'))).toBe(3600);
    expect(cetOffset(utc('2024-03-31T01:00:00'))).toBe(7200);
    expect(cetOffset(utc('2024-10-27T00:59:00'))).toBe(7200);
    expect(cetOffset(utc('2024-10-27T01:00:00'))).toBe(3600);
  });

  it('#11 varsayılan mod NY 17:00 ve eski davranışla aynı', () => {
    const t = ny('2024-07-10 16:59');
    expect(resetDay(t)).toBe(tradingDay(t));
    expect(resetDay(ny('2024-07-10 17:00'))).toBe(tradingDay(ny('2024-07-10 17:00')));
  });

  it('#11 günlük kayıp sıfırlaması seçilen moda göre çalışır', () => {
    const r = (resetMode?: 'ny17' | 'cet0'): AccountRules => ({ type: 'prop', profitTargetPct: null, dailyLossPct: 5, maxLossPct: null, drawdownType: 'static', minTradingDays: 0, resetMode });
    const t1 = ny('2024-07-10 17:30'); // NY 17:00'yi geçti, CEST gece yarısını (NY 18:00) henüz geçmedi
    const t0 = ny('2024-07-10 10:00');
    const ny17 = newAccount(r('ny17'), 100000, t0);
    expect(rollDay(ny17.state, t1, 97000, 'ny17').dayStartBalance).toBe(97000);
    const cet = newAccount(r('cet0'), 100000, t0);
    expect(rollDay(cet.state, t1, 97000, 'cet0').dayStartBalance).toBe(100000); // henüz yeni gün değil
    expect(rollDay(cet.state, ny('2024-07-10 18:05'), 97000, 'cet0').dayStartBalance).toBe(97000);
  });
});
