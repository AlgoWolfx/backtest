// İşlemler: açılış / kapanış olayları, manuel kapatma, not ve işlem sonrası değerlendirme.

import { getSymbol } from '../../shared/symbols.js';
import { closeTrade, type Trade, type TradeReview } from '../core/trading';
import { afterBalanceChange, rollDay } from '../core/account';
import { get, set, toast, patchSession, exitPriceNow } from './state';
import { stopPlay } from './replay';

export type TradeEvent = { kind: 'open' | 'close'; tradeId: string };

const tradeListeners = new Set<(e: TradeEvent) => void>();

export function onTradeEvent(fn: (e: TradeEvent) => void) {
  tradeListeners.add(fn);
  return () => {
    tradeListeners.delete(fn);
  };
}

export function emitTrade(kind: TradeEvent['kind'], tradeId: string) {
  for (const fn of tradeListeners) fn({ kind, tradeId });
}

function patchTrade(id: string, fn: (t: Trade) => Trade) {
  patchSession((s) => ({ trades: s.trades.map((t) => (t.id === id ? fn(t) : t)) }));
}

export function setTradeShot(id: string, kind: 'open' | 'close', name: string) {
  patchTrade(id, (t) => ({ ...t, shots: { ...t.shots, [kind]: name } }));
}

/** Kapanmış işlemi değerlendirme sırasına koyar; oynatma durur ve pencere açılır. */
export function queueReview(id: string) {
  const tr = get().session?.trades.find((t) => t.id === id);
  if (!tr || tr.status !== 'closed') return;
  stopPlay();
  set({ reviewQueue: [...get().reviewQueue.filter((x) => x !== id), id] });
}

/** Performans sayfasından: işlemin değerlendirmesini (yeniden) aç. */
export function editReview(id: string) {
  const tr = get().session?.trades.find((t) => t.id === id);
  if (!tr || tr.status !== 'closed') return;
  set({ reviewQueue: [id, ...get().reviewQueue.filter((x) => x !== id)] });
}

export function skipReview(id: string) {
  set({ reviewQueue: get().reviewQueue.filter((x) => x !== id) });
}

export function saveReview(id: string, review: Omit<TradeReview, 'reviewedAt'>) {
  patchTrade(id, (t) => ({ ...t, review: { ...review, reviewedAt: Date.now() } }));
  skipReview(id);
}

export function setTradeNote(id: string, note: string) {
  patchTrade(id, (t) => ({ ...t, note }));
}

export function closeTradeManual(tradeId: string) {
  const s = get().session;
  if (!s) return;
  const tr = s.trades.find((t) => t.id === tradeId);
  if (!tr) return;
  if (tr.status === 'pending') {
    patchSession((s) => ({ trades: s.trades.map((t) => (t.id === tradeId ? { ...t, status: 'cancelled', closedAt: s.replayTime } : t)) }));
    return toast('Emir iptal edildi.');
  }
  if (tr.status !== 'open') return;
  const price = exitPriceNow(tr);
  if (price == null) return toast(`${tr.symbol} verisi yüklü değil.`, 'error');
  const closed = closeTrade(getSymbol(tr.symbol), tr, price, s.replayTime, 'manual');
  patchSession((s) => {
    const trades = s.trades.map((t) => (t.id === tradeId ? closed : t));
    const balance = s.initialBalance + trades.reduce((a, t) => a + (t.status === 'closed' ? (t.pnl ?? 0) : 0), 0);
    const account = s.account
      ? afterBalanceChange({ ...s.account, state: rollDay(s.account.state, s.replayTime, balance - (closed.pnl ?? 0), s.account.rules.resetMode) }, s.initialBalance, s.replayTime, balance, trades.some((t) => t.status === 'open'))
      : undefined;
    return { trades, account };
  });
  emitTrade('close', tradeId);
  queueReview(tradeId);
  if (get().session?.account?.state.status === 'passed' && s.account?.state.status !== 'passed') {
    return toast(`Tebrikler, değerlendirme geçildi: ${get().session!.account!.state.reason}.`, 'win');
  }
  toast(`${tr.symbol} manuel kapatıldı: ${closed.pnl! >= 0 ? '+' : ''}$${closed.pnl!.toFixed(2)}${closed.r != null ? ` (${closed.r.toFixed(2)}R)` : ''}`, closed.result === 'win' ? 'win' : closed.result === 'loss' ? 'loss' : 'info');
}
