import { chartRef } from '../chartRef';
import { hexToRgba } from '../chart/drawUtil';
import type { LineStyleName, Position } from '../core/types';
import { SizeControl } from './SizeControl';
import { closeTradeManual, cloneDrawing, deleteDrawing, drawingsOf, placeOrderFromDrawing, updateDrawing, useStore } from '../store';
import { TvColor } from './DrawingDialog';
import { Icons } from './icons';

export const COLORS = ['#2962ff', '#089981', '#f23645', '#ff9800', '#e91e63', '#9c27b0', '#00bcd4', '#d1d4dc', '#787b86'];

const NEXT_STYLE: Record<LineStyleName, LineStyleName> = { solid: 'dashed', dashed: 'dotted', dotted: 'solid' };
const STYLE_LABEL: Record<LineStyleName, string> = { solid: '───', dashed: '- - -', dotted: '· · ·' };

/**
 * Seçili çizim için grafiğin üstünde beliren yüzen araç çubuğu (TradingView gibi): renk + opaklık, kalınlık, çizgi stili,
 * kilitle, kopyala, ayarlar, sil. Kilitli çizimde stil düğmeleri devre dışıdır.
 */
export function DrawingToolbar() {
  const session = useStore((s) => s.session);
  const selectedId = useStore((s) => s.selectedId);
  const d = drawingsOf(session).find((x) => x.id === selectedId);
  if (!d || !session) return null;
  const isPos = d.type === 'long' || d.type === 'short';
  const trade = isPos && d.tradeId ? session.trades.find((t) => t.id === d.tradeId) : undefined;
  const locked = !!d.locked;
  const set = (patch: Record<string, unknown>) => updateDrawing(d.id, patch as never);

  const color = d.type === 'rect' ? d.fillColor ?? d.color : isPos ? '#2962ff' : d.color;
  const alpha = d.type === 'rect' ? d.fillAlpha ?? 0.15 : d.type === 'trend' || d.type === 'hline' ? d.lineAlpha ?? 1 : 1;
  const onColor = (c: string, a: number) => {
    if (d.type === 'rect') set({ color: d.borderColor ? d.color : c, fillColor: c, fillAlpha: a, fillOn: a > 0, fill: hexToRgba(c, a) });
    else if (d.type === 'trend' || d.type === 'hline') set({ color: c, lineAlpha: a });
    else set({ color: c });
  };
  const hasStyle = d.type === 'trend' || d.type === 'hline' || d.type === 'rect';
  const style = (d as { style?: LineStyleName }).style ?? 'solid';

  return (
    <div className="draw-toolbar" onMouseDown={(e) => e.stopPropagation()}>
      {!isPos && (
        <span className={locked ? 'dt-disabled' : ''}>
          <TvColor color={color} alpha={alpha} onChange={onColor} withAlpha={d.type !== 'fib'} />
        </span>
      )}
      {!isPos && (
        <select className="dt-select" disabled={locked} title="Kalınlık" value={d.width} onChange={(e) => set({ width: Number(e.target.value) })}>
          {[1, 2, 3, 4].map((w) => (
            <option key={w} value={w}>
              {w}px
            </option>
          ))}
        </select>
      )}
      {hasStyle && (
        <button className="btn small" disabled={locked} title="Çizgi stili" onClick={() => set({ style: NEXT_STYLE[style] })}>
          {STYLE_LABEL[style]}
        </button>
      )}
      {d.type === 'rect' && (
        <button className={`btn small ${d.midline ? 'primary' : ''}`} disabled={locked} title="Orta çizgi (%50 / denge) ve fiyat etiketi" onClick={() => set({ midline: !d.midline })}>
          ½ Orta
        </button>
      )}
      {d.type === 'trend' && (
        <button className={`btn small ${d.midpoint ? 'primary' : ''}`} disabled={locked} title="Orta noktayı göster" onClick={() => set({ midpoint: !d.midpoint })}>
          Orta nokta
        </button>
      )}
      {isPos && (!trade || trade.status === 'pending') && <SizeControl d={d as Position} record />}
      {isPos && !trade && (
        <>
          <button className="btn small primary" onClick={() => placeOrderFromDrawing(d.id, true)} title="Anlık fiyattan pozisyon aç (SL/TP çizimdeki gibi)">
            Piyasa emri
          </button>
          <button className="btn small" onClick={() => placeOrderFromDrawing(d.id, false)} title="Çizimdeki giriş fiyatından bekleyen emir">
            Limit / Stop emri
          </button>
        </>
      )}
      {trade?.status === 'open' && (
        <button className="btn small danger" onClick={() => closeTradeManual(trade.id)}>
          Pozisyonu kapat
        </button>
      )}
      {trade?.status === 'pending' && (
        <button className="btn small danger" onClick={() => closeTradeManual(trade.id)}>
          Emri iptal et
        </button>
      )}
      <span className="sep" />
      <button className={`icon-btn ${locked ? 'on' : ''}`} title={locked ? 'Kilidi aç' : 'Kilitle (taşınamaz / düzenlenemez)'} onClick={() => set({ locked: !locked })}>
        {locked ? <Icons.lock /> : <Icons.unlock />}
      </button>
      {!isPos && (
        <button
          className="icon-btn"
          title="Kopyala (çizimin bir kopyasını oluştur)"
          onClick={() => {
            const c = chartRef.current;
            cloneDrawing(d.id, (t) => (c ? c.logicalToTime(c.timeToLogical(t) + 5) : t));
          }}
        >
          <Icons.clone />
        </button>
      )}
      <button className="icon-btn" title="Ayarlar (çift tık)" onClick={() => useStore.setState({ editingId: d.id })}>
        <Icons.settings />
      </button>
      <button className="icon-btn" title="Sil (Delete)" onClick={() => deleteDrawing(d.id)}>
        <Icons.trash />
      </button>
    </div>
  );
}
