// TradingView "Şablon" menüsünün karşılığı: her çizim türü için stilleri varsayılan olarak kaydetme / uygulama.
// Yalnızca stil alanları saklanır (koordinatlar, metin ve görünürlük şablona girmez); tarayıcıda saklanır.

import { hexToRgba } from '../chart/drawUtil';
import type { Drawing, FibLevel, Rect } from '../core/types';

type TemplateType = 'rect' | 'trend' | 'hline' | 'vline' | 'text' | 'fib' | 'long' | 'short';

/** Her aracın fabrika rengi / kalınlığı. */
export const TOOL_DEFAULTS: Record<TemplateType, { color: string; width: number }> = {
  hline: { color: '#2962ff', width: 1 },
  vline: { color: '#787b86', width: 1 },
  text: { color: '#d1d4dc', width: 1 },
  trend: { color: '#2962ff', width: 2 },
  rect: { color: '#2962ff', width: 1 },
  fib: { color: '#9598a1', width: 1 },
  long: { color: '#787b86', width: 1 },
  short: { color: '#787b86', width: 1 },
};

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
  hline: ['color', 'width', 'style', 'lineAlpha', 'showPriceLabel', 'extendLeft', ...TEXT_STYLE],
  vline: ['color', 'width', 'style', 'lineAlpha', ...TEXT_STYLE],
  text: ['color', 'textColor', 'textSize', 'bold', 'italic', 'bgOn', 'bgColor', 'bgAlpha'],
  fib: [
    'color', 'width', 'bgOn', 'bgAlpha', 'bgColor', 'showTrend', 'trendColor', 'trendWidth', 'trendStyle', 'levelWidth', 'levelStyle',
    'extendLeft', 'extendRight', 'reverse', 'showPrices', 'showLevels', 'labelH', 'labelV', 'oneColor', 'levels',
  ],
  long: ['profitColor', 'lossColor', 'zoneAlpha', 'profitAlpha', 'lossAlpha', 'lineColor', 'textColor', 'alwaysStats', 'compact'],
  short: ['profitColor', 'lossColor', 'zoneAlpha', 'profitAlpha', 'lossAlpha', 'lineColor', 'textColor', 'alwaysStats', 'compact'],
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

/**
 * "Fabrika ayarlarına dön" yaması: stil alanları silinir, zorunlu olanlar (renk, kalınlık, Fib seviyeleri) fabrika
 * değerine döner. (Eskiden bunlar da undefined yapılıp çizim çöküyordu.)
 */
export function factoryReset(type: TemplateType, fibLevels: FibLevel[]): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const k of STYLE_KEYS[type]) out[k] = undefined;
  Object.assign(out, TOOL_DEFAULTS[type]);
  if (type === 'fib') out.levels = fibLevels.map((l) => ({ ...l }));
  if (type === 'rect') out.fill = hexToRgba(TOOL_DEFAULTS.rect.color, 0.15);
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

// ---- Adlı şablonlar (TradingView "Şablonu farklı kaydet…"): stil + etiket metni, tür başına birden çok.
// Liste hazır ICT / SMC şablonlarıyla başlar, sonra tamamen kullanıcınındır (değiştir / üzerine yaz / sil); tarayıcıda saklanır.

export interface NamedTemplate {
  name: string;
  style: DrawingTemplate;
}

/** Adlı şablon = stil alanları + etiket metni (çizgiye "PDH", "SIBI" gibi ad yazar). */
export function namedTemplateOf(d: Drawing): DrawingTemplate {
  const out = templateOf(d);
  const text = (d as { text?: string }).text;
  if (text !== undefined) out.text = text;
  return out;
}

const HIGH = '#f23645';
const LOW = '#089981';

/** Yatay ışın etiketi: sağda, çizginin üstünde, çizgi renginde. */
const hl = (name: string, color: string, style: 'solid' | 'dashed' | 'dotted' = 'solid'): NamedTemplate => ({
  name,
  style: { color, width: 1, style, lineAlpha: 1, text: name, textColor: color, textSize: 11, hAlign: 'right', vAlign: 'top' },
});
/** Yapı kırılımı (trend çizgisi): kırılan tepe/dipten kıran muma, etiket ortada. */
const st = (name: string, color: string, style: 'solid' | 'dashed' | 'dotted' = 'dashed'): NamedTemplate => ({
  name,
  style: { color, width: 1, style, lineAlpha: 1, text: name, textColor: color, textSize: 11, hAlign: 'center', vAlign: 'top' },
});
/** Bölge (dikdörtgen): dolgu + %50 orta çizgi (CE / mean threshold), etiket sağ üstte. */
const zone = (name: string, color: string, alpha = 0.18, midline = true): NamedTemplate => ({
  name,
  style: {
    color, width: 1, fillColor: color, fillAlpha: alpha, fillOn: true, fill: hexToRgba(color, alpha),
    midline, midColor: color, midStyle: 'dashed', midWidth: 1,
    text: name, textColor: color, textSize: 11, hAlign: 'right', vAlign: 'top',
  },
});

const STRUCTURE = [st('MSS', '#ff9800'), st('CHoCH', '#e91e63'), st('BOS', '#2962ff'), st('CISD', '#9c27b0')];

export const BUILTIN_TEMPLATES: Partial<Record<TemplateType, NamedTemplate[]>> = {
  hline: [
    hl('PDH', HIGH), hl('PDL', LOW), hl('PWH', HIGH), hl('PWL', LOW), hl('PMH', HIGH), hl('PML', LOW),
    hl('BSL', HIGH, 'dashed'), hl('SSL', LOW, 'dashed'), hl('EQH', HIGH, 'dotted'), hl('EQL', LOW, 'dotted'),
    hl('ERL', '#ff9800', 'dashed'), hl('IRL', '#00bcd4', 'dashed'), hl('Midnight Open', '#787b86', 'dotted'),
    ...STRUCTURE.map((t) => ({ ...t, style: { ...t.style, hAlign: 'right' } })),
  ],
  trend: STRUCTURE,
  rect: [
    zone('+OB', LOW), zone('-OB', HIGH), zone('BISI', '#00bcd4'), zone('SIBI', '#e91e63'),
    zone('+BB', '#2962ff'), zone('-BB', '#ff9800'), zone('IFVG', '#9c27b0'), zone('BPR', '#787b86'),
    zone('Premium', HIGH, 0.08, false), zone('Discount', LOW, 0.08, false),
  ],
};

const namedKey = (type: TemplateType) => `backtest.drawTemplates.${type}`;

/**
 * Türün şablon listesi. Hiç kaydedilmemişse hazır şablonlarla başlar; sonra liste tamamen kullanıcınındır
 * (hazırlar da değiştirilebilir / silinebilir, TradingView gibi). Bozuk kayıtta hazırlara döner.
 */
export function loadNamed(type: TemplateType): NamedTemplate[] {
  const builtins = () => structuredClone(BUILTIN_TEMPLATES[type] ?? []);
  try {
    const raw = localStorage.getItem(namedKey(type));
    if (raw == null) return builtins();
    const v = JSON.parse(raw);
    return Array.isArray(v) ? v.filter((t) => t && typeof t.name === 'string' && t.style && typeof t.style === 'object') : builtins();
  } catch {
    return builtins();
  }
}

function writeNamed(type: TemplateType, list: NamedTemplate[]) {
  try {
    localStorage.setItem(namedKey(type), JSON.stringify(list));
  } catch {
    /* kaydedilemedi */
  }
}

export const hasNamed = (type: TemplateType, name: string) => loadNamed(type).some((t) => t.name === name);

/** Aynı adlı şablon varsa yerinde üzerine yazar, yoksa sona ekler. */
export function saveNamed(type: TemplateType, name: string, style: DrawingTemplate) {
  const list = loadNamed(type);
  const i = list.findIndex((t) => t.name === name);
  if (i >= 0) list[i] = { name, style };
  else list.push({ name, style });
  writeNamed(type, list);
}

export function deleteNamed(type: TemplateType, name: string) {
  writeNamed(type, loadNamed(type).filter((t) => t.name !== name));
}

/** Hazır şablonları geri yükler: değiştirilen / silinen hazırlar eski hâline döner, kullanıcının eklediği şablonlar kalır. */
export function restoreBuiltins(type: TemplateType) {
  const builtins = structuredClone(BUILTIN_TEMPLATES[type] ?? []);
  const names = new Set(builtins.map((t) => t.name));
  writeNamed(type, [...builtins, ...loadNamed(type).filter((t) => !names.has(t.name))]);
}
