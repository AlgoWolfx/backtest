// 1 dakikalık ham verinin yüklenmesi ve üst zaman dilimlerine birleştirilmesi.

import type { SymbolSpec } from '../../shared/symbols.js';
import { bucketKey, bucketStartUtc, bucketChartTime, type TF } from './timeframes';

export interface Gap {
  from: number;
  to: number;
  minutes: number;
}

export interface SymbolMeta {
  id: string;
  count: number;
  scale: number;
  from: number;
  to: number;
  gaps: Gap[];
  /** Normal işlem saatlerinde verinin olmadığı saat (tatiller dahil), yıllara göre. */
  missingHoursByYear: Record<string, number>;
  builtAt: string;
  source: string;
  format?: number;
  /** Kapanışlardaki spread (medyan, %90) */
  spread?: { median: number; p90: number };
  /** Dukascopy derlemesi: ask'ı bulunmayıp ask=bid yazılan dakika sayısı (bu dakikalarda spread gerçekte bilinmiyor) */
  askMissingMinutes?: number;
}

/** Bir 1m mumun kaynağı. */
export function sourceLabel(s: DataSource): string {
  return DATA_SOURCES.find((x) => x.id === s)?.label ?? s;
}

export function sourceName(d: Pick<M1Data, 'source'>, src: number): string {
  if (src === 1) return 'Dukascopy (boşluk dolgusu)';
  return sourceLabel(d.source);
}

export type DataSource = 'dukascopy';
export const DATA_SOURCES: { id: DataSource; label: string; detail: string }[] = [
  { id: 'dukascopy', label: 'Dukascopy', detail: 'Dukascopy 1m bid + ask (orijinal akış, gerçek spread)' },
];

export interface SymbolInfo extends SymbolSpec {
  /** Sembolün verisi indirilmiş mi */
  available: boolean;
  meta: SymbolMeta | null;
  /** Kaynak başına meta (yoksa o kaynakta veri yok) */
  sources: Partial<Record<DataSource, SymbolMeta>>;
}

/** 1m mumlar, sütun düzeninde. Fiyatlar tam sayı (fiyat * scale). t = UTC saniye (mum başlangıcı). */
export interface M1Data {
  /** "kaynak:sembol" */
  id: string;
  source: DataSource;
  n: number;
  scale: number;
  t: Int32Array;
  o: Int32Array;
  h: Int32Array;
  l: Int32Array;
  c: Int32Array;
  /** 0 = ana kaynak, 1 = Dukascopy dolgusu */
  src: Uint8Array;
  /** Ask fiyatları (yalnızca kaynakta varsa) */
  ask?: { o: Int32Array; h: Int32Array; l: Int32Array; c: Int32Array };
  meta: SymbolMeta;
}

/** Birleştirilmiş mumlar. start/end: bu mumu oluşturan 1m mumların [start, end) aralığı. */
export interface AggData {
  tf: TF;
  n: number;
  utc: Float64Array; // kova başlangıcı (gerçek UTC)
  time: Float64Array; // grafikte gösterilen zaman
  start: Int32Array;
  end: Int32Array;
  o: Int32Array;
  h: Int32Array;
  l: Int32Array;
  c: Int32Array;
}

const cache = new Map<string, Promise<M1Data>>();
// Önbellek veri nesnesine bağlıdır: veri yeniden yüklenince aynı sembolün eski mumları kullanılmaz.
const aggCache = new WeakMap<M1Data, Map<TF, AggData>>();

export function loadSymbol(info: SymbolInfo, source: DataSource, onProgress?: (p: number) => void): Promise<M1Data> {
  const key = `${source}:${info.id}`;
  let p = cache.get(key);
  if (!p) {
    p = fetchBars(info, source, onProgress);
    p.catch(() => cache.delete(key));
    cache.set(key, p);
  }
  return p;
}

async function fetchBars(info: SymbolInfo, source: DataSource, onProgress?: (p: number) => void): Promise<M1Data> {
  const meta = info.sources[source];
  if (!meta) throw new Error(`${info.id} için ${source} verisi yok.`);
  const res = await fetch(`/api/bars/${info.id}?source=${source}`);
  if (!res.ok) throw new Error(`${info.id} verisi yüklenemedi (${res.status})`);
  // Content-Length yoksa (sıkıştırılmış / aracılı yanıt) parçalar toplanıp birleştirilir; varsa doğrudan tampona yazılır.
  const total = Number(res.headers.get('Content-Length')) || 0;
  const reader = res.body!.getReader();
  const chunks: Uint8Array[] = [];
  let off = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    off += value.length;
    onProgress?.(total ? Math.min(1, off / total) : 0);
  }
  const buf = new Uint8Array(off);
  let pos = 0;
  for (const c of chunks) {
    buf.set(c, pos);
    pos += c.length;
  }
  const n = meta.count;
  // format 1: 5 x Int32 | format 2: + kaynak (Uint8) | format 3: + ask OHLC (4 x Int32) + kaynak
  const per = meta.format === 3 ? 37 : meta.format === 2 ? 21 : 20;
  const ints = meta.format === 3 ? 9 : 5;
  if (off !== n * per) throw new Error(`${info.id} veri dosyası bozuk (beklenen ${n * per}, gelen ${off} bayt). Sayfayı yenileyin veya "npm run data" ile veriyi yeniden indirin.`);
  const all = new Int32Array(buf.buffer, 0, ints * n);
  return {
    id: `${source}:${info.id}`,
    source,
    n,
    scale: meta.scale,
    t: all.subarray(0, n),
    o: all.subarray(n, 2 * n),
    h: all.subarray(2 * n, 3 * n),
    l: all.subarray(3 * n, 4 * n),
    c: all.subarray(4 * n, 5 * n),
    src: per > 20 ? new Uint8Array(buf.buffer, ints * 4 * n, n) : new Uint8Array(n),
    ask: ints === 9 ? { o: all.subarray(5 * n, 6 * n), h: all.subarray(6 * n, 7 * n), l: all.subarray(7 * n, 8 * n), c: all.subarray(8 * n, 9 * n) } : undefined,
    meta,
  };
}

/** t <= x olan son indeks + 1 (yani t > x olan ilk indeks). */
export function upperBound(arr: ArrayLike<number>, x: number, lo = 0, hi = arr.length): number {
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (arr[mid] <= x) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

/** Replay zamanında (UTC) görünen 1m mum sayısı: kapanışı (t + 60) <= replayTime olanlar. */
export function revealedCount(d: M1Data, replayTime: number): number {
  return upperBound(d.t, replayTime - 60);
}

export function aggregate(d: M1Data, tf: TF): AggData {
  let perData = aggCache.get(d);
  if (!perData) aggCache.set(d, (perData = new Map()));
  const hit = perData.get(tf);
  if (hit) return hit;

  const n = d.n;
  // Üst sınır tahmini: tf 1m ise n, değilse daha az.
  const keys = new Float64Array(n);
  let count = 0;
  let prev = NaN;
  const starts = new Int32Array(n + 1);
  for (let i = 0; i < n; i++) {
    const k = bucketKey(tf, d.t[i]);
    if (k !== prev) {
      keys[count] = k;
      starts[count] = i;
      count++;
      prev = k;
    }
  }
  starts[count] = n;

  const agg: AggData = {
    tf,
    n: count,
    utc: new Float64Array(count),
    time: new Float64Array(count),
    start: new Int32Array(count),
    end: new Int32Array(count),
    o: new Int32Array(count),
    h: new Int32Array(count),
    l: new Int32Array(count),
    c: new Int32Array(count),
  };
  let lastTime = -Infinity;
  for (let k = 0; k < count; k++) {
    const s = starts[k];
    const e = starts[k + 1];
    agg.utc[k] = bucketStartUtc(tf, keys[k]);
    let time = bucketChartTime(tf, keys[k]);
    if (time <= lastTime) time = lastTime + 1; // DST geri dönüşünde (piyasa kapalıyken) güvenlik
    agg.time[k] = lastTime = time;
    agg.start[k] = s;
    agg.end[k] = e;
    agg.o[k] = d.o[s];
    agg.c[k] = d.c[e - 1];
    let hi = d.h[s];
    let lo = d.l[s];
    for (let i = s + 1; i < e; i++) {
      if (d.h[i] > hi) hi = d.h[i];
      if (d.l[i] < lo) lo = d.l[i];
    }
    agg.h[k] = hi;
    agg.l[k] = lo;
  }
  perData.set(tf, agg);
  return agg;
}

/** Birleştirilmiş mum indeksini, 1m indeksinden bulur (1m mum i'yi içeren mum). */
export function aggIndexOfM1(agg: AggData, i: number): number {
  return upperBound(agg.start, i) - 1;
}

export interface Bar {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
}

/**
 * Replay'e göre k. mumun görünen hâli. Mum henüz tamamlanmadıysa yalnızca
 * açıklanmış 1m mumlardan oluşturulur (geleceğe bakma yok).
 */
export function visibleBar(d: M1Data, agg: AggData, k: number, revealed: number): Bar {
  const s = agg.start[k];
  const e = Math.min(agg.end[k], revealed);
  const sc = d.scale;
  if (e === agg.end[k]) {
    return { time: agg.time[k], open: agg.o[k] / sc, high: agg.h[k] / sc, low: agg.l[k] / sc, close: agg.c[k] / sc };
  }
  let hi = d.h[s];
  let lo = d.l[s];
  for (let i = s + 1; i < e; i++) {
    if (d.h[i] > hi) hi = d.h[i];
    if (d.l[i] < lo) lo = d.l[i];
  }
  return { time: agg.time[k], open: d.o[s] / sc, high: hi / sc, low: lo / sc, close: d.c[e - 1] / sc };
}
