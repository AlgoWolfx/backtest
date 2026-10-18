// İkinci inceleme turundaki karşı örnekler (issue #1, #2, #4, #6, #8) ve değişmezler.
import { describe, expect, it } from 'vitest';
import { getSymbol } from '../../shared/symbols.js';
import { nyLocalToUtc } from '../../shared/nytime.js';
import type { M1Data } from './data';
import { newAccount, type AccountRules } from './account';
import { simulate } from './simulate';
import { applyCandle, calcPnl, chronologyIssue, EXECUTION_MODEL, exitSide, lotsForRisk, stopRiskPerLot, type Candle, type Trade } from './trading';
import type { Session } from './types';

const eur = getSymbol('EURUSD');
const pend = (side: 'long' | 'short', orderType: 'limit' | 'stop', entry: number, sl: number, tp: number): Trade => ({
  id: 'p', symbol: 'EURUSD', side, status: 'pending', orderType, createdAt: 0, entry, sl, tp, initialSl: sl, lots: 1,
});
type Q = { o: number; h: number; l: number; c: number };
const k = (b: Q, ask?: Q): Candle => ({ t: 60, ...b, ask });

describe('#1 spreadli mum içi dolumda erişilemeyen SL çıkışı', () => {
  it('Astra örneği: long limit, bid mumu SL\'nin altında -> çıkış bid yüksek\'ten (erişilebilir), SL fiyatından değil', () => {
    const r = applyCandle(eur, pend('long', 'limit', 1.1, 1.0999, 1.11), k({ o: 1.09985, h: 1.09985, l: 1.0998, c: 1.09982 }, { o: 1.10005, h: 1.10005, l: 1.1, c: 1.10002 }));
    expect(r.entry).toBe(1.1);
    expect(r.exitReason).toBe('sl');
    expect(r.exit).toBe(1.09985);
    expect(r.exit!).toBeLessThanOrEqual(1.09985); // bid high
  });

  it('simetrik short: çıkış ask düşük\'ten (erişilebilir)', () => {
    // short limit entry 1.10000 (bid), SL 1.10005; ask mumu SL'nin üstünde (en düşük 1.10010)
    const r = applyCandle(eur, pend('short', 'limit', 1.1, 1.10005, 1.09), k({ o: 1.09995, h: 1.1, l: 1.0999, c: 1.09995 }, { o: 1.10015, h: 1.1002, l: 1.1001, c: 1.10015 }));
    expect(r.entry).toBe(1.1);
    expect(r.exitReason).toBe('sl');
    expect(r.exit).toBe(1.1001);
  });

  it('değişmez: kapanan her işlemin çıkışı çıkış tarafı aralığında, girişi giriş tarafı aralığında (rastgele mumlar)', () => {
    let seed = 12345;
    const rnd = () => ((seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296);
    for (let n = 0; n < 4000; n++) {
      const base = 1.1 + (rnd() - 0.5) * 0.01;
      const w = () => rnd() * 0.002;
      const o = base, h = base + w(), l = base - w(), c = l + rnd() * (h - l);
      const sp = rnd() < 0.5 ? 0 : rnd() * 0.0003;
      const bid: Q = { o, h, l, c };
      const ask: Q | undefined = sp ? { o: o + sp, h: h + sp, l: l + sp, c: c + sp } : undefined;
      const long = rnd() < 0.5;
      const entry = base + (rnd() - 0.5) * 0.004;
      const d1 = 0.0001 + rnd() * 0.003;
      const sl = long ? entry - d1 : entry + d1;
      const tp = long ? entry + d1 * (0.5 + rnd() * 3) : entry - d1 * (0.5 + rnd() * 3);
      const type: 'limit' | 'stop' = rnd() < 0.5 ? 'limit' : 'stop';
      const cand = k(bid, ask);
      const t0: Trade = pend(long ? 'long' : 'short', type, entry, sl, tp);
      const r = applyCandle(eur, t0, cand);
      if (r.status === 'pending') continue;
      const ent = long ? ask ?? bid : bid;
      expect(r.entry).toBeGreaterThanOrEqual(ent.l - 1e-12);
      expect(r.entry).toBeLessThanOrEqual(ent.h + 1e-12);
      if (r.status === 'closed') {
        const x = exitSide(r.side, cand);
        expect(r.exit!).toBeGreaterThanOrEqual(x.l - 1e-12);
        expect(r.exit!).toBeLessThanOrEqual(x.h + 1e-12);
      }
    }
  });
});

describe('#2 kanıtlanabilir TP ile gerçekten belirsiz TP', () => {
  it('A: buy limit, mum TP üstünde kapanır -> dolumdan sonra TP zorunlu', () => {
    const r = applyCandle(eur, pend('long', 'limit', 1.1, 1.09, 1.105), k({ o: 1.103, h: 1.106, l: 1.0995, c: 1.1055 }));
    expect(r.status).toBe('closed');
    expect(r.exitReason).toBe('tp');
    expect(r.exit).toBe(1.105);
  });

  it('B: buy stop, high TP\'ye çıkarken önce giriş aşılır -> TP', () => {
    const r = applyCandle(eur, pend('long', 'stop', 1.1, 1.09, 1.105), k({ o: 1.099, h: 1.106, l: 1.098, c: 1.103 }));
    expect(r.status).toBe('closed');
    expect(r.exitReason).toBe('tp');
    expect(r.exit).toBe(1.105);
  });

  it('kanıtlanamayan: buy limit, high önce gelmiş olabilir ve kapanış TP altında -> açık kalır, işaretlenir', () => {
    const r = applyCandle(eur, pend('long', 'limit', 1.1, 1.09, 1.105), k({ o: 1.103, h: 1.106, l: 1.0995, c: 1.1035 }));
    expect(r.status).toBe('open');
    expect(r.flags).toContain('fill-bar-tp-unknown');
  });

  it('short simetrisi: sell limit (kapanış TP altında) ve sell stop', () => {
    // sell limit entry 1.1000, TP 1.0950; mum O 1.0970 H 1.1005 L 1.0940 C 1.0945 (ask=bid)
    const a = applyCandle(eur, pend('short', 'limit', 1.1, 1.11, 1.095), k({ o: 1.097, h: 1.1005, l: 1.094, c: 1.0945 }));
    expect(a.exitReason).toBe('tp');
    // sell stop entry 1.1000 (fiyat yukarıdan aşağı), TP 1.0950; O 1.1010 H 1.1012 L 1.0940 C 1.0990
    const b = applyCandle(eur, pend('short', 'stop', 1.1, 1.11, 1.095), k({ o: 1.101, h: 1.1012, l: 1.094, c: 1.099 }));
    expect(b.exitReason).toBe('tp');
  });

  it('spreadli kanıt: stop emrinde ask girişi aşmadan bid TP\'yi aşamaz -> TP; limitte kapanış bid TP üstündeyse TP', () => {
    const sp = 0.0002;
    const bid = { o: 1.099, h: 1.106, l: 1.098, c: 1.103 };
    const ask = { o: bid.o + sp, h: bid.h + sp, l: bid.l + sp, c: bid.c + sp };
    expect(applyCandle(eur, pend('long', 'stop', 1.1, 1.09, 1.105), k(bid, ask)).exitReason).toBe('tp');
    const bid2 = { o: 1.103, h: 1.106, l: 1.0993, c: 1.1055 };
    const ask2 = { o: bid2.o + sp, h: bid2.h + sp, l: bid2.l + sp, c: bid2.c + sp };
    expect(applyCandle(eur, pend('long', 'limit', 1.1, 1.09, 1.105), k(bid2, ask2)).exitReason).toBe('tp');
  });

  it('SL de görülürse SL-önce kalır; stop emrinde SL\'nin dolumdan önce görülmüş olması da işaretlenir', () => {
    const r = applyCandle(eur, pend('long', 'stop', 1.1, 1.098, 1.105), k({ o: 1.099, h: 1.106, l: 1.0975, c: 1.103 }));
    expect(r.exitReason).toBe('sl');
    expect(r.flags).toEqual(expect.arrayContaining(['fill-bar-sl-unknown', 'sl-tp-same-bar']));
  });

  it('yürütme modeli sürümü 2', () => {
    expect(EXECUTION_MODEL).toBe(2);
  });
});

describe('#6 USDJPY ve risk bütçesi değişmezleri', () => {
  const jpy = getSymbol('USDJPY');

  it('Astra örneği: 150 -> 149, $100k %1: gerçekleşen SL zararı bütçeyi aşmaz (1.49 lot)', () => {
    const lots = lotsForRisk(jpy, 100000, 1, 150, 149)!;
    expect(lots).toBe(1.49);
    const stopLoss = -calcPnl(jpy, 'long', 150, 149, lots);
    expect(stopLoss).toBeLessThanOrEqual(1000 + 1e-6);
    expect(stopLoss).toBeGreaterThan(990);
  });

  it('short için de simetrik: 150 -> 151', () => {
    const lots = lotsForRisk(jpy, 100000, 1, 150, 151)!;
    const stopLoss = -calcPnl(jpy, 'short', 150, 151, lots);
    expect(stopLoss).toBeLessThanOrEqual(1000 + 1e-6);
    expect(stopRiskPerLot(jpy, 150, 151) * lots).toBeCloseTo(stopLoss, 6);
  });

  it('değişmez: tüm semboller ve yönlerde lot * stop riski <= bütçe (rastgele)', () => {
    let seed = 99;
    const rnd = () => ((seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296);
    for (const id of ['EURUSD', 'GBPUSD', 'USDJPY', 'XAUUSD', 'XAGUSD', 'US100', 'US500', 'DXY']) {
      const spec = getSymbol(id);
      for (let i = 0; i < 300; i++) {
        const entry = id === 'USDJPY' ? 100 + rnd() * 100 : id === 'US100' || id === 'US500' ? 3000 + rnd() * 20000 : 1 + rnd() * 2000;
        const dist = entry * (0.0002 + rnd() * 0.02);
        const long = rnd() < 0.5;
        const sl = long ? entry - dist : entry + dist;
        const bal = 1000 + rnd() * 500000;
        const pct = 0.1 + rnd() * 3;
        const comm = rnd() < 0.5 ? 0 : rnd() * 10;
        const lots = lotsForRisk(spec, bal, pct, entry, sl, comm);
        if (lots == null) continue;
        const realized = -calcPnl(spec, long ? 'long' : 'short', entry, sl, lots) + comm * lots;
        expect(realized).toBeLessThanOrEqual((bal * pct) / 100 + 1e-4);
      }
    }
  });

  it('komisyon > 0 iken sıfır stop mesafesi yine reddedilir', () => {
    expect(lotsForRisk(eur, 100000, 1, 1.1, 1.1, 7)).toBeNull();
    expect(lotsForRisk(eur, 100000, 1, 1.1, 1.1, 0)).toBeNull();
  });

  it('sl <= 0, geçersiz minLot / lotStep ve negatif komisyon reddedilir', () => {
    expect(lotsForRisk(eur, 100000, 1, 1.1, 0)).toBeNull();
    expect(lotsForRisk(eur, 100000, 1, 1.1, -1)).toBeNull();
    expect(lotsForRisk({ ...eur, minLot: 0 }, 100000, 1, 1.1, 1.099)).toBeNull();
    expect(lotsForRisk({ ...eur, lotStep: NaN }, 100000, 1, 1.1, 1.099)).toBeNull();
    expect(lotsForRisk({ ...eur, lotStep: -0.01 }, 100000, 1, 1.1, 1.099)).toBeNull();
    expect(lotsForRisk(eur, 100000, 1, 1.1, 1.099, -5)).toBeNull();
  });
});

// ---- simulate entegrasyon testleri
const SCALE = 100000;
interface C {
  t: number;
  o: number;
  h: number;
  l: number;
  c: number;
}
function m1(candles: C[], askSpread = 0): M1Data {
  const mk = (f: (c: C) => number, add = 0) => Int32Array.from(candles.map((c) => Math.round((f(c) + add) * SCALE)));
  const d = { id: 'EURUSD', source: 'dukascopy', n: candles.length, scale: SCALE, t: Int32Array.from(candles.map((c) => c.t)), o: mk((c) => c.o), h: mk((c) => c.h), l: mk((c) => c.l), c: mk((c) => c.c), src: new Uint8Array(candles.length), meta: {} } as unknown as M1Data;
  if (askSpread) d.ask = { o: mk((c) => c.o, askSpread), h: mk((c) => c.h, askSpread), l: mk((c) => c.l, askSpread), c: mk((c) => c.c, askSpread) };
  return d;
}
const rules = (o: Partial<AccountRules> = {}): AccountRules => ({ type: 'prop', profitTargetPct: null, dailyLossPct: 5, maxLossPct: null, drawdownType: 'static', minTradingDays: 0, ...o });
const open = (id: string, side: 'long' | 'short', entry: number, sl: number, tp: number, lots = 1, commissionPerLot?: number): Trade => ({
  id, symbol: 'EURUSD', side, status: 'open', orderType: 'market', createdAt: 0, openedAt: 0, entry, sl, tp, initialSl: sl, lots, ...(commissionPerLot ? { commissionPerLot } : {}),
});
const sess = (trades: Trade[], t: number, r: AccountRules): Session => ({ id: 's', initialBalance: 100000, replayTime: t, trades, account: newAccount(r, 100000, t) } as unknown as Session);
const T0 = nyLocalToUtc(Date.parse('2024-07-10T09:00:00Z') / 1000);
const run = (s: Session, d: M1Data) => simulate(s, T0 + 60, (x) => (x === 'EURUSD' ? d : undefined));

describe('#4 aynı sembolde hedge: ortak fiyat senaryosu', () => {
  const wide = m1([{ t: T0, o: 1.1, h: 1.14, l: 1.06, c: 1.1 }]);
  const long = open('L', 'long', 1.1, 1.0, 1.2);
  const short = open('S', 'short', 1.1, 1.2, 1.0);

  it('Astra örneği: eşit long+short, hiçbir SL/TP tetiklenmez -> hesap patlamaz, minEquity ~ 100000', () => {
    const r = run(sess([long, short], T0, rules()), wide);
    expect(r.breach).toBeNull();
    expect(r.account!.state.status).toBe('active');
    expect(r.account!.state.minEquity).toBeCloseTo(100000, 2);
  });

  it('trade dizisi ters çevrilince sonuç aynı', () => {
    const a = run(sess([long, short], T0, rules()), wide);
    const b = run(sess([short, long], T0, rules()), wide);
    expect(a.account!.state.minEquity).toBeCloseTo(b.account!.state.minEquity, 8);
    expect(a.account!.state.ddLow).toEqual(b.account!.state.ddLow);
  });

  it('sabit 2 pip spreadli hedge: kayıp yalnızca spread kadar', () => {
    const d = m1([{ t: T0, o: 1.1, h: 1.14, l: 1.06, c: 1.1 }], 0.0002);
    const r = run(sess([long, short], T0, rules()), d);
    expect(r.breach).toBeNull();
    expect(r.account!.state.minEquity).toBeGreaterThan(100000 - 25);
  });

  it('eşit olmayan hedge (2 long + 1 short): net maruz kalma değerlenir (-4000, limit 5000 altı)', () => {
    const r = run(sess([open('L', 'long', 1.1, 1.0, 1.2, 2), short], T0, rules()), wide);
    expect(r.breach).toBeNull();
    expect(r.account!.state.minEquity).toBeCloseTo(96000, 0);
  });

  it('tek yönlü pozisyonda eski kesin ihlal korunur: 1 lot long, dip -4000, limit %3 -> patlar', () => {
    const r = run(sess([long], T0, rules({ dailyLossPct: 3 })), wide);
    expect(r.breach).toMatch(/Günlük/);
  });
});

describe('#8 komisyon: açık equity net likidasyon değeri, kapanışta çift düşme yok', () => {
  const flat = m1([{ t: T0, o: 1.1, h: 1.1, l: 1.1, c: 1.1 }]);

  it('Astra örneği: $100k, 1 lot, fiyat değişmez, $7/lot -> minEquity 99993', () => {
    const r = run(sess([open('t', 'long', 1.1, 1.09, 1.12, 1, 7)], T0, rules({ dailyLossPct: null })), flat);
    expect(r.account!.state.minEquity).toBeCloseTo(99993, 6);
    expect(r.trades[0].status).toBe('open');
  });

  it('kapanışta toplam etki bir kez: TP kârından komisyon bir kez düşer, equity ile bakiye uzlaşır', () => {
    const d = m1([{ t: T0, o: 1.1, h: 1.1105, l: 1.1, c: 1.1105 }]);
    const s = sess([open('t', 'long', 1.1, 1.09, 1.1105, 1, 7)], T0, rules({ dailyLossPct: null }));
    const r = run(s, d);
    expect(r.trades[0].exitReason).toBe('tp');
    expect(r.trades[0].grossPnl).toBeCloseTo(1050, 6);
    expect(r.trades[0].pnl).toBeCloseTo(1043, 6); // 1050 - 7, tek sefer
    expect(r.account!.state.ddClose?.abs ?? 0).toBeLessThanOrEqual(7.0001); // en fazla komisyon rezervi kadar
  });
});

describe('#7 eski oturumlarda tutarsız kronoloji uyarısı', () => {
  const closed = (closedAt: number): Trade => ({ ...open('c', 'long', 1.1, 1.09, 1.12), status: 'closed', closedAt, pnl: 10, r: 1, result: 'win' });
  it('replay zamanından sonraya ait kayıt varsa uyarı zamanı döner, yoksa null', () => {
    expect(chronologyIssue([closed(2000)], 1000)).toBe(2000);
    expect(chronologyIssue([closed(900)], 1000)).toBeNull();
    expect(chronologyIssue([], 1000)).toBeNull();
  });
});
