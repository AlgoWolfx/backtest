// Pozisyon aracının (Long / Short) boyutu: risk yüzdesi veya sabit lot. Henüz emre dönmemiş ve bekleyen (limit / stop)
// pozisyonlarda düzenlenir; bekleyen emirde değişiklik emre de yansır (lot yeniden hesaplanır).

import { getSymbol } from '../../shared/symbols.js';
import { lotsForRisk, stopRiskPerLot } from '../core/trading';
import type { Position } from '../core/types';
import { fmtMoney } from '../format';
import { balanceOf, updateDrawing, useStore } from '../store';
import { NumberInput } from './Bars';

export function SizeControl({ d, record }: { d: Position; record: boolean }) {
  const session = useStore((s) => s.session);
  if (!session) return null;
  const spec = getSymbol(session.symbol);
  const balance = balanceOf(session);
  const lotMode = d.lots != null;
  const set = (patch: Partial<Position>) => updateDrawing(d.id, patch, record);
  const trade = d.tradeId ? session.trades.find((t) => t.id === d.tradeId) : undefined;
  // Şu an geçerli lot: işleme yazılan, sabit lot veya risk yüzdesinden hesaplanan
  const riskLots = lotsForRisk(spec, balance, d.riskPct, d.entry.p, d.sl, session.commissionPerLot);
  const lotsNow = trade ? trade.lots : lotMode ? d.lots! : riskLots;
  const riskUsd = lotsNow != null ? stopRiskPerLot(spec, d.entry.p, d.sl) * lotsNow : null;

  return (
    <div className="size-ctl">
      <div className="seg" title="Boyut: bakiyenin risk yüzdesi veya sabit lot">
        <button className={!lotMode ? 'on' : ''} onClick={() => lotMode && set({ lots: undefined })}>
          Risk %
        </button>
        <button className={lotMode ? 'on' : ''} onClick={() => !lotMode && set({ lots: Math.max(0.01, Math.round((lotsNow ?? 0.01) * 100) / 100) })}>
          Lot
        </button>
      </div>
      {lotMode ? <NumberInput value={d.lots!} min={0.01} step={0.01} onChange={(lots) => set({ lots })} /> : <NumberInput value={d.riskPct} min={0.01} step={0.25} onChange={(riskPct) => set({ riskPct })} />}
      <span className="muted size-info">{lotMode ? (riskUsd != null ? `≈ ${fmtMoney(riskUsd)} risk` : '') : lotsNow != null ? `${lotsNow.toFixed(2)} lot` : 'lot yok'}</span>
    </div>
  );
}
