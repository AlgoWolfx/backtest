import type { ChartController } from './chart/ChartController';
import { useStore } from './store';

/** Çoklu ekranda her grafiğin denetleyicisi (ekran numarasına göre). */
export const paneControllers = new Map<number, ChartController>();

/** Klavye kısayolları, ekran görüntüsü gibi React dışı yerlerden AKTİF grafiğe erişim. */
export const chartRef = {
  get current(): ChartController | null {
    const a = useStore.getState().session?.active ?? 0;
    return paneControllers.get(a) ?? paneControllers.get(0) ?? null;
  },
};

/** Belirli bir sembolü gösteren grafik (aktif olan tercih edilir). */
export function controllerFor(symbol: string): ChartController | null {
  const cur = chartRef.current;
  if (cur?.spec?.id === symbol) return cur;
  for (const c of paneControllers.values()) if (c.spec?.id === symbol) return c;
  return null;
}
