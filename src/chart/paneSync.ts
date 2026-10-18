// Ekranlar arası senkron: imleç (artı işareti), zaman (sağ kenar) ve tarih aralığı. Yalnızca KULLANICI bir grafiği
// sürüklerken / kaydırırken / imleci gezdirirken yayın yapılır; replay ilerlemesi ve diğer ekranlara uygulanan
// değişiklikler yeniden yayına yol açmaz (döngü yok).

import { paneControllers } from '../chartRef';
import { syncOf, useStore } from '../store';
import type { ChartController } from './ChartController';

const others = (src: ChartController) => [...paneControllers.values()].filter((c) => c !== src);

/** Kaynak ekranda imleç utc zamanında (price: imlecin fiyatı) ise diğer ekranlarda aynı zamanı gösterir; null: gizle. */
export function broadcastCrosshair(src: ChartController, utc: number | null, price: number | null) {
  if (!syncOf(useStore.getState().session).crosshair) return;
  for (const c of others(src)) c.showCrosshairAt(utc, c.spec?.id === src.spec?.id ? price : null);
}

/** Kaynak ekranın görünen aralığını, açık senkron türüne göre diğer ekranlara uygular. */
export function broadcastRange(src: ChartController) {
  const cfg = syncOf(useStore.getState().session);
  if (!cfg.time && !cfg.range) return;
  const r = src.visibleTimeRange();
  if (!r) return;
  const [t0, t1] = r;
  for (const c of others(src)) {
    if (!c.agg || c.lastK < 0) continue;
    if (cfg.range) {
      c.setLogicalRangeQuiet(c.timeToLogical(t0), c.timeToLogical(t1));
    } else {
      // Yalnızca zaman: sağ kenar aynı zamana gelir, kendi yakınlaştırması (genişlik) korunur
      const cur = c.chart.timeScale().getVisibleLogicalRange();
      if (!cur) continue;
      const width = cur.to - cur.from;
      const L = c.timeToLogical(t1);
      c.setLogicalRangeQuiet(L - width, L);
    }
  }
}
