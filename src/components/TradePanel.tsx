import { useState } from 'react';
import { getSymbol } from '../../shared/symbols.js';
import { calcR, entryTime, liquidationPnl, type Trade } from '../core/trading';
import { fmtMoney, fmtNyShort, fmtPrice, fmtR, reasonLabel } from '../format';
import { closeTradeManual, exitPriceNow, setSymbol, useStore } from '../store';

const RESULT_LABEL = { win: 'Win', loss: 'Loss', be: 'BE' } as const;

export function TradePanel() {
  const session = useStore((s) => s.session);
  useStore((s) => s.data);
  const [tab, setTab] = useState<'open' | 'history'>('open');
  if (!session) return null;
  const active = session.trades.filter((t) => t.status === 'open' || t.status === 'pending');
  const closed = session.trades.filter((t) => t.status === 'closed').sort((a, b) => (b.closedAt ?? 0) - (a.closedAt ?? 0));

  const wins = closed.filter((t) => t.result === 'win').length;
  const losses = closed.filter((t) => t.result === 'loss').length;
  const bes = closed.length - wins - losses;
  const rs = closed.filter((t) => t.r != null).map((t) => t.r!);
  const totalR = rs.reduce((a, b) => a + b, 0);
  const net = closed.reduce((a, t) => a + (t.pnl ?? 0), 0);
  const grossWin = closed.reduce((a, t) => a + Math.max(0, t.pnl ?? 0), 0);
  const grossLoss = closed.reduce((a, t) => a + Math.min(0, t.pnl ?? 0), 0);

  return (
    <section className="trade-panel">
      <div className="panel-head">
        <button className={`tab ${tab === 'open' ? 'on' : ''}`} onClick={() => setTab('open')}>
          Pozisyonlar ({active.length})
        </button>
        <button className={`tab ${tab === 'history' ? 'on' : ''}`} onClick={() => setTab('history')}>
          Geçmiş ({closed.length})
        </button>
        <div className="stats">
          <span>
            İşlem <b>{closed.length}</b>
          </span>
          <span>
            W/L/BE <b>{wins}/{losses}/{bes}</b>
          </span>
          <span>
            Kazanma <b>{closed.length ? ((wins / closed.length) * 100).toFixed(1) : '0'}%</b>
          </span>
          <span>
            Toplam <b className={totalR >= 0 ? 'pos' : 'neg'}>{fmtR(totalR)}</b>
          </span>
          <span>
            Ort. <b>{rs.length ? fmtR(totalR / rs.length) : '—'}</b>
          </span>
          <span>
            PF <b>{grossLoss ? (grossWin / -grossLoss).toFixed(2) : '—'}</b>
          </span>
          <span>
            Net <b className={net >= 0 ? 'pos' : 'neg'}>{fmtMoney(net, true)}</b>
          </span>
        </div>
        <button className="btn small ghost" onClick={() => exportCsv(session.name, closed)} disabled={!closed.length}>
          CSV indir
        </button>
      </div>
      <div className="panel-body">{tab === 'open' ? <OpenTable trades={active} /> : <HistoryTable trades={closed} />}</div>
    </section>
  );
}

function goTo(t: Trade) {
  const s = useStore.getState().session;
  if (s && s.symbol !== t.symbol) setSymbol(t.symbol);
  if (t.drawingId) useStore.setState({ selectedId: t.drawingId });
}

function OpenTable({ trades }: { trades: Trade[] }) {
  if (!trades.length) return <div className="empty">Açık pozisyon veya bekleyen emir yok. Long/Short aracıyla çizip "Piyasa emri" veya alttaki Buy/Sell ile açabilirsiniz.</div>;
  return (
    <table>
      <thead>
        <tr>
          <th>Parite</th>
          <th>Yön</th>
          <th>Durum</th>
          <th>Açılış (NY)</th>
          <th>Lot</th>
          <th>Entry</th>
          <th>SL</th>
          <th>TP</th>
          <th>Anlık</th>
          <th>R</th>
          <th>K/Z</th>
          <th />
        </tr>
      </thead>
      <tbody>
        {trades.map((t) => {
          const spec = getSymbol(t.symbol);
          const px = exitPriceNow(t);
          const pnl = t.status === 'open' && px != null ? liquidationPnl(spec, t, px) : null;
          const r = t.status === 'open' && px != null ? calcR(t.side, t.entry, px, t.initialSl) : null;
          return (
            <tr key={t.id} onClick={() => goTo(t)}>
              <td>{t.symbol}</td>
              <td className={t.side === 'long' ? 'pos' : 'neg'}>{t.side === 'long' ? 'Long' : 'Short'}</td>
              <td>{t.status === 'open' ? 'Açık' : `Bekleyen ${t.orderType}`}</td>
              <td>{fmtNyShort(entryTime(t))}</td>
              <td>{t.lots}</td>
              <td>{fmtPrice(t.entry, spec)}</td>
              <td>{t.sl != null ? fmtPrice(t.sl, spec) : '—'}</td>
              <td>{t.tp != null ? fmtPrice(t.tp, spec) : '—'}</td>
              <td>{px != null ? fmtPrice(px, spec) : '—'}</td>
              <td>{fmtR(r)}</td>
              <td className={pnl == null ? '' : pnl >= 0 ? 'pos' : 'neg'}>{pnl == null ? '—' : fmtMoney(pnl, true)}</td>
              <td>
                <button
                  className="btn small danger"
                  onClick={(e) => {
                    e.stopPropagation();
                    closeTradeManual(t.id);
                  }}
                >
                  {t.status === 'open' ? 'Kapat' : 'İptal'}
                </button>
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function HistoryTable({ trades }: { trades: Trade[] }) {
  if (!trades.length) return <div className="empty">Henüz kapanmış işlem yok.</div>;
  return (
    <table>
      <thead>
        <tr>
          <th>Parite</th>
          <th>Yön</th>
          <th>Açılış (NY)</th>
          <th>Kapanış (NY)</th>
          <th>Lot</th>
          <th>Entry</th>
          <th>SL</th>
          <th>TP</th>
          <th>Çıkış</th>
          <th>Neden</th>
          <th>R</th>
          <th>K/Z</th>
          <th>Sonuç</th>
        </tr>
      </thead>
      <tbody>
        {trades.map((t) => {
          const spec = getSymbol(t.symbol);
          return (
            <tr key={t.id} onClick={() => goTo(t)}>
              <td>{t.symbol}</td>
              <td className={t.side === 'long' ? 'pos' : 'neg'}>{t.side === 'long' ? 'Long' : 'Short'}</td>
              <td>{t.openedAt ? fmtNyShort(entryTime(t)) : '—'}</td>
              <td>{t.closedAt ? fmtNyShort(t.closedAt) : '—'}</td>
              <td>{t.lots}</td>
              <td>{fmtPrice(t.entry, spec)}</td>
              <td>{t.initialSl != null ? fmtPrice(t.initialSl, spec) : '—'}</td>
              <td>{t.tp != null ? fmtPrice(t.tp, spec) : '—'}</td>
              <td>{t.exit != null ? fmtPrice(t.exit, spec) : '—'}</td>
              <td>{reasonLabel(t.exitReason)}</td>
              <td className={(t.r ?? 0) >= 0 ? 'pos' : 'neg'}>{fmtR(t.r)}</td>
              <td className={(t.pnl ?? 0) >= 0 ? 'pos' : 'neg'}>{fmtMoney(t.pnl ?? 0, true)}</td>
              <td>
                <span className={`pill ${t.result}`}>{t.result ? RESULT_LABEL[t.result] : '—'}</span>
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function exportCsv(name: string, trades: Trade[]) {
  const head = ['parite', 'yon', 'acilis_ny', 'kapanis_ny', 'lot', 'entry', 'sl', 'tp', 'cikis', 'neden', 'r', 'kz_usd', 'sonuc', 'komisyon_usd', 'brut_kz_usd', 'mum_ici_varsayim'];
  const rows = [...trades].reverse().map((t) => [
    t.symbol,
    t.side,
    t.openedAt ? fmtNyShort(entryTime(t)) : '',
    t.closedAt ? fmtNyShort(t.closedAt) : '',
    t.lots,
    t.entry,
    t.initialSl ?? '',
    t.tp ?? '',
    t.exit ?? '',
    t.exitReason ?? '',
    t.r != null ? t.r.toFixed(3) : '',
    (t.pnl ?? 0).toFixed(2),
    t.result ?? '',
    (t.commission ?? 0).toFixed(2),
    (t.grossPnl ?? t.pnl ?? 0).toFixed(2),
    (t.flags ?? []).join('|'),
  ]);
  const csv = [head, ...rows].map((r) => r.join(',')).join('\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
  a.download = `${name.replace(/[^\w-]+/g, '_')}_islemler.csv`;
  a.click();
  URL.revokeObjectURL(a.href);
}
