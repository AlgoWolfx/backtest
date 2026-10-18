// Replay boyunca açık işlemlere 1m mumları uygular ve hesap kurallarını denetler (saf çekirdek; store'dan bağımsız).

import { getSymbol } from '../../shared/symbols.js';
import { revealedCount, type M1Data } from './data';
import { applyCandle, calcPnl, type Candle, closeTrade, exitSide, type Trade } from './trading';
import { afterBalanceChange, evaluate, noteTradingDay, rollDay, type Account } from './account';
import type { Session } from './types';

/** Kapanmış işlemlerin toplam P&L'iyle güncel bakiye. */
export function balanceOf(s: Session): number {
  return s.initialBalance + s.trades.reduce((a, t) => a + (t.status === 'closed' ? t.pnl ?? 0 : 0), 0);
}

export const activeTrades = (s: Session) => s.trades.filter((t) => t.status === 'open' || t.status === 'pending');

export interface SimResult {
  trades: Trade[];
  closed: Trade[];
  filled: Trade[];
  /** İlk işlem olayının (dolum / kapanış) gerçekleştiği mumun kapanış zamanı */
  firstEvent: number | null;
  account?: Account;
  /** Hesap kuralı ihlal edildiyse nedeni */
  breach: string | null;
}

export function candleAt(d: M1Data, i: number): Candle {
  const sc = d.scale;
  return { t: d.t[i], o: d.o[i] / sc, h: d.h[i] / sc, l: d.l[i] / sc, c: d.c[i] / sc, ask: d.ask ? { o: d.ask.o[i] / sc, h: d.ask.h[i] / sc, l: d.ask.l[i] / sc, c: d.ask.c[i] / sc } : undefined };
}

export const isActiveTrade = (t: Trade) => t.status === 'open' || t.status === 'pending';

/**
 * replayTime'dan newTime'a kadar açıklanacak 1m mumları aktif işlemlere uygular (durumu değiştirmez).
 * Birden çok sembolde işlem varsa dakikalar zaman sırasıyla birleştirilir; hesap kuralları (günlük /
 * maks. kayıp) her dakikanın sonunda tüm açık pozisyonların en kötü equity'si ile denetlenir.
 */
export function simulate(s: Session, newTime: number, dataOf: (symbol: string) => M1Data | undefined): SimResult {
  let trades = s.trades;
  const closed: Trade[] = [];
  const filled: Trade[] = [];
  let firstEvent: number | null = null;
  let account = s.account;
  let breach: string | null = null;
  let balance = balanceOf(s);
  const initial = s.initialBalance;

  const cursors = [...new Set(activeTrades(s).map((t) => t.symbol))].flatMap((sym) => {
    const d = dataOf(sym);
    if (!d) return [];
    const i = revealedCount(d, s.replayTime);
    return [{ sym, d, spec: getSymbol(sym), i, to: revealedCount(d, newTime), last: i > 0 ? candleAt(d, i - 1) : null }];
  });
  const lastOf = (sym: string) => cursors.find((c) => c.sym === sym)?.last ?? null;

  const hasActive = (sym: string) => trades.some((t) => t.symbol === sym && isActiveTrade(t));

  for (;;) {
    // Aktif işlemi olan semboller arasında sıradaki en erken dakika. Aynı dakikaya düşen TÜM semboller
    // birlikte işlenir ve hesap kuralları dakikada bir kez denetlenir: sonuç sembol sırasına bağlı değildir.
    let minT: number | null = null;
    for (const c of cursors) {
      if (c.i >= c.to || !hasActive(c.sym)) continue;
      const ti = c.d.t[c.i];
      if (minT == null || ti < minT) minT = ti;
    }
    if (minT == null) break;
    const batch = cursors.filter((c) => c.i < c.to && c.d.t[c.i] === minT && hasActive(c.sym));
    const inBatch = new Set(batch.map((c) => c.sym));
    const closeTime = minT + 60;
    if (account) account = { ...account, state: rollDay(account.state, minT, balance) };

    let changed = false;
    let closedNow = false;
    // Bu dakikada TP ile kapanan işlemler: kapanıştan önce mum dibini görmüş olabilirler (sıra bilinemez).
    const tpClosed: { tr: Trade; k: Candle }[] = [];
    for (const cur of batch) {
      const k = candleAt(cur.d, cur.i++);
      cur.last = k;
      const sym = cur.sym;
      const spec = cur.spec;
      trades = trades.map((tr) => {
        if (tr.symbol !== sym || !isActiveTrade(tr)) return tr;
        const u = applyCandle(spec, tr, k);
        if (u === tr) return tr;
        changed = true;
        if (tr.status === 'pending' && u.status !== 'pending') {
          filled.push(u);
          if (account) account = noteTradingDay(account, k.t);
        }
        if (u.status === 'closed') {
          closed.push(u);
          balance += u.pnl ?? 0;
          closedNow = true;
          if (u.exitReason === 'tp') tpClosed.push({ tr: u, k });
        }
        return u;
      });
    }
    if (changed && (firstEvent == null || closeTime < firstEvent)) firstEvent = closeTime;

    if (account && account.state.status !== 'failed') {
      // Bu dakikadaki en kötü equity: bu dakikanın mumunu gören sembollerde mumun en kötü ucu, diğerlerinde son kapanış.
      // Yönler aynı anda en kötüsünü görmüş sayılır (korelasyonlu, muhafazakâr ve sıradan bağımsız).
      let equityLow = balance;
      let equityClose = balance;
      for (const tr of trades) {
        if (tr.status !== 'open') continue;
        const kk = lastOf(tr.symbol);
        if (!kk) continue;
        const x = exitSide(tr.side, kk);
        const worst = inBatch.has(tr.symbol) ? (tr.side === 'long' ? x.l : x.h) : x.c;
        const sp = getSymbol(tr.symbol);
        equityLow += calcPnl(sp, tr.side, tr.entry, worst, tr.lots);
        equityClose += calcPnl(sp, tr.side, tr.entry, x.c, tr.lots);
      }
      // Aynı dakikada TP ile kapanan işlemlerin olası kapanış öncesi dibi (yalnızca uyarı için, hesabı patlatmaz).
      let equityLowPossible = equityLow;
      for (const { tr, k } of tpClosed) {
        const x = exitSide(tr.side, k);
        const worst = tr.side === 'long' ? x.l : x.h;
        equityLowPossible += Math.min(0, calcPnl(getSymbol(tr.symbol), tr.side, tr.entry, worst, tr.lots) - (tr.pnl ?? 0));
      }
      const ev = evaluate(account, initial, minT, balance, equityLow, { equityClose, equityLowPossible });
      account = ev.account;
      if (ev.breach) {
        // Hesap patladı: tüm pozisyonlar kapanır, bekleyen emirler iptal edilir.
        breach = ev.breach;
        trades = trades.map((tr) => {
          if (tr.status === 'pending') return { ...tr, status: 'cancelled', closedAt: closeTime };
          if (tr.status !== 'open') return tr;
          const kk = lastOf(tr.symbol);
          const px = kk ? exitSide(tr.side, kk).c : tr.entry;
          const u = closeTrade(getSymbol(tr.symbol), tr, px, closeTime, 'breach');
          closed.push(u);
          balance += u.pnl ?? 0;
          return u;
        });
        firstEvent = firstEvent == null ? closeTime : Math.min(firstEvent, closeTime);
        break;
      }
      if (closedNow) account = afterBalanceChange(account, initial, closeTime, balance, trades.some((t) => t.status === 'open'));
    }
  }
  return { trades, closed, filled, firstEvent, account, breach };
}
