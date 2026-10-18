// Emir / pozisyon simülasyonu. Her açıklanan 1m mum için çalışır.
//
// Varsayımlar (muhafazakâr):
//   - Grafik bid fiyatıdır. Kaynakta ask varsa (OANDA) gerçek spread uygulanır:
//     long ask'tan açılır / bid ile kapanır, short bid'den açılır / ask ile kapanır.
//     Ask yoksa (HistData) spread 0 kabul edilir. Komisyon uygulanmaz.
//   - Aynı 1m mumda hem SL hem TP görülürse önce SL vurulmuş sayılır (işlem `flags`'ine 'sl-tp-same-bar' yazılır).
//   - Fiyat SL/TP'nin ötesinde açılırsa (gap) çıkış açılış fiyatından olur. Hiçbir çıkış, mumun
//     işlem görmediği bir fiyattan yazılmaz.
//   - Bekleyen emir mumun AÇILIŞINDA doluyorsa (gap veya açılış = giriş) mumun tamamı dolumdan sonradır:
//     açık pozisyonla aynı kurallar uygulanır (TP de sayılır).
//   - Bekleyen emir mum İÇİNDE doluyorsa high/low sırası 1m OHLC'den bilinemez. Yalnızca KANITLANABİLİR
//     durumlar sayılır: dolumdan sonra TP'ye ulaşıldığı, fiyatın sürekliliğiyle zorunluysa (stop emri: TP > giriş
//     olduğundan önce giriş aşılır; limit emri: mum TP'nin ötesinde kapanıyorsa) TP yazılır. Kanıtlanamayan TP
//     sayılmaz ve 'fill-bar-tp-unknown' ile işaretlenir. SL görüldüyse muhafazakâr olarak zarar yazılır; stop
//     emrinde SL'nin dolumdan ÖNCE görülmüş olması da mümkündür ('fill-bar-sl-unknown').
//   - SL dolum anında zaten tetiklenmişse (bid/ask aralığı SL'yi kapsamıyorsa) çıkış, SL'ye en yakın
//     ERİŞİLEBİLİR fiyattan yazılır; mumun işlem görmediği fiyattan çıkış uydurulmaz.
//   - Komisyon (varsa) kapanışta pnl'den düşülür; açık pozisyonun equity'si 'şimdi likide edilirse net' değeridir
//     (komisyon rezerve edilmiş, kapanışta çift düşülmez).
//   - Model sürümü: EXECUTION_MODEL (oturumda saklanır; kural değişince artar).

import type { SymbolSpec } from '../../shared/symbols.js';

export type Side = 'long' | 'short';
export type TradeStatus = 'pending' | 'open' | 'closed' | 'cancelled';
export type ExitReason = 'tp' | 'sl' | 'manual' | 'breach';
export type TradeResult = 'win' | 'loss' | 'be';
/**
 * 1m OHLC'den sıra bilinemediği için varsayım yapılan durumlar:
 *   sl-tp-same-bar:       aynı mumda SL ve TP ikisi de görüldü, SL-önce varsayıldı.
 *   fill-bar-tp-unknown:  emir mum içinde doldu; aynı mumda TP seviyesi de görüldü ama kanıtlanamadığı için sayılmadı.
 *   fill-bar-sl-unknown:  stop emri mum içinde doldu; SL aynı mumda görüldü ama dolumdan önce mi sonra mı bilinemez (SL sayıldı).
 */
export type TradeFlag = 'sl-tp-same-bar' | 'fill-bar-tp-unknown' | 'fill-bar-sl-unknown';

/**
 * Yürütme (mum içi emir/çıkış) modeli sürümü. Oturum açılırken saklanır; eski oturumlarda yok = 1.
 *   1: ilk sürüm (3727f4a)
 *   2: açılış dolumu açık-pozisyon kurallarıyla; erişilebilir çıkış; kanıtlanabilir TP; net komisyon equity
 */
export const EXECUTION_MODEL = 2;

export interface Trade {
  id: string;
  symbol: string;
  side: Side;
  status: TradeStatus;
  orderType: 'market' | 'limit' | 'stop';
  createdAt: number;
  openedAt?: number;
  closedAt?: number;
  entry: number;
  sl: number | null;
  tp: number | null;
  initialSl: number | null;
  lots: number;
  exit?: number;
  exitReason?: ExitReason;
  pnl?: number;
  r?: number | null;
  result?: TradeResult;
  drawingId?: string;
  /** Giriş / çıkış anında alınan grafik görüntüleri (dosya adları) */
  shots?: { open?: string; close?: string };
  /** Günlük notu */
  note?: string;
  /** Mum içi sıra belirsizliği nedeniyle yapılan varsayımlar (bkz. TradeFlag) */
  flags?: TradeFlag[];
  /** Açılışta işleme yazılan komisyon (USD / lot, gidiş-dönüş); sonradan ayar değişse de bu işlem değişmez */
  commissionPerLot?: number;
  /** Komisyon varsa: brüt K/Z ve ödenen komisyon. pnl = grossPnl - commission (NET) */
  grossPnl?: number;
  commission?: number;
}

/** R'si bu eşiğin altında kalan işlemler başabaş (BE) sayılır. */
export const BE_THRESHOLD_R = 0.1;

const dirOf = (side: Side) => (side === 'long' ? 1 : -1);

/** 1 lotun, fiyat 1 birim hareket ettiğinde USD karşılığı. */
export function usdPerPriceUnit(spec: SymbolSpec, price: number): number {
  return spec.contractSize * (spec.quote === 'JPY' ? 1 / price : 1);
}

export function calcPnl(spec: SymbolSpec, side: Side, entry: number, exit: number, lots: number): number {
  return dirOf(side) * (exit - entry) * lots * usdPerPriceUnit(spec, exit);
}

export function calcR(side: Side, entry: number, exit: number, initialSl: number | null): number | null {
  if (initialSl == null) return null;
  const risk = Math.abs(entry - initialSl);
  if (risk === 0) return null;
  return (dirOf(side) * (exit - entry)) / risk;
}

export function classify(r: number | null, pnl: number): TradeResult {
  if (r != null) return r > BE_THRESHOLD_R ? 'win' : r < -BE_THRESHOLD_R ? 'loss' : 'be';
  return pnl > 0 ? 'win' : pnl < 0 ? 'loss' : 'be';
}

/** Enstrümanın en küçük lotu ve lot adımı. Sembolde tanımlı değilse 0.01 / 0.01. */
export function lotRules(spec: SymbolSpec): { minLot: number; lotStep: number } {
  return { minLot: spec.minLot ?? 0.01, lotStep: spec.lotStep ?? 0.01 };
}

/** minLot / lotStep geçerli (sonlu ve > 0) mi? */
const validLotRules = (r: { minLot: number; lotStep: number }) => Number.isFinite(r.minLot) && r.minLot > 0 && Number.isFinite(r.lotStep) && r.lotStep > 0;

/** Stop'ta 1 lotun USD zararı. JPY dönüşümü, gerçekleşen SL P&L'sinin (calcPnl) kullandığı çıkış kuruyla (SL) yapılır. */
export const stopRiskPerLot = (spec: SymbolSpec, entry: number, sl: number): number => Math.abs(entry - sl) * usdPerPriceUnit(spec, sl);

/**
 * Risk yüzdesine göre lot: lot adımına AŞAĞI yuvarlanır; stop zararı + komisyon bütçeyi aşmaz.
 * Stop geometrisi (entry != sl) komisyondan bağımsız doğrulanır. Bütçeye sığan en küçük lot bile yoksa
 * (veya girdi geçersizse) null döner; emir engellenmelidir.
 */
export function lotsForRisk(spec: SymbolSpec, balance: number, riskPct: number, entry: number, sl: number, commissionPerLot = 0): number | null {
  const rules = lotRules(spec);
  if (!validLotRules(rules)) return null;
  if (![balance, riskPct, entry, sl, commissionPerLot].every(Number.isFinite) || balance <= 0 || riskPct <= 0 || entry <= 0 || sl <= 0 || commissionPerLot < 0) return null;
  const stop = stopRiskPerLot(spec, entry, sl);
  if (!(stop > 0) || !Number.isFinite(stop)) return null; // sıfır stop mesafesi komisyonla bile geçerli olmaz
  const perLot = stop + commissionPerLot;
  // 1e-6 adım toleransı: 1.1 - 1.099 gibi kayan nokta farkları 10 lotu 9.99'a düşürmesin
  // (bütçe aşımı en çok 1e-6 lot adımı kadardır, yani kuruşun çok altında).
  const steps = Math.floor((balance * riskPct) / 100 / perLot / rules.lotStep + 1e-6);
  const lots = Math.round(steps * rules.lotStep * 1e6) / 1e6;
  return lots >= rules.minLot - 1e-9 ? lots : null;
}

/** Elle girilen lotu lot adımına aşağı yuvarlar; geçersiz veya minimumun altındaysa null. */
export function normalizeLots(spec: SymbolSpec, lots: number): number | null {
  if (!Number.isFinite(lots)) return null;
  const { minLot, lotStep } = lotRules(spec);
  if (!validLotRules({ minLot, lotStep })) return null;
  const q = Math.round(Math.floor(lots / lotStep + 1e-6) * lotStep * 1e6) / 1e6;
  return q >= minLot - 1e-9 ? q : null;
}

export type LotDecision = { lots: number; error?: undefined } | { lots?: undefined; error: string };

/**
 * TÜM emir yolları (ticket, pozisyon çizimi, Shift+Buy/Sell hızlı emir) için tek lot kararı.
 * mode 'risk': bakiyenin riskPct'i ve stop mesafesine göre; 'lots': elle seçilen lot (adıma indirilir).
 * Geçersiz / bütçeye sığmayan durumda lot yerine açıklama döner ve emir açılmamalıdır.
 */
export function decideLots(
  spec: SymbolSpec,
  p: { mode: 'risk' | 'lots'; lots: number; riskPct: number; balance: number; entry: number; sl: number; commissionPerLot?: number },
): LotDecision {
  if (p.mode === 'lots') {
    const l = normalizeLots(spec, p.lots);
    if (l == null) return { error: `Geçersiz lot: en az ${lotRules(spec).minLot}, adım ${lotRules(spec).lotStep}.` };
    return { lots: l };
  }
  const l = lotsForRisk(spec, p.balance, p.riskPct, p.entry, p.sl, p.commissionPerLot);
  return l == null ? { error: noLotReason(spec, p.balance, p.riskPct, p.entry, p.sl, p.commissionPerLot) } : { lots: l };
}

/** lotsForRisk null döndüğünde kullanıcıya gösterilecek açıklama. */
export function noLotReason(spec: SymbolSpec, balance: number, riskPct: number, entry: number, sl: number, commissionPerLot = 0): string {
  const stop = stopRiskPerLot(spec, entry, sl);
  const perLot = stop + Math.max(0, commissionPerLot);
  if (!(stop > 0) || !Number.isFinite(stop)) return 'Stop mesafesi geçersiz (giriş ile SL aynı veya sayı değil).';
  if (!(balance > 0) || !(riskPct > 0)) return 'Bakiye ve risk % sıfırdan büyük olmalı.';
  const { minLot } = lotRules(spec);
  return `Risk bütçesine ($${((balance * riskPct) / 100).toFixed(2)}) sığan lot yok: en küçük işlem (${minLot} lot) bu stopla $${(perLot * minLot).toFixed(2)} riske eder. Stopu daralt veya risk %'sini artır.`;
}

/** İşleme yazılı komisyonun toplamı (USD, gidiş-dönüş). */
export const commissionOf = (tr: Pick<Trade, 'commissionPerLot' | 'lots'>): number => (tr.commissionPerLot ?? 0) * tr.lots;

/** Açık pozisyonun şimdi px fiyatından likide edilirse NET K/Z'si: komisyon rezerve edilir (kapanışta çift düşülmez). */
export const liquidationPnl = (spec: SymbolSpec, tr: Trade, px: number): number => calcPnl(spec, tr.side, tr.entry, px, tr.lots) - commissionOf(tr);

/**
 * İşlemi kapatır. pnl ve r NET'tir: komisyon (varsa) pnl'den düşülür; R, ilk parasal riske göre
 * komisyon kadar azalır (net R = brüt R - komisyon / ilk risk). Komisyonsuzken eski değerlerle birebir aynıdır.
 */
export function closeTrade(spec: SymbolSpec, tr: Trade, exit: number, time: number, reason: ExitReason): Trade {
  const gross = calcPnl(spec, tr.side, tr.entry, exit, tr.lots);
  const commission = (tr.commissionPerLot ?? 0) * tr.lots;
  const pnl = gross - commission;
  let r = calcR(tr.side, tr.entry, exit, tr.initialSl);
  if (r != null && commission > 0 && tr.initialSl != null) {
    const riskUsd = stopRiskPerLot(spec, tr.entry, tr.initialSl) * tr.lots;
    r -= commission / riskUsd;
  }
  const costs = commission > 0 ? { grossPnl: gross, commission } : {};
  return { ...tr, ...costs, status: 'closed', exit, closedAt: time, exitReason: reason, pnl, r, result: classify(r, pnl) };
}

/**
 * İşleme girişin gerçek zamanı. Piyasa emri, son kapanan mumun (openedAt = mum başlangıcı) kapanışında,
 * yani emrin verildiği replay anında (createdAt) açılır; 17:00'de verilen emir 16:59 mumundan girse bile
 * yeni işlem gününe ve 17:00 seansına aittir. Bekleyen emir mum başlangıcında dolmuş sayılır.
 */
export const entryTime = (t: Pick<Trade, 'orderType' | 'createdAt' | 'openedAt'>): number =>
  t.orderType === 'market' ? t.createdAt : t.openedAt ?? t.createdAt;

/** Oturumdaki en son işlem olayının zamanı (emir verme, açılış, kapanış, iptal); işlem yoksa null. */
export function lastTradeEvent(trades: Trade[]): number | null {
  let t: number | null = null;
  for (const tr of trades) {
    for (const x of [tr.createdAt, tr.openedAt, tr.closedAt]) if (x != null && (t == null || x > t)) t = x;
  }
  return t;
}

/**
 * Replay zamanından SONRAYA ait işlem kaydı var mı (eski sürümde geri sarılmış, tutarsız kronoloji)?
 * Varsa en geç olayın zamanını döndürür. Otomatik düzeltme/silme yapılmaz; yalnızca uyarı içindir.
 */
export function chronologyIssue(trades: Trade[], replayTime: number): number | null {
  const last = lastTradeEvent(trades);
  return last != null && last > replayTime ? last : null;
}

/**
 * Replay zamanını `target`a GERİ almak, kayıtlı bir işlem olayından önceye düşüyorsa o olayın zamanını döndürür
 * (engel). Aksi halde null. Geleceği bilerek aynı hareketi yeniden işlemlemeyi ve hesap/kronoloji
 * çelişkisini önler; grafik kaydırma etkilenmez (yalnızca replay zamanı).
 */
export function rewindBlockedBy(trades: Trade[], target: number): number | null {
  const last = lastTradeEvent(trades);
  return last != null && target < last ? last : null;
}

/** Emir tipi: giriş fiyatı mevcut fiyata göre limit mi stop mu? */
export function pendingType(side: Side, entry: number, price: number): 'limit' | 'stop' {
  return side === 'long' ? (entry < price ? 'limit' : 'stop') : entry > price ? 'limit' : 'stop';
}

export interface OHLC {
  o: number;
  h: number;
  l: number;
  c: number;
}

/** 1m mum: bid OHLC; ask varsa gerçek spread kullanılır (yoksa ask = bid). */
export interface Candle extends OHLC {
  t: number;
  ask?: OHLC;
}

/** İşleme GİRİŞ fiyatlarının geldiği taraf: long ask'tan alır, short bid'den satar. */
export const entrySide = (side: Side, k: Candle): OHLC => (side === 'long' ? k.ask ?? k : k);
/** İşlemden ÇIKIŞ (SL/TP) fiyatlarının geldiği taraf: long bid'e satar, short ask'tan geri alır. */
export const exitSide = (side: Side, k: Candle): OHLC => (side === 'long' ? k : k.ask ?? k);

/**
 * Bir 1m mumu işleme uygular. Değişen işlemi döndürür, değişmediyse aynı nesneyi döndürür.
 * Mumun kapanış zamanı = t + 60.
 */
export function applyCandle(spec: SymbolSpec, tr: Trade, k: Candle): Trade {
  if (tr.status === 'pending') {
    const long = tr.side === 'long';
    const e = entrySide(tr.side, k);
    let fill: number | null = null;
    if (tr.orderType === 'limit') {
      if (long && e.l <= tr.entry) fill = Math.min(e.o, tr.entry);
      if (!long && e.h >= tr.entry) fill = Math.max(e.o, tr.entry);
    } else {
      if (long && e.h >= tr.entry) fill = Math.max(e.o, tr.entry);
      if (!long && e.l <= tr.entry) fill = Math.min(e.o, tr.entry);
    }
    if (fill == null) return tr;
    const opened: Trade = { ...tr, status: 'open', entry: fill, openedAt: k.t };
    // Mumun açılışında dolduysa (gap veya açılış = giriş) mumun tamamı dolumdan sonradır.
    if (fill === e.o) return applyOpen(spec, opened, k);
    return applyFillBar(spec, opened, k);
  }
  if (tr.status !== 'open') return tr;
  return applyOpen(spec, tr, k);
}

const addFlag = (tr: Trade, f: TradeFlag): Trade => (tr.flags?.includes(f) ? tr : { ...tr, flags: [...(tr.flags ?? []), f] });

/**
 * Mum içinde dolan emir. Dolum anı bilinmez; yalnızca kanıtlanabilir sonuçlar yazılır (başlık yorumuna bakın).
 * Süreklilik argümanı bid/ask ayrımında da geçerlidir (ask >= bid olduğundan): stop emrinde ask girişi aşmadan
 * bid TP'yi aşamaz; limit emrinde dolumda bid <= giriş < TP, kapanış TP ötesindeyse sonradan TP geçilmek zorundadır.
 */
function applyFillBar(spec: SymbolSpec, tr: Trade, k: Candle): Trade {
  const long = tr.side === 'long';
  const x = exitSide(tr.side, k);
  const slSeen = tr.sl != null && (long ? x.l <= tr.sl : x.h >= tr.sl);
  const tpSeen = tr.tp != null && (long ? x.h >= tr.tp : x.l <= tr.tp);
  const closesBeyondTp = tr.tp != null && (long ? x.c >= tr.tp : x.c <= tr.tp);
  const provableTp = tpSeen && (tr.orderType === 'stop' || closesBeyondTp);
  const closeTime = k.t + 60;
  if (slSeen) {
    // SL-önce (muhafazakâr). SL dolum anında zaten tetiklenmiş olabilir: çıkış, SL'ye en yakın erişilebilir fiyat.
    const exit = long ? Math.min(tr.sl!, x.h) : Math.max(tr.sl!, x.l);
    let c = closeTrade(spec, tr, exit, closeTime, 'sl');
    if (tr.orderType === 'stop') c = addFlag(c, 'fill-bar-sl-unknown');
    if (tpSeen) c = addFlag(c, provableTp ? 'sl-tp-same-bar' : 'fill-bar-tp-unknown');
    return c;
  }
  if (provableTp) return closeTrade(spec, tr, tr.tp!, closeTime, 'tp');
  return tpSeen ? addFlag(tr, 'fill-bar-tp-unknown') : tr;
}

/** Açık pozisyona bir 1m mum uygular (açılışta dolan bekleyen emirler de buraya düşer). */
function applyOpen(spec: SymbolSpec, tr: Trade, k: Candle): Trade {
  const closeTime = k.t + 60;
  const long = tr.side === 'long';
  const { sl, tp } = tr;
  const x = exitSide(tr.side, k);
  const slSeen = sl != null && (long ? x.l <= sl : x.h >= sl);
  const tpSeen = tp != null && (long ? x.h >= tp : x.l <= tp);
  // Açılış zaten seviyenin ötesindeyse sıra bellidir (gap): çıkış açılıştan, belirsizlik yok.
  if (long) {
    if (sl != null && x.o <= sl) return closeTrade(spec, tr, x.o, closeTime, 'sl');
    if (tp != null && x.o >= tp) return closeTrade(spec, tr, x.o, closeTime, 'tp');
  } else {
    if (sl != null && x.o >= sl) return closeTrade(spec, tr, x.o, closeTime, 'sl');
    if (tp != null && x.o <= tp) return closeTrade(spec, tr, x.o, closeTime, 'tp');
  }
  // Mum içinde: ikisi de görüldüyse hangisinin önce olduğu bilinmez, SL-önce varsayılır.
  if (slSeen) {
    const c = closeTrade(spec, tr, sl!, closeTime, 'sl');
    return tpSeen ? addFlag(c, 'sl-tp-same-bar') : c;
  }
  if (tpSeen) return closeTrade(spec, tr, tp!, closeTime, 'tp');
  return tr;
}
