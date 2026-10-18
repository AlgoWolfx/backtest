// Emirler: pozisyon aracından emir, sağ tık emri, grafik üzerinde emir bileti, hızlı emir ve stop tamponu.

import { getSymbol } from '../../shared/symbols.js';
import { aggregate, aggIndexOfM1, revealedCount } from '../core/data';
import { decideLots, pendingType, widenStop, type Side, type Trade } from '../core/trading';
import { noteTradingDay } from '../core/account';
import { TOOL_DEFAULTS, loadTemplate } from '../prefs/drawingTemplates';
import { balanceOf } from '../core/simulate';
import { type NewDrawing, type Position, type Session } from '../core/types';
import { fmtPrice } from '../lib/format';
import { type Ticket, get, set, toast, patchSession, nextId, currentData, entryPriceNow, lastBarTime } from './state';
import { mapDrawing, drawingsOf, addDrawing, deleteDrawing, validLevels } from './drawings';
import { emitTrade } from './trades';

export function setSlBuffer(slBuffer: number) {
  patchSession(() => ({ slBuffer }));
}

/** Stop tamponunu uygular ve fiyat basamağına yuvarlar. */
export function bufferedSl(s: Session, side: Side, sl: number): number {
  const spec = getSymbol(s.symbol);
  const w = widenStop(spec, side, sl, s.slBuffer ?? 0);
  return Math.round(w * 10 ** spec.digits) / 10 ** spec.digits;
}

/** Pozisyon aracından emir. market=true: anlık fiyattan; false: çizimdeki girişten limit/stop. */
/** Hesap patladıysa yeni işlem açılamaz. */
function accountLocked(s: Session): boolean {
  if (s.account?.state.status !== 'failed') return false;
  toast(`Hesap patladı (${s.account.state.reason}); yeni işlem açılamaz. Yeni oturum başlatın.`, 'error');
  return true;
}

/** Sağ tık: verilen fiyatta bu yöndeki bekleyen emir limit mi stop mu olur (anlık fiyat yoksa null). */
export function pendingKindAt(side: Side, price: number): 'limit' | 'stop' | null {
  const s = get().session;
  if (!s) return null;
  const cur = entryPriceNow(s.symbol, side);
  return cur == null ? null : pendingType(side, price, cur);
}

/**
 * Sağ tık ile bekleyen emir: o fiyatta long / short pozisyon çizimi (SL = dist kadar uzakta + stop tamponu, TP = 2R)
 * oluşturur ve hemen bekleyen emir olarak yerleştirir. Sonradan çizimin tutamaçlarıyla (giriş / SL / TP),
 * çift tık ayarlarıyla veya "Emri iptal et" ile düzenlenir. Başarısızsa çizim silinir ve null döner.
 */
export function placePendingAt(side: Side, price: number, t: number, tEnd: number, dist: number): string | null {
  const s = get().session;
  if (!s || accountLocked(s)) return null;
  const spec = getSymbol(s.symbol);
  const dir = side === 'long' ? 1 : -1;
  const round = (p: number) => Math.round(p * 10 ** spec.digits) / 10 ** spec.digits;
  const entry = round(price);
  const sl = bufferedSl(s, side, round(entry - dir * dist));
  const tp = round(entry + dir * Math.abs(entry - sl) * 2);
  const id = addDrawing({ type: side, ...TOOL_DEFAULTS[side], entry: { t, p: entry }, sl, tp, tEnd, riskPct: s.riskPct, ...(get().sizing === 'lots' ? { lots: s.lots } : {}), ...loadTemplate(side) } as NewDrawing);
  if (!placeOrderFromDrawing(id, false)) {
    deleteDrawing(id, false);
    return null;
  }
  set({ selectedId: id });
  return id;
}

export function placeOrderFromDrawing(drawingId: string, market: boolean, lotsOverride?: number): boolean {
  const s = get().session;
  if (!s || accountLocked(s)) return false;
  const d = drawingsOf(s).find((x) => x.id === drawingId) as Position | undefined;
  if (!d || (d.type !== 'long' && d.type !== 'short') || d.tradeId) return false;
  const side: Side = d.type;
  const price = entryPriceNow(s.symbol, side);
  const barT = lastBarTime();
  if (price == null || barT == null) return false;
  const spec = getSymbol(s.symbol);
  const entry = market ? price : d.entry.p;
  if (!validLevels(side, entry, d.sl, d.tp)) {
    toast(side === 'long' ? 'Long için SL girişin altında, TP üstünde olmalı.' : 'Short için SL girişin üstünde, TP altında olmalı.', 'error');
    return false;
  }
  const fixedLots = lotsOverride ?? d.lots; // elle verilen lot (alt çubuk / çizimdeki sabit lot) risk %'sinden önceliklidir
  const dec = decideLots(spec, { mode: fixedLots != null ? 'lots' : 'risk', lots: fixedLots ?? 0, riskPct: d.riskPct, balance: balanceOf(s), entry, sl: d.sl, commissionPerLot: s.commissionPerLot });
  if (dec.error != null) {
    toast(dec.error, 'error');
    return false;
  }
  const lots = dec.lots;
  const id = nextId('t');
  const s2 = get().session!;
  const trade: Trade = {
    id,
    symbol: s.symbol,
    side,
    status: market ? 'open' : 'pending',
    orderType: market ? 'market' : pendingType(side, entry, price),
    createdAt: s.replayTime,
    openedAt: market ? barT : undefined,
    entry,
    sl: d.sl,
    tp: d.tp,
    initialSl: d.sl,
    lots,
    ...(fixedLots == null ? { riskPct: d.riskPct } : {}),
    drawingId,
    ...(s.commissionPerLot ? { commissionPerLot: s.commissionPerLot } : {}),
  };
  const entryPt = market ? { t: barT, p: price } : d.entry;
  set({
    session: {
      ...s2,
      trades: [...s2.trades, trade],
      drawings: mapDrawing(s2.drawings, s.symbol, drawingId, (x) => ({ ...(x as Position), tradeId: id, entry: entryPt, ...(fixedLots != null ? { lots: fixedLots } : {}) })),
      account: market && s2.account ? noteTradingDay(s2.account, s.replayTime) : s2.account,
      updatedAt: Date.now(),
    },
  });
  if (market) emitTrade('open', id);
  toast(market ?`${side === 'long' ? 'Alış' : 'Satış'} açıldı: ${lots} lot @ ${fmtPrice(entry, spec)}` : `${side === 'long' ? 'Buy' : 'Sell'} ${trade.orderType === 'limit' ? 'Limit' : 'Stop'} emri verildi: ${lots} lot @ ${fmtPrice(entry, spec)}`);
  return true;
}

export function startTicket(side: Side) {
  const s = get().session;
  if (!s || accountLocked(s)) return;
  if (entryPriceNow(s.symbol, side) == null) return toast(`${s.symbol} verisi yüklü değil.`, 'error');
  set({ ticket: { side, kind: get().orderKind, entry: null, sl: null }, tool: 'cursor', selectedId: null, pickingStart: false });
}

export function cancelTicket(): boolean {
  if (!get().ticket) return false;
  set({ ticket: null });
  return true;
}

export type TicketStep = 'entry' | 'sl' | 'tp';

export function ticketStep(t: Ticket): TicketStep {
  if (t.kind !== 'market' && t.entry == null) return 'entry';
  return t.sl == null ? 'sl' : 'tp';
}

/** Biletin giriş fiyatı: market'te anlık fiyat, limit/stop'ta seçilen fiyat. */
export function ticketEntry(t: Ticket): number | null {
  if (t.kind === 'market') return entryPriceNow(get().session?.symbol ?? '', t.side);
  return t.entry;
}

/** Tıklanan fiyatı mevcut adıma uygular. Geçersizse nedenini söyler ve adımı değiştirmez. */
export function ticketClick(price: number, tick: number, makeDrawing: (entry: number, sl: number, tp: number) => string | null) {
  const t = get().ticket;
  const s = get().session;
  if (!t || !s) return;
  const long = t.side === 'long';
  const now = entryPriceNow(s.symbol, t.side);
  if (now == null) return;
  const step = ticketStep(t);
  if (step === 'entry') {
    const ok = t.kind === 'limit' ? (long ? price < now : price > now) : long ? price > now : price < now;
    if (!ok) {
      const need = t.kind === 'limit' ? (long ? 'altında' : 'üstünde') : long ? 'üstünde' : 'altında';
      return toast(`${long ? 'Buy' : 'Sell'} ${t.kind === 'limit' ? 'Limit' : 'Stop'} girişi anlık fiyatın ${need} olmalı.`, 'error');
    }
    return set({ ticket: { ...t, entry: price } });
  }
  const entry = ticketEntry(t)!;
  if (step === 'sl') {
    if (long ? price > entry - tick / 2 : price < entry + tick / 2) return toast(long ? 'Stop (SL) girişin altında olmalı.' : 'Stop (SL) girişin üstünde olmalı.', 'error');
    return set({ ticket: { ...t, sl: bufferedSl(s, t.side, price) } });
  }
  if (long ? price < entry + tick / 2 : price > entry - tick / 2) return toast(long ? 'Hedef (TP) girişin üstünde olmalı.' : 'Hedef (TP) girişin altında olmalı.', 'error');
  const sl = t.sl!;
  const market = t.kind === 'market';
  const dId = makeDrawing(entry, sl, price);
  if (!dId) return;
  const lots = get().sizing === 'lots' ? s.lots : undefined;
  const ok = placeOrderFromDrawing(dId, market, lots);
  if (!ok) deleteDrawing(dId, false);
  set({ ticket: null, selectedId: ok ? dId : null });
}

/** Hızlı emir (Shift+Buy/Sell): anlık fiyattan, ATR tabanlı varsayılan SL ve 2R TP ile. */
export function marketOrder(side: Side) {
  const s = get().session;
  const d = currentData();
  const price = s ? entryPriceNow(s.symbol, side) : null;
  const barT = lastBarTime();
  if (!s || !d || price == null || barT == null || accountLocked(s)) return;
  const agg = aggregate(d, s.tf);
  const r = revealedCount(d, s.replayTime);
  const k = aggIndexOfM1(agg, r - 1);
  let sum = 0;
  let cnt = 0;
  for (let i = Math.max(0, k - 14); i < k; i++, cnt++) sum += (agg.h[i] - agg.l[i]) / d.scale;
  const atr = cnt ? sum / cnt : price * 0.002;
  const dist = Math.max(atr * 1.5, price * 0.0002);
  const dir = side === 'long' ? 1 : -1;
  const spec = getSymbol(s.symbol);
  const round = (p: number) => Math.round(p * d.scale) / d.scale;
  const sl = bufferedSl(s, side, round(price - dir * dist));
  const tp = round(price + dir * Math.abs(price - sl) * 2); // 2R: tampon dahil gerçek stop mesafesine göre
  // Hızlı emir de normal ticket ile aynı boyutlandırma kuralını kullanır (Risk % veya sabit lot).
  const dec = decideLots(spec, { mode: get().sizing, lots: s.lots, riskPct: s.riskPct, balance: balanceOf(s), entry: price, sl, commissionPerLot: s.commissionPerLot });
  if (dec.error != null) return toast(dec.error, 'error');
  const lots = dec.lots;
  const id = nextId('t');
  const dId = nextId('d');
  const s2 = get().session!;
  const pos: Position = {
    id: dId,
    type: side,
    color: '#787b86',
    width: 1,
    entry: { t: barT, p: price },
    sl,
    tp,
    tEnd: barT + 25 * Math.max(60, agg.utc[k] - (agg.utc[k - 1] ?? agg.utc[k] - 60)),
    riskPct: s.riskPct,
    tradeId: id,
  };
  const trade: Trade = { id, symbol: s.symbol, side, status: 'open', orderType: 'market', createdAt: s.replayTime, openedAt: barT, entry: price, sl, tp, initialSl: sl, lots, drawingId: dId, ...(s.commissionPerLot ? { commissionPerLot: s.commissionPerLot } : {}) };
  set({
    session: {
      ...s2,
      trades: [...s2.trades, trade],
      drawings: { ...s2.drawings, [s.symbol]: [...drawingsOf(s2), pos] },
      account: s2.account ? noteTradingDay(s2.account, s.replayTime) : undefined,
      updatedAt: Date.now(),
    },
    selectedId: dId,
  });
  emitTrade('open', id);
  toast(`${side === 'long' ? 'Alış' : 'Satış'} açıldı: ${lots} lot @ ${fmtPrice(price, spec)}. SL/TP'yi grafikte sürükleyebilirsiniz.`);
}
