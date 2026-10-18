// TradingView "Şablon" menüsünün karşılığı: her çizim türü için stilleri varsayılan olarak kaydetme / uygulama.
// Yalnızca stil alanları saklanır (koordinatlar, metin ve görünürlük şablona girmez); tarayıcıda saklanır.

import type { Drawing, Rect } from './core/types';

type TemplateType = 'rect' | 'trend' | 'hline' | 'fib' | 'long' | 'short';

const TEXT_STYLE = ['textColor', 'textSize', 'bold', 'italic', 'hAlign', 'vAlign'] as const;

/** Her türün şablona giren stil alanları. */
export const STYLE_KEYS: Record<TemplateType, readonly string[]> = {
  rect: [
    'color', 'width', 'style', 'fillAlpha', 'fill', 'fillOn', 'fillColor', 'borderOn', 'borderColor', 'borderAlpha',
    'midline', 'midColor', 'midStyle', 'midWidth', 'extendLeft', 'extendRight', ...TEXT_STYLE,
  ],
  trend: [
    'color', 'width', 'style', 'lineAlpha', 'leftEnd', 'rightEnd', 'extendLeft', 'extendRight', 'midpoint', 'showPriceLabels',
    'statsMode', 'statPrice', 'statPct', 'statBars', 'statTime', 'statDist', 'statAngle', ...TEXT_STYLE,
  ],
  hline: ['color', 'width', 'style', 'lineAlpha', 'showPriceLabel', ...TEXT_STYLE],
  fib: [
    'color', 'width', 'bgOn', 'bgAlpha', 'showTrend', 'trendColor', 'trendWidth', 'trendStyle', 'levelWidth', 'levelStyle',
    'extendLeft', 'extendRight', 'reverse', 'showPrices', 'showLevels', 'labelH', 'labelV', 'oneColor', 'levels',
  ],
  long: ['profitColor', 'lossColor', 'zoneAlpha', 'lineColor', 'textColor', 'alwaysStats', 'compact'],
  short: ['profitColor', 'lossColor', 'zoneAlpha', 'lineColor', 'textColor', 'alwaysStats', 'compact'],
};

export type DrawingTemplate = Record<string, unknown>;

const keyOf = (type: TemplateType) => `backtest.drawTemplate.${type}`;

/** Bir çizimden şablona girecek stil alanlarını ayıklar. */
export function templateOf(d: Drawing): DrawingTemplate {
  const out: DrawingTemplate = {};
  const rec = d as unknown as Record<string, unknown>;
  for (const k of STYLE_KEYS[d.type]) if (rec[k] !== undefined) out[k] = structuredClone(rec[k]);
  return out;
}

export function loadTemplate(type: TemplateType): DrawingTemplate {
  try {
    const raw = localStorage.getItem(keyOf(type));
    if (raw) {
      const o = JSON.parse(raw) as Record<string, unknown>;
      const out: DrawingTemplate = {};
      for (const k of STYLE_KEYS[type]) if (o[k] !== undefined) out[k] = o[k];
      return out;
    }
  } catch {
    /* depolama yok / bozuk */
  }
  return {};
}

export function saveTemplate(type: TemplateType, t: DrawingTemplate) {
  try {
    localStorage.setItem(keyOf(type), JSON.stringify(t));
  } catch {
    /* kaydedilemedi */
  }
}

export function clearTemplate(type: TemplateType) {
  try {
    localStorage.removeItem(keyOf(type));
  } catch {
    /* yok */
  }
}

// ---- Geriye uyumlu dikdörtgen sarmalayıcıları
export type RectTemplate = Partial<Rect>;
export const rectTemplateOf = (d: Rect): RectTemplate => templateOf(d) as RectTemplate;
export const loadRectTemplate = (): RectTemplate => loadTemplate('rect') as RectTemplate;
export const saveRectTemplate = (t: RectTemplate) => saveTemplate('rect', t as DrawingTemplate);
export const clearRectTemplate = () => clearTemplate('rect');
