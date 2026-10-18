// Grafik görünümü (TradingView'deki "Grafik ayarları" gibi): renkler, mum türü, ölçek, çizgiler ve durum çubuğu.
// Tarayıcıda saklanır ve tüm oturumlarda geçerlidir.

export type ChartType = 'candles' | 'hollow' | 'bars' | 'line' | 'area';
export type PriceMode = 'normal' | 'log' | 'percent' | 'indexed';
export type CrosshairStyle = 'solid' | 'dashed' | 'dotted';

export interface ChartTheme {
  // ---- tuval
  background: string;
  text: string;
  grid: string;
  gridV: boolean;
  gridH: boolean;
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
  grid: '#15171c',
  gridV: true,
  gridH: true,
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
export type ThemeColors = Pick<ChartTheme, 'background' | 'text' | 'grid' | 'gridV' | 'gridH' | 'crosshair' | 'upBody' | 'downBody' | 'borderVisible' | 'upBorder' | 'downBorder' | 'upWick' | 'downWick'>;

const COLOR_KEYS: (keyof ThemeColors)[] = ['background', 'text', 'grid', 'gridV', 'gridH', 'crosshair', 'upBody', 'downBody', 'borderVisible', 'upBorder', 'downBorder', 'upWick', 'downWick'];

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

export const THEME_PRESETS: { name: string; colors: ThemeColors }[] = [
  { name: 'Varsayılan', colors: col({}) },
  {
    name: 'TradingView koyu',
    colors: col({ background: '#131722', text: '#b2b5be', grid: '#1e222d', crosshair: '#758696', upBody: '#26a69a', downBody: '#ef5350', upBorder: '#26a69a', downBorder: '#ef5350', upWick: '#26a69a', downWick: '#ef5350' }),
  },
  { name: 'Siyah', colors: col({ background: '#000000', grid: '#101114', text: '#868993' }) },
  {
    name: 'Gece mavisi',
    colors: col({ background: '#0d1b2a', text: '#8fa3b8', grid: '#16283b', crosshair: '#6b829b', upBody: '#2ecc9a', downBody: '#ff5c6c', upBorder: '#2ecc9a', downBorder: '#ff5c6c', upWick: '#2ecc9a', downWick: '#ff5c6c' }),
  },
  {
    name: 'Mavi / beyaz mum',
    colors: col({ upBody: '#ffffff', downBody: '#2962ff', upBorder: '#ffffff', downBorder: '#2962ff', upWick: '#ffffff', downWick: '#2962ff', borderVisible: true }),
  },
  { name: 'Izgarasız', colors: col({ gridV: false, gridH: false }) },
];

const KEY = 'backtest.chartTheme';

export function loadTheme(): ChartTheme {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return { ...DEFAULT_THEME, ...JSON.parse(raw) };
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
