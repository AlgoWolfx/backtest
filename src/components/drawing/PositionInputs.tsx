import { getSymbol } from '../../../shared/symbols.js';
import { lotsForRisk, stopRiskPerLot, usdPerPriceUnit } from '../../core/trading';
import { Position } from '../../core/types';
import { fmtDistance, fmtMoney } from '../../lib/format';
import { balanceOf, placeOrderFromDrawing, updateDrawing, useStore } from '../../store';
import { NumberInput } from '../common/NumberInput';
import { SizeControl } from './SizeControl';

/** Pozisyon girdileri: giriş, SL, TP, risk %, özet ve emir butonları. */
export function PositionInputs({ d, digits }: { d: Position; digits: number }) {
  const session = useStore((s) => s.session)!;
  const spec = getSymbol(session.symbol);
  const trade = d.tradeId ? session.trades.find((t) => t.id === d.tradeId) : undefined;
  const lockedEntry = trade && trade.status !== 'pending';
  const locked = trade && (trade.status === 'closed' || trade.status === 'cancelled');
  const risk = Math.abs(d.entry.p - d.sl);
  const rr = risk ? Math.abs(d.tp - d.entry.p) / risk : 0;
  const sized = trade ? trade.lots : d.lots != null ? d.lots : lotsForRisk(spec, balanceOf(session), d.riskPct, d.entry.p, d.sl, session.commissionPerLot);
  const lots = sized ?? 0; // null: risk bütçesine sığan lot yok
  const r = (v: number) => Math.round(v * 10 ** digits) / 10 ** digits;
  const long = d.type === 'long';
  const valid = long ? d.sl < d.entry.p && d.tp > d.entry.p : d.sl > d.entry.p && d.tp < d.entry.p;
  return (
    <>
      <div className="form-row">
        <span>Giriş</span>
        {lockedEntry ? <b>{d.entry.p.toFixed(digits)}</b> : <NumberInput value={d.entry.p} onChange={(p) => updateDrawing(d.id, { entry: { ...d.entry, p: r(p) } }, false)} />}
      </div>
      <div className="form-row">
        <span>Stop-loss</span>
        {locked ? <b>{d.sl.toFixed(digits)}</b> : <NumberInput value={d.sl} onChange={(sl) => updateDrawing(d.id, { sl: r(sl) }, false)} />}
        <span className="muted">{fmtDistance(d.sl - d.entry.p, spec)}</span>
      </div>
      <div className="form-row">
        <span>Take-profit</span>
        {locked ? <b>{d.tp.toFixed(digits)}</b> : <NumberInput value={d.tp} onChange={(tp) => updateDrawing(d.id, { tp: r(tp) }, false)} />}
        <span className="muted">{fmtDistance(d.tp - d.entry.p, spec)}</span>
      </div>
      {(!trade || trade.status === 'pending') && (
        <div className="form-row">
          <span>Boyut</span>
          <SizeControl d={d} record={false} />
        </div>
      )}
      <div className="pos-summary">
        <div>
          R:R <b>{rr.toFixed(2)}</b>
        </div>
        <div>
          Lot <b>{sized == null ? 'yok' : lots.toFixed(2)}</b>
        </div>
        <div>
          Risk <b>{fmtMoney(stopRiskPerLot(spec, d.entry.p, d.sl) * lots)}</b>
        </div>
        <div>
          Hedef <b>{fmtMoney(Math.abs(d.tp - d.entry.p) * lots * usdPerPriceUnit(spec, d.tp))}</b>
        </div>
      </div>
      {!trade && sized == null && valid && <p className="hint neg">Risk bütçesine sığan lot yok; stopu daraltın veya risk %'sini artırın.</p>}
      {!valid && <p className="hint neg">{long ? 'Long: SL girişin altında, TP üstünde olmalı.' : 'Short: SL girişin üstünde, TP altında olmalı.'}</p>}
      {!trade && (
        <div className="form-row">
          <button className="btn primary" onClick={() => placeOrderFromDrawing(d.id, true)}>
            Piyasa emri
          </button>
          <button className="btn" onClick={() => placeOrderFromDrawing(d.id, false)}>
            Limit / Stop emri ({d.entry.p.toFixed(digits)})
          </button>
        </div>
      )}
    </>
  );
}
