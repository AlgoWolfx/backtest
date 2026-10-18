// Hesap kuralları: kişisel hesap veya fon (prop firm) değerlendirmesi.
//
// Kurallar prop firmalardaki gibi EQUITY (bakiye + açık pozisyonların o dakikadaki en kötü
// değeri) üzerinden, her 1m mumda denetlenir:
//   - Maks. kayıp (hesap patlama): equity, taban seviyeye değerse hesap patlar.
//       statik:   taban = başlangıç × (1 − %)
//       trailing: taban = (en yüksek kapanmış bakiye − başlangıç × %), en fazla başlangıç seviyesine kadar yükselir
//   - Günlük kayıp: equity, (işlem günü başındaki bakiye − başlangıç × %) seviyesine değerse hesap patlar.
//       İşlem günü NY 17:00'de başlar (forex günü).
//   - Kâr hedefi (fon geçme): kapanmış bakiye başlangıç × (1 + %) seviyesine ulaşır, açık işlem yoksa ve
//     minimum işlem günü sağlanmışsa değerlendirme geçilir.

import { tradingDay } from '../../shared/nytime.js';

export type AccountType = 'personal' | 'prop';

export interface AccountRules {
  type: AccountType;
  /** Fon geçme hedefi (%), null = yok */
  profitTargetPct: number | null;
  /** Günlük kayıp limiti (%), null = yok */
  dailyLossPct: number | null;
  /** Maks. kayıp / hesap patlama (%), null = yok */
  maxLossPct: number | null;
  drawdownType: 'static' | 'trailing';
  /** Hedef için gereken en az işlem günü (0 = yok) */
  minTradingDays: number;
}

export interface AccountState {
  status: 'active' | 'failed' | 'passed';
  statusAt?: number;
  reason?: string;
  /** En yüksek kapanmış bakiye (trailing düşüş için) */
  peakBalance: number;
  /** dayStartBalance'ın ait olduğu işlem günü */
  dayKey: number;
  dayStartBalance: number;
  /** İşlem açılan işlem günleri */
  tradingDays: number[];
  /** Görülen en büyük günlük kayıp (equity, para birimi) */
  worstDailyLoss: number;
  /** Görülen en düşük equity */
  minEquity: number;
}

export interface Account {
  rules: AccountRules;
  state: AccountState;
}

export const ACCOUNT_PRESETS: { id: string; label: string; rules: AccountRules }[] = [
  { id: 'personal', label: 'Kişisel hesap', rules: { type: 'personal', profitTargetPct: null, dailyLossPct: null, maxLossPct: null, drawdownType: 'static', minTradingDays: 0 } },
  { id: 'prop-2s-p1', label: 'Fon · 2 adım · Faz 1', rules: { type: 'prop', profitTargetPct: 10, dailyLossPct: 5, maxLossPct: 10, drawdownType: 'static', minTradingDays: 4 } },
  { id: 'prop-2s-p2', label: 'Fon · 2 adım · Faz 2', rules: { type: 'prop', profitTargetPct: 5, dailyLossPct: 5, maxLossPct: 10, drawdownType: 'static', minTradingDays: 4 } },
  { id: 'prop-1s', label: 'Fon · 1 adım (trailing)', rules: { type: 'prop', profitTargetPct: 10, dailyLossPct: 3, maxLossPct: 6, drawdownType: 'trailing', minTradingDays: 0 } },
  { id: 'prop-funded', label: 'Fonlu hesap (hedef yok)', rules: { type: 'prop', profitTargetPct: null, dailyLossPct: 5, maxLossPct: 10, drawdownType: 'static', minTradingDays: 0 } },
];

export function newAccount(rules: AccountRules, initial: number, startTime: number): Account {
  return {
    rules,
    state: { status: 'active', peakBalance: initial, dayKey: tradingDay(startTime), dayStartBalance: initial, tradingDays: [], worstDailyLoss: 0, minEquity: initial },
  };
}

export interface Levels {
  /** Maks. kayıp tabanı (equity bunun altına inmemeli) */
  maxLoss: number | null;
  /** Günlük kayıp tabanı */
  daily: number | null;
  /** Hedef bakiye */
  target: number | null;
}

/** Kuruşa yuvarlar: 100000 × 1.1 = 110000.00000000001 gibi kayan nokta hataları hedefi kaçırmasın. */
const cents = (v: number) => Math.round(v * 100) / 100;

export function levels(a: Account, initial: number): Levels {
  const { rules: r, state: st } = a;
  let maxLoss: number | null = null;
  if (r.maxLossPct != null) {
    const amt = (initial * r.maxLossPct) / 100;
    maxLoss = cents(r.drawdownType === 'trailing' ? Math.min(st.peakBalance - amt, initial) : initial - amt);
  }
  return {
    maxLoss,
    daily: r.dailyLossPct != null ? cents(st.dayStartBalance - (initial * r.dailyLossPct) / 100) : null,
    target: r.profitTargetPct != null ? cents(initial * (1 + r.profitTargetPct / 100)) : null,
  };
}

/** Yeni işlem gününe geçildiyse günün başlangıç bakiyesini ayarlar. t: UTC, balance: o anki kapanmış bakiye. */
export function rollDay(st: AccountState, t: number, balance: number): AccountState {
  const day = tradingDay(t);
  return day === st.dayKey ? st : { ...st, dayKey: day, dayStartBalance: balance };
}

/**
 * Bir dakikanın sonunda kuralları denetler.
 * balance: kapanmış bakiye, equityLow: o dakikadaki en kötü equity.
 * Dönen breach doluysa hesap patlamıştır (pozisyonlar kapatılmalı).
 */
export function evaluate(a: Account, initial: number, t: number, balance: number, equityLow: number): { account: Account; breach: string | null } {
  if (a.state.status === 'failed') return { account: a, breach: null };
  let st = rollDay(a.state, t, balance);
  st = {
    ...st,
    peakBalance: Math.max(st.peakBalance, balance),
    worstDailyLoss: Math.max(st.worstDailyLoss, st.dayStartBalance - equityLow),
    minEquity: Math.min(st.minEquity, equityLow),
  };
  const acc = { ...a, state: st };
  const lv = levels(acc, initial);
  let breach: string | null = null;
  if (lv.maxLoss != null && equityLow <= lv.maxLoss) breach = `Maks. kayıp limiti (%${a.rules.maxLossPct}${a.rules.drawdownType === 'trailing' ? ', trailing' : ''})`;
  else if (lv.daily != null && equityLow <= lv.daily) breach = `Günlük kayıp limiti (%${a.rules.dailyLossPct})`;
  if (breach) acc.state = { ...acc.state, status: 'failed', statusAt: t + 60, reason: breach };
  return { account: acc, breach };
}

/** Kapanmış bakiye değiştikten sonra (işlem kapandı): zirve ve hedef kontrolü. */
export function afterBalanceChange(a: Account, initial: number, t: number, balance: number, hasOpen: boolean): Account {
  if (a.state.status !== 'active') return { ...a, state: { ...a.state, peakBalance: Math.max(a.state.peakBalance, balance) } };
  const st = { ...a.state, peakBalance: Math.max(a.state.peakBalance, balance) };
  const lv = levels({ ...a, state: st }, initial);
  if (lv.target != null && balance >= lv.target && !hasOpen && st.tradingDays.length >= a.rules.minTradingDays) {
    return { ...a, state: { ...st, status: 'passed', statusAt: t, reason: `Kâr hedefi (%${a.rules.profitTargetPct}) ulaşıldı` } };
  }
  return { ...a, state: st };
}

export interface AccountSnapshot {
  status: AccountState['status'];
  /** Hedefe ilerleme: kazanılan / gereken (para) */
  target: { have: number; need: number } | null;
  /** Bugünkü kayıp / günlük limit (para) */
  daily: { used: number; limit: number } | null;
  /** Maks. kayıp limitinden kullanılan / toplam (para) */
  max: { used: number; limit: number } | null;
  tradingDays: number;
}

/** Ekranda göstermek için anlık durum. equity: bakiye + açık pozisyonların şu anki değeri. */
export function snapshot(a: Account, initial: number, t: number, balance: number, equity: number): AccountSnapshot {
  const st0 = rollDay(a.state, t, balance);
  const st = { ...st0, peakBalance: Math.max(st0.peakBalance, balance) };
  const lv = levels({ ...a, state: st }, initial);
  const r = a.rules;
  const maxAmt = r.maxLossPct != null ? (initial * r.maxLossPct) / 100 : 0;
  return {
    status: a.state.status,
    target: lv.target != null ? { have: balance - initial, need: lv.target - initial } : null,
    daily: lv.daily != null ? { used: Math.max(0, st.dayStartBalance - equity), limit: (initial * (r.dailyLossPct ?? 0)) / 100 } : null,
    max: lv.maxLoss != null ? { used: Math.max(0, maxAmt - (equity - lv.maxLoss)), limit: maxAmt } : null,
    tradingDays: st.tradingDays.length,
  };
}

/** İşlem açıldığında işlem gününü kaydeder. */
export function noteTradingDay(a: Account, t: number): Account {
  const day = tradingDay(t);
  if (a.state.tradingDays.includes(day)) return a;
  return { ...a, state: { ...a.state, tradingDays: [...a.state.tradingDays, day] } };
}
