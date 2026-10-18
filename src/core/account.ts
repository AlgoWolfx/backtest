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

import { resetDay } from '../../shared/nytime.js';

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
  /** Günlük kayıp sıfırlaması / işlem günü sınırı: NY 17:00 (varsayılan) veya Avrupa gece yarısı (CE(S)T 00:00) */
  resetMode?: ResetMode;
}

export type ResetMode = 'ny17' | 'cet0';

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
  // --- Equity düşüşü (replay boyunca). Eski oturumlarda yoktur; yokken "veri yok" kabul edilir. ---
  /** En yüksek equity: kapanmış bakiye ve her dakika SONU (close-mark) equity zirvesi */
  peakEquity?: number;
  /** Close-mark equity'den en büyük zirveden-dibe düşüş (para); yüzde bağımsız izlenir */
  ddClose?: { abs: number; pct: number };
  /** Mum içi en kötü equity ile (önceki dakika sonlarına kadarki) zirve arasındaki en büyük düşüş */
  ddLow?: { abs: number; pct: number };
  /** Equity metriklerinin (peakEquity, ddClose, ddLow, uyarılar) ölçülmeye başlandığı zaman; öncesi ölçülmemiştir (eski oturumlar) */
  equityMetricsSince?: number;
  /** Belirsiz mumda olası limit ihlali uyarıları (hesap patlatmaz; sıra bilinemez) */
  warnings?: { t: number; text: string }[];
}

/** evaluate'e verilen isteğe bağlı ek equity bilgileri. */
export interface EquityExtra {
  /** Dakika sonu (close-mark) equity */
  equityClose?: number;
  /**
   * Aynı dakikada TP ile kapanan işlemlerin kapanıştan ÖNCE mum dibini görmüş olma ihtimali dahil
   * edilmiş olası en kötü equity (sıra bilinemez; sınır ihlali yalnızca uyarı üretir).
   */
  equityLowPossible?: number;
}

export interface Account {
  rules: AccountRules;
  state: AccountState;
}

/** Hazır hesap türleri: gruplara ayrılır (kişisel / değerlendirme / fonlu). Genel örneklerdir, belirli bir firmanın kuralı değildir. */
export type AccountGroup = 'personal' | 'eval' | 'funded';
export interface AccountPreset {
  id: string;
  label: string;
  group: AccountGroup;
  desc: string;
  rules: AccountRules;
}

export const ACCOUNT_GROUPS: { id: AccountGroup; label: string; desc: string }[] = [
  { id: 'personal', label: 'Kişisel', desc: 'Kural yok: hesap patlamaz, hedef yok.' },
  { id: 'eval', label: 'Fon değerlendirmesi', desc: 'Kâr hedefi + günlük / maks. kayıp limiti. Hedefe ulaşınca geçersin, limite değince patlar.' },
  { id: 'funded', label: 'Fonlu hesap', desc: 'Hedef yok; yalnızca günlük / maks. kayıp limitlerine uymak gerekir.' },
];

const prop = (r: Partial<AccountRules>): AccountRules => ({ type: 'prop', profitTargetPct: null, dailyLossPct: null, maxLossPct: null, drawdownType: 'static', minTradingDays: 0, ...r });

export const ACCOUNT_PRESETS: AccountPreset[] = [
  {
    id: 'personal',
    label: 'Kişisel hesap',
    group: 'personal',
    desc: 'Limit ve hedef yok.',
    rules: { type: 'personal', profitTargetPct: null, dailyLossPct: null, maxLossPct: null, drawdownType: 'static', minTradingDays: 0 },
  },
  { id: 'prop-2s-p1', label: '2 adım · Faz 1', group: 'eval', desc: 'Klasik ilk faz: %10 hedef, statik %10 maks. kayıp.', rules: prop({ profitTargetPct: 10, dailyLossPct: 5, maxLossPct: 10, minTradingDays: 4 }) },
  { id: 'prop-2s-p2', label: '2 adım · Faz 2', group: 'eval', desc: 'Doğrulama fazı: %5 hedef, aynı limitler.', rules: prop({ profitTargetPct: 5, dailyLossPct: 5, maxLossPct: 10, minTradingDays: 4 }) },
  { id: 'prop-1s-static', label: '1 adım · statik', group: 'eval', desc: 'Tek faz, sabit taban; minimum gün şartı yok.', rules: prop({ profitTargetPct: 8, dailyLossPct: 4, maxLossPct: 8 }) },
  { id: 'prop-1s', label: '1 adım · trailing', group: 'eval', desc: 'Tek faz; taban kapanmış bakiye zirvesiyle yükselir (başlangıç seviyesine kadar).', rules: prop({ profitTargetPct: 10, dailyLossPct: 3, maxLossPct: 6, drawdownType: 'trailing' }) },
  { id: 'prop-funded', label: 'Fonlu · statik', group: 'funded', desc: 'Hedef yok, sabit %10 maks. kayıp.', rules: prop({ dailyLossPct: 5, maxLossPct: 10 }) },
  { id: 'prop-funded-trailing', label: 'Fonlu · trailing', group: 'funded', desc: 'Hedef yok, zirveden %6 trailing kayıp.', rules: prop({ dailyLossPct: 3, maxLossPct: 6, drawdownType: 'trailing' }) },
];

/** Bir kural setine uyan hazır hesap (yoksa özel). */
export function presetOf(rules: AccountRules): AccountPreset | undefined {
  return ACCOUNT_PRESETS.find((p) => JSON.stringify({ ...p.rules, resetMode: p.rules.resetMode ?? 'ny17' }) === JSON.stringify({ ...rules, resetMode: rules.resetMode ?? 'ny17' }));
}

/** Kurallara göre hesabın hangi grupta olduğu. */
export function groupOf(rules: AccountRules): AccountGroup {
  if (rules.type === 'personal') return 'personal';
  return rules.profitTargetPct != null ? 'eval' : 'funded';
}

/** Kuralların başlangıç bakiyesine göre dolar karşılıkları (formda özet için). */
export function ruleAmounts(r: AccountRules, balance: number) {
  const amt = (pct: number | null) => (pct == null ? null : cents((balance * pct) / 100));
  return {
    target: r.profitTargetPct == null ? null : cents(balance * (1 + r.profitTargetPct / 100)),
    targetGain: amt(r.profitTargetPct),
    dailyLoss: amt(r.dailyLossPct),
    maxLoss: amt(r.maxLossPct),
    /** Başlangıçta equity'nin düşebileceği en düşük seviye (hesap patlama tabanı) */
    floor: r.maxLossPct == null ? null : cents(balance - (balance * r.maxLossPct) / 100),
  };
}

export interface RuleCheck {
  errors: string[];
  warnings: string[];
}

/** Hesap kurallarının tutarlılığı: hatalar oturum açmayı engeller, uyarılar bilgi verir. */
export function validateRules(r: AccountRules, balance: number): RuleCheck {
  const errors: string[] = [];
  const warnings: string[] = [];
  if (!Number.isFinite(balance) || balance < 100) errors.push('Başlangıç bakiyesi en az $100 olmalı.');
  for (const [label, v] of [['Kâr hedefi', r.profitTargetPct], ['Günlük kayıp', r.dailyLossPct], ['Maks. kayıp', r.maxLossPct]] as const) {
    if (v != null && !(v > 0 && v < 100)) errors.push(`${label} % 0 ile 100 arasında olmalı.`);
  }
  if (r.drawdownType === 'trailing' && r.maxLossPct == null) errors.push('Trailing düşüş için maks. kayıp % gerekli.');
  if (!Number.isInteger(r.minTradingDays) || r.minTradingDays < 0) errors.push('Min. işlem günü 0 veya pozitif tam sayı olmalı.');
  if (r.type === 'prop') {
    if (r.dailyLossPct == null && r.maxLossPct == null) warnings.push('Fon hesabında günlük veya maks. kayıp limiti yok: hesap hiç patlamaz.');
    if (r.dailyLossPct != null && r.maxLossPct != null && r.dailyLossPct >= r.maxLossPct) warnings.push('Günlük limit maks. kayıptan büyük veya eşit: günlük limit fiilen devreye girmez.');
    if (r.minTradingDays > 0 && r.profitTargetPct == null) warnings.push('Min. işlem günü yalnızca kâr hedefiyle birlikte anlamlı.');
  }
  return { errors, warnings };
}

export function newAccount(rules: AccountRules, initial: number, startTime: number): Account {
  return {
    rules,
    state: { status: 'active', peakBalance: initial, dayKey: resetDay(startTime, rules.resetMode), dayStartBalance: initial, tradingDays: [], worstDailyLoss: 0, minEquity: initial, equityMetricsSince: startTime },
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
export function rollDay(st: AccountState, t: number, balance: number, mode: ResetMode = 'ny17'): AccountState {
  const day = resetDay(t, mode);
  return day === st.dayKey ? st : { ...st, dayKey: day, dayStartBalance: balance };
}

/**
 * Bir dakikanın sonunda kuralları denetler.
 * balance: kapanmış bakiye, equityLow: o dakikadaki en kötü equity.
 * Dönen breach doluysa hesap patlamıştır (pozisyonlar kapatılmalı).
 */
export function evaluate(a: Account, initial: number, t: number, balance: number, equityLow: number, extra: EquityExtra = {}): { account: Account; breach: string | null } {
  if (a.state.status === 'failed') return { account: a, breach: null };
  let st = rollDay(a.state, t, balance, a.rules.resetMode);
  const equityClose = extra.equityClose ?? balance;
  // Zirve: önceki dakika sonlarına kadarki en yüksek equity. Mum içi dip bu zirveden SONRA olduğu kesindir.
  const peakBefore = Math.max(st.peakEquity ?? st.peakBalance, st.peakBalance);
  const peakAfter = Math.max(peakBefore, equityClose);
  st = {
    ...st,
    peakBalance: Math.max(st.peakBalance, balance),
    worstDailyLoss: Math.max(st.worstDailyLoss, st.dayStartBalance - equityLow),
    minEquity: Math.min(st.minEquity, equityLow),
    peakEquity: peakAfter,
    equityMetricsSince: st.equityMetricsSince ?? t,
    ddClose: trackDd(st.ddClose, peakAfter, equityClose),
    ddLow: trackDd(st.ddLow, peakBefore, equityLow),
  };
  const acc = { ...a, state: st };
  const lv = levels(acc, initial);
  const check = (eq: number): string | null => {
    if (lv.maxLoss != null && eq <= lv.maxLoss) return `Maks. kayıp limiti (%${a.rules.maxLossPct}${a.rules.drawdownType === 'trailing' ? ', trailing' : ''})`;
    if (lv.daily != null && eq <= lv.daily) return `Günlük kayıp limiti (%${a.rules.dailyLossPct})`;
    return null;
  };
  const breach = check(equityLow);
  if (breach) acc.state = { ...acc.state, status: 'failed', statusAt: t + 60, reason: breach };
  else if (extra.equityLowPossible != null && extra.equityLowPossible < equityLow) {
    // Kesin ihlal yok; fakat aynı dakikada TP ile kapanan işlem kapanıştan önce mum dibini görmüş olabilir.
    const poss = check(extra.equityLowPossible);
    if (poss) {
      const text = `Belirsiz mum: ${poss} aşılmış olabilir (TP'den önce mum dibi görülmüşse equity $${extra.equityLowPossible.toFixed(2)}). Sıra 1m verisinden bilinemez, hesap patlatılmadı.`;
      const w = acc.state.warnings ?? [];
      if (!w.some((x) => x.text === text)) acc.state = { ...acc.state, warnings: [...w, { t, text }].slice(-20) };
    }
  }
  return { account: acc, breach };
}

/** Zirveden dibe düşüşü izler; para ve yüzde maksimumları birbirinden bağımsız güncellenir. */
function trackDd(prev: { abs: number; pct: number } | undefined, peak: number, eq: number): { abs: number; pct: number } {
  const abs = Math.max(0, peak - eq);
  const pct = peak > 0 ? (abs / peak) * 100 : 0;
  return { abs: Math.max(prev?.abs ?? 0, abs), pct: Math.max(prev?.pct ?? 0, pct) };
}

/** Kapanmış bakiye değiştikten sonra (işlem kapandı): zirve ve hedef kontrolü. */
export function afterBalanceChange(a: Account, initial: number, t: number, balance: number, hasOpen: boolean): Account {
  // Açık işlem kalmadıysa equity = bakiye: equity zirvesi de güncellenir.
  const flatPeak = !hasOpen ? { peakEquity: Math.max(a.state.peakEquity ?? a.state.peakBalance, balance) } : {};
  if (a.state.status !== 'active') return { ...a, state: { ...a.state, peakBalance: Math.max(a.state.peakBalance, balance), ...flatPeak } };
  const st = { ...a.state, peakBalance: Math.max(a.state.peakBalance, balance), ...flatPeak };
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
  const st0 = rollDay(a.state, t, balance, a.rules.resetMode);
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
  const day = resetDay(t, a.rules.resetMode);
  if (a.state.tradingDays.includes(day)) return a;
  return { ...a, state: { ...a.state, tradingDays: [...a.state.tradingDays, day] } };
}
