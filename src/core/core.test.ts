import { describe, expect, it } from 'vitest';
import { getSymbol } from '../../shared/symbols.js';
import { nyLocalToUtc, nyOffset, tradingDay } from '../../shared/nytime.js';
import { aggregate, revealedCount, visibleBar, type M1Data } from './data';
import { bucketChartTime, bucketKey, bucketStartUtc, TIMEFRAMES } from './timeframes';
import { bucketEndAfter, nextNyTime } from './replay';
import { breakdown, computeStats, sessionOf, SESSIONS, weekdayOf } from './stats';
import { afterBalanceChange, evaluate, levels, newAccount, noteTradingDay, rollDay, type AccountRules } from './account';
import { applyCandle, calcPnl, calcR, lotsForRisk, type Trade } from './trading';

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
  return { id: `TEST${start}`, source: 'histdata', n, scale: 1e5, t, o, h, l, c, src: new Uint8Array(n), meta: { id: 'TEST', count: n, scale: 1e5, from: start, to: start + n * 60, gaps: [], missingHoursByYear: {}, builtAt: '', source: '' } };
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
