// Çoklu ekran: aktif ekranın sembol / zaman dilimi, düzen, bölücüler, büyütme ve ekranlar arası senkron.

import { type TF } from '../core/timeframes';
import { DEFAULT_SYNC, LAYOUTS, type LayoutId, type PaneCfg, type Session, type SyncCfg } from '../core/types';
import { get, set, patchSession } from './state';
import { ensureData } from './session';

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
  patchSession((s) => ({ symbol, ...(syncOf(s).symbol ? patchAllPanes(s, { symbol }) : patchActivePane(s, { symbol })) }));
  set({ selectedId: null, editingId: null });
}

export function setTf(tf: TF) {
  patchSession((s) => ({ tf, ...(syncOf(s).tf ? patchAllPanes(s, { tf }) : patchActivePane(s, { tf })) }));
}

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
  set({ maxPane: null });
  patchSession(() => ({ layout, splits: undefined, panes, active: next, symbol: panes[next].symbol, tf: panes[next].tf }));
  if (next !== active) set({ selectedId: null, editingId: null, ticket: null });
}

/** Grafiği tüm alana büyütür / eski düzene döner (TradingView "grafiği büyüt"). Büyütülen grafik aktif olur. */
export function toggleMaxPane(pane: number) {
  const cur = get().maxPane;
  if (cur === pane) return set({ maxPane: null });
  activatePane(pane);
  set({ maxPane: pane });
}

/** Bir bölünmüş düğümün oranlarını ayarlar (null: varsayılana dön). */
export function setSplits(path: string, ratios: number[] | null) {
  patchSession((s) => {
    const splits = { ...s.splits };
    if (ratios) splits[path] = ratios;
    else delete splits[path];
    return { splits };
  });
}

export const syncOf = (s: Session | null | undefined): SyncCfg => ({ ...DEFAULT_SYNC, ...s?.sync });

const patchAllPanes = (s: Session, patch: Partial<PaneCfg>): Pick<Session, 'panes'> => ({ panes: s.panes?.map((p) => ({ ...p, ...patch })) });

/** Senkron anahtarlarını değiştirir; sembol / aralık açılınca aktif ekranın değeri hepsine yayılır. */
export function setSync(patch: Partial<SyncCfg>) {
  patchSession((s) => ({ sync: { ...syncOf(s), ...patch } }));
  if (patch.symbol) patchSession((s) => patchAllPanes(s, { symbol: s.symbol }));
  if (patch.tf) patchSession((s) => patchAllPanes(s, { tf: s.tf }));
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
