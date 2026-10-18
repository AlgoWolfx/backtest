import { closeTradeManual, deleteDrawing, drawingsOf, placeOrderFromDrawing, updateDrawing, useStore } from '../store';
import { hexToRgba } from '../chart/DrawingLayer';
import { Icons } from './icons';

export const COLORS = ['#2962ff', '#089981', '#f23645', '#ff9800', '#e91e63', '#9c27b0', '#00bcd4', '#d1d4dc', '#787b86'];

/** Seçili çizim için grafiğin üstünde beliren küçük araç çubuğu. */
export function DrawingToolbar() {
  const session = useStore((s) => s.session);
  const selectedId = useStore((s) => s.selectedId);
  const d = drawingsOf(session).find((x) => x.id === selectedId);
  if (!d || !session) return null;
  const isPos = d.type === 'long' || d.type === 'short';
  const trade = isPos && d.tradeId ? session.trades.find((t) => t.id === d.tradeId) : undefined;

  return (
    <div className="draw-toolbar" onMouseDown={(e) => e.stopPropagation()}>
      {!isPos &&
        COLORS.map((c) => (
          <button
            key={c}
            className={`swatch ${d.color === c ? 'on' : ''}`}
            style={{ background: c }}
            title={c}
            onClick={() => updateDrawing(d.id, d.type === 'rect' ? { color: c, fill: hexToRgba(c, d.fillAlpha ?? 0.15) } : { color: c })}
          />
        ))}
      {d.type === 'rect' && (
        <button className={`btn small ${d.midline ? 'primary' : ''}`} title="Orta çizgi (%50 / denge) ve fiyat etiketi" onClick={() => updateDrawing(d.id, { midline: !d.midline })}>
          ½ Orta
        </button>
      )}
      {d.type === 'trend' && (
        <button className={`btn small ${d.midpoint ? 'primary' : ''}`} title="Orta noktayı göster" onClick={() => updateDrawing(d.id, { midpoint: !d.midpoint })}>
          Orta nokta
        </button>
      )}
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
      <button className="icon-btn" title="Ayarlar (çift tık)" onClick={() => useStore.setState({ editingId: d.id })}>
        <Icons.settings />
      </button>
      <button className="icon-btn" title="Sil (Delete)" onClick={() => deleteDrawing(d.id)}>
        <Icons.trash />
      </button>
    </div>
  );
}
