// Oturum yaşam döngüsü: açılış, veri yükleme, oluşturma / açma / kapatma / silme ve otomatik kayıt.

import { loadSymbol, type DataSource, type M1Data } from '../core/data';
import { chronologyIssue, EXECUTION_MODEL } from '../core/trading';
import { newAccount, type AccountRules } from '../core/account';
import { activeTrades } from '../core/simulate';
import { isLayoutId } from '../core/layouts';
import { DEFAULT_FIB, type Session } from '../core/types';
import { fmtNyShort } from '../lib/format';
import { useStore, get, set, toast } from './state';
import { stopPlay } from './replay';
import { history } from './drawings';

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

/** Tek kaynak var: Dukascopy. Sembolün verisi indirilmemişse null. */
export function resolveSource(symbol: string): DataSource | null {
  return get().symbols.find((s) => s.id === symbol)?.sources?.dukascopy ? 'dukascopy' : null;
}

export async function ensureData(symbol: string): Promise<M1Data | null> {
  const have = get().data[symbol];
  if (have) return have;
  const info = get().symbols.find((s) => s.id === symbol);
  const source = resolveSource(symbol);
  if (!info || !source) {
    toast(`${symbol} için veri yok. "npm run data" ile indirin.`, 'error');
    return null;
  }
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
  session.source = 'dukascopy'; // eski oturumlar (HistData / OANDA) aynı Dukascopy verisiyle açılır
  if (!isLayoutId(session.layout)) session.layout = '1'; // bilinmeyen düzen kimliği çökertmesin
  // Ana sembolün verisi yoksa oturum boş ekranla açılmaz
  if (!(await ensureData(session.symbol))) return;
  const needed = new Set([...(session.panes ?? []).map((p) => p.symbol), ...activeTrades(session).map((t) => t.symbol)]);
  for (const sym of needed) await ensureData(sym);
  stopPlay();
  history.clear();
  set({ session, selectedId: null, editingId: null, tool: 'cursor', playing: false, ticket: null, pickingStart: false, maxPane: null, reviewQueue: [] });
  const bad = chronologyIssue(session.trades, session.replayTime);
  if (bad != null) toast(`Bu oturumun kronolojisi tutarsız: replay zamanından sonraya ait işlem kaydı var (${fmtNyShort(bad)} NY). Eski sürümde geri sarılmış olabilir; bakiye gelecekteki kapanışları içerir. Kayıtlar silinmedi; ölçüm için yeni oturum açın.`, 'error');
}

export async function closeSession() {
  stopPlay();
  const s = get().session;
  if (s) await saveNow(s);
  history.clear();
  set({ session: null, selectedId: null, editingId: null, maxPane: null, reviewQueue: [], ticket: null, pickingStart: false });
  await refreshSessions();
}

export async function deleteSession(id: string) {
  await fetch(`/api/sessions/${id}`, { method: 'DELETE' });
  await refreshSessions();
}

let saveTimer: ReturnType<typeof setTimeout> | null = null;

let lastSavedAt = 0;

const MAX_SAVE_WAIT_MS = 10_000;

async function saveNow(s: Session) {
  lastSavedAt = Date.now();
  await fetch(`/api/sessions/${s.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(s) });
}

useStore.subscribe((state, prev) => {
  if (!state.session || state.session === prev.session) return;
  if (saveTimer) clearTimeout(saveTimer);
  const s = state.session;
  // Oynatırken her adım zamanlayıcıyı sıfırlardı ve kayıt hiç yapılmazdı: en geç MAX_SAVE_WAIT_MS'de bir kaydedilir.
  const overdue = Date.now() - lastSavedAt > MAX_SAVE_WAIT_MS;
  saveTimer = setTimeout(() => saveNow(s).catch(() => toast('Oturum kaydedilemedi', 'error')), overdue ? 0 : state.playing ? 3000 : 600);
});

window.addEventListener('beforeunload', () => {
  const s = get().session;
  if (s) navigator.sendBeacon?.(`/api/sessions/${s.id}`, new Blob([JSON.stringify(s)], { type: 'application/json' }));
});
