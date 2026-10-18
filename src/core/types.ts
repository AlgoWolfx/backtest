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
  /** Yatay ışının başlangıç zamanı (UTC); sağa doğru uzar. Yok = eski tam genişlikli yatay çizgi. */
  t?: number;
  /** Işın başlangıcından sola da uzat (tam genişlikli yatay çizgi) */
  extendLeft?: boolean;
  /** Sağ eksendeki fiyat etiketi (yok = göster) */
  showPriceLabel?: boolean;
}

/** Dikey çizgi: tek bir zamanı işaretler (seans açılışı, haber saati, önemli mum vb.); metin çizginin yanında durur. */
export interface VLine extends Base, LineText {
  type: 'vline';
  /** UTC saniye */
  t: number;
}

/** Serbest metin notu: grafikte bir fiyat/zaman noktasına yazılır, isteğe bağlı arkaplanlı. */
export interface TextNote extends Base {
  type: 'text';
  a: Pt;
  text: string;
  /** Metin rengi (yok = color) ve yazı tipi */
  textColor?: string;
  textSize?: number;
  bold?: boolean;
  italic?: boolean;
  /** Arkaplan kutusu */
  bgOn?: boolean;
  bgColor?: string;
  bgAlpha?: number;
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
  /** Sabit lot (yok = risk % ile hesaplanır) */
  lots?: number;
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

export type Drawing = HLine | VLine | TrendLine | Rect | Fib | Position | TextNote;
/** Kimliği henüz atanmamış çizim (birleşim tipine dağıtılmış Omit). */
export type NewDrawing = Drawing extends infer D ? (D extends Drawing ? Omit<D, 'id'> : never) : never;
export type DrawingType = Drawing['type'];
/** 'ray' ayrı bir çizim tipi değil: sağa uzayan trend çizgisi olarak oluşturulur. */
export type Tool = 'cursor' | 'measure' | 'ray' | DrawingType;

/** Çoklu ekranda bir grafiğin sembolü ve zaman dilimi. */
export interface PaneCfg {
  symbol: string;
  tf: TF;
}
import type { LayoutId } from './layouts';
export { LAYOUTS, type LayoutId } from './layouts';

/** Çoklu ekran senkronu (TradingView "Yerleşimde senkronize et"). */
export interface SyncCfg {
  /** Sembol değişince tüm ekranlar değişir */
  symbol: boolean;
  /** Zaman dilimi (aralık) değişince tüm ekranlar değişir */
  tf: boolean;
  /** Artı işareti: imleç aynı zamanda diğer ekranlarda da görünür */
  crosshair: boolean;
  /** Zaman: bir grafiği kaydırınca diğerlerinin sağ kenarı aynı zamana gelir (kendi yakınlaştırmaları korunur) */
  time: boolean;
  /** Tarih aralığı: görünen aralık (kaydırma + yakınlaştırma) tüm ekranlarda aynı olur */
  range: boolean;
}
export const DEFAULT_SYNC: SyncCfg = { symbol: false, tf: false, crosshair: true, time: false, range: false };

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
  /** Bölücü oranları: düğüm yoluna göre (bkz. core/layouts.ts). Yoksa düzenin varsayılanı. */
  splits?: Record<string, number[]>;
  /** Ekranlar arası senkron ayarları (yoksa DEFAULT_SYNC) */
  sync?: SyncCfg;
  panes?: PaneCfg[];
  active?: number;
  stepTf: TF;
  /** Adım zaman dilimi grafiğin zaman dilimini izler (yok = evet). Elle adım seçilince false olur. */
  stepSync?: boolean;
  speed: number;
  /** Stop tamponu: emirlerde SL bu kadar pip/puan daha geniş konur (yok = 0) */
  slBuffer?: number;
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
