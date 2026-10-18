// Çizimler: ekleme / güncelleme / silme, geri al-yinele, kopyala-yapıştır ve bağlı bekleyen emrin eşitlenmesi.

import { getSymbol } from '../../shared/symbols.js';
import { decideLots, pendingType, type Side } from '../core/trading';
import { activeTrades, balanceOf } from '../core/simulate';
import { type Drawing, type NewDrawing, type Session } from '../core/types';
import { get, set, toast, patchSession, nextId, entryPriceNow } from './state';

export function mapDrawing(all: Record<string, Drawing[]>, symbol: string, id: string, fn: (d: Drawing) => Drawing) {
  return { ...all, [symbol]: (all[symbol] ?? []).map((d) => (d.id === id ? fn(d) : d)) };
}

export function drawingsOf(s: Session | null): Drawing[] {
  return s ? s.drawings[s.symbol] ?? [] : [];
}

export const history = new Map<string, { past: Drawing[][]; future: Drawing[][] }>();

/** Geçmiş oturum + sembol başınadır: başka oturumdaki aynı sembolün çizimleri Ctrl+Z ile gelmez. */
const historyOf = (s: Session) => {
  const key = `${s.id}:${s.symbol}`;
  let h = history.get(key);
  if (!h) history.set(key, (h = { past: [], future: [] }));
  return h;
};

/** Bir çizim değişikliğinden ÖNCE çağrılır: mevcut çizimleri geri alma geçmişine ekler. */
export function recordUndo() {
  const s = get().session;
  if (!s) return;
  const h = historyOf(s);
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
  const h = historyOf(s);
  const prev = h.past.pop();
  if (!prev) return toast('Geri alınacak çizim işlemi yok.');
  h.future.push(drawingsOf(s));
  applyDrawings(prev);
}

export function redo() {
  const s = get().session;
  if (!s) return;
  const h = historyOf(s);
  const next = h.future.pop();
  if (!next) return;
  h.past.push(drawingsOf(s));
  applyDrawings(next);
}

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
  } else if (src.type === 'hline' && src.t != null) {
    d = { ...src, t: shiftTime(src.t) };
  }
  const { id: _id, ...rest } = d;
  void _id;
  const newId = addDrawing(rest as NewDrawing);
  set({ selectedId: newId });
}

/** Çizimin bir kopyasını oluşturur (zaman noktaları shiftTime ile birkaç mum sağa kayar); aktif işleme bağlı pozisyonlar kopyalanmaz. */
export function cloneDrawing(id: string, shiftTime: (t: number) => number): string | null {
  const s = get().session;
  const src = drawingsOf(s).find((x) => x.id === id);
  if (!src) return null;
  if ((src.type === 'long' || src.type === 'short') && src.tradeId) return null;
  const c: Drawing = structuredClone(src);
  let d: Drawing = c;
  if ('entry' in c) d = { ...c, tradeId: undefined, entry: { ...c.entry, t: shiftTime(c.entry.t) }, tEnd: shiftTime(c.tEnd) };
  else if ('a' in c) d = { ...c, a: { ...c.a, t: shiftTime(c.a.t) }, b: { ...c.b, t: shiftTime(c.b.t) } };
  else if (c.type === 'hline' && c.t != null) d = { ...c, t: shiftTime(c.t) };
  const { id: _id, locked: _l, ...rest } = d as Drawing & { locked?: boolean };
  void _id;
  void _l;
  const newId = addDrawing(rest as NewDrawing);
  set({ selectedId: newId });
  return newId;
}

/** Çizimi en öne / en arkaya alır (TradingView "Öne getir / Arkaya gönder"). */
export function reorderDrawing(id: string, where: 'front' | 'back') {
  const s = get().session;
  if (!s) return;
  const list = drawingsOf(s);
  const d = list.find((x) => x.id === id);
  if (!d) return;
  recordUndo();
  const rest = list.filter((x) => x.id !== id);
  patchSession((cur) => ({ drawings: { ...cur.drawings, [cur.symbol]: where === 'front' ? [...rest, d] : [d, ...rest] } }));
}

/** Bu sembolün tüm çizimlerini kilitler / kilidini açar (TradingView "Tüm çizimleri kilitle"). */
export function setAllLocked(lock: boolean) {
  const s = get().session;
  if (!s) return;
  recordUndo();
  patchSession((cur) => ({ drawings: { ...cur.drawings, [cur.symbol]: drawingsOf(cur).map((d) => ({ ...d, locked: lock })) } }));
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
          // Geçersiz seviyeler (ör. long'da SL girişin üstünde) emre yazılmaz: çizim düzelince eşitleme sürer.
          if (!validLevels(t.side, u.entry.p, u.sl, u.tp)) return t;
          const price = entryPriceNow(t.symbol, t.side) ?? u.entry.p;
          // Bekleyen emir çizimle birlikte yeniden boyutlanır: sabit lot veya risk % (SL / giriş değişince lot yeniden hesaplanır).
          let lots = t.lots;
          let riskPct = t.riskPct;
          {
            const dec = decideLots(getSymbol(t.symbol), { mode: u.lots != null ? 'lots' : 'risk', lots: u.lots ?? 0, riskPct: u.riskPct, balance: balanceOf(s), entry: u.entry.p, sl: u.sl, commissionPerLot: t.commissionPerLot });
            if (dec.error == null) {
              lots = dec.lots;
              riskPct = u.lots != null ? undefined : u.riskPct;
            }
          }
          return { ...t, sl: u.sl, tp: u.tp, initialSl: u.sl, entry: u.entry.p, lots, riskPct, orderType: pendingType(t.side, u.entry.p, price) };
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

export function validLevels(side: Side, entry: number, sl: number, tp: number) {
  return side === 'long' ? sl < entry && tp > entry : sl > entry && tp < entry;
}
