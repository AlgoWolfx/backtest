import { create } from 'zustand';
import { getSymbol } from '../shared/symbols.js';
import { aggregate, aggIndexOfM1, loadSymbol, revealedCount, type DataSource, type M1Data, type SymbolInfo } from './core/data';
import { bucketKey, type TF } from './core/timeframes';
import { bucketEndAfter, nextNyTime } from './core/replay';
import { loadTheme, saveTheme, type ChartTheme } from './chartTheme';
import { loadSessionSettings, saveSessionSettings } from './sessionSettings';
import { nextBoundary, type SessionSettings } from './core/sessions';
import { chronologyIssue, closeTrade, decideLots, EXECUTION_MODEL, pendingType, rewindBlockedBy, type Side, type Trade } from './core/trading';
import { afterBalanceChange, newAccount, noteTradingDay, rollDay, type AccountRules } from './core/account';
import { activeTrades, balanceOf, simulate as simulateRange, type SimResult } from './core/simulate';
import { DEFAULT_FIB, LAYOUTS, type Drawing, type LayoutId, type NewDrawing, type PaneCfg, type Position, type Session, type Tool } from './core/types';
import { fmtNyShort, fmtPrice, reasonLabel } from './format';

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
  hideDrawings: boolean;
  panelOpen: boolean;
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
  /** Emir boyutu: bakiyenin risk yüzdesi veya sabit lot */
  sizing: 'risk' | 'lots';
  /** Grafikte seçilmekte olan emir (giriş / SL / TP noktaları tıklanır) */
  ticket: Ticket | null;
  /** data haritasındaki verinin kaynağı */
  dataSource: DataSource;
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
  hideDrawings: false,
  panelOpen: false,
  jumpOpen: false,
  pickingStart: false,
  perfOpen: false,
  chartSettingsOpen: false,
  chartSettingsTab: null,
  chartTheme: loadTheme(),
  sessionSettings: loadSessionSettings(),
  orderKind: 'market',
  sizing: 'risk',
  ticket: null,
  dataSource: 'histdata',
}));

const get = useStore.getState;
const set = useStore.setState;

// ---------------------------------------------------------------- yardımcılar

export function toast(text: string, kind: 'info' | 'win' | 'loss' | 'error' = 'info') {
  set({ toast: { text, kind, id: Date.now() + Math.random() } });
}

function patchSession(fn: (s: Session) => Partial<Session>) {
  const s = get().session;
  if (!s) return;
  set({ session: { ...s, ...fn(s), updatedAt: Date.now() } });
}

function nextId(prefix: string): string {
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

// ---------------------------------------------------------------- başlangıç / oturumlar

export async function init() {
  try {
    const [symbols, sessions] = await Promise.all([fetch('/api/symbols').then((r) => r.json()), fetch('/api/sessions').then((r) => r.json())]);
    set({ symbols, sessions });
  } catch (err) {
    set({ error: `Sunucuya bağlanılamadı: ${(err as Error).message}` });
  }
}

export async function refreshSessions() {
  set({ sessions: await fetch('/api/sessions').then((r) => r.json()) });
}

/** İstenen kaynakta sembol yoksa HistData'ya düşer (ör. DXY OANDA'da yok). */
export function resolveSource(symbol: string, wanted: DataSource): DataSource | null {
  const info = get().symbols.find((s) => s.id === symbol);
  if (!info) return null;
  if (info.sources?.[wanted]) return wanted;
  // Yedek sırası: Dukascopy (boşluksuz, bid+ask) -> HistData
  return info.sources?.dukascopy ? 'dukascopy' : info.sources?.histdata ? 'histdata' : null;
}

export async function ensureData(symbol: string, wanted?: DataSource): Promise<M1Data | null> {
  const have = get().data[symbol];
  if (have) return have;
  const info = get().symbols.find((s) => s.id === symbol);
  const want = wanted ?? get().session?.source ?? 'histdata';
  const source = resolveSource(symbol, want);
  if (!info || !source) {
    toast(`${symbol} için veri yok. "npm run data" ile indirin.`, 'error');
    return null;
  }
  if (source !== want) toast(`${symbol} ${want.toUpperCase()} kaynağında yok; ${source} verisi kullanılıyor.`);
  set({ loading: { symbol, progress: 0 } });
  try {
    const d = await loadSymbol(info, source, (p) => set({ loading: { symbol, progress: p } }));
    set({ data: { ...get().data, [symbol]: d } });
    // Ask'ı olmayan dakikalarda ask=bid yazılır: sessiz sıfır spread yerine kullanıcı uyarılır.
    const noAsk = d.meta.askMissingMinutes ?? 0;
    if (noAsk > 0) toast(`${symbol}: ${noAsk.toLocaleString('tr-TR')} dakikada ask verisi yok (ask = bid, spread 0 sayılır); bu dakikalardaki işlemlerde spread maliyeti eksik olabilir.`, 'error');
    return d;
  } catch (err) {
    toast((err as Error).message, 'error');
    return null;
  } finally {
    set({ loading: null });
  }
}

export async function createSession(p: { name: string; symbol: string; startTime: number; balance: number; source: DataSource; rules: AccountRules; commissionPerLot?: number }) {
  const now = Date.now();
  const session: Session = {
    account: newAccount(p.rules, p.balance, p.startTime),
    id: `s${now.toString(36)}`,
    name: p.name || 'Yeni oturum',
    source: p.source,
    createdAt: now,
    updatedAt: now,
    initialBalance: p.balance,
    startTime: p.startTime,
    replayTime: p.startTime,
    symbol: p.symbol,
    tf: '15m',
    stepTf: '1m',
    speed: 4,
    riskPct: 1,
    lots: 1,
    executionModel: EXECUTION_MODEL,
    ...(p.commissionPerLot ? { commissionPerLot: p.commissionPerLot } : {}),
    trades: [],
    drawings: {},
    fibDefaults: DEFAULT_FIB,
    seq: 0,
  };
  await saveNow(session);
  await openSession(session.id, session);
}

export async function openSession(id: string, preloaded?: Session) {
  const session: Session = preloaded ?? (await fetch(`/api/sessions/${id}`).then((r) => r.json()));
  session.fibDefaults ??= DEFAULT_FIB;
  session.source ??= 'histdata';
  if (get().dataSource !== session.source) set({ data: {}, dataSource: session.source });
  const needed = new Set([session.symbol, ...(session.panes ?? []).map((p) => p.symbol), ...activeTrades(session).map((t) => t.symbol)]);
  for (const sym of needed) await ensureData(sym, session.source);
  set({ session, selectedId: null, editingId: null, tool: 'cursor', playing: false });
  const bad = chronologyIssue(session.trades, session.replayTime);
  if (bad != null) toast(`Bu oturumun kronolojisi tutarsız: replay zamanından sonraya ait işlem kaydı var (${fmtNyShort(bad)} NY). Eski sürümde geri sarılmış olabilir; bakiye gelecekteki kapanışları içerir. Kayıtlar silinmedi; ölçüm için yeni oturum açın.`, 'error');
}

/** Oturumun veri kaynağını değiştirir (açık işlem yokken). Fiyatlar kaynağa göre farklı olabilir. */
export async function setDataSource(source: DataSource) {
  const s = get().session;
  if (!s || s.source === source) return;
  if (activeTrades(s).length) return toast('Açık pozisyon veya bekleyen emir varken veri kaynağı değiştirilemez.', 'error');
  if (!resolveSource(s.symbol, source)) return;
  stopPlay();
  set({ data: {}, dataSource: source });
  const d = await ensureData(s.symbol, source);
  if (d) patchSession(() => ({ source }));
}

export async function closeSession() {
  stopPlay();
  const s = get().session;
  if (s) await saveNow(s);
  set({ session: null, selectedId: null, editingId: null });
  await refreshSessions();
}

export async function deleteSession(id: string) {
  await fetch(`/api/sessions/${id}`, { method: 'DELETE' });
  await refreshSessions();
}

// ---------------------------------------------------------------- otomatik kayıt

let saveTimer: ReturnType<typeof setTimeout> | null = null;
async function saveNow(s: Session) {
  await fetch(`/api/sessions/${s.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(s) });
}
useStore.subscribe((state, prev) => {
  if (!state.session || state.session === prev.session) return;
  if (saveTimer) clearTimeout(saveTimer);
  const s = state.session;
  saveTimer = setTimeout(() => saveNow(s).catch(() => toast('Oturum kaydedilemedi', 'error')), state.playing ? 3000 : 600);
});
window.addEventListener('beforeunload', () => {
  const s = get().session;
  if (s) navigator.sendBeacon?.(`/api/sessions/${s.id}`, new Blob([JSON.stringify(s)], { type: 'application/json' }));
});

// ---------------------------------------------------------------- görünüm

/** Ekran numarasına göre sembol / zaman dilimi (aktif ekran için oturumdaki değerler esastır). */
export function paneCfg(s: Session, i: number): PaneCfg {
  if (i === (s.active ?? 0) || !s.panes?.[i]) return { symbol: s.symbol, tf: s.tf };
  return s.panes[i];
}

const patchActivePane = (s: Session, patch: Partial<PaneCfg>): Pick<Session, 'panes'> => ({
  panes: s.panes?.map((p, i) => (i === (s.active ?? 0) ? { ...p, ...patch } : p)),
});

export async function setSymbol(symbol: string) {
  const d = await ensureData(symbol);
  if (!d) return;
  patchSession((s) => ({ symbol, ...patchActivePane(s, { symbol }) }));
  set({ selectedId: null, editingId: null });
}

export function setTf(tf: TF) {
  patchSession((s) => ({ tf, ...patchActivePane(s, { tf }) }));
}

// ---- çoklu ekran

const PANE_TF_LADDER: TF[] = ['1h', '5m', '4h', '15m', '1D'];

export async function setLayout(layout: LayoutId) {
  const s = get().session;
  if (!s) return;
  const n = LAYOUTS[layout].count;
  const active = s.active ?? 0;
  const panes: PaneCfg[] = (s.panes ?? [{ symbol: s.symbol, tf: s.tf }]).map((p, i) => (i === active ? { symbol: s.symbol, tf: s.tf } : p));
  while (panes.length < n) {
    const used = new Set(panes.filter((p) => p.symbol === s.symbol).map((p) => p.tf));
    panes.push({ symbol: s.symbol, tf: PANE_TF_LADDER.find((t) => !used.has(t)) ?? s.tf });
  }
  const next = active < n ? active : 0;
  patchSession(() => ({ layout, panes, active: next, symbol: panes[next].symbol, tf: panes[next].tf }));
  if (next !== active) set({ selectedId: null, editingId: null, ticket: null });
}

/** Tıklanan grafiği aktif yapar: üst çubuk, çizim, emir ve işlem paneli o grafiğin sembolüne göre çalışır. */
export function activatePane(i: number) {
  const s = get().session;
  if (!s || (s.active ?? 0) === i) return;
  const p = s.panes?.[i];
  if (!p || i >= LAYOUTS[s.layout ?? '1'].count) return;
  patchSession(() => ({ active: i, symbol: p.symbol, tf: p.tf }));
  set({ selectedId: null, editingId: null, ticket: null });
}

// ---------------------------------------------------------------- replay

const simulate = (s: Session, newTime: number): SimResult => simulateRange(s, newTime, (sym) => get().data[sym]);

/**
 * Zamanı ileri alır; aradaki her 1m mumu açık işlemlere uygular.
 * stopOnEvent: ileri sarmalarda bir emir dolar veya işlem kapanırsa tam o dakikada durur.
 * Ulaşılan zamanı döndürür.
 */
function advanceTo(target: number, opts: { stopOnEvent?: boolean } = {}): number {
  const s = get().session!;
  if (target <= s.replayTime) return s.replayTime;
  let newTime = target;
  let sim = simulate(s, newTime);
  if (opts.stopOnEvent && sim.firstEvent != null && sim.firstEvent < newTime) {
    newTime = sim.firstEvent;
    sim = simulate(s, newTime);
    toast('İşlem olayı nedeniyle ileri sarma durduruldu.');
  }
  const { trades, closed: closedNow, filled, account, breach } = sim;
  const prevStatus = s.account?.state.status;
  for (const u of filled) {
    if (u.status === 'open' || u.status === 'closed') toast(`${u.symbol} ${u.side === 'long' ? 'alış' : 'satış'} emri doldu @ ${fmtPrice(u.entry, getSymbol(u.symbol))}`);
  }
  // Doldurulan bekleyen emirlerin çizimlerindeki giriş fiyatını güncelle.
  let drawings = s.drawings;
  for (const tr of trades) {
    const before = s.trades.find((x) => x.id === tr.id);
    if (before && before.status === 'pending' && tr.status !== 'pending' && tr.drawingId) {
      drawings = mapDrawing(drawings, tr.symbol, tr.drawingId, (d) => (d.type === 'long' || d.type === 'short' ? { ...d, entry: { t: tr.openedAt ?? d.entry.t, p: tr.entry } } : d));
    }
  }
  set({ session: { ...s, replayTime: newTime, trades, drawings, account, updatedAt: Date.now() } });
  for (const tr of closedNow) {
    if (tr.exitReason === 'breach') continue;
    const r = tr.r != null ? ` (${tr.r >= 0 ? '+' : ''}${tr.r.toFixed(2)}R)` : '';
    const label = reasonLabel(tr.exitReason);
    toast(`${tr.symbol} ${label}: ${tr.pnl! >= 0 ? '+' : ''}$${tr.pnl!.toFixed(2)}${r}`, tr.result === 'win' ? 'win' : tr.result === 'loss' ? 'loss' : 'info');
  }
  if (breach) {
    toast(`HESAP PATLADI: ${breach}. Tüm pozisyonlar kapatıldı, yeni işlem açılamaz.`, 'loss');
  } else if (account?.state.status === 'passed' && prevStatus !== 'passed') {
    toast(`Tebrikler, değerlendirme geçildi: ${account.state.reason}.`, 'win');
  }
  // Emir dolumu, kapanış veya hesap durumu değişiminde oynatma durur (ekran görüntüsü tam o anı yakalasın).
  if (closedNow.length || filled.length || breach) stopPlay();
  for (const u of filled) emitTrade('open', u.id);
  for (const tr of closedNow) emitTrade('close', tr.id);
  return newTime;
}

function mapDrawing(all: Record<string, Drawing[]>, symbol: string, id: string, fn: (d: Drawing) => Drawing) {
  return { ...all, [symbol]: (all[symbol] ?? []).map((d) => (d.id === id ? fn(d) : d)) };
}

/** Bir adım ilerler (adım büyüklüğü = stepTf). tf verilirse o zaman diliminin mum kapanışına kadar. */
export function stepForward(tf?: TF): boolean {
  const s = get().session;
  const d = currentData();
  if (!s || !d) return false;
  const end = bucketEndAfter(d, s.replayTime, tf ?? s.stepTf);
  if (end == null) {
    toast('Veri sonuna ulaşıldı.');
    stopPlay();
    return false;
  }
  advanceTo(end, { stopOnEvent: !!tf });
  return true;
}

/** Grafikteki zaman diliminin mevcut mumunu tamamlar (TradingView replay "mum kapanışı"). */
export function forwardToBarClose() {
  const s = get().session;
  if (s) stepForward(s.tf);
}

export function setSessionSettings(s: SessionSettings) {
  saveSessionSettings(s);
  set({ sessionSettings: s });
}

/** Bir sonraki seans başlangıcına / bitişine ileri sarar (hafta sonu atlanır, işlem olayında durur). */
export function forwardToNextSessionBoundary() {
  const s = get().session;
  if (!s) return;
  const b = nextBoundary(get().sessionSettings, s.replayTime);
  if (!b) return toast('Görünür seans yok: Grafik ayarları > Seanslar bölümünden bir seans açın.', 'error');
  forwardToNyTime(b.h, b.m);
}

/** Bir sonraki "NY hh:mm" anına ileri sarar (hafta sonu / tatil atlanır, işlem olayında durur). */
export function forwardToNyTime(h: number, m: number) {
  const s = get().session;
  const d = currentData();
  if (!s || !d) return;
  const target = nextNyTime(d, s.replayTime, h, m);
  if (target == null) return toast('Bu saatten sonra veri yok.', 'error');
  stopPlay();
  advanceTo(target, { stopOnEvent: true });
}

export function stepBack() {
  const s = get().session;
  const d = currentData();
  if (!s || !d) return;
  if (activeTrades(s).length) return toast('Açık pozisyon veya bekleyen emir varken geri gidilemez.', 'error');
  const r = revealedCount(d, s.replayTime);
  if (r <= 1) return;
  const key = bucketKey(s.stepTf, d.t[r - 1]);
  let j = r - 1;
  while (j > 1 && bucketKey(s.stepTf, d.t[j - 1]) === key) j--;
  const target = d.t[j - 1] + 60;
  if (rewindBlocked(s, target)) return;
  patchSession(() => ({ replayTime: target }));
}

/** Kayıtlı bir işlem olayından önceye replay'i geri almak kronolojiyi bozar (gelecekteki kâr/hesap durumu kalırdı). */
function rewindBlocked(s: Session, target: number): boolean {
  const by = rewindBlockedBy(s.trades, target);
  if (by == null) return false;
  toast(`Bu zamandan önce işlem kaydı var (son olay ${fmtNyShort(by)} NY); replay geri alınamaz. Geçmişe bakmak için grafiği kaydırın; aynı hareketi yeniden denemek için yeni oturum açın.`, 'error');
  return true;
}

export function jumpTo(utc: number) {
  const s = get().session;
  const d = currentData();
  if (!s || !d) return;
  const t = Math.max(d.t[0] + 60, Math.min(Math.floor(utc / 60) * 60, d.t[d.n - 1] + 60));
  if (t < s.replayTime && activeTrades(s).length) return toast('Açık pozisyon veya bekleyen emir varken geçmişe dönülemez.', 'error');
  if (t < s.replayTime && rewindBlocked(s, t)) return;
  stopPlay();
  if (t > s.replayTime) advanceTo(t, { stopOnEvent: true });
  else patchSession(() => ({ replayTime: t }));
}

let playTimer: ReturnType<typeof setTimeout> | null = null;
function tick() {
  if (!get().playing) return;
  const ok = stepForward();
  if (!ok || !get().playing) return;
  playTimer = setTimeout(tick, 1000 / (get().session?.speed ?? 1));
}
export function togglePlay() {
  if (get().playing) return stopPlay();
  set({ playing: true });
  tick();
}
export function stopPlay() {
  if (playTimer) clearTimeout(playTimer);
  playTimer = null;
  if (get().playing) set({ playing: false });
}
export function setSpeed(speed: number) {
  patchSession(() => ({ speed }));
}
export function setStepTf(stepTf: TF) {
  patchSession(() => ({ stepTf }));
}

// ---------------------------------------------------------------- çizimler

export function drawingsOf(s: Session | null): Drawing[] {
  return s ? s.drawings[s.symbol] ?? [] : [];
}

// ---- geri al / yinele (sembol başına çizim geçmişi; işlemler geri alınmaz)

const history = new Map<string, { past: Drawing[][]; future: Drawing[][] }>();
const historyOf = (symbol: string) => {
  let h = history.get(symbol);
  if (!h) history.set(symbol, (h = { past: [], future: [] }));
  return h;
};

/** Bir çizim değişikliğinden ÖNCE çağrılır: mevcut çizimleri geri alma geçmişine ekler. */
export function recordUndo() {
  const s = get().session;
  if (!s) return;
  const h = historyOf(s.symbol);
  h.past.push(drawingsOf(s));
  if (h.past.length > 200) h.past.shift();
  h.future = [];
}

const isActive = (s: Session, tradeId?: string) => {
  const t = tradeId ? s.trades.find((x) => x.id === tradeId) : undefined;
  return !!t && (t.status === 'open' || t.status === 'pending');
};

/**
 * Geçmişteki bir çizim listesini uygular. Aktif işleme bağlı çizimler kaybolmaz;
 * yalnızca aynı işleme bağlı eski hâli varsa (ör. SL'yi geri çekmek) o hâle döner.
 * Bağlı işlemlerin SL/TP'si çizimle eşitlenir.
 */
function applyDrawings(next: Drawing[]) {
  const s = get().session!;
  const byId = new Map(next.map((d) => [d.id, d]));
  const result: Drawing[] = [];
  for (const d of next) {
    const cur = drawingsOf(s).find((x) => x.id === d.id);
    const curTrade = cur && (cur.type === 'long' || cur.type === 'short') ? cur.tradeId : undefined;
    const nextTrade = d.type === 'long' || d.type === 'short' ? d.tradeId : undefined;
    if (curTrade && isActive(s, curTrade) && nextTrade !== curTrade) result.push(cur!);
    else result.push(d);
  }
  for (const cur of drawingsOf(s)) {
    if ((cur.type === 'long' || cur.type === 'short') && isActive(s, cur.tradeId) && !byId.has(cur.id)) result.push(cur);
  }
  patchSession((s) => ({ drawings: { ...s.drawings, [s.symbol]: result } }));
  for (const d of result) {
    if ((d.type === 'long' || d.type === 'short') && isActive(get().session!, d.tradeId)) updateDrawing(d.id, { sl: d.sl, tp: d.tp, entry: d.entry }, false);
  }
  set({ selectedId: null, editingId: null });
}

export function undo() {
  const s = get().session;
  if (!s) return;
  const h = historyOf(s.symbol);
  const prev = h.past.pop();
  if (!prev) return toast('Geri alınacak çizim işlemi yok.');
  h.future.push(drawingsOf(s));
  applyDrawings(prev);
}

export function redo() {
  const s = get().session;
  if (!s) return;
  const h = historyOf(s.symbol);
  const next = h.future.pop();
  if (!next) return;
  h.past.push(drawingsOf(s));
  applyDrawings(next);
}

// ---- kopyala / yapıştır (semboller arasında da çalışır)

let clipboard: Drawing | null = null;
export const hasClipboard = () => clipboard != null;

export function copySelected(): boolean {
  const s = get().session;
  const d = drawingsOf(s).find((x) => x.id === get().selectedId);
  if (!d) return false;
  clipboard = structuredClone(d);
  toast('Çizim kopyalandı (Ctrl+V ile yapıştır).');
  return true;
}

/** Kopyalanan çizimi yapıştırır. shiftTime: zaman noktalarını birkaç mum sağa kaydırır (üst üste binmesin). */
export function pasteClipboard(shiftTime: (t: number) => number) {
  if (!clipboard || !get().session) return;
  const src: Drawing = structuredClone(clipboard);
  let d: Drawing = src;
  if ('entry' in src) {
    d = { ...src, tradeId: undefined, entry: { ...src.entry, t: shiftTime(src.entry.t) }, tEnd: shiftTime(src.tEnd) };
  } else if ('a' in src) {
    d = { ...src, a: { ...src.a, t: shiftTime(src.a.t) }, b: { ...src.b, t: shiftTime(src.b.t) } };
  }
  const { id: _id, ...rest } = d;
  void _id;
  const newId = addDrawing(rest as NewDrawing);
  set({ selectedId: newId });
}

export function addDrawing(d: NewDrawing, record = true): string {
  if (record) recordUndo();
  const id = nextId('d');
  patchSession((s) => ({ drawings: { ...s.drawings, [s.symbol]: [...drawingsOf(s), { ...d, id } as Drawing] } }));
  return id;
}

/**
 * Çizimi günceller; bağlı işlem varsa SL/TP (ve bekleyen emirde giriş) değişikliğini işleme yansıtır.
 * record=false: sürükleme sırasındaki ara güncellemeler (geri alma kaydı sürükleme başında alınır).
 */
export function updateDrawing(id: string, patch: Partial<Drawing>, record = true) {
  if (record) recordUndo();
  patchSession((s) => {
    let updated: Drawing | null = null;
    const list = drawingsOf(s).map((d) => (d.id === id ? (updated = { ...d, ...patch } as Drawing) : d));
    let trades = s.trades;
    const u = updated as Drawing | null;
    if (u && (u.type === 'long' || u.type === 'short') && u.tradeId) {
      trades = trades.map((t) => {
        if (t.id !== u.tradeId) return t;
        if (t.status === 'open') return { ...t, sl: u.sl, tp: u.tp };
        if (t.status === 'pending') {
          const price = entryPriceNow(t.symbol, t.side) ?? u.entry.p;
          return { ...t, sl: u.sl, tp: u.tp, initialSl: u.sl, entry: u.entry.p, orderType: pendingType(t.side, u.entry.p, price) };
        }
        return t;
      });
    }
    return { drawings: { ...s.drawings, [s.symbol]: list }, trades };
  });
}

export function deleteDrawing(id: string, record = true) {
  const s = get().session;
  if (!s) return;
  const d = drawingsOf(s).find((x) => x.id === id);
  if (!d) return;
  if ((d.type === 'long' || d.type === 'short') && d.tradeId) {
    const tr = s.trades.find((t) => t.id === d.tradeId);
    if (tr && (tr.status === 'open' || tr.status === 'pending')) return toast('Bu çizime bağlı aktif işlem var. Önce işlemi kapatın/iptal edin.', 'error');
  }
  if (record) recordUndo();
  patchSession((s) => ({ drawings: { ...s.drawings, [s.symbol]: drawingsOf(s).filter((x) => x.id !== id) } }));
  set({ selectedId: get().selectedId === id ? null : get().selectedId, editingId: null });
}

export function clearDrawings() {
  const s = get().session;
  if (!s) return;
  const activeIds = new Set(activeTrades(s).map((t) => t.drawingId));
  recordUndo();
  patchSession((s) => ({ drawings: { ...s.drawings, [s.symbol]: drawingsOf(s).filter((d) => activeIds.has(d.id)) } }));
  set({ selectedId: null, editingId: null });
}

// ---------------------------------------------------------------- emirler

function validLevels(side: Side, entry: number, sl: number, tp: number) {
  return side === 'long' ? sl < entry && tp > entry : sl > entry && tp < entry;
}

/** Pozisyon aracından emir. market=true: anlık fiyattan; false: çizimdeki girişten limit/stop. */
/** Hesap patladıysa yeni işlem açılamaz. */
function accountLocked(s: Session): boolean {
  if (s.account?.state.status !== 'failed') return false;
  toast(`Hesap patladı (${s.account.state.reason}); yeni işlem açılamaz. Yeni oturum başlatın.`, 'error');
  return true;
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
  const dec = decideLots(spec, { mode: lotsOverride != null ? 'lots' : 'risk', lots: lotsOverride ?? 0, riskPct: d.riskPct, balance: balanceOf(s), entry, sl: d.sl, commissionPerLot: s.commissionPerLot });
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
    drawingId,
    ...(s.commissionPerLot ? { commissionPerLot: s.commissionPerLot } : {}),
  };
  const entryPt = market ? { t: barT, p: price } : d.entry;
  set({
    session: {
      ...s2,
      trades: [...s2.trades, trade],
      drawings: mapDrawing(s2.drawings, s.symbol, drawingId, (x) => ({ ...(x as Position), tradeId: id, entry: entryPt })),
      account: market && s2.account ? noteTradingDay(s2.account, s.replayTime) : s2.account,
      updatedAt: Date.now(),
    },
  });
  if (market) emitTrade('open', id);
  toast(market ?`${side === 'long' ? 'Alış' : 'Satış'} açıldı: ${lots} lot @ ${fmtPrice(entry, spec)}` : `${side === 'long' ? 'Buy' : 'Sell'} ${trade.orderType === 'limit' ? 'Limit' : 'Stop'} emri verildi: ${lots} lot @ ${fmtPrice(entry, spec)}`);
  return true;
}

// ---- emir bileti (TradingView tarzı: giriş / SL / TP grafikte tıklanarak seçilir)

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
    return set({ ticket: { ...t, sl: price } });
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
  const sl = round(price - dir * dist);
  const tp = round(price + dir * dist * 2);
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

// ---- işlem olayları (ekran görüntüsü vb. için)

export type TradeEvent = { kind: 'open' | 'close'; tradeId: string };
const tradeListeners = new Set<(e: TradeEvent) => void>();
export function onTradeEvent(fn: (e: TradeEvent) => void) {
  tradeListeners.add(fn);
  return () => {
    tradeListeners.delete(fn);
  };
}
function emitTrade(kind: TradeEvent['kind'], tradeId: string) {
  for (const fn of tradeListeners) fn({ kind, tradeId });
}

function patchTrade(id: string, fn: (t: Trade) => Trade) {
  patchSession((s) => ({ trades: s.trades.map((t) => (t.id === id ? fn(t) : t)) }));
}
export function setTradeShot(id: string, kind: 'open' | 'close', name: string) {
  patchTrade(id, (t) => ({ ...t, shots: { ...t.shots, [kind]: name } }));
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
  if (get().session?.account?.state.status === 'passed' && s.account?.state.status !== 'passed') {
    return toast(`Tebrikler, değerlendirme geçildi: ${get().session!.account!.state.reason}.`, 'win');
  }
  toast(`${tr.symbol} manuel kapatıldı: ${closed.pnl! >= 0 ? '+' : ''}$${closed.pnl!.toFixed(2)}${closed.r != null ? ` (${closed.r.toFixed(2)}R)` : ''}`, closed.result === 'win' ? 'win' : closed.result === 'loss' ? 'loss' : 'info');
}

export function setChartTheme(t: ChartTheme) {
  saveTheme(t);
  set({ chartTheme: t });
}

export function setRiskPct(riskPct: number) {
  patchSession(() => ({ riskPct }));
}
export function setLots(lots: number) {
  patchSession(() => ({ lots }));
}
export function setFibDefaults(levels: Session['fibDefaults']) {
  patchSession(() => ({ fibDefaults: levels }));
}
