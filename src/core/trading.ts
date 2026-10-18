// Emir / pozisyon simülasyonu. Her açıklanan 1m mum için çalışır.
//
// Varsayımlar (muhafazakâr):
//   - Grafik bid fiyatıdır. Kaynakta ask varsa (OANDA) gerçek spread uygulanır:
//     long ask'tan açılır / bid ile kapanır, short bid'den açılır / ask ile kapanır.
//     Ask yoksa (HistData) spread 0 kabul edilir. Komisyon uygulanmaz.
//   - Aynı 1m mumda hem SL hem TP görülürse önce SL vurulmuş sayılır.
//   - Fiyat SL/TP'nin ötesinde açılırsa (gap) çıkış açılış fiyatından olur.
//   - Bekleyen emir dolduğu mumda TP sayılmaz, SL sayılır.

import type { SymbolSpec } from '../../shared/symbols.js';

export type Side = 'long' | 'short';
export type TradeStatus = 'pending' | 'open' | 'closed' | 'cancelled';
export type ExitReason = 'tp' | 'sl' | 'manual' | 'breach';
export type TradeResult = 'win' | 'loss' | 'be';

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

/** Risk yüzdesine göre lot (0.01'e aşağı yuvarlanır, en az 0.01). */
export function lotsForRisk(spec: SymbolSpec, balance: number, riskPct: number, entry: number, sl: number): number {
  const perLot = Math.abs(entry - sl) * usdPerPriceUnit(spec, entry);
  if (perLot <= 0) return 0.01;
  // 1e-6 toleransı: 1.1 - 1.099 gibi kayan nokta farkları 10 lotu 9.99'a düşürmesin.
  const lots = Math.floor(((balance * riskPct) / 100 / perLot) * 100 + 1e-6) / 100;
  return Math.max(0.01, lots);
}

export function closeTrade(spec: SymbolSpec, tr: Trade, exit: number, time: number, reason: ExitReason): Trade {
  const pnl = calcPnl(spec, tr.side, tr.entry, exit, tr.lots);
  const r = calcR(tr.side, tr.entry, exit, tr.initialSl);
  return { ...tr, status: 'closed', exit, closedAt: time, exitReason: reason, pnl, r, result: classify(r, pnl) };
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
  const closeTime = k.t + 60;
  const long = tr.side === 'long';
  if (tr.status === 'pending') {
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
    let opened: Trade = { ...tr, status: 'open', entry: fill, openedAt: k.t };
    // Dolduğu mumda stop seviyesi de görülmüşse zarar kabul edilir.
    const x = exitSide(tr.side, k);
    if (opened.sl != null && (long ? x.l <= opened.sl : x.h >= opened.sl)) {
      opened = closeTrade(spec, opened, opened.sl, closeTime, 'sl');
    }
    return opened;
  }
  if (tr.status !== 'open') return tr;

  const { sl, tp } = tr;
  const x = exitSide(tr.side, k);
  if (long) {
    if (sl != null && x.o <= sl) return closeTrade(spec, tr, x.o, closeTime, 'sl');
    if (tp != null && x.o >= tp) return closeTrade(spec, tr, x.o, closeTime, 'tp');
    if (sl != null && x.l <= sl) return closeTrade(spec, tr, sl, closeTime, 'sl');
    if (tp != null && x.h >= tp) return closeTrade(spec, tr, tp, closeTime, 'tp');
  } else {
    if (sl != null && x.o >= sl) return closeTrade(spec, tr, x.o, closeTime, 'sl');
    if (tp != null && x.o <= tp) return closeTrade(spec, tr, x.o, closeTime, 'tp');
    if (sl != null && x.h >= sl) return closeTrade(spec, tr, sl, closeTime, 'sl');
    if (tp != null && x.l <= tp) return closeTrade(spec, tr, tp, closeTime, 'tp');
  }
  return tr;
}
