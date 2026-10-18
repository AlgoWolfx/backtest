import type { TF } from './timeframes';
import type { Trade } from './trading';
import type { DataSource } from './data';
import type { Account } from './account';

/** Çizim noktası: gerçek UTC saniye + fiyat. Zaman dilimi değişse de aynı yerde kalır. */
export interface Pt {
  t: number;
  p: number;
}

export interface FibLevel {
  v: number;
  on: boolean;
  /** Bu seviyenin çizgi/yazı rengi ve kendinden önceki seviye arasındaki arkaplanın rengi (yok = çizim rengi) */
  color?: string;
}

export type LineStyleName = 'solid' | 'dashed' | 'dotted';

interface Base {
  id: string;
  color: string;
  width: number;
  /** Çizgi stili (yoksa düz) */
  style?: LineStyleName;
  /** Görünürlük: bu zaman dilimlerinde çizim gizlenir (TradingView "Görünürlük" sekmesi); yoksa hepsinde görünür */
  hiddenTfs?: TF[];
  /** Kilitli çizim seçilebilir ama taşınamaz / düzenlenemez (TradingView "Kilitle") */
  locked?: boolean;
  /** Çizgi opaklığı 0-1 (yok = 1): TradingView renk seçicisindeki opaklık */
  lineAlpha?: number;
}

export type TextHAlign = 'left' | 'center' | 'right';
export type TextVAlign = 'top' | 'middle' | 'bottom';
export type RectExtend = 'none' | 'left' | 'right' | 'both';

/** Çizgi üstü metin ayarları (yatay çizgi ve trend çizgisi: TradingView "Metin" sekmesi) */
export interface LineText {
  text?: string;
  textColor?: string;
  textSize?: number;
  bold?: boolean;
  italic?: boolean;
  /** Metnin çizgi boyunca konumu (yok = yatay çizgide sağ, trend çizgisinde orta) */
  hAlign?: TextHAlign;
  /** Metnin çizgiye göre dikey konumu (yok = üst) */
  vAlign?: TextVAlign;
}

export interface HLine extends Base, LineText {
  type: 'hline';
  p: number;
  /** Sağ eksendeki fiyat etiketi (yok = göster) */
  showPriceLabel?: boolean;
}

export type LineEnd = 'normal' | 'arrow';
export type StatsMode = 'hidden' | 'always' | 'selected';
export interface TrendLine extends Base, LineText {
  type: 'trend';
  a: Pt;
  b: Pt;
  extendLeft?: boolean;
  extendRight?: boolean;
  /** Orta noktayı işaretle */
  midpoint?: boolean;
  /** Uç biçimi: normal veya ok (TradingView "Sol uç / Sağ uç") */
  leftEnd?: LineEnd;
  rightEnd?: LineEnd;
  /** Uç noktaların fiyat etiketleri (sağ eksende) */
  showPriceLabels?: boolean;
  /** İstatistik kutusu: gizli / her zaman / yalnızca seçiliyken (yok = gizli) ve gösterilecek kalemler */
  statsMode?: StatsMode;
  statPrice?: boolean;
  statPct?: boolean;
  statBars?: boolean;
  statTime?: boolean;
  statDist?: boolean;
  statAngle?: boolean;
}
export interface Rect extends Base {
  type: 'rect';
  a: Pt;
  b: Pt;
  fill: string;
  /** Dolgu saydamlığı (0-1, yoksa 0.15); fill rengi color + bu değerden türetilir */
  fillAlpha?: number;
  extendLeft?: boolean;
  extendRight?: boolean;
  /** Orta çizgi (%50 / denge seviyesi) ve fiyat etiketi */
  midline?: boolean;
  // --- TradingView benzeri ayrıntılı stil (hepsi isteğe bağlı; yoksa eski davranış) ---
  /** Kenarlık görünsün mü (yok = evet) ve rengi/saydamlığı (yok = color, 1) */
  borderOn?: boolean;
  borderColor?: string;
  borderAlpha?: number;
  /** Arkaplan görünsün mü (yok = fillAlpha > 0) ve rengi (yok = fill / color) */
  fillOn?: boolean;
  fillColor?: string;
  /** Orta çizgi rengi / stili / kalınlığı (yok = kenarlık rengi, kesik, 1) */
  midColor?: string;
  midStyle?: LineStyleName;
  midWidth?: number;
  // --- Metin ---
  text?: string;
  textColor?: string;
  textSize?: number;
  bold?: boolean;
  italic?: boolean;
  /** Metin hizalama: dikey (üst/orta/alt) ve yatay (sol/orta/sağ); yok = orta / sağ */
  vAlign?: TextVAlign;
  hAlign?: TextHAlign;
}
export interface Fib extends Base {
  type: 'fib';
  a: Pt;
  b: Pt;
  levels: FibLevel[];
  extendRight?: boolean;
  /** Seviyeler arasındaki arkaplan dolgusu (TradingView "Arkaplan"): açık mı ve opaklığı (yok = kapalı / 0.15) */
  bgOn?: boolean;
  bgAlpha?: number;
  /** Arkaplan tek renk (yok = her aralık üst seviyenin rengiyle) */
  bgColor?: string;
  // --- TradingView "Fib Retracement" ayarları (hepsi isteğe bağlı) ---
  /** Trend çizgisi (a-b kesikli çizgisi): göster (yok = evet), renk, kalınlık, stil */
  showTrend?: boolean;
  trendColor?: string;
  trendWidth?: number;
  trendStyle?: LineStyleName;
  /** Seviye çizgilerinin kalınlığı/stili (yok = çizim kalınlığı / düz) */
  levelWidth?: number;
  levelStyle?: LineStyleName;
  extendLeft?: boolean;
  /** Seviyeleri ters çevir (0 ve 1 yer değiştirir) */
  reverse?: boolean;
  /** Yazıda fiyat ve seviye değeri (yok = ikisi de) */
  showPrices?: boolean;
  showLevels?: boolean;
  /** Yazı konumu: yatay (sol/sağ) ve seviyeye göre dikey (üst/orta/alt); yok = sol / orta */
  labelH?: 'left' | 'right';
  labelV?: 'top' | 'middle' | 'bottom';
  /** Tüm seviyelerde tek renk (çizim rengi) */
  oneColor?: boolean;
}
export interface Position extends Base {
  type: 'long' | 'short';
  entry: Pt;
  sl: number;
  tp: number;
  tEnd: number;
  riskPct: number;
  tradeId?: string;
  /** Kâr (hedef) ve zarar (stop) bölgelerinin renkleri ve arkaplan opaklığı (yok = yeşil / kırmızı, 0.2) */
  profitColor?: string;
  lossColor?: string;
  zoneAlpha?: number;
  /** Kâr / zarar bölgesi opaklıkları ayrı ayrı (yok = zoneAlpha) */
  profitAlpha?: number;
  lossAlpha?: number;
  /** Giriş çizgisi ve yazı rengi (yok = gri / beyaz) */
  lineColor?: string;
  textColor?: string;
  /** İstatistikler: her zaman göster (yok = seçiliyken veya işlem varken) ve kompakt gösterim (tek satır) */
  alwaysStats?: boolean;
  compact?: boolean;
}

export type Drawing = HLine | TrendLine | Rect | Fib | Position;
/** Kimliği henüz atanmamış çizim (birleşim tipine dağıtılmış Omit). */
export type NewDrawing = Drawing extends infer D ? (D extends Drawing ? Omit<D, 'id'> : never) : never;
export type DrawingType = Drawing['type'];
export type Tool = 'cursor' | 'measure' | DrawingType;

/** Çoklu ekranda bir grafiğin sembolü ve zaman dilimi. */
export interface PaneCfg {
  symbol: string;
  tf: TF;
}
export type LayoutId = '1' | '2v' | '2h' | '3' | '4';
/** Düzen başına varsayılan bölücü konumu (3 ekranda sol sütun 2/3 genişliğinde). */
export const defaultSplit = (layout: LayoutId): { x: number; y: number } => ({ x: layout === '3' ? 2 / 3 : 0.5, y: 0.5 });
export const SPLIT_MIN = 0.12;
export const clampSplit = (v: number) => Math.min(1 - SPLIT_MIN, Math.max(SPLIT_MIN, v));
export const LAYOUTS: Record<LayoutId, { count: number; label: string }> = {
  '1': { count: 1, label: 'Tek ekran' },
  '2v': { count: 2, label: '2 ekran (yan yana)' },
  '2h': { count: 2, label: '2 ekran (alt alta)' },
  '3': { count: 3, label: '3 ekran' },
  '4': { count: 4, label: '4 ekran (2×2)' },
};

export interface Session {
  id: string;
  name: string;
  /** Veri kaynağı: her zaman Dukascopy (eski HistData / OANDA oturumları açılışta buna çevrilir) */
  source?: DataSource;
  /** Hesap kuralları ve durumu (eski oturumlarda yok = kuralsız kişisel hesap) */
  account?: Account;
  createdAt: number;
  updatedAt: number;
  initialBalance: number;
  startTime: number;
  /** Replay imleci (UTC). Kapanışı bu zamana kadar olan 1m mumlar görünür. */
  replayTime: number;
  /** Aktif grafiğin sembolü / zaman dilimi (panes[active] ile aynıdır) */
  symbol: string;
  tf: TF;
  /** Çoklu ekran: düzen, her grafiğin ayarı ve aktif grafik (eski oturumlarda yok = tek ekran) */
  layout?: LayoutId;
  /** Ekran bölücü konumları (0-1): x = sütun ayrımı, y = satır ayrımı. Yoksa düzenin varsayılanı. */
  split?: { x: number; y: number };
  panes?: PaneCfg[];
  active?: number;
  stepTf: TF;
  speed: number;
  riskPct: number;
  lots: number;
  /** Komisyon, USD / lot, GİDİŞ-DÖNÜŞ (isteğe bağlı; yok = 0). Her işlem açılırken değeri işlemin kendisine yazılır. */
  commissionPerLot?: number;
  /** Oturumun açıldığı yürütme modeli sürümü (bkz. EXECUTION_MODEL); yok = 1 */
  executionModel?: number;
  trades: Trade[];
  drawings: Record<string, Drawing[]>;
  fibDefaults: FibLevel[];
  seq: number;
}

export const DEFAULT_FIB: FibLevel[] = [
  { v: 0, on: true },
  { v: 0.236, on: false },
  { v: 0.382, on: false },
  { v: 0.5, on: true },
  { v: 0.618, on: true },
  { v: 0.705, on: true },
  { v: 0.786, on: true },
  { v: 1, on: true },
  { v: -0.27, on: false },
  { v: -0.5, on: false },
  { v: -1, on: false },
  { v: -2, on: false },
];
