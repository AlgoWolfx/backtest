import { describe, expect, it } from 'vitest';
import { nyLocalToUtc } from '../../shared/nytime.js';
import type { M1Data } from './data';
import { computeStats } from './stats';
import { newAccount, type AccountRules } from './account';
import { simulate } from './simulate';
import type { Trade } from './trading';
import type { Session } from './types';

const utc = (s: string) => Date.parse(s + 'Z') / 1000;
const ny = (s: string) => nyLocalToUtc(utc(s.replace(' ', 'T')));
const SCALE = 100000;

interface C {
  t: number;
  o: number;
  h: number;
  l: number;
  c: number;
}

/** Sentetik 1m veri (bid). t: mum başlangıcı. */
function m1(id: string, candles: C[]): M1Data {
  const mk = (f: (c: C) => number) => Int32Array.from(candles.map((c) => Math.round(f(c) * SCALE)));
  return { id, source: 'dukascopy', n: candles.length, scale: SCALE, t: Int32Array.from(candles.map((c) => c.t)), o: mk((c) => c.o), h: mk((c) => c.h), l: mk((c) => c.l), c: mk((c) => c.c), src: new Uint8Array(candles.length), meta: {} as M1Data['meta'] };
}

const rules = (o: Partial<AccountRules> = {}): AccountRules => ({ type: 'prop', profitTargetPct: null, dailyLossPct: 5, maxLossPct: null, drawdownType: 'static', minTradingDays: 0, ...o });

const openLong = (id: string, symbol: string, entry: number, sl: number, tp: number, lots = 1): Trade => ({
  id, symbol, side: 'long', status: 'open', orderType: 'market', createdAt: 0, openedAt: 0, entry, sl, tp, initialSl: sl, lots,
});

function session(trades: Trade[], replayTime: number, r: AccountRules, initial = 100000): Session {
  return { id: 's', initialBalance: initial, replayTime, trades, account: newAccount(r, initial, replayTime) } as unknown as Session;
}

const T0 = ny('2024-07-10 09:00');

describe('risk motoru: aynı mumda kapanan işlemin riski — issue #4', () => {
  // EURUSD long 1 lot: giriş 1.1000, SL 1.0000, TP 1.1100. Sonraki mum O=1.10 H=1.11 L=1.04 C=1.10 (TP görülür, dip -6000$).
  const data = m1('EURUSD', [{ t: T0, o: 1.1, h: 1.11, l: 1.04, c: 1.1 }]);
  const dataOf = (sym: string) => (sym === 'EURUSD' ? data : undefined);

  it('TP ile kapanır; dip TP\'den önce görülmüş olabilir -> hesap patlatılmaz ama uyarı yazılır', () => {
    const s = session([openLong('t1', 'EURUSD', 1.1, 1.0, 1.11)], T0, rules());
    const r = simulate(s, T0 + 60, dataOf);
    expect(r.trades[0].status).toBe('closed');
    expect(r.trades[0].exitReason).toBe('tp');
    expect(r.breach).toBeNull();
    expect(r.account!.state.status).toBe('active');
    // $6k açık zarar ihtimali günlük %5 ($5k) limitini aşar: kesin değil -> uyarı
    expect(r.account!.state.warnings?.length).toBe(1);
    expect(r.account!.state.warnings![0].text).toMatch(/Belirsiz mum/);
    expect(r.account!.state.warnings![0].text).toMatch(/Günlük kayıp/);
  });

  it('limit aşılmıyorsa uyarı yoktur', () => {
    const s = session([openLong('t1', 'EURUSD', 1.1, 1.0, 1.11, 0.5)], T0, rules()); // -3k < %5
    const r = simulate(s, T0 + 60, dataOf);
    expect(r.account!.state.warnings).toBeUndefined();
  });

  it('SL ile kapanan işlemin gerçekleşmiş zararı kesin ihlalse hesap patlar', () => {
    const d = m1('EURUSD', [{ t: T0, o: 1.1, h: 1.1, l: 1.03, c: 1.04 }]);
    const s = session([openLong('t1', 'EURUSD', 1.1, 1.04, 1.2)], T0, rules()); // SL 1.04 -> -6k
    const r = simulate(s, T0 + 60, (x) => (x === 'EURUSD' ? d : undefined));
    expect(r.trades[0].exitReason).toBe('sl');
    expect(r.breach).toMatch(/Günlük/);
    expect(r.account!.state.status).toBe('failed');
  });
});

describe('equity düşüşü kaydı — issue #3', () => {
  it('bakiye DD sıfır olsa da equity DD ölçülür ($100k -> açık $99k -> kapanış $101k)', () => {
    const d = m1('EURUSD', [
      { t: T0, o: 1.1, h: 1.1, l: 1.09, c: 1.09 }, // açık -$1000 (1 lot, 100 pip)
      { t: T0 + 60, o: 1.09, h: 1.111, l: 1.09, c: 1.11 }, // TP 1.101 -> +$1000
    ]);
    const s = session([openLong('t1', 'EURUSD', 1.1, 1.0, 1.101)], T0, rules({ dailyLossPct: null }));
    const r = simulate(s, T0 + 120, (x) => (x === 'EURUSD' ? d : undefined));
    expect(r.trades[0].exitReason).toBe('tp');
    const st = r.account!.state;
    expect(st.ddClose!.abs).toBeCloseTo(1000, 0);
    expect(st.ddLow!.abs).toBeCloseTo(1000, 0);
    // bakiye eğrisinden düşüş yok
    expect(computeStats(r.trades, 100000).maxDrawdown).toBe(0);
  });

  it('en büyük dolar düşüşü ve en büyük yüzde düşüşü bağımsız izlenir (stats)', () => {
    const mk = (id: string, closedAt: number, pnl: number): Trade => ({ ...openLong(id, 'EURUSD', 1.1, 1, 2), status: 'closed', closedAt, pnl, r: 1, result: pnl > 0 ? 'win' : 'loss' });
    // 100 -> 50 (%50, $50) -> 20050 -> 19050 (%4.98, $1000)
    const st = computeStats([mk('a', 1, -50), mk('b', 2, 20000), mk('c', 3, -1000)], 100);
    expect(st.maxDrawdown).toBeCloseTo(1000, 6);
    expect(st.maxDrawdownPct).toBeCloseTo(50, 6);
  });
});

describe('çoklu sembol: aynı dakika işlenme sırası sonucu değiştirmez — issue #4', () => {
  const eurD = m1('EURUSD', [{ t: T0, o: 1.1, h: 1.1, l: 1.07, c: 1.08 }]);
  const gbpD = m1('GBPUSD', [{ t: T0, o: 1.3, h: 1.3, l: 1.27, c: 1.28 }]);
  const dataOf = (sym: string) => (sym === 'EURUSD' ? eurD : sym === 'GBPUSD' ? gbpD : undefined);
  const eur = openLong('e', 'EURUSD', 1.1, 1.0, 1.2); // dip -3000
  const gbp = openLong('g', 'GBPUSD', 1.3, 1.0, 1.5); // dip -3000

  it('trade dizisinin sırası değişince hesap durumu aynı kalır', () => {
    const a = simulate(session([eur, gbp], T0, rules()), T0 + 60, dataOf);
    const b = simulate(session([gbp, eur], T0, rules()), T0 + 60, dataOf);
    expect(a.account!.state.minEquity).toBeCloseTo(b.account!.state.minEquity, 6);
    expect(a.account!.state.worstDailyLoss).toBeCloseTo(b.account!.state.worstDailyLoss, 6);
    expect(a.account!.state.ddLow).toEqual(b.account!.state.ddLow);
    // iki sembolün dipleri aynı dakikada: -6000 ≥ %5 günlük limit (5000) -> ikisinde de aynı sonuç
    expect(a.breach).toBe(b.breach);
    expect(a.breach).toMatch(/Günlük/);
  });
});
