// Store çekirdeği: durum tipi, zustand deposu, ortak yardımcılar (oturumu yamalama, kimlik üretme, anlık fiyatlar).

import { create } from 'zustand';
import { revealedCount, type M1Data, type SymbolInfo } from '../core/data';
import { loadTheme, type ChartTheme } from '../prefs/chartTheme';
import { loadSessionSettings } from '../prefs/sessionSettings';
import { type SessionSettings } from '../core/sessions';
import { type Side, type Trade } from '../core/trading';
import { balanceOf } from '../core/simulate';
import { type Session, type Tool } from '../core/types';

export interface SessionSummary {
  id: string;
  name: string;
  symbol: string;
  replayTime: number;
  startTime: number;
  updatedAt: number;
  initialBalance: number;
  balance: number;
  trades: number;
  accountStatus: 'active' | 'failed' | 'passed' | null;
  accountType: 'personal' | 'prop' | null;
}

export type OrderKind = 'market' | 'limit' | 'stop';

/** Emir bileti: entry/sl dolduruldukça bir sonraki adıma geçilir (limit/stop: giriş, SL, TP; market: SL, TP). */
export interface Ticket {
  side: Side;
  kind: OrderKind;
  entry: number | null;
  sl: number | null;
}

interface State {
  symbols: SymbolInfo[];
  sessions: SessionSummary[];
  session: Session | null;
  data: Record<string, M1Data>;
  loading: { symbol: string; progress: number } | null;
  error: string | null;
  toast: { text: string; kind: 'info' | 'win' | 'loss' | 'error'; id: number } | null;
  playing: boolean;
  tool: Tool;
  selectedId: string | null;
  editingId: string | null;
  magnet: boolean;
  /** Mıknatıs gücü (TradingView "Zayıf / Güçlü mıknatıs") */
  magnetMode: 'weak' | 'strong';
  /** Çizim modunda kal: çizim bitince araç seçili kalır (TradingView "Stay in drawing mode") */
  stayInDraw: boolean;
  hideDrawings: boolean;
  panelOpen: boolean;
  /** Çoklu ekranda büyütülmüş grafik (null = hepsi görünür). Kaydedilmez. */
  maxPane: number | null;
  /** Değerlendirme penceresi bekleyen kapanmış işlemler (ilki açık) */
  reviewQueue: string[];
  jumpOpen: boolean;
  /** Grafikte tıklanan mumdan replay başlatma modu */
  pickingStart: boolean;
  perfOpen: boolean;
  chartSettingsOpen: boolean;
  /** Grafik ayarları açılırken gösterilecek sekme (tek seferlik istek) */
  chartSettingsTab: string | null;
  chartTheme: ChartTheme;
  /** Seans / killzone katmanı ayarları (tarayıcıda saklanır, tüm oturumlarda geçerli) */
  sessionSettings: SessionSettings;
  /** Buy/Sell butonlarının emir tipi */
  orderKind: OrderKind;
  /** Long / Short aracını grafiğe bırakınca emri hemen ver (bekleyen limit / stop; FX Replay gibi) */
  autoOrder: boolean;
  /** Emir boyutu: bakiyenin risk yüzdesi veya sabit lot */
  sizing: 'risk' | 'lots';
  /** Grafikte seçilmekte olan emir (giriş / SL / TP noktaları tıklanır) */
  ticket: Ticket | null;
  /** data haritasındaki verinin kaynağı */
}

export const useStore = create<State>(() => ({
  symbols: [],
  sessions: [],
  session: null,
  data: {},
  loading: null,
  error: null,
  toast: null,
  playing: false,
  tool: 'cursor',
  selectedId: null,
  editingId: null,
  magnet: true,
  magnetMode: 'strong',
  stayInDraw: false,
  hideDrawings: false,
  panelOpen: false,
  maxPane: null,
  reviewQueue: [],
  jumpOpen: false,
  pickingStart: false,
  perfOpen: false,
  chartSettingsOpen: false,
  chartSettingsTab: null,
  chartTheme: loadTheme(),
  sessionSettings: loadSessionSettings(),
  orderKind: 'market',
  autoOrder: loadAutoOrder(),
  sizing: 'risk',
  ticket: null,
}));

export const get = useStore.getState;

export const set = useStore.setState;

export function toast(text: string, kind: 'info' | 'win' | 'loss' | 'error' = 'info') {
  set({ toast: { text, kind, id: Date.now() + Math.random() } });
}

export function patchSession(fn: (s: Session) => Partial<Session>) {
  const s = get().session;
  if (!s) return;
  set({ session: { ...s, ...fn(s), updatedAt: Date.now() } });
}

export function nextId(prefix: string): string {
  const s = get().session!;
  const id = `${prefix}${s.seq + 1}`;
  set({ session: { ...s, seq: s.seq + 1 } });
  return id;
}

export function currentData(): M1Data | null {
  const s = get().session;
  return s ? get().data[s.symbol] ?? null : null;
}

/** Son açıklanan 1m mumun bid kapanışı (grafikteki fiyat). */
export function lastPrice(symbol?: string): number | null {
  return lastQuote(symbol)?.bid ?? null;
}

/** Son açıklanan 1m mumun bid ve ask kapanışı (ask yoksa bid). */
export function lastQuote(symbol?: string): { bid: number; ask: number } | null {
  const s = get().session;
  if (!s) return null;
  const d = get().data[symbol ?? s.symbol];
  if (!d) return null;
  const r = revealedCount(d, s.replayTime);
  if (r <= 0) return null;
  const bid = d.c[r - 1] / d.scale;
  return { bid, ask: d.ask ? d.ask.c[r - 1] / d.scale : bid };
}

/** İşlemin şu an kapatılacağı fiyat: long bid'e, short ask'a kapanır. */
export function exitPriceNow(t: Pick<Trade, 'symbol' | 'side'>): number | null {
  const q = lastQuote(t.symbol);
  return q ? (t.side === 'long' ? q.bid : q.ask) : null;
}

/** Yeni işlemin açılacağı fiyat: long ask'tan, short bid'den. */
export function entryPriceNow(symbol: string, side: Side): number | null {
  const q = lastQuote(symbol);
  return q ? (side === 'long' ? q.ask : q.bid) : null;
}

/** Son açıklanan 1m mumun başlangıç zamanı. */
export function lastBarTime(symbol?: string): number | null {
  const s = get().session;
  if (!s) return null;
  const d = get().data[symbol ?? s.symbol];
  if (!d) return null;
  const r = revealedCount(d, s.replayTime);
  return r > 0 ? d.t[r - 1] : null;
}

export { balanceOf };

const AUTO_ORDER_KEY = 'backtest.autoOrder';

function loadAutoOrder(): boolean {
  try {
    return localStorage.getItem(AUTO_ORDER_KEY) !== '0'; // varsayılan açık
  } catch {
    return true;
  }
}

export function setAutoOrder(on: boolean) {
  set({ autoOrder: on });
  try {
    localStorage.setItem(AUTO_ORDER_KEY, on ? '1' : '0');
  } catch {
    /* kaydedilemedi */
  }
}
