// Performans istatistikleri (saf fonksiyonlar). Yalnızca kapanmış işlemler sayılır.

import { toNyLocal } from '../../shared/nytime.js';
import type { Trade } from './trading';

export interface EquityPoint {
  n: number;
  t: number;
  balance: number;
  pnl: number;
  r: number | null;
  symbol: string;
}

export interface PerfStats {
  trades: number;
  wins: number;
  losses: number;
  bes: number;
  winRate: number;
  net: number;
  netPct: number;
  grossWin: number;
  grossLoss: number;
  profitFactor: number | null;
  totalR: number;
  avgR: number | null;
  avgWinR: number | null;
  avgLossR: number | null;
  avgWin: number | null;
  avgLoss: number | null;
  largestWin: number;
  largestLoss: number;
  maxDrawdown: number;
  maxDrawdownPct: number;
  maxWinStreak: number;
  maxLossStreak: number;
  avgHoldMin: number | null;
  equity: EquityPoint[];
}

export const closedTrades = (trades: Trade[]) => trades.filter((t) => t.status === 'closed').sort((a, b) => (a.closedAt ?? 0) - (b.closedAt ?? 0));

const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);

export function computeStats(trades: Trade[], initialBalance: number): PerfStats {
  const closed = closedTrades(trades);
  const wins = closed.filter((t) => t.result === 'win');
  const losses = closed.filter((t) => t.result === 'loss');
  const net = closed.reduce((a, t) => a + (t.pnl ?? 0), 0);
  const grossWin = closed.reduce((a, t) => a + Math.max(0, t.pnl ?? 0), 0);
  const grossLoss = closed.reduce((a, t) => a + Math.min(0, t.pnl ?? 0), 0);
  const rs = closed.filter((t) => t.r != null).map((t) => t.r!);

  const equity: EquityPoint[] = [];
  let bal = initialBalance;
  let peak = initialBalance;
  let maxDD = 0;
  let maxDDPct = 0;
  let streak = 0;
  let maxWin = 0;
  let maxLoss = 0;
  closed.forEach((t, i) => {
    bal += t.pnl ?? 0;
    equity.push({ n: i + 1, t: t.closedAt ?? 0, balance: bal, pnl: t.pnl ?? 0, r: t.r ?? null, symbol: t.symbol });
    peak = Math.max(peak, bal);
    if (peak - bal > maxDD) {
      maxDD = peak - bal;
      maxDDPct = (maxDD / peak) * 100;
    }
    if (t.result === 'win') streak = streak > 0 ? streak + 1 : 1;
    else if (t.result === 'loss') streak = streak < 0 ? streak - 1 : -1;
    else streak = 0;
    maxWin = Math.max(maxWin, streak);
    maxLoss = Math.max(maxLoss, -streak);
  });

  const holds = closed.filter((t) => t.openedAt != null && t.closedAt != null).map((t) => (t.closedAt! - t.openedAt!) / 60);
  return {
    trades: closed.length,
    wins: wins.length,
    losses: losses.length,
    bes: closed.length - wins.length - losses.length,
    winRate: closed.length ? (wins.length / closed.length) * 100 : 0,
    net,
    netPct: (net / initialBalance) * 100,
    grossWin,
    grossLoss,
    profitFactor: grossLoss < 0 ? grossWin / -grossLoss : null,
    totalR: rs.reduce((a, b) => a + b, 0),
    avgR: avg(rs),
    avgWinR: avg(wins.filter((t) => t.r != null).map((t) => t.r!)),
    avgLossR: avg(losses.filter((t) => t.r != null).map((t) => t.r!)),
    avgWin: avg(wins.map((t) => t.pnl ?? 0)),
    avgLoss: avg(losses.map((t) => t.pnl ?? 0)),
    largestWin: Math.max(0, ...closed.map((t) => t.pnl ?? 0)),
    largestLoss: Math.min(0, ...closed.map((t) => t.pnl ?? 0)),
    maxDrawdown: maxDD,
    maxDrawdownPct: maxDDPct,
    maxWinStreak: maxWin,
    maxLossStreak: maxLoss,
    avgHoldMin: avg(holds),
    equity,
  };
}

export interface BreakdownRow {
  key: string;
  trades: number;
  winRate: number;
  totalR: number;
  net: number;
}

export function breakdown(trades: Trade[], keyOf: (t: Trade) => string, order?: string[]): BreakdownRow[] {
  const groups = new Map<string, Trade[]>();
  for (const t of closedTrades(trades)) {
    const k = keyOf(t);
    groups.set(k, [...(groups.get(k) ?? []), t]);
  }
  const rows = [...groups.entries()].map(([key, ts]) => ({
    key,
    trades: ts.length,
    winRate: (ts.filter((t) => t.result === 'win').length / ts.length) * 100,
    totalR: ts.reduce((a, t) => a + (t.r ?? 0), 0),
    net: ts.reduce((a, t) => a + (t.pnl ?? 0), 0),
  }));
  if (order) rows.sort((a, b) => order.indexOf(a.key) - order.indexOf(b.key));
  return rows;
}

export const WEEKDAYS = ['Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi', 'Pazar'];

/** İşlem gününe göre (NY) hafta günü. */
export function weekdayOf(utc: number): string {
  const d = new Date(toNyLocal(utc) * 1000).getUTCDay();
  return WEEKDAYS[(d + 6) % 7];
}

export const SESSIONS = ['Asya 20-02', 'Londra 02-07', 'NY sabah 07-12', 'NY öğle 12-17', 'Kapanış 17-20'];

/** Giriş saatine (NY) göre seans. */
export function sessionOf(utc: number): string {
  const d = new Date(toNyLocal(utc) * 1000);
  const h = d.getUTCHours() + d.getUTCMinutes() / 60;
  if (h >= 20 || h < 2) return SESSIONS[0];
  if (h < 7) return SESSIONS[1];
  if (h < 12) return SESSIONS[2];
  if (h < 17) return SESSIONS[3];
  return SESSIONS[4];
}
