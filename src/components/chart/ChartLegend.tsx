import { useEffect, useState } from 'react';
import type { MouseEventParams, Time } from 'lightweight-charts';
import { getSymbol } from '../../../shared/symbols.js';
import { ChartController } from '../../chart/ChartController';
import { sourceLabel } from '../../core/data';
import { tfInfo } from '../../core/timeframes';
import { fmtNy, fmtPrice, fmtShifted } from '../../lib/format';
import { paneCfg, useStore } from '../../store';

/** Mumun zaman etiketi: gün içi mumlarda NY saati, D/W/M mumlarda işlem günü tarihi. */
function barLabel(utc: number, chartTime: number, intraday: boolean) {
  return intraday ? fmtNy(utc) : fmtShifted(chartTime, false);
}

/** TradingView'daki gibi: imlecin altındaki mumun OHLC değerleri. */
export function ChartLegend({ c, pane }: { c: ChartController; pane: number }) {
  const symbol = useStore((s) => (s.session ? paneCfg(s.session, pane).symbol : undefined));
  const tf = useStore((s) => (s.session ? paneCfg(s.session, pane).tf : undefined));
  useStore((s) => s.session?.replayTime);
  const th = useStore((s) => s.chartTheme);
  const [L, setL] = useState<number | null>(null);

  useEffect(() => {
    const h = (p: MouseEventParams<Time>) => setL(p.logical ?? null);
    c.chart.subscribeCrosshairMove(h);
    return () => c.chart.unsubscribeCrosshairMove(h);
  }, [c]);

  if (!symbol || !tf) return null;
  const spec = getSymbol(symbol);
  const info = c.barInfo(L ?? c.lastK - c.winStart);
  const ti = tfInfo(tf);
  const src = c.d?.source;
  const sourceText = src ? sourceLabel(src) : '';
  const up = info ? info.bar.close >= info.bar.open : true;
  return (
    <div className="legend">
      <div>
        {th.showSymbol && (
          <>
            <b>{spec.id}</b> <span>{spec.name}</span> <span>·</span>{' '}
          </>
        )}
        <span>
          {ti.label}
          {th.showSource ? ` · ${sourceText} bid${c.d?.ask ? ' (ask ayrı)' : ''}` : ''} · NY saati
        </span>
      </div>
      {info && (th.showOhlc || th.showChange) && (
        <div className="ohlc">
          <span className="muted">{barLabel(info.utc, info.bar.time, ti.intraday)}</span>
          {th.showOhlc && (
            <>
              <span>
                O<b className={up ? 'pos' : 'neg'}>{fmtPrice(info.bar.open, spec)}</b>
              </span>
              <span>
                H<b className={up ? 'pos' : 'neg'}>{fmtPrice(info.bar.high, spec)}</b>
              </span>
              <span>
                L<b className={up ? 'pos' : 'neg'}>{fmtPrice(info.bar.low, spec)}</b>
              </span>
              <span>
                C<b className={up ? 'pos' : 'neg'}>{fmtPrice(info.bar.close, spec)}</b>
              </span>
            </>
          )}
          {th.showChange && info.prevClose != null && (
            <span className={info.bar.close >= info.prevClose ? 'pos' : 'neg'}>
              {info.bar.close - info.prevClose >= 0 ? '+' : ''}
              {fmtPrice(info.bar.close - info.prevClose, spec)} ({(((info.bar.close - info.prevClose) / info.prevClose) * 100).toFixed(2)}%)
            </span>
          )}
          <span className="muted">
            {info.end - info.start} adet 1m{!info.complete ? ' · oluşuyor' : ''}
          </span>
          {info.filled > 0 && <span className="warn">{info.filled} dk Dukascopy dolgusu</span>}
        </div>
      )}
    </div>
  );
}
