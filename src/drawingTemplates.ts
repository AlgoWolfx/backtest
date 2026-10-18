// TradingView "Şablon" menüsünün karşılığı: dikdörtgen stilini varsayılan olarak kaydetme / uygulama.
// Yalnızca stil alanları saklanır (koordinatlar, metin ve görünürlük şablona girmez); tarayıcıda saklanır.

import type { Rect } from './core/types';

const KEY = 'backtest.rectTemplate';

/** Şablona giren stil alanları. */
export const RECT_STYLE_KEYS = [
  'color', 'width', 'style', 'fillAlpha', 'fill', 'fillOn', 'fillColor', 'borderOn', 'borderColor', 'borderAlpha',
  'midline', 'midColor', 'midStyle', 'midWidth', 'extendLeft', 'extendRight',
  'textColor', 'textSize', 'bold', 'italic', 'vAlign', 'hAlign',
] as const;

export type RectTemplate = Partial<Pick<Rect, (typeof RECT_STYLE_KEYS)[number]>>;

/** Bir dikdörtgenden şablona girecek stil alanlarını ayıklar. */
export function rectTemplateOf(d: Rect): RectTemplate {
  const out: Record<string, unknown> = {};
  for (const k of RECT_STYLE_KEYS) if (d[k] !== undefined) out[k] = d[k];
  return out as RectTemplate;
}

export function loadRectTemplate(): RectTemplate {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const o = JSON.parse(raw) as Record<string, unknown>;
      const out: Record<string, unknown> = {};
      for (const k of RECT_STYLE_KEYS) if (o[k] !== undefined) out[k] = o[k];
      return out as RectTemplate;
    }
  } catch {
    /* depolama yok / bozuk */
  }
  return {};
}

export function saveRectTemplate(t: RectTemplate) {
  try {
    localStorage.setItem(KEY, JSON.stringify(t));
  } catch {
    /* kaydedilemedi */
  }
}

export function clearRectTemplate() {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* yok */
  }
}
