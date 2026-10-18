// lightweight-charts sarmalayıcısı.
//
// Grafikte yalnızca replay zamanına kadar açıklanmış veri bulunur; son mum, henüz
// tamamlanmadıysa sadece açıklanmış 1m mumlardan oluşturulur. Büyük veri için grafiğe
// bir "pencere" verilir; kullanıcı sola kaydırdıkça pencere genişletilir.

import {
  AreaSeries,
  BarSeries,
  CandlestickSeries,
  ColorType,
  CrosshairMode,
  LineSeries,
  LineStyle,
  PriceScaleMode,
  TickMarkType,
  createChart,
  type IChartApi,
  type ISeriesApi,
  type Logical,
  type LogicalRange,
  type SeriesType,
  type Time,
  type UTCTimestamp,
} from 'lightweight-charts';
import type { SymbolSpec } from '../../shared/symbols.js';
import { aggIndexOfM1, aggregate, revealedCount, upperBound, visibleBar, type AggData, type Bar, type M1Data } from '../core/data';
import { tfInfo, type TF } from '../core/timeframes';
import { MONTHS, fmtShifted, pad } from '../format';
import type { ChartTheme } from '../chartTheme';
import { useStore } from '../store';
import { DrawingLayer, hexToRgba } from './DrawingLayer';
import { SessionLayer } from './SessionLayer';

const INITIAL_WINDOW = 3000;
const EXTEND_BY = 4000;

export class ChartController {
  readonly chart: IChartApi;
  readonly series: ISeriesApi<'Candlestick'>;
  readonly layer: DrawingLayer;
  /** Seans / killzone / seans high-low katmanı (mumların arkasında ve üstünde) */
  readonly sessions: SessionLayer;

  d: M1Data | null = null;
  agg: AggData | null = null;
  spec: SymbolSpec | null = null;
  tf: TF = '15m';
  revealed = 0;
  winStart = 0;
  lastK = -1;
  private extending = false;
  /** Çizgi / alan / bar türlerinde asıl çizimi yapan ikinci seri (mum serisi görünmez kalır, koordinatları verir). */
  private alt: ISeriesApi<SeriesType> | null = null;
  private altKind: ChartTheme['chartType'] | null = null;
  private priceFormat = { type: 'price' as const, precision: 5, minMove: 0.00001 };
  theme: ChartTheme | null = null;

  // ---- ekranlar arası senkron (bkz. chart/paneSync.ts)
  /** Kullanıcı imleci bu grafikte gezdirdi: utc = mumun zamanı, price = imlecin fiyatı; null = imleç çıktı */
  onCrosshair: ((utc: number | null, price: number | null) => void) | null = null;
  /** Kullanıcı bu grafiği kaydırdı / yakınlaştırdı */
  onUserRange: (() => void) | null = null;
  private hovering = false;
  private userUntil = 0;
  private quiet = false;

  constructor(readonly el: HTMLElement, readonly pane = 0) {
    this.chart = createChart(el, {
      autoSize: true,
      layout: {
        background: { type: ColorType.Solid, color: '#0b0c0f' },
        textColor: '#9598a1',
        fontSize: 11,
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
        attributionLogo: false,
      },
      grid: { vertLines: { color: 'rgba(255,255,255,0.035)' }, horzLines: { color: 'rgba(255,255,255,0.035)' } },
      crosshair: {
        mode: CrosshairMode.Normal,
        vertLine: { color: '#5d606b', style: LineStyle.Dashed, labelBackgroundColor: '#2a2e39' },
        horzLine: { color: '#5d606b', style: LineStyle.Dashed, labelBackgroundColor: '#2a2e39' },
      },
      rightPriceScale: { borderColor: '#1e222d', scaleMargins: { top: 0.08, bottom: 0.08 } },
      timeScale: {
        borderColor: '#1e222d',
        timeVisible: true,
        secondsVisible: false,
        rightOffset: 12,
        barSpacing: 8,
        minBarSpacing: 0.5,
        shiftVisibleRangeOnNewBar: true,
        tickMarkFormatter: (time: Time, type: TickMarkType) => {
          const d = new Date((time as number) * 1000);
          switch (type) {
            case TickMarkType.Year:
              return String(d.getUTCFullYear());
            case TickMarkType.Month:
              return MONTHS[d.getUTCMonth()];
            case TickMarkType.DayOfMonth:
              return String(d.getUTCDate());
            default:
              return `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
          }
        },
      },
      localization: {
        locale: 'tr-TR',
        timeFormatter: (time: Time) => fmtShifted(time as number, tfInfo(this.tf).intraday),
      },
    });
    this.series = this.chart.addSeries(CandlestickSeries, {
      upColor: '#089981',
      downColor: '#f23645',
      borderVisible: false,
      wickUpColor: '#089981',
      wickDownColor: '#f23645',
      priceLineStyle: LineStyle.Dotted,
    });
    this.layer = new DrawingLayer(this);
    this.sessions = new SessionLayer(this);
    this.applyTheme(useStore.getState().chartTheme);
    this.series.attachPrimitive(this.sessions);
    this.series.attachPrimitive(this.layer);
    this.chart.timeScale().subscribeVisibleLogicalRangeChange((r) => {
      this.maybeExtend(r);
      if (!this.quiet && performance.now() < this.userUntil) this.onUserRange?.();
    });
    this.watchUser();
  }

  /** Kullanıcı etkileşimini izler: fare basılıyken veya tekerlekten sonra kısa süre "kullanıcı" aralık değişimidir. */
  private watchUser() {
    const el = this.el;
    el.addEventListener('pointerdown', () => (this.userUntil = Infinity), true);
    window.addEventListener('pointerup', () => {
      if (this.userUntil === Infinity) this.userUntil = performance.now() + 250;
    });
    el.addEventListener('wheel', () => (this.userUntil = performance.now() + 400), { capture: true, passive: true });
    el.addEventListener('mouseenter', () => (this.hovering = true));
    el.addEventListener('mouseleave', () => {
      this.hovering = false;
      this.onCrosshair?.(null, null);
    });
    this.chart.subscribeCrosshairMove((p) => {
      if (!this.hovering || !this.agg || this.lastK < 0) return;
      if (p.logical == null || !p.point) return this.onCrosshair?.(null, null);
      const k = Math.round(p.logical) + this.winStart;
      if (k < this.winStart || k > this.lastK) return this.onCrosshair?.(null, null);
      this.onCrosshair?.(this.agg.utc[k], this.yToPrice(p.point.y));
    });
  }

  /** Başka bir grafikteki imleç zamanını gösterir (utc null: gizle). price yoksa mumun kapanışı. */
  showCrosshairAt(utc: number | null, price: number | null) {
    const agg = this.agg;
    if (utc == null || !agg || this.lastK < 0 || !this.d || this.hovering) {
      if (!this.hovering) this.chart.clearCrosshairPosition();
      return;
    }
    // Bu grafiğin son mumundan sonraki zamanlarda imleç gösterilmez
    if (utc >= agg.utc[this.lastK] + this.tfSeconds) return this.chart.clearCrosshairPosition();
    const k = Math.min(this.lastK, Math.max(this.winStart, Math.floor(this.timeToLogical(utc)) + this.winStart));
    this.chart.setCrosshairPosition(price ?? agg.c[k] / this.d.scale, agg.time[k] as Time, this.series);
  }

  /** Görünür mantıksal aralığı, yeniden yayın yapmadan ayarlar (senkron için). */
  setLogicalRangeQuiet(from: number, to: number) {
    if (!Number.isFinite(from) || !Number.isFinite(to) || to <= from) return;
    this.quiet = true;
    try {
      this.chart.timeScale().setVisibleLogicalRange({ from, to });
    } finally {
      this.quiet = false;
    }
  }

  destroy() {
    this.layer.dispose();
    this.chart.remove();
  }

  get tfSeconds() {
    return tfInfo(this.tf).seconds;
  }

  /** Sembol / zaman dilimi / büyük zaman sıçraması: tüm veriyi yeniden kurar. */
  setContext(d: M1Data, spec: SymbolSpec, tf: TF, replayTime: number, preserve: boolean) {
    const ts = this.chart.timeScale();
    let anchor: { atEdge: boolean; offset: number; rightTime: number; width: number } | null = null;
    if (preserve && this.agg && this.lastK >= 0) {
      const r = ts.getVisibleLogicalRange();
      if (r) {
        const lastL = this.lastK - this.winStart;
        anchor = { atEdge: r.to >= lastL - 1, offset: r.to - lastL, rightTime: this.logicalToTimeRaw(r.to), width: r.to - r.from };
      }
    }

    if (this.spec?.id !== spec.id) {
      this.priceFormat = { type: 'price', precision: spec.digits, minMove: 1 / 10 ** spec.digits };
      this.series.applyOptions({ priceFormat: this.priceFormat });
      this.alt?.applyOptions({ priceFormat: this.priceFormat } as never);
    }
    this.d = d;
    this.spec = spec;
    this.tf = tf;
    this.agg = aggregate(d, tf);
    this.revealed = revealedCount(d, replayTime);
    if (this.revealed === 0) {
      this.lastK = -1;
      this.winStart = 0;
      this.feedAll([]);
      this.layer.requestUpdate();
      return;
    }
    this.lastK = aggIndexOfM1(this.agg, this.revealed - 1);
    let anchorK = this.lastK;
    if (anchor && !anchor.atEdge) anchorK = Math.min(this.lastK, Math.max(0, upperBound(this.agg.utc, anchor.rightTime) - 1));
    const width = anchor ? anchor.width : 130;
    this.winStart = Math.max(0, anchorK - Math.ceil(width) - INITIAL_WINDOW);

    this.extending = true;
    this.feedAll(this.buildBars(this.winStart, this.lastK));
    const lastL = this.lastK - this.winStart;
    if (!anchor) ts.setVisibleLogicalRange({ from: lastL - width, to: lastL + 10 });
    else if (anchor.atEdge) ts.setVisibleLogicalRange({ from: lastL + anchor.offset - width, to: lastL + anchor.offset });
    else {
      const L = this.timeToLogical(anchor.rightTime);
      ts.setVisibleLogicalRange({ from: L - width, to: L });
    }
    this.extending = false;
    this.layer.requestUpdate();
  }

  /** Replay ilerlediğinde yalnızca değişen mumları günceller. */
  updateReplay(replayTime: number) {
    const { d, agg, spec } = this;
    if (!d || !agg || !spec) return;
    const r = revealedCount(d, replayTime);
    if (r === this.revealed) return;
    if (r < this.revealed || this.lastK < 0) return this.setContext(d, spec, this.tf, replayTime, true);
    const newK = aggIndexOfM1(agg, r - 1);
    if (newK - this.lastK > 1500) return this.setContext(d, spec, this.tf, replayTime, true);
    this.revealed = r;
    for (let k = this.lastK; k <= newK; k++) this.feedOne(this.toSeries(visibleBar(d, agg, k, r)));
    this.lastK = newK;
    this.layer.requestUpdate();
  }

  private toSeries(b: Bar) {
    return { ...b, time: b.time as UTCTimestamp };
  }

  private altPoint(b: ReturnType<ChartController['toSeries']>) {
    return this.altKind === 'bars' ? b : { time: b.time, value: b.close };
  }

  private feedAll(bars: ReturnType<ChartController['toSeries']>[]) {
    this.series.setData(bars as never);
    this.alt?.setData(bars.map((b) => this.altPoint(b)) as never);
  }

  private feedOne(b: ReturnType<ChartController['toSeries']>) {
    this.series.update(b as never);
    this.alt?.update(this.altPoint(b) as never);
  }

  private buildBars(from: number, to: number) {
    const { d, agg } = this;
    const out = new Array(to - from + 1);
    for (let k = from; k <= to; k++) out[k - from] = this.toSeries(visibleBar(d!, agg!, k, this.revealed));
    return out;
  }

  private maybeExtend(r: LogicalRange | null) {
    if (!r || this.extending || !this.agg || this.winStart === 0 || r.from > 300) return;
    this.extending = true;
    requestAnimationFrame(() => {
      const ts = this.chart.timeScale();
      const add = Math.min(EXTEND_BY, this.winStart);
      const cur = ts.getVisibleLogicalRange();
      this.winStart -= add;
      this.feedAll(this.buildBars(this.winStart, this.lastK));
      if (cur) ts.setVisibleLogicalRange({ from: cur.from + add, to: cur.to + add });
      this.extending = false;
      this.layer.requestUpdate();
    });
  }

  // ------------------------------------------------------------ zaman <-> koordinat

  /** Gerçek UTC zamanı grafiğin mantıksal indeksine çevirir (mum içi kesirli). */
  timeToLogical(t: number): number {
    const agg = this.agg;
    if (!agg || this.lastK < 0) return 0;
    const sec = this.tfSeconds;
    const last = this.lastK;
    if (t >= agg.utc[last]) return last - this.winStart + (t - agg.utc[last]) / sec;
    const idx = upperBound(agg.utc, t, 0, last + 1) - 1;
    if (idx < 0) return -this.winStart + (t - agg.utc[0]) / sec;
    const frac = Math.min(1, (t - agg.utc[idx]) / Math.min(sec, agg.utc[idx + 1] - agg.utc[idx]));
    return idx - this.winStart + frac;
  }

  /** Mantıksal indeksi en yakın mumun başlangıç zamanına çevirir (çizim noktaları mumlara oturur). */
  logicalToTime(L: number): number {
    const agg = this.agg!;
    const sec = this.tfSeconds;
    const i = Math.round(L) + this.winStart;
    if (i < 0) return agg.utc[0] + i * sec;
    if (i > this.lastK) return agg.utc[this.lastK] + (i - this.lastK) * sec;
    return agg.utc[i];
  }

  private logicalToTimeRaw(L: number): number {
    const agg = this.agg!;
    const sec = this.tfSeconds;
    const i = Math.floor(L);
    const abs = i + this.winStart;
    if (abs < 0) return agg.utc[0] + (L + this.winStart) * sec;
    if (abs >= this.lastK) return agg.utc[this.lastK] + (L + this.winStart - this.lastK) * sec;
    return agg.utc[abs] + (L - i) * (agg.utc[abs + 1] - agg.utc[abs]);
  }

  timeToX(t: number): number | null {
    return this.logicalToX(this.timeToLogical(t));
  }

  /** Kütüphane kesirli indekslerde 0 döndürdüğü için iki tam sayı arasında enterpolasyon yapılır. */
  logicalToX(L: number): number | null {
    const ts = this.chart.timeScale();
    const i = Math.floor(L);
    const x0 = ts.logicalToCoordinate(i as Logical);
    if (x0 == null || L === i) return x0;
    const x1 = ts.logicalToCoordinate((i + 1) as Logical);
    return x1 == null ? x0 : x0 + (x1 - x0) * (L - i);
  }

  xToLogical(x: number): number | null {
    return this.chart.timeScale().coordinateToLogical(x);
  }

  priceToY(p: number): number | null {
    return this.series.priceToCoordinate(p);
  }

  yToPrice(y: number): number | null {
    return this.series.coordinateToPrice(y);
  }

  /** Mantıksal indeksteki görünen mum (magnet için). */
  barAt(L: number): Bar | null {
    if (!this.d || !this.agg) return null;
    const k = Math.round(L) + this.winStart;
    if (k < 0 || k > this.lastK) return null;
    return visibleBar(this.d, this.agg, k, this.revealed);
  }

  /** L indeksindeki mumdan önceki 14 mumun ortalama aralığı (varsayılan stop mesafesi için). */
  atrAt(L: number): number | null {
    const { d, agg } = this;
    if (!d || !agg) return null;
    const k = Math.min(Math.round(L) + this.winStart, this.lastK);
    let sum = 0;
    let n = 0;
    for (let i = Math.max(0, k - 14); i < k; i++, n++) sum += agg.h[i] - agg.l[i];
    return n ? sum / n / d.scale : null;
  }

  roundPrice(p: number): number {
    const sc = this.d?.scale ?? 1e5;
    return Math.round(p * sc) / sc;
  }

  get tick(): number {
    return 1 / (this.d?.scale ?? 1e5);
  }

  /** Mantıksal indeksteki mumun ayrıntıları (gösterge ve inceleyici için). Henüz açıklanmamış veri verilmez. */
  barInfo(L: number) {
    const { d, agg } = this;
    if (!d || !agg) return null;
    const k = Math.round(L) + this.winStart;
    if (k < 0 || k > this.lastK) return null;
    const start = agg.start[k];
    const end = Math.min(agg.end[k], this.revealed);
    let filled = 0;
    for (let i = start; i < end; i++) filled += d.src[i];
    const prevClose = k > 0 ? agg.c[k - 1] / d.scale : null;
    return { k, bar: visibleBar(d, agg, k, this.revealed), utc: agg.utc[k], start, end, complete: end === agg.end[k], filled, prevClose };
  }

  /** L indeksindeki mumun kapanış zamanı (son 1m mumunun bitişi). Görünür alan dışındaysa null. */
  barEndTime(L: number): number | null {
    const { d, agg } = this;
    if (!d || !agg) return null;
    const k = Math.round(L) + this.winStart;
    if (k < 0 || k > this.lastK) return null;
    return d.t[agg.end[k] - 1] + 60;
  }

  /** Ekranda görünen mumlar (CSV için). */
  visibleBars() {
    const r = this.chart.timeScale().getVisibleLogicalRange();
    if (!r || !this.agg) return [];
    const out = [];
    for (let L = Math.max(0, Math.floor(r.from)); L <= Math.min(this.lastK - this.winStart, Math.ceil(r.to)); L++) {
      const info = this.barInfo(L);
      if (info) out.push(info);
    }
    return out;
  }

  /** Görünür mantıksal aralığın zaman karşılığı [başlangıç, bitiş] (UTC); henüz bilinmiyorsa null. */
  visibleTimeRange(): [number, number] | null {
    const r = this.chart.timeScale().getVisibleLogicalRange();
    if (!r || !this.agg || this.lastK < 0) return null;
    return [this.logicalToTimeRaw(r.from), this.logicalToTimeRaw(r.to)];
  }

  /** Grafiği son muma kaydırır. */
  scrollToLast() {
    this.chart.timeScale().scrollToRealTime();
  }

  /** Fiyat ekseni otomatik ölçeğe, mum aralığı varsayılana döner ve son muma gidilir (elle ölçeklemeyi sıfırlar). */
  resetView() {
    const t = this.theme;
    this.chart.priceScale('right').applyOptions({ autoScale: true, scaleMargins: { top: (t?.marginTop ?? 8) / 100, bottom: (t?.marginBottom ?? 8) / 100 } });
    this.chart.timeScale().applyOptions({ barSpacing: 8, rightOffset: t?.rightOffset ?? 12 });
    this.chart.timeScale().scrollToRealTime();
  }

  /** Fiyat ekseni otomatik ölçek (TradingView'deki "Auto"). */
  setAutoScale(on = true) {
    this.chart.priceScale('right').applyOptions({ autoScale: on });
  }
  isAutoScale(): boolean {
    return this.chart.priceScale('right').options().autoScale;
  }

  applyTheme(t: ChartTheme) {
    this.theme = t;
    const ls = t.crosshairStyle === 'solid' ? LineStyle.Solid : t.crosshairStyle === 'dotted' ? LineStyle.Dotted : LineStyle.Dashed;
    const cross = { color: t.crosshair, width: t.crosshairWidth, style: ls };
    const mode = { normal: PriceScaleMode.Normal, log: PriceScaleMode.Logarithmic, percent: PriceScaleMode.Percentage, indexed: PriceScaleMode.IndexedTo100 }[t.priceMode];
    this.chart.applyOptions({
      layout: { background: { type: ColorType.Solid, color: t.background }, textColor: t.text, fontSize: t.fontSize },
      grid: { vertLines: { color: t.grid, visible: t.gridV }, horzLines: { color: t.grid, visible: t.gridH } },
      crosshair: { mode: t.crosshairMagnet ? CrosshairMode.Magnet : CrosshairMode.Normal, vertLine: cross, horzLine: cross },
      rightPriceScale: { mode, invertScale: t.invert, scaleMargins: { top: t.marginTop / 100, bottom: t.marginBottom / 100 } },
      timeScale: { rightOffset: t.rightOffset },
    });
    this.ensureAlt(t);
    // Mum benzeri türlerde mum serisi çizer; diğerlerinde yalnızca koordinat / ölçek için görünmez kalır.
    const none = 'rgba(0,0,0,0)';
    const candleLike = t.chartType === 'candles' || t.chartType === 'hollow';
    const hollow = t.chartType === 'hollow';
    this.series.applyOptions({
      upColor: candleLike ? (hollow ? none : t.upBody) : none,
      downColor: candleLike ? t.downBody : none,
      borderVisible: candleLike && (hollow || t.borderVisible),
      borderUpColor: candleLike ? t.upBorder : none,
      borderDownColor: candleLike ? t.downBorder : none,
      wickUpColor: candleLike ? t.upWick : none,
      wickDownColor: candleLike ? t.downWick : none,
      priceLineVisible: t.lastLine,
      lastValueVisible: t.lastLabel,
      priceLineColor: candleLike ? '' : t.chartType === 'bars' ? '#787b86' : t.lineColor,
    });
    this.layer.requestUpdate();
  }

  private ensureAlt(t: ChartTheme) {
    const want = t.chartType === 'bars' || t.chartType === 'line' || t.chartType === 'area' ? t.chartType : null;
    if (want !== this.altKind) {
      if (this.alt) this.chart.removeSeries(this.alt);
      this.alt = null;
      this.altKind = want;
      const common = { priceLineVisible: false, lastValueVisible: false, priceFormat: this.priceFormat };
      if (want === 'bars') this.alt = this.chart.addSeries(BarSeries, { ...common, upColor: t.upBody, downColor: t.downBody });
      else if (want === 'line') this.alt = this.chart.addSeries(LineSeries, { ...common, color: t.lineColor, lineWidth: 2 });
      else if (want === 'area') this.alt = this.chart.addSeries(AreaSeries, { ...common, lineColor: t.lineColor, topColor: hexToRgba(t.lineColor, 0.35), bottomColor: hexToRgba(t.lineColor, 0), lineWidth: 2 });
      if (this.alt && this.agg && this.lastK >= 0) this.alt.setData(this.buildBars(this.winStart, this.lastK).map((b) => this.altPoint(b)) as never);
    } else if (this.alt) {
      if (want === 'bars') this.alt.applyOptions({ upColor: t.upBody, downColor: t.downBody } as never);
      else if (want === 'line') this.alt.applyOptions({ color: t.lineColor } as never);
      else if (want === 'area') this.alt.applyOptions({ lineColor: t.lineColor, topColor: hexToRgba(t.lineColor, 0.35), bottomColor: hexToRgba(t.lineColor, 0) } as never);
    }
  }
}
