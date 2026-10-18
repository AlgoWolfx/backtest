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
}

export type LineStyleName = 'solid' | 'dashed' | 'dotted';

interface Base {
  id: string;
  color: string;
  width: number;
  /** Çizgi stili (yoksa düz) */
  style?: LineStyleName;
}

export interface HLine extends Base {
  type: 'hline';
  p: number;
}
export interface TrendLine extends Base {
  type: 'trend';
  a: Pt;
  b: Pt;
  extendLeft?: boolean;
  extendRight?: boolean;
  /** Orta noktayı işaretle */
  midpoint?: boolean;
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
}
export interface Fib extends Base {
  type: 'fib';
  a: Pt;
  b: Pt;
  levels: FibLevel[];
  extendRight?: boolean;
}
export interface Position extends Base {
  type: 'long' | 'short';
  entry: Pt;
  sl: number;
  tp: number;
  tEnd: number;
  riskPct: number;
  tradeId?: string;
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
  /** Veri kaynağı (eski oturumlarda yok = histdata) */
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
  panes?: PaneCfg[];
  active?: number;
  stepTf: TF;
  speed: number;
  riskPct: number;
  lots: number;
  /** Komisyon, USD / lot, GİDİŞ-DÖNÜŞ (isteğe bağlı; yok = 0). Her işlem açılırken değeri işlemin kendisine yazılır. */
  commissionPerLot?: number;
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
