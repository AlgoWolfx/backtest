// GERALT Session Liquidity katmanı (geralt.pine'ın çizimi): killzone kutuları, canlı seans çizgileri,
// likidite çizgileri (alınınca biten ve silikleşen), etiketler ve True Day Open.
//
// Hesaplar src/core/sessions.ts'te (saf, testli) yapılır; bu sınıf yalnızca çizer. Yalnızca replay zamanına kadar
// açıklanmış veri kullanılır. Kutular mumların ARKASINA (zOrder 'bottom'), çizgiler ve yazılar üstüne çizilir.

import type { CanvasRenderingTarget2D } from 'fancy-canvas';
import type { IPrimitivePaneView, ISeriesPrimitive, SeriesAttachedParameter, Time } from 'lightweight-charts';
import { alphaOf, computeOverlay, type LabelSize, type LineStyleName, type Overlay, type SessionSettings } from '../core/sessions';
import { fmtPrice } from '../format';
import { useStore } from '../store';
import { hexToRgba } from './DrawingLayer';
import type { ChartController } from './ChartController';

/** Pine yazı boyutları -> piksel. */
const FONT_PX: Record<LabelSize, number> = { Tiny: 8, Small: 10, Normal: 12, Large: 14, Huge: 18 };

const dashOf = (style: LineStyleName, w: number): number[] => (style === 'Dashed' ? [6 + w, 4 + w] : style === 'Dotted' ? [w, 3 + w] : []);

export class SessionLayer implements ISeriesPrimitive<Time> {
  private requestRedraw: (() => void) | null = null;
  private readonly views: IPrimitivePaneView[];
  private memo: { key: string; settings: unknown; d: unknown; overlay: Overlay } | null = null;

  constructor(private readonly c: ChartController) {
    this.views = [
      { zOrder: () => 'bottom', renderer: () => ({ draw: (t: CanvasRenderingTarget2D) => this.drawBoxes(t) }) },
      { zOrder: () => 'normal', renderer: () => ({ draw: (t: CanvasRenderingTarget2D) => this.drawLines(t) }) },
    ];
  }

  attached(p: SeriesAttachedParameter<Time>) {
    this.requestRedraw = p.requestUpdate;
  }
  detached() {
    this.requestRedraw = null;
  }
  paneViews() {
    return this.views;
  }
  requestUpdate() {
    this.memo = null;
    this.requestRedraw?.();
  }

  /** Aynı karede kutu ve çizgi görünümleri tek hesaplamayı paylaşır (anahtar: replay, veri, ayar nesnesi, zaman dilimi). */
  private overlay(): { o: Overlay; s: SessionSettings } | null {
    const st = useStore.getState();
    const s = st.session;
    const { d, agg } = this.c;
    const settings = st.sessionSettings;
    if (!s || !d || !agg || this.c.lastK < 0 || !settings.enabled) return null;
    const key = `${s.replayTime}|${d.id}|${this.c.tfSeconds}`;
    if (this.memo && this.memo.key === key && this.memo.settings === settings && this.memo.d === d) return { o: this.memo.overlay, s: settings };
    const overlay = computeOverlay(d, settings, s.replayTime, this.c.tfSeconds);
    this.memo = { key, settings, d, overlay };
    return { o: overlay, s: settings };
  }

  private X(t: number) {
    return this.c.timeToX(t) ?? -1e6;
  }

  private drawBoxes(target: CanvasRenderingTarget2D) {
    const r = this.overlay();
    if (!r || !r.o.boxes.length) return;
    const { o, s } = r;
    target.useMediaCoordinateSpace(({ context: ctx, mediaSize }) => {
      for (const b of o.boxes) {
        const x0 = this.X(b.firstT);
        const x1 = Math.max(this.X(b.lastT + 60), x0 + 1);
        const y0 = this.c.priceToY(b.hi);
        const y1 = this.c.priceToY(b.lo);
        if (y0 == null || y1 == null || x1 < 0 || x0 > mediaSize.width) continue;
        ctx.fillStyle = hexToRgba(b.def.color, alphaOf(s.boxTransp));
        ctx.fillRect(x0, y0, x1 - x0, Math.max(1, y1 - y0));
        if (s.boxBorderTransp < 100) {
          ctx.strokeStyle = hexToRgba(b.def.color, alphaOf(s.boxBorderTransp));
          ctx.lineWidth = 1;
          ctx.strokeRect(Math.round(x0) + 0.5, Math.round(y0) + 0.5, x1 - x0, Math.max(1, y1 - y0));
        }
      }
    });
  }

  private drawLines(target: CanvasRenderingTarget2D) {
    const r = this.overlay();
    if (!r) return;
    const { o, s } = r;
    if (!o.levels.length && !o.live.length && !o.tdo.length) return;
    const spec = this.c.spec!;
    const agg = this.c.agg!;
    const tf = this.c.tfSeconds;
    const lastBar = agg.utc[this.c.lastK];
    const tick = this.c.tick;
    const px = FONT_PX[s.labelSize];
    target.useMediaCoordinateSpace(({ context: ctx, mediaSize }) => {
      ctx.font = `${px}px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`;
      ctx.textBaseline = 'middle';
      ctx.textAlign = 'center';

      const line = (x0: number, x1: number, y: number, color: string, alpha: number, width: number, style: LineStyleName) => {
        const a = Math.max(0, x0);
        const b = Math.min(mediaSize.width, x1);
        if (b <= a) return;
        ctx.strokeStyle = hexToRgba(color, alpha);
        ctx.lineWidth = width;
        ctx.setLineDash(dashOf(style, width));
        const yy = width % 2 ? Math.round(y) + 0.5 : Math.round(y);
        ctx.beginPath();
        ctx.moveTo(a, yy);
        ctx.lineTo(b, yy);
        ctx.stroke();
        ctx.setLineDash([]);
      };
      /** Pine getLabelY: otomatik = high için üst, low için alt. */
      const labelPrice = (price: number, isHigh: boolean) => {
        const off = s.vOffsetTicks * tick;
        if (s.labelVPos === 'Seviye') return price;
        if (s.labelVPos === 'Üst') return price + off;
        if (s.labelVPos === 'Alt') return price - off;
        return isHigh ? price + off : price - off;
      };
      const label = (txt: string, xTime: number, price: number, isHigh: boolean, color: string, alpha: number) => {
        const y = this.c.priceToY(labelPrice(price, isHigh));
        if (y == null || y < -10 || y > mediaSize.height + 10) return;
        const w = ctx.measureText(txt).width;
        const x = Math.max(w / 2 + 2, Math.min(mediaSize.width - w / 2 - 2, this.X(xTime)));
        ctx.fillStyle = hexToRgba(color, alpha);
        ctx.fillText(txt, x, y);
      };
      const rightX = lastBar + s.rightOffset * tf;

      // Canlı seans çizgileri: seans açıkken güncel high/low, sağda kısa çizgi
      for (const lv of o.live) {
        const x0 = this.X(lastBar);
        const x1 = this.X(lastBar + s.liveBars * tf);
        for (const price of [lv.hi, lv.lo]) {
          const y = this.c.priceToY(price);
          if (y != null) line(x0, x1, y, lv.def.color, alphaOf(s.liveTransp), s.lineWidth, s.lineStyle);
        }
      }

      // Likidite çizgileri
      for (const lv of o.levels) {
        const y = this.c.priceToY(lv.price);
        if (y == null) continue;
        const taken = lv.takenAt != null;
        const x0 = this.X(lv.startT);
        const x1 = taken ? this.X(lv.takenAt!) : mediaSize.width;
        if (y >= -2 && y <= mediaSize.height + 2) line(x0, x1, y, lv.def.color, alphaOf(taken ? s.takenTransp : s.activeTransp), s.lineWidth, s.lineStyle);
        if (!s.showLabels || (taken && !s.showTakenLabels)) continue;
        const at = s.labelPos === 'Sağ' ? (taken ? lv.takenAt! : rightX) : lv.startT;
        label(lv.text, at, lv.price, lv.isHigh, lv.def.color, alphaOf(taken ? s.takenLabelTransp : s.activeTransp));
      }

      // True Day Open
      for (const t of o.tdo) {
        const y = this.c.priceToY(t.price);
        if (y == null) continue;
        const x0 = this.X(t.from);
        const x1 = t.to == null ? mediaSize.width : this.X(t.to);
        const color = t.today ? s.tdo.color : s.tdo.pastColor;
        const alpha = t.today ? 1 : alphaOf(s.tdo.pastTransp);
        if (y >= -2 && y <= mediaSize.height + 2) line(x0, x1, y, color, alpha, s.tdo.width, s.tdo.style);
        if (t.today && s.tdo.showLabel) label(s.tdo.labelText, s.labelPos === 'Sağ' ? rightX : t.from, t.price, true, s.tdo.color, 1);
      }
      void spec;
      void fmtPrice;
    });
  }
}
