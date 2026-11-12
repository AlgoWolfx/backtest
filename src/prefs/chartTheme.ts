// Grafik görünümü (TradingView'deki "Grafik ayarları" gibi): renkler, mum türü, ölçek, çizgiler ve durum çubuğu.
// Tarayıcıda saklanır ve tüm oturumlarda geçerlidir.

export type ChartType = 'candles' | 'hollow' | 'bars' | 'line' | 'area';
export type PriceMode = 'normal' | 'log' | 'percent' | 'indexed';
export type CrosshairStyle = 'solid' | 'dashed' | 'dotted';

export interface ChartTheme {
  // ---- tuval
  background: string;
  text: string;
  /** Fiyat / zaman ekseni kenar çizgisi (TradingView "Ölçek çizgileri"). Izgara yok: hiç çizilmez. */
  scaleLine: string;
  crosshair: string;
  crosshairStyle: CrosshairStyle;
  crosshairWidth: 1 | 2 | 3 | 4;
  /** Artı imleç en yakın mumun OHLC değerine yapışır */
  crosshairMagnet: boolean;
  fontSize: number;
  watermark: boolean;
  // ---- mumlar
  chartType: ChartType;
  upBody: string;
  downBody: string;
  borderVisible: boolean;
  upBorder: string;
  downBorder: string;
  upWick: string;
  downWick: string;
  /** Çizgi / alan grafiği rengi */
  lineColor: string;
  // ---- ölçekler
  priceMode: PriceMode;
  invert: boolean;
  /** Son fiyat çizgisi ve fiyat eksenindeki etiketi */
  lastLine: boolean;
  lastLabel: boolean;
  /** Mum kapanışına kalan süre (fiyat etiketinin altında) */
  countdown: boolean;
  marginTop: number;
  marginBottom: number;
  /** Son mumun sağındaki boşluk (mum sayısı) */
  rightOffset: number;
  // ---- durum çubuğu
  showSymbol: boolean;
  showSource: boolean;
  showOhlc: boolean;
  showChange: boolean;
}

export const DEFAULT_THEME: ChartTheme = {
  background: '#0b0c0f',
  text: '#9598a1',
  scaleLine: '#1e222d',
  crosshair: '#5d606b',
  crosshairStyle: 'dashed',
  crosshairWidth: 1,
  crosshairMagnet: false,
  fontSize: 11,
  watermark: false,
  chartType: 'candles',
  upBody: '#089981',
  downBody: '#f23645',
  borderVisible: false,
  upBorder: '#089981',
  downBorder: '#f23645',
  upWick: '#089981',
  downWick: '#f23645',
  lineColor: '#2962ff',
  priceMode: 'normal',
  invert: false,
  lastLine: true,
  lastLabel: true,
  countdown: true,
  marginTop: 8,
  marginBottom: 8,
  rightOffset: 12,
  showSymbol: true,
  showSource: true,
  showOhlc: true,
  showChange: true,
};

/** Hazır temalarla yalnızca renkler değişir; mum türü, ölçek ve durum çubuğu ayarlarına dokunulmaz. */
export type ThemeColors = Pick<ChartTheme, 'background' | 'text' | 'scaleLine' | 'crosshair' | 'upBody' | 'downBody' | 'borderVisible' | 'upBorder' | 'downBorder' | 'upWick' | 'downWick'>;

const COLOR_KEYS: (keyof ThemeColors)[] = ['background', 'text', 'scaleLine', 'crosshair', 'upBody', 'downBody', 'borderVisible', 'upBorder', 'downBorder', 'upWick', 'downWick'];

export function withColors(t: ChartTheme, colors: ThemeColors): ChartTheme {
  const out = { ...t };
  for (const k of COLOR_KEYS) (out as Record<string, unknown>)[k] = colors[k];
  return out;
}

const col = (p: Partial<ThemeColors>): ThemeColors => {
  const base: ThemeColors = {} as ThemeColors;
  for (const k of COLOR_KEYS) (base as unknown as Record<string, unknown>)[k] = DEFAULT_THEME[k];
  return { ...base, ...p };
};

/** En çok kullanılan hazır renk temaları (hepsi ızgarasız). Yalnızca renkler değişir. */
export const THEME_PRESETS: { name: string; colors: ThemeColors }[] = [
  { name: 'Varsayılan', colors: col({}) },
  { name: 'TradingView koyu', colors: col({ background: '#131722', text: '#b2b5be', scaleLine: '#2a2e39', crosshair: '#758696', upBody: '#26a69a', downBody: '#ef5350', upBorder: '#26a69a', downBorder: '#ef5350', upWick: '#26a69a', downWick: '#ef5350' }) },
  { name: 'TradingView açık', colors: col({ background: '#ffffff', text: '#131722', scaleLine: '#e0e3eb', crosshair: '#9598a1', upBody: '#089981', downBody: '#f23645', upBorder: '#089981', downBorder: '#f23645', upWick: '#089981', downWick: '#f23645' }) },
  { name: 'Siyah', colors: col({ background: '#000000', text: '#868993', scaleLine: '#1a1b20' }) },
  { name: 'Gece mavisi', colors: col({ background: '#0d1b2a', text: '#8fa3b8', scaleLine: '#1b2e44', crosshair: '#6b829b', upBody: '#2ecc9a', downBody: '#ff5c6c', upBorder: '#2ecc9a', downBorder: '#ff5c6c', upWick: '#2ecc9a', downWick: '#ff5c6c' }) },
  { name: 'Beyaz / siyah mum', colors: col({ background: '#ffffff', text: '#131722', scaleLine: '#e0e3eb', crosshair: '#9598a1', upBody: '#ffffff', downBody: '#000000', upBorder: '#000000', downBorder: '#000000', upWick: '#000000', downWick: '#000000', borderVisible: true }) },
  { name: 'Siyah üstüne beyaz', colors: col({ background: '#000000', text: '#868993', scaleLine: '#1a1b20', upBody: '#ffffff', downBody: '#000000', upBorder: '#ffffff', downBorder: '#ffffff', upWick: '#ffffff', downWick: '#ffffff', borderVisible: true }) },
  { name: 'Mavi / beyaz mum', colors: col({ upBody: '#ffffff', downBody: '#2962ff', upBorder: '#ffffff', downBorder: '#2962ff', upWick: '#ffffff', downWick: '#2962ff', borderVisible: true }) },
  { name: 'Gri tonlar', colors: col({ background: '#131722', text: '#9598a1', scaleLine: '#2a2e39', upBody: '#d1d4dc', downBody: '#5d606b', upBorder: '#d1d4dc', downBorder: '#5d606b', upWick: '#d1d4dc', downWick: '#5d606b' }) },
  { name: 'Canlı yeşil / kırmızı', colors: col({ background: '#0b0c0f', upBody: '#00e676', downBody: '#ff1744', upBorder: '#00e676', downBorder: '#ff1744', upWick: '#00e676', downWick: '#ff1744' }) },
];

const KEY = 'backtest.chartTheme';

export function loadTheme(): ChartTheme {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const { grid: _g, gridV: _v, gridH: _h, ...saved } = JSON.parse(raw) as Record<string, unknown>; // ızgara kaldırıldı
      return { ...DEFAULT_THEME, ...saved } as ChartTheme;
    }
  } catch {
    /* depolama yok / bozuk: varsayılan */
  }
  return DEFAULT_THEME;
}

export function saveTheme(t: ChartTheme) {
  try {
    localStorage.setItem(KEY, JSON.stringify(t));
  } catch {
    /* kaydedilemedi */
  }
}

// ---- Grafik şablonları (TradingView "Grafik ayarları → Şablon"): tüm ayarlar adla kaydedilir / uygulanır / silinir.

export interface ChartTemplate {
  name: string;
  theme: Partial<ChartTheme>;
}

const TPL_KEY = 'backtest.chartTemplates';

/**
 * Hazır grafik şablonları. Kullanıcı aynı adla kaydederse onun kopyası geçerli olur; kopyayı silince hazır hali döner.
 * "TradingView ayarım": kullanıcının TradingView'deki ayarı (gri arka plan, mavi / siyah mum, siyah kenar ve fitil, ızgarasız).
 */
export const BUILTIN_CHART_TEMPLATES: ChartTemplate[] = [
  {
    name: 'TradingView ayarım',
    theme: {
      background: '#636363',
      text: '#000000',
      scaleLine: '#636363', // TradingView'de ölçek çizgileri saydam
      crosshair: '#9598a1',
      crosshairStyle: 'dashed',
      crosshairWidth: 1,
      fontSize: 14,
      watermark: false,
      chartType: 'candles',
      upBody: '#2962ff',
      downBody: '#000000',
      borderVisible: true,
      upBorder: '#000000',
      downBorder: '#000000',
      upWick: '#000000',
      downWick: '#000000',
      marginTop: 10,
      marginBottom: 8,
      rightOffset: 10,
    },
  },
];

export function loadChartTemplates(): ChartTemplate[] {
  try {
    const v = JSON.parse(localStorage.getItem(TPL_KEY) ?? '[]');
    return Array.isArray(v) ? v.filter((t) => t && typeof t.name === 'string' && t.theme && typeof t.theme === 'object') : [];
  } catch {
    return [];
  }
}

function writeChartTemplates(list: ChartTemplate[]) {
  try {
    localStorage.setItem(TPL_KEY, JSON.stringify(list));
  } catch {
    /* kaydedilemedi */
  }
}

/** Aynı ad varsa yerinde üzerine yazar. */
export function saveChartTemplate(name: string, theme: ChartTheme) {
  const list = loadChartTemplates();
  const i = list.findIndex((t) => t.name === name);
  if (i >= 0) list[i] = { name, theme: { ...theme } };
  else list.push({ name, theme: { ...theme } });
  writeChartTemplates(list);
}

export function deleteChartTemplate(name: string) {
  writeChartTemplates(loadChartTemplates().filter((t) => t.name !== name));
}

/** Şablonu uygular: eksik alanlar (eski şablon) varsayılandan gelir, ızgara alanları yok sayılır. */
export function themeFromTemplate(t: ChartTemplate): ChartTheme {
  const { grid: _g, gridV: _v, gridH: _h, ...rest } = t.theme as Record<string, unknown>;
  return { ...DEFAULT_THEME, ...rest } as ChartTheme;
}
