// Çizim katmanı: tüm çizimleri grafik içine çizer, fare ile oluşturma / seçme / taşıma / boyutlandırma.
//
// Çizimler (zaman, fiyat) olarak saklanır; her karede o anki zaman dilimine göre ekrana çevrilir.
// Fare olayları grafik kapsayıcısında "capture" aşamasında yakalanır; bir çizim yakalandığında
// olay grafik kütüphanesine iletilmez (grafik kaymaz).

import type { CanvasRenderingTarget2D } from 'fancy-canvas';
import type { IPrimitivePaneView, ISeriesPrimitive, ISeriesPrimitiveAxisView, PrimitiveHoveredItem, SeriesAttachedParameter, Time } from 'lightweight-charts';
import { getSymbol } from '../../shared/symbols.js';
import { lotsForRisk, calcPnl, calcR, usdPerPriceUnit, type Trade } from '../core/trading';
import type { Drawing, Fib, LineStyleName, Position, Pt, Session, Tool, TrendLine } from '../core/types';
import { fmtDistance, fmtMoney, fmtPrice, fmtR, reasonLabel } from '../format';
import { tfInfo } from '../core/timeframes';
import { bucketEndAfter } from '../core/replay';
import { addDrawing, balanceOf, deleteDrawing, drawingsOf, exitPriceNow, jumpTo, lastBarTime, recordUndo, ticketClick, ticketEntry, ticketStep, updateDrawing, useStore } from '../store';
import type { ChartController } from './ChartController';

type Part = 'body' | 'a' | 'b' | 'c1' | 'c2' | 'entry' | 'sl' | 'tp' | 'end';
interface Hit {
  id: string;
  part: Part;
}

const HANDLE_R = 5;
const HIT_PX = 6;

type DrawTool = Exclude<Tool, 'cursor' | 'measure'>;

export const TOOL_DEFAULTS: Record<DrawTool, { color: string; width: number }> = {
  hline: { color: '#2962ff', width: 1 },
  trend: { color: '#2962ff', width: 2 },
  rect: { color: '#2962ff', width: 1 },
  fib: { color: '#9598a1', width: 1 },
  long: { color: '#787b86', width: 1 },
  short: { color: '#787b86', width: 1 },
};

/** Çizgi stiline göre kesik çizgi dizisi. */
export function dashOf(style: LineStyleName | undefined, width: number): number[] {
  if (style === 'dashed') return [6 + width, 4 + width];
  if (style === 'dotted') return [width, 3 + width];
  return [];
}

export function hexToRgba(hex: string, a: number): string {
  const h = hex.replace('#', '');
  const n = parseInt(h.length === 3 ? h.replace(/./g, (c) => c + c) : h, 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

const isPos = (d: Drawing): d is Position => d.type === 'long' || d.type === 'short';

function distToSegment(px: number, py: number, x1: number, y1: number, x2: number, y2: number) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len = dx * dx + dy * dy;
  const t = len ? Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / len)) : 0;
  return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
}

export function fibPrice(d: Fib, v: number) {
  return d.b.p + (d.a.p - d.b.p) * v;
}

export class DrawingLayer implements ISeriesPrimitive<Time> {
  private requestRedraw: (() => void) | null = null;
  private readonly views: IPrimitivePaneView[];
  private axisViews: ISeriesPrimitiveAxisView[] = [];
  private axisVersion = -1;
  private version = 0;

  hoverId: string | null = null;
  private drag: { hit: Hit; L0: number; p0: number; orig: Drawing; moved: boolean } | null = null;
  private creating: { id: string; downX: number; downY: number } | null = null;
  /** Ölçüm aracı (Shift+sürükle): kaydedilmez, Esc veya tıklamayla kaybolur. */
  private measure: { L0: number; p0: number; L1: number; p1: number; dragging: boolean } | null = null;
  private pickX: number | null = null;
  /** Emir bileti açıkken farenin fiyatı (null: grafik dışında) */
  private ticketP: number | null = null;
  private width = 0;

  constructor(private readonly c: ChartController) {
    this.views = [{ zOrder: () => 'top', renderer: () => ({ draw: (t: CanvasRenderingTarget2D) => this.draw(t) }) }];
    const el = c.el;
    el.addEventListener('mousedown', this.onDown, true);
    el.addEventListener('dblclick', this.onDblClick, true);
    window.addEventListener('mousemove', this.onMove);
    window.addEventListener('mouseup', this.onUp);
  }

  dispose() {
    this.c.el.removeEventListener('mousedown', this.onDown, true);
    this.c.el.removeEventListener('dblclick', this.onDblClick, true);
    window.removeEventListener('mousemove', this.onMove);
    window.removeEventListener('mouseup', this.onUp);
  }

  // ------------------------------------------------------------ ISeriesPrimitive

  attached(p: SeriesAttachedParameter<Time>) {
    this.requestRedraw = p.requestUpdate;
  }
  detached() {
    this.requestRedraw = null;
  }
  paneViews() {
    return this.views;
  }
  /** Bu grafiğin sembolüne ait çizimler (çoklu ekranda her grafik kendi sembolünü gösterir). */
  private drawings(s: Session | null): Drawing[] {
    return s ? s.drawings[this.c.spec?.id ?? s.symbol] ?? [] : [];
  }
  /** Çoklu ekranda yalnızca aktif grafik emir bileti ve düzenleme alır. */
  private get isActive() {
    return (useStore.getState().session?.active ?? 0) === this.c.pane;
  }

  requestUpdate() {
    this.version++;
    this.requestRedraw?.();
  }
  hitTest(x: number, y: number): PrimitiveHoveredItem | null {
    if (useStore.getState().pickingStart) return { cursorStyle: 'pointer', externalId: '', zOrder: 'top' };
    if (useStore.getState().ticket && this.isActive) return { cursorStyle: 'crosshair', externalId: '', zOrder: 'top' };
    const h = this.hitTestAt(x, y);
    if (!h) return useStore.getState().tool !== 'cursor' ? { cursorStyle: 'crosshair', externalId: '', zOrder: 'top' } : null;
    const cursor = h.part === 'body' ? (this.canMove(h) ? 'move' : 'pointer') : h.part === 'sl' || h.part === 'tp' ? 'ns-resize' : h.part === 'end' ? 'ew-resize' : 'pointer';
    return { cursorStyle: cursor, externalId: h.id, zOrder: 'top' };
  }

  priceAxisViews() {
    if (this.axisVersion === this.version) return this.axisViews;
    this.axisVersion = this.version;
    const st = useStore.getState();
    const views: ISeriesPrimitiveAxisView[] = [];
    if (!this.c.spec) return (this.axisViews = views);
    // Mum kapanışına kalan süre: son fiyat etiketinin hemen altında (çizimler gizli olsa da görünür).
    const th = this.c.theme;
    if (th?.countdown && th.lastLabel) {
      const cd = this.countdown();
      if (cd) views.push({ coordinate: () => (this.c.priceToY(cd.price) ?? -1e6) + 20, text: () => cd.text, textColor: () => '#fff', backColor: () => cd.color });
    }
    if (st.hideDrawings) return (this.axisViews = views);
    const spec = this.c.spec;
    const label = (p: number, bg: string) => {
      const y = this.c.priceToY(p);
      if (y == null) return;
      views.push({ coordinate: () => y, text: () => fmtPrice(p, spec), textColor: () => '#fff', backColor: () => bg });
    };
    for (const d of this.drawings(st.session)) {
      const sel = d.id === st.selectedId || d.id === this.hoverId;
      if (d.type === 'hline') label(d.p, d.color);
      else if (isPos(d)) {
        const tr = d.tradeId ? st.session!.trades.find((t) => t.id === d.tradeId) : undefined;
        if (sel || tr?.status === 'open' || tr?.status === 'pending') {
          label(d.tp, '#089981');
          label(d.sl, '#f23645');
          label(d.entry.p, '#50535e');
        }
      } else if (sel && (d.type === 'trend' || d.type === 'rect' || d.type === 'fib')) {
        label(d.a.p, d.color);
        label(d.b.p, d.color);
      }
    }
    return (this.axisViews = views);
  }

  /** Son mumun kapanışına kalan süre (replay saatine göre) ve fiyat etiketi rengi. */
  private countdown(): { price: number; text: string; color: string } | null {
    const st = useStore.getState();
    const { d, agg } = this.c;
    if (!st.session || !d || !agg || this.c.lastK < 0) return null;
    const end = bucketEndAfter(d, st.session.replayTime, this.c.tf);
    if (end == null) return null;
    const left = Math.max(0, end - st.session.replayTime);
    const info = this.c.barInfo(this.c.lastK - this.c.winStart);
    if (!info) return null;
    const hh = Math.floor(left / 3600), mm = Math.floor((left % 3600) / 60), ss = left % 60;
    const text = hh ? `${hh}:${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}` : `${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}`;
    const t = this.c.theme!;
    const color = t.chartType === 'line' || t.chartType === 'area' ? t.lineColor : info.bar.close >= info.bar.open ? t.upBody : t.downBody;
    return { price: info.bar.close, text, color };
  }

  // ------------------------------------------------------------ çizim

  private X(t: number) {
    return this.c.timeToX(t) ?? -1e6;
  }
  private Y(p: number) {
    return this.c.priceToY(p) ?? -1e6;
  }

  private draw(target: CanvasRenderingTarget2D) {
    const st = useStore.getState();
    if (!st.session || !this.c.agg || this.c.lastK < 0) return;
    const drawings = st.hideDrawings ? [] : this.drawings(st.session);
    const trades = new Map(st.session.trades.map((t) => [t.id, t]));
    target.useMediaCoordinateSpace(({ context: ctx, mediaSize }) => {
      this.width = mediaSize.width;
      ctx.font = '11px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
      ctx.textBaseline = 'middle';
      for (const d of drawings) {
        const active = d.id === st.selectedId || d.id === this.hoverId;
        ctx.save();
        switch (d.type) {
          case 'hline':
            this.drawHLine(ctx, d.p, d.color, d.width, mediaSize.width, d.style);
            if (active) this.handle(ctx, mediaSize.width / 2, this.Y(d.p), d.color);
            break;
          case 'trend': {
            const x1 = this.X(d.a.t), y1 = this.Y(d.a.p), x2 = this.X(d.b.t), y2 = this.Y(d.b.p);
            const [ex1, ey1, ex2, ey2] = this.trendEnds(d);
            ctx.strokeStyle = d.color;
            ctx.lineWidth = d.width;
            ctx.setLineDash(dashOf(d.style, d.width));
            ctx.beginPath();
            ctx.moveTo(ex1, ey1);
            ctx.lineTo(ex2, ey2);
            ctx.stroke();
            ctx.setLineDash([]);
            if (d.midpoint) {
              ctx.beginPath();
              ctx.arc((x1 + x2) / 2, (y1 + y2) / 2, 3.5, 0, Math.PI * 2);
              ctx.fillStyle = d.color;
              ctx.fill();
            }
            if (active) {
              this.handle(ctx, x1, y1, d.color);
              this.handle(ctx, x2, y2, d.color);
            }
            break;
          }
          case 'rect': {
            const x1 = this.X(d.a.t), y1 = this.Y(d.a.p), y2 = this.Y(d.b.p);
            const bxr = this.X(d.b.t);
            const left = d.extendLeft ? -2 : Math.min(x1, bxr);
            const right = d.extendRight ? mediaSize.width + 2 : Math.max(x1, bxr);
            ctx.fillStyle = d.fill;
            ctx.fillRect(left, Math.min(y1, y2), right - left, Math.abs(y2 - y1));
            ctx.strokeStyle = d.color;
            ctx.lineWidth = d.width;
            ctx.setLineDash(dashOf(d.style, d.width));
            ctx.strokeRect(left + 0.5, Math.min(y1, y2) + 0.5, right - left, Math.abs(y2 - y1));
            if (d.midline) {
              const ym = Math.round((y1 + y2) / 2) + 0.5;
              ctx.setLineDash([5, 4]);
              ctx.beginPath();
              ctx.moveTo(left, ym);
              ctx.lineTo(right, ym);
              ctx.stroke();
              this.label(ctx, fmtPrice((d.a.p + d.b.p) / 2, this.c.spec!), Math.min(right, mediaSize.width) - 38, ym, d.color);
            }
            ctx.setLineDash([]);
            if (active) {
              const bx = this.X(d.b.t);
              for (const [hx, hy] of [[x1, y1], [bx, y2], [x1, y2], [bx, y1]]) this.handle(ctx, hx, hy, d.color);
            }
            break;
          }
          case 'fib':
            this.drawFib(ctx, d, active, mediaSize.width);
            break;
          default:
            this.drawPosition(ctx, d, active, d.tradeId ? trades.get(d.tradeId) : undefined);
        }
        ctx.restore();
      }
      if (this.measure) this.drawMeasure(ctx);
      if (st.ticket && this.isActive) this.drawTicket(ctx, mediaSize.width, mediaSize.height);
      if (st.pickingStart && this.pickX != null) this.drawPickLine(ctx, mediaSize.height);
    });
  }

  /** Emir bileti önizlemesi: giriş (limit/stop), SL ve TP fare ile seçilirken canlı gösterilir. */
  private drawTicket(ctx: CanvasRenderingContext2D, w: number, h: number) {
    const st = useStore.getState();
    const t = st.ticket!;
    const spec = this.c.spec!;
    const barT = lastBarTime();
    if (barT == null) return;
    const long = t.side === 'long';
    const step = ticketStep(t);
    const m = this.ticketP;
    const entry = ticketEntry(t) ?? (step === 'entry' ? m : null);
    const sl = step === 'sl' ? m : t.sl;
    const tp = step === 'tp' ? m : null;
    const x0 = this.X(barT);
    const x1 = this.X(this.c.logicalToTime(this.c.timeToLogical(barT) + 25));
    const cx = (x0 + x1) / 2;
    const kindName = t.kind === 'market' ? 'Market' : t.kind === 'limit' ? 'Limit' : 'Stop';
    const name = `${long ? 'Buy' : 'Sell'} ${kindName}`;
    const hint =
      step === 'entry'
        ? `${name}: giriş fiyatını seç (${long === (t.kind === 'limit') ? 'anlık fiyatın altı' : 'anlık fiyatın üstü'})`
        : step === 'sl'
          ? `${name}: STOP (SL) noktasını seç`
          : `${name}: HEDEF (TP) noktasını seç`;
    ctx.save();
    const line = (p: number, color: string, dash: boolean) => {
      const y = Math.round(this.Y(p)) + 0.5;
      ctx.strokeStyle = color;
      ctx.lineWidth = 1;
      ctx.setLineDash(dash ? [5, 4] : []);
      ctx.beginPath();
      ctx.moveTo(dash ? 0 : x0, y);
      ctx.lineTo(dash ? w : x1, y);
      ctx.stroke();
      ctx.setLineDash([]);
    };
    if (entry != null) {
      const yE = this.Y(entry);
      if (sl != null) {
        ctx.fillStyle = 'rgba(242,54,69,0.2)';
        ctx.fillRect(x0, Math.min(yE, this.Y(sl)), x1 - x0, Math.abs(this.Y(sl) - yE));
      }
      if (tp != null) {
        ctx.fillStyle = 'rgba(8,153,129,0.2)';
        ctx.fillRect(x0, Math.min(yE, this.Y(tp)), x1 - x0, Math.abs(this.Y(tp) - yE));
      }
      line(entry, '#787b86', false);
      const lots = sl != null ? (st.sizing === 'lots' ? st.session!.lots : lotsForRisk(spec, balanceOf(st.session!), st.session!.riskPct, entry, sl, st.session!.commissionPerLot)) : null;
      const per = (p: number) => (lots == null ? 0 : Math.abs(p - entry) * lots * usdPerPriceUnit(spec, p));
      if (sl != null) {
        line(sl, '#f23645', true);
        this.label(ctx, `Stop ${fmtPrice(sl, spec)} · ${fmtDistance(sl - entry, spec)} · ${fmtMoney(per(sl))}`, cx, long ? Math.max(this.Y(sl), this.Y(entry)) + 11 : Math.min(this.Y(sl), this.Y(entry)) - 11, '#f23645');
      }
      if (tp != null && sl != null) {
        line(tp, '#089981', true);
        const rr = Math.abs(entry - sl) ? Math.abs(tp - entry) / Math.abs(entry - sl) : 0;
        this.label(ctx, `Hedef ${fmtPrice(tp, spec)} · ${fmtDistance(tp - entry, spec)} · ${fmtMoney(per(tp))} · R:R ${rr.toFixed(2)}`, cx, long ? Math.min(this.Y(tp), this.Y(entry)) - 11 : Math.max(this.Y(tp), this.Y(entry)) + 11, '#089981');
      }
      this.label(ctx, `${name} · ${fmtPrice(entry, spec)}${lots != null ? ` · ${lots.toFixed(2)} lot` : ''}`, cx, yE, long ? '#067a67' : '#c12a37');
    }
    this.label(ctx, `${hint} · Esc: iptal`, w / 2, 24, '#2a2e39');
    void h;
    ctx.restore();
  }

  private drawMeasure(ctx: CanvasRenderingContext2D) {
    const m = this.measure!;
    const spec = this.c.spec!;
    const x0 = this.c.logicalToX(Math.round(m.L0)) ?? 0, x1 = this.c.logicalToX(Math.round(m.L1)) ?? 0;
    const y0 = this.Y(m.p0), y1 = this.Y(m.p1);
    const up = m.p1 >= m.p0;
    ctx.save();
    ctx.fillStyle = up ? 'rgba(41,98,255,0.18)' : 'rgba(242,54,69,0.18)';
    ctx.fillRect(Math.min(x0, x1), Math.min(y0, y1), Math.abs(x1 - x0), Math.abs(y1 - y0));
    ctx.strokeStyle = up ? '#2962ff' : '#f23645';
    ctx.setLineDash([4, 3]);
    ctx.beginPath();
    ctx.moveTo((x0 + x1) / 2, y0);
    ctx.lineTo((x0 + x1) / 2, y1);
    ctx.moveTo(x0, (y0 + y1) / 2);
    ctx.lineTo(x1, (y0 + y1) / 2);
    ctx.stroke();
    ctx.setLineDash([]);
    const bars = Math.round(m.L1) - Math.round(m.L0);
    const secs = Math.abs(this.c.logicalToTime(m.L1) - this.c.logicalToTime(m.L0));
    const dd = Math.floor(secs / 86400), hh = Math.floor((secs % 86400) / 3600), mm = Math.floor((secs % 3600) / 60);
    const dur = [dd ? `${dd}g` : '', hh ? `${hh}sa` : '', mm || (!dd && !hh) ? `${mm}dk` : ''].filter(Boolean).join(' ');
    const diff = m.p1 - m.p0;
    const pct = (diff / m.p0) * 100;
    const text = `${diff >= 0 ? '+' : '-'}${fmtPrice(Math.abs(diff), spec)} (${pct.toFixed(2)}%) · ${fmtDistance(diff, spec)} · ${bars} mum · ${dur}`;
    this.label(ctx, text, (x0 + x1) / 2, up ? Math.min(y0, y1) - 12 : Math.max(y0, y1) + 12, up ? '#2962ff' : '#f23645');
    ctx.restore();
    void tfInfo;
  }

  /** "Grafikten başlangıç seç": imlecin altındaki mumda dikey kılavuz. */
  private drawPickLine(ctx: CanvasRenderingContext2D, h: number) {
    const L = this.c.xToLogical(this.pickX!);
    if (L == null) return;
    const info = this.c.barInfo(L);
    if (!info) return;
    const x = Math.round(this.c.logicalToX(Math.round(L)) ?? 0) + 0.5;
    ctx.save();
    ctx.fillStyle = 'rgba(41,98,255,0.08)';
    ctx.fillRect(x, 0, this.width - x, h);
    ctx.strokeStyle = '#2962ff';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([5, 4]);
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, h);
    ctx.stroke();
    ctx.restore();
    this.label(ctx, 'Replay buradan başlasın (bu mum son görünen mum olur) · Esc: iptal', x, 22, '#2962ff');
  }

  clearMeasure(): boolean {
    if (!this.measure) return false;
    this.measure = null;
    this.requestUpdate();
    return true;
  }

  private drawHLine(ctx: CanvasRenderingContext2D, p: number, color: string, width: number, w: number, style?: LineStyleName) {
    const y = Math.round(this.Y(p)) + 0.5;
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.setLineDash(dashOf(style, width));
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(w, y);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  /** Trend çizgisinin ekrandaki uçları (sola / sağa uzatma dahil). */
  private trendEnds(d: TrendLine): [number, number, number, number] {
    const xa = this.X(d.a.t), ya = this.Y(d.a.p), xb = this.X(d.b.t), yb = this.Y(d.b.p);
    if (xa === xb) return [xa, ya, xb, yb];
    const [lx, ly, rx, ry] = xa < xb ? [xa, ya, xb, yb] : [xb, yb, xa, ya];
    const slope = (ry - ly) / (rx - lx);
    const yAt = (x: number) => ly + slope * (x - lx);
    const l = d.extendLeft ? -50 : lx;
    const r = d.extendRight ? this.width + 50 : rx;
    return [l, d.extendLeft ? yAt(l) : ly, r, d.extendRight ? yAt(r) : ry];
  }

  private handle(ctx: CanvasRenderingContext2D, x: number, y: number, color: string) {
    ctx.beginPath();
    ctx.arc(x, y, HANDLE_R, 0, Math.PI * 2);
    ctx.fillStyle = '#0b0c0f';
    ctx.fill();
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = color;
    ctx.stroke();
  }

  private label(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, bg: string, fg = '#fff', align: 'left' | 'center' | 'right' = 'center') {
    const w = ctx.measureText(text).width + 10;
    const h = 18;
    let left = align === 'center' ? x - w / 2 : align === 'left' ? x : x - w;
    // Etiket fiyat ekseninin altına veya sol kenarın dışına taşmasın.
    left = Math.max(4, Math.min(left, this.width - w - 4));
    ctx.fillStyle = bg;
    ctx.beginPath();
    ctx.roundRect(left, y - h / 2, w, h, 3);
    ctx.fill();
    ctx.fillStyle = fg;
    ctx.textAlign = 'left';
    ctx.fillText(text, left + 5, y + 0.5);
  }

  private drawFib(ctx: CanvasRenderingContext2D, d: Fib, active: boolean, w: number) {
    const spec = this.c.spec!;
    const xa = this.X(d.a.t), xb = this.X(d.b.t);
    const xl = Math.min(xa, xb);
    const xr = d.extendRight ? w : Math.max(xa, xb);
    ctx.lineWidth = d.width;
    ctx.textAlign = 'right';
    for (const lv of d.levels) {
      if (!lv.on) continue;
      const p = fibPrice(d, lv.v);
      const y = Math.round(this.Y(p)) + 0.5;
      ctx.strokeStyle = d.color;
      ctx.beginPath();
      ctx.moveTo(xl, y);
      ctx.lineTo(xr, y);
      ctx.stroke();
      ctx.fillStyle = d.color;
      ctx.fillText(`${+lv.v.toFixed(3)} (${fmtPrice(p, spec)})`, xl - 6, y);
    }
    ctx.setLineDash([4, 4]);
    ctx.strokeStyle = hexToRgba(d.color, 0.6);
    ctx.beginPath();
    ctx.moveTo(xa, this.Y(d.a.p));
    ctx.lineTo(xb, this.Y(d.b.p));
    ctx.stroke();
    ctx.setLineDash([]);
    if (active) {
      this.handle(ctx, xa, this.Y(d.a.p), d.color);
      this.handle(ctx, xb, this.Y(d.b.p), d.color);
    }
  }

  private drawPosition(ctx: CanvasRenderingContext2D, d: Position, active: boolean, tr: Trade | undefined) {
    const st = useStore.getState();
    const spec = this.c.spec!;
    const long = d.type === 'long';
    const x0 = this.X(d.entry.t);
    const x1 = Math.max(this.X(d.tEnd), x0 + 24);
    const yE = this.Y(d.entry.p), ySL = this.Y(d.sl), yTP = this.Y(d.tp);
    const done = tr && (tr.status === 'closed' || tr.status === 'cancelled');
    ctx.globalAlpha = done ? 0.55 : 1;

    ctx.fillStyle = 'rgba(8,153,129,0.2)';
    ctx.fillRect(x0, Math.min(yE, yTP), x1 - x0, Math.abs(yTP - yE));
    ctx.fillStyle = 'rgba(242,54,69,0.2)';
    ctx.fillRect(x0, Math.min(yE, ySL), x1 - x0, Math.abs(ySL - yE));

    // İşlemin seyri: girişten çıkışa / anlık fiyata kadar koyu alan.
    if (tr && tr.openedAt != null && (tr.status === 'open' || tr.status === 'closed')) {
      const endPrice = tr.status === 'closed' ? tr.exit! : exitPriceNow(tr) ?? tr.entry;
      const xs = this.X(tr.openedAt);
      const xe = this.X(tr.status === 'closed' ? tr.closedAt! : st.session!.replayTime);
      const yEnd = this.Y(endPrice);
      const good = (endPrice - tr.entry) * (long ? 1 : -1) >= 0;
      ctx.fillStyle = good ? 'rgba(8,153,129,0.35)' : 'rgba(242,54,69,0.35)';
      ctx.fillRect(xs, Math.min(yE, yEnd), Math.max(1, xe - xs), Math.abs(yEnd - yE));
      ctx.setLineDash([3, 3]);
      ctx.strokeStyle = '#d1d4dc';
      ctx.beginPath();
      ctx.moveTo(xs, yE);
      ctx.lineTo(xe, yEnd);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    ctx.lineWidth = 1;
    ctx.strokeStyle = tr?.status === 'pending' ? '#d1d4dc' : '#787b86';
    if (tr?.status === 'pending') ctx.setLineDash([4, 3]);
    ctx.beginPath();
    ctx.moveTo(x0, Math.round(yE) + 0.5);
    ctx.lineTo(x1, Math.round(yE) + 0.5);
    ctx.stroke();
    ctx.setLineDash([]);

    const risk = Math.abs(d.entry.p - d.sl);
    const rr = risk ? Math.abs(d.tp - d.entry.p) / risk : 0;
    const balance = balanceOf(st.session!);
    const sized = tr ? tr.lots : lotsForRisk(spec, balance, d.riskPct, d.entry.p, d.sl, st.session!.commissionPerLot);
    const lots = sized ?? 0; // null: risk bütçesine sığan lot yok (emir engellenir)
    const riskUsd = risk * lots * usdPerPriceUnit(spec, d.entry.p);
    const cx = (x0 + x1) / 2;
    const showDetails = active || tr?.status === 'open' || tr?.status === 'pending';

    if (showDetails) {
      const tpY = long ? Math.min(yTP, yE) - 11 : Math.max(yTP, yE) + 11;
      const slY = long ? Math.max(ySL, yE) + 11 : Math.min(ySL, yE) - 11;
      this.label(ctx, `Hedef ${fmtPrice(d.tp, spec)} · ${fmtDistance(d.tp - d.entry.p, spec)} · ${fmtMoney(Math.abs(d.tp - d.entry.p) * lots * usdPerPriceUnit(spec, d.tp))}`, cx, tpY, '#089981');
      this.label(ctx, `Stop ${fmtPrice(d.sl, spec)} · ${fmtDistance(d.sl - d.entry.p, spec)} · ${fmtMoney(riskUsd)}`, cx, slY, '#f23645');
    }

    let center: string;
    let bg = '#2a2e39';
    if (!tr) center = sized == null ? `${long ? 'Long' : 'Short'} · R:R ${rr.toFixed(2)} · uygun lot yok (risk %${d.riskPct} bütçesine sığmıyor)` : `${long ? 'Long' : 'Short'} · R:R ${rr.toFixed(2)} · ${lots.toFixed(2)} lot · Risk ${fmtMoney(riskUsd)} (%${d.riskPct})`;
    else if (tr.status === 'pending') center = `Bekleyen ${tr.orderType === 'limit' ? 'Limit' : 'Stop'} · ${fmtPrice(tr.entry, spec)} · ${tr.lots} lot · R:R ${rr.toFixed(2)}`;
    else if (tr.status === 'open') {
      const px = exitPriceNow(tr) ?? tr.entry;
      const pnl = calcPnl(getSymbol(tr.symbol), tr.side, tr.entry, px, tr.lots);
      const r = calcR(tr.side, tr.entry, px, tr.initialSl);
      center = `Açık · ${fmtMoney(pnl, true)} · ${fmtR(r)}`;
      bg = pnl >= 0 ? '#067a67' : '#c12a37';
    } else if (tr.status === 'closed') {
      const reason = reasonLabel(tr.exitReason);
      center = `${reason} · ${fmtMoney(tr.pnl!, true)} · ${fmtR(tr.r)}`;
      bg = tr.result === 'win' ? '#067a67' : tr.result === 'loss' ? '#c12a37' : '#50535e';
    } else center = 'İptal edildi';
    if (showDetails || tr) this.label(ctx, center, cx, yE, bg);

    ctx.globalAlpha = 1;
    if (active) {
      const editable = this.allowedParts(d);
      if (editable.has('entry')) this.handle(ctx, x0, yE, '#d1d4dc');
      if (editable.has('sl')) this.handle(ctx, x0, ySL, '#f23645');
      if (editable.has('tp')) this.handle(ctx, x0, yTP, '#089981');
      if (editable.has('end')) this.handle(ctx, x1, yE, '#d1d4dc');
    }
  }

  // ------------------------------------------------------------ isabet testi

  private tradeOf(d: Position): Trade | undefined {
    return d.tradeId ? useStore.getState().session?.trades.find((t) => t.id === d.tradeId) : undefined;
  }

  allowedParts(d: Drawing): Set<Part> {
    if (!isPos(d)) return new Set<Part>(['body', 'a', 'b', 'c1', 'c2']);
    const tr = this.tradeOf(d);
    if (!tr || tr.status === 'pending') return new Set<Part>(['body', 'entry', 'sl', 'tp', 'end']);
    if (tr.status === 'open') return new Set<Part>(['sl', 'tp', 'end']);
    return new Set<Part>();
  }

  private canMove(h: Hit) {
    const d = drawingsOf(useStore.getState().session).find((x) => x.id === h.id);
    return !!d && this.allowedParts(d).has(h.part);
  }

  hitTestAt(x: number, y: number): Hit | null {
    const st = useStore.getState();
    if (st.hideDrawings || !st.session || !this.c.agg || this.c.lastK < 0) return null;
    const list = this.drawings(st.session);
    const near = (ax: number, ay: number) => Math.hypot(x - ax, y - ay) <= HANDLE_R + 3;
    // Önce seçili çizimin tutamaçları, sonra üstten alta diğerleri.
    const ordered = [...list].reverse().sort((a, b) => (b.id === st.selectedId ? 1 : 0) - (a.id === st.selectedId ? 1 : 0));
    for (const d of ordered) {
      const sel = d.id === st.selectedId;
      switch (d.type) {
        case 'hline':
          if (Math.abs(y - this.Y(d.p)) <= HIT_PX) return { id: d.id, part: 'body' };
          break;
        case 'trend': {
          const x1 = this.X(d.a.t), y1 = this.Y(d.a.p), x2 = this.X(d.b.t), y2 = this.Y(d.b.p);
          if (sel && near(x1, y1)) return { id: d.id, part: 'a' };
          if (sel && near(x2, y2)) return { id: d.id, part: 'b' };
          const [ex1, ey1, ex2, ey2] = this.trendEnds(d);
          if (distToSegment(x, y, ex1, ey1, ex2, ey2) <= HIT_PX) return { id: d.id, part: 'body' };
          break;
        }
        case 'rect': {
          const x1 = this.X(d.a.t), y1 = this.Y(d.a.p), bx = this.X(d.b.t), y2 = this.Y(d.b.p);
          if (sel) {
            if (near(x1, y1)) return { id: d.id, part: 'a' };
            if (near(bx, y2)) return { id: d.id, part: 'b' };
            if (near(x1, y2)) return { id: d.id, part: 'c1' };
            if (near(bx, y1)) return { id: d.id, part: 'c2' };
          }
          const hl = d.extendLeft ? -HIT_PX : Math.min(x1, bx), hr = d.extendRight ? this.width : Math.max(x1, bx);
          if (x >= hl - HIT_PX && x <= hr + HIT_PX && y >= Math.min(y1, y2) - HIT_PX && y <= Math.max(y1, y2) + HIT_PX)
            return { id: d.id, part: 'body' };
          break;
        }
        case 'fib': {
          const xa = this.X(d.a.t), xb = this.X(d.b.t);
          if (sel && near(xa, this.Y(d.a.p))) return { id: d.id, part: 'a' };
          if (sel && near(xb, this.Y(d.b.p))) return { id: d.id, part: 'b' };
          const xl = Math.min(xa, xb), xr = d.extendRight ? this.width : Math.max(xa, xb);
          if (x >= xl - HIT_PX && x <= xr + HIT_PX) {
            for (const lv of d.levels) if (lv.on && Math.abs(y - this.Y(fibPrice(d, lv.v))) <= HIT_PX) return { id: d.id, part: 'body' };
          }
          break;
        }
        default: {
          const x0 = this.X(d.entry.t), x1 = Math.max(this.X(d.tEnd), x0 + 24);
          const yE = this.Y(d.entry.p), ySL = this.Y(d.sl), yTP = this.Y(d.tp);
          const allowed = this.allowedParts(d);
          if (sel) {
            if (allowed.has('entry') && near(x0, yE)) return { id: d.id, part: 'entry' };
            if (allowed.has('sl') && near(x0, ySL)) return { id: d.id, part: 'sl' };
            if (allowed.has('tp') && near(x0, yTP)) return { id: d.id, part: 'tp' };
            if (allowed.has('end') && near(x1, yE)) return { id: d.id, part: 'end' };
          }
          const inX = x >= x0 - 2 && x <= x1 + 2;
          if (inX && allowed.has('sl') && Math.abs(y - ySL) <= 4) return { id: d.id, part: 'sl' };
          if (inX && allowed.has('tp') && Math.abs(y - yTP) <= 4) return { id: d.id, part: 'tp' };
          if (inX && y >= Math.min(ySL, yTP) && y <= Math.max(ySL, yTP)) return { id: d.id, part: 'body' };
        }
      }
    }
    return null;
  }

  // ------------------------------------------------------------ fare

  private local(e: MouseEvent) {
    const r = this.c.el.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  /** Fare konumunu (mantıksal indeks, fiyat) olarak döndürür; magnet açıksa OHLC'ye yapıştırır. */
  private point(x: number, y: number, snap: boolean): { L: number; p: number } | null {
    const L = this.c.xToLogical(x);
    const p = this.c.yToPrice(y);
    if (L == null || p == null) return null;
    let price = p;
    if (snap && useStore.getState().magnet) {
      const bar = this.c.barAt(L);
      if (bar) {
        let best = Infinity;
        for (const v of [bar.open, bar.high, bar.low, bar.close]) {
          const dy = Math.abs(this.Y(v) - y);
          if (dy < best && dy <= 30) {
            best = dy;
            price = v;
          }
        }
      }
    }
    return { L, p: this.c.roundPrice(price) };
  }

  private inPane(x: number, y: number) {
    const ps = this.c.chart.priceScale('right').width();
    const tsH = this.c.chart.timeScale().height();
    return x >= 0 && y >= 0 && x < this.c.el.clientWidth - ps && y < this.c.el.clientHeight - tsH;
  }

  private onDown = (e: MouseEvent) => {
    if (e.button !== 0) return;
    const { x, y } = this.local(e);
    if (!this.inPane(x, y)) return;
    const st = useStore.getState();
    if (!st.session || !this.c.agg || this.c.lastK < 0) return;
    const block = () => {
      e.stopPropagation();
      e.preventDefault();
    };

    if (st.ticket && this.isActive) {
      const pt = this.point(x, y, true);
      if (pt) {
        ticketClick(pt.p, this.c.tick, (entry, sl, tp) => {
          const t = useStore.getState().ticket;
          const barT = lastBarTime();
          if (!t || barT == null) return null;
          return addDrawing({
            type: t.side,
            ...TOOL_DEFAULTS[t.side],
            entry: { t: barT, p: entry },
            sl,
            tp,
            tEnd: this.c.logicalToTime(this.c.timeToLogical(barT) + 25),
            riskPct: st.session!.riskPct,
          });
        });
        this.requestUpdate();
      }
      return block();
    }

    if (this.creating) {
      const pt = this.point(x, y, true);
      if (pt) updateDrawing(this.creating.id, { b: { t: this.c.logicalToTime(pt.L), p: pt.p } } as Partial<Drawing>, false);
      this.finishCreate();
      return block();
    }

    if (st.pickingStart) {
      const L = this.c.xToLogical(x);
      const end = L != null ? this.c.barEndTime(L) : null;
      useStore.setState({ pickingStart: false });
      this.pickX = null;
      if (end != null) jumpTo(end);
      this.requestUpdate();
      return block();
    }

    if (st.tool === 'measure' || e.shiftKey) {
      const pt = this.point(x, y, true);
      if (!pt) return;
      this.measure = { L0: pt.L, p0: pt.p, L1: pt.L, p1: pt.p, dragging: true };
      this.c.chart.applyOptions({ handleScroll: false, handleScale: false });
      this.requestUpdate();
      return block();
    }
    if (this.measure) {
      this.clearMeasure();
      return block();
    }

    if (st.tool !== 'cursor') {
      const pt = this.point(x, y, true);
      if (!pt) return;
      this.create(st.tool, pt, x, y);
      return block();
    }

    const hit = this.hitTestAt(x, y);
    if (!hit) {
      if (st.selectedId) useStore.setState({ selectedId: null });
      this.requestUpdate();
      return;
    }
    useStore.setState({ selectedId: hit.id });
    const d = drawingsOf(st.session).find((x) => x.id === hit.id)!;
    const pt = this.point(x, y, false);
    if (pt && this.allowedParts(d).has(hit.part)) {
      this.drag = { hit, L0: pt.L, p0: pt.p, orig: d, moved: false };
      this.c.chart.applyOptions({ handleScroll: false, handleScale: false });
    }
    this.requestUpdate();
    block();
  };

  private create(tool: DrawTool, pt: { L: number; p: number }, x: number, y: number) {
    const st = useStore.getState();
    const s = st.session!;
    const def = TOOL_DEFAULTS[tool];
    const P: Pt = { t: this.c.logicalToTime(pt.L), p: pt.p };
    let id: string;
    if (tool === 'hline') {
      id = addDrawing({ type: 'hline', p: pt.p, ...def });
      useStore.setState({ selectedId: id, tool: 'cursor' });
    } else if (tool === 'long' || tool === 'short') {
      const dir = tool === 'long' ? 1 : -1;
      const p40 = this.c.yToPrice(y + 40);
      const dist = (this.c.atrAt(pt.L) ?? 0) * 1.5 || (p40 != null ? Math.abs(pt.p - p40) : pt.p * 0.002);
      id = addDrawing({
        type: tool,
        ...def,
        entry: P,
        sl: this.c.roundPrice(pt.p - dir * dist),
        tp: this.c.roundPrice(pt.p + dir * dist * 2),
        tEnd: this.c.logicalToTime(pt.L + 25),
        riskPct: s.riskPct,
      });
      useStore.setState({ selectedId: id, tool: 'cursor' });
    } else {
      const base = { ...def, a: P, b: { ...P } };
      id =
        tool === 'rect'
          ? addDrawing({ type: 'rect', ...base, fill: hexToRgba(def.color, 0.15) })
          : tool === 'fib'
            ? addDrawing({ type: 'fib', ...base, levels: s.fibDefaults.map((l) => ({ ...l })) })
            : addDrawing({ type: 'trend', ...base });
      this.creating = { id, downX: x, downY: y };
      useStore.setState({ selectedId: id });
    }
    this.requestUpdate();
  }

  private finishCreate() {
    const c = this.creating;
    this.creating = null;
    if (!c) return;
    const d = drawingsOf(useStore.getState().session).find((x) => x.id === c.id);
    // Tek tıklamayla bırakılmış (sıfır boyutlu) çizimleri sil.
    if (d && 'a' in d && d.a.t === d.b.t && d.a.p === d.b.p) deleteDrawing(c.id, false);
    useStore.setState({ tool: 'cursor' });
    this.requestUpdate();
  }

  cancelCreate(): boolean {
    if (!this.creating) return false;
    const id = this.creating.id;
    this.creating = null;
    deleteDrawing(id, false);
    useStore.setState({ tool: 'cursor' });
    return true;
  }

  private onMove = (e: MouseEvent) => {
    const { x, y } = this.local(e);
    if (useStore.getState().pickingStart) {
      this.pickX = this.inPane(x, y) ? x : null;
      this.requestUpdate();
      return;
    }
    if (useStore.getState().ticket && this.isActive) {
      this.ticketP = this.inPane(x, y) ? this.point(x, y, true)?.p ?? null : null;
      this.requestUpdate();
      return;
    }
    if (this.creating) {
      const pt = this.point(x, y, true);
      if (pt) updateDrawing(this.creating.id, { b: { t: this.c.logicalToTime(pt.L), p: pt.p } } as Partial<Drawing>, false);
      return;
    }
    if (this.measure?.dragging) {
      const pt = this.point(x, y, true);
      if (pt) {
        this.measure.L1 = pt.L;
        this.measure.p1 = pt.p;
        this.requestUpdate();
      }
      return;
    }
    if (this.drag) {
      const pt = this.point(x, y, this.drag.hit.part !== 'body');
      if (!pt) return;
      if (!this.drag.moved) recordUndo(); // sürükleme başına tek geri alma kaydı
      this.drag.moved = true;
      this.applyDrag(pt);
      return;
    }
    if (e.buttons) return;
    const h = this.inPane(x, y) ? this.hitTestAt(x, y) : null;
    const id = h?.id ?? null;
    if (id !== this.hoverId) {
      this.hoverId = id;
      this.requestUpdate();
    }
  };

  private onUp = (e: MouseEvent) => {
    if (this.measure?.dragging) {
      this.measure.dragging = false;
      this.c.chart.applyOptions({ handleScroll: true, handleScale: true });
      if (useStore.getState().tool === 'measure') useStore.setState({ tool: 'cursor' });
      return;
    }
    if (this.creating) {
      const { x, y } = this.local(e);
      if (Math.hypot(x - this.creating.downX, y - this.creating.downY) > 5) this.finishCreate();
      return;
    }
    if (this.drag) {
      this.drag = null;
      this.c.chart.applyOptions({ handleScroll: true, handleScale: true });
      this.requestUpdate();
    }
  };

  private onDblClick = (e: MouseEvent) => {
    const { x, y } = this.local(e);
    const h = this.inPane(x, y) ? this.hitTestAt(x, y) : null;
    if (!h) return;
    e.stopPropagation();
    useStore.setState({ selectedId: h.id, editingId: h.id });
  };

  private applyDrag(pt: { L: number; p: number }) {
    const { hit, orig, L0, p0 } = this.drag!;
    const c = this.c;
    const dL = Math.round(pt.L - L0);
    const dp = pt.p - p0;
    const shiftT = (t: number) => c.logicalToTime(c.timeToLogical(t) + dL);
    const at = (): Pt => ({ t: c.logicalToTime(pt.L), p: pt.p });
    const r = (p: number) => c.roundPrice(p);
    let patch: Partial<Drawing> = {};
    switch (orig.type) {
      case 'hline':
        patch = { p: r(orig.p + dp) };
        break;
      case 'trend':
      case 'rect':
      case 'fib':
        if (hit.part === 'a') patch = { a: at() };
        else if (hit.part === 'b') patch = { b: at() };
        else if (hit.part === 'c1') patch = { a: { t: at().t, p: orig.a.p }, b: { t: orig.b.t, p: pt.p } };
        else if (hit.part === 'c2') patch = { a: { t: orig.a.t, p: pt.p }, b: { t: at().t, p: orig.b.p } };
        else patch = { a: { t: shiftT(orig.a.t), p: r(orig.a.p + dp) }, b: { t: shiftT(orig.b.t), p: r(orig.b.p + dp) } };
        break;
      default: {
        const long = orig.type === 'long';
        const tick = c.tick;
        const e = orig.entry.p;
        if (hit.part === 'sl') patch = { sl: long ? Math.min(pt.p, e - tick) : Math.max(pt.p, e + tick) };
        else if (hit.part === 'tp') patch = { tp: long ? Math.max(pt.p, e + tick) : Math.min(pt.p, e - tick) };
        else if (hit.part === 'end') patch = { tEnd: c.logicalToTime(Math.max(pt.L, c.timeToLogical(orig.entry.t) + 2)) };
        else if (hit.part === 'entry') {
          const lo = Math.min(orig.sl, orig.tp) + tick;
          const hi = Math.max(orig.sl, orig.tp) - tick;
          patch = { entry: { t: at().t, p: Math.max(lo, Math.min(hi, pt.p)) } };
        } else {
          patch = {
            entry: { t: shiftT(orig.entry.t), p: r(e + dp) },
            sl: r(orig.sl + dp),
            tp: r(orig.tp + dp),
            tEnd: shiftT(orig.tEnd),
          };
        }
      }
    }
    updateDrawing(orig.id, patch, false);
  }
}
