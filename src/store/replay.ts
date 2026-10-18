// Replay: zamanı ilerletme / geri alma, oynatma ve adım ayarları. Açık işlemlere mumları uygular.

import { getSymbol } from '../../shared/symbols.js';
import { revealedCount } from '../core/data';
import { bucketKey, type TF } from '../core/timeframes';
import { bucketEndAfter, effectiveStepTf, nextNyTime } from '../core/replay';
import { nextBoundary } from '../core/sessions';
import { rewindBlockedBy } from '../core/trading';
import { activeTrades, simulate as simulateRange, type SimResult } from '../core/simulate';
import { type Session } from '../core/types';
import { fmtNyShort, fmtPrice, reasonLabel } from '../lib/format';
import { get, set, toast, patchSession, currentData } from './state';
import { mapDrawing } from './drawings';
import { emitTrade, queueReview } from './trades';

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
  // Ekran görüntüsü yukarıda eşzamanlı alındı; şimdi değerlendirme penceresi sıraya girer (zorla kapanan işlemler hariç).
  for (const tr of closedNow) if (tr.exitReason !== 'breach') queueReview(tr.id);
  return newTime;
}

/** Bir adım ilerler (adım büyüklüğü = stepTf). tf verilirse o zaman diliminin mum kapanışına kadar. */
export function stepForward(tf?: TF): boolean {
  const s = get().session;
  const d = currentData();
  if (!s || !d) return false;
  const end = bucketEndAfter(d, s.replayTime, tf ?? effectiveStepTf(s));
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
  const stepTf = effectiveStepTf(s);
  const key = bucketKey(stepTf, d.t[r - 1]);
  let j = r - 1;
  while (j > 1 && bucketKey(stepTf, d.t[j - 1]) === key) j--;
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

/** Elle adım seçer ve eşlemeyi kapatır. */
export function setStepTf(stepTf: TF) {
  patchSession(() => ({ stepTf, stepSync: false }));
}

/** Adımı grafiğin zaman dilimine bağlar. */
export function setStepSync() {
  patchSession(() => ({ stepSync: true }));
}
