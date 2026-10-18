import { getSymbol } from '../../../shared/symbols.js';
import { chartRef } from '../../chart/chartRef';
import { sourceName } from '../../core/data';
import { tfInfo } from '../../core/timeframes';
import { downloadCsv } from '../../lib/csv';
import { fmtNy, fmtNyShort, fmtPrice, fmtShifted } from '../../lib/format';
import { useStore } from '../../store';
import { Modal } from '../common/Modal';

export function exportVisible() {
  const c = chartRef.current;
  const s = useStore.getState().session;
  if (!c || !s) return;
  const spec = getSymbol(s.symbol);
  const ti = tfInfo(s.tf);
  const rows = c.visibleBars().map((b) => [
    ti.intraday ? fmtNyShort(b.utc) : fmtShifted(b.bar.time, false),
    new Date(b.utc * 1000).toISOString().slice(0, 16).replace('T', ' '),
    fmtPrice(b.bar.open, spec),
    fmtPrice(b.bar.high, spec),
    fmtPrice(b.bar.low, spec),
    fmtPrice(b.bar.close, spec),
    b.end - b.start,
    b.filled,
    b.complete ? '' : 'olusuyor',
  ]);
  downloadCsv(`${s.symbol}_${ti.label}_${rows[0]?.[0] ?? ''}.csv`.replace(/[^\w.-]+/g, '_'), ['zaman_ny', 'zaman_utc', 'open', 'high', 'low', 'close', 'm1_adet', 'dukascopy_dk', 'durum'], rows);
}

/** Bir mumu oluşturan 1m mumları gösterir (yalnızca açıklanmış olanlar). */
export function BarInspector({ L, onClose }: { L: number; onClose: () => void }) {
  const c = chartRef.current;
  const s = useStore((st) => st.session);
  if (!c || !s || !c.d) return null;
  const info = c.barInfo(L);
  if (!info) return null;
  const d = c.d;
  const spec = getSymbol(s.symbol);
  const ti = tfInfo(s.tf);
  const rows: { t: number; o: number; h: number; l: number; c: number; src: number }[] = [];
  for (let i = info.start; i < info.end; i++) rows.push({ t: d.t[i], o: d.o[i] / d.scale, h: d.h[i] / d.scale, l: d.l[i] / d.scale, c: d.c[i] / d.scale, src: d.src[i] });
  const hiRow = rows.reduce((a, r) => (r.h > a.h ? r : a), rows[0]);
  const loRow = rows.reduce((a, r) => (r.l < a.l ? r : a), rows[0]);
  const csv = () =>
    downloadCsv(
      `${s.symbol}_${ti.label}_${fmtNyShort(info.utc)}_1m.csv`.replace(/[^\w.-]+/g, '_'),
      ['zaman_ny', 'zaman_utc', 'open', 'high', 'low', 'close', 'kaynak'],
      rows.map((r) => [fmtNyShort(r.t), new Date(r.t * 1000).toISOString().slice(0, 16).replace('T', ' '), fmtPrice(r.o, spec), fmtPrice(r.h, spec), fmtPrice(r.l, spec), fmtPrice(r.c, spec), sourceName(d, r.src)]),
    );
  const shown = rows.slice(0, 1500);
  return (
    <Modal title={`${s.symbol} ${ti.label} mum — kaynak verisi`} onClose={onClose} wkey="candle" width={640}>
      <div className="inspect-head">
        <div>
          Başlangıç: <b>{fmtNy(info.utc)} NY</b> <span className="muted">({new Date(info.utc * 1000).toISOString().slice(0, 16).replace('T', ' ')} UTC)</span>
        </div>
        <div>
          O <b>{fmtPrice(info.bar.open, spec)}</b> · H <b>{fmtPrice(info.bar.high, spec)}</b> ({fmtNyShort(hiRow.t).slice(11)}) · L <b>{fmtPrice(info.bar.low, spec)}</b> ({fmtNyShort(loRow.t).slice(11)}) · C{' '}
          <b>{fmtPrice(info.bar.close, spec)}</b>
        </div>
        <div className="muted">
          {rows.length} adet 1m mum{ti.intraday && ti.seconds <= 4 * 3600 ? ` (en fazla ${ti.seconds / 60})` : ''}
          {!info.complete && ' · mum henüz oluşuyor, sonraki dakikalar gösterilmez'}
          {info.filled > 0 && ` · ${info.filled} dakika Dukascopy dolgusu`}
          . Fiyatlar bid. Diğer platformlar farklı fiyat akışı kullanıyorsa fitillerde küçük farklar normaldir.
        </div>
      </div>
      <div className="inspect-table">
        <table>
          <thead>
            <tr>
              <th>Zaman (NY)</th>
              <th>Open</th>
              <th>High</th>
              <th>Low</th>
              <th>Close</th>
              <th>Kaynak</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((r) => (
              <tr key={r.t}>
                <td>{fmtNyShort(r.t).slice(5)}</td>
                <td>{fmtPrice(r.o, spec)}</td>
                <td className={r === hiRow ? 'pos' : ''}>{fmtPrice(r.h, spec)}</td>
                <td className={r === loRow ? 'neg' : ''}>{fmtPrice(r.l, spec)}</td>
                <td>{fmtPrice(r.c, spec)}</td>
                <td className={r.src ? 'warn' : 'muted'}>{sourceName(d, r.src)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length > shown.length && <div className="empty">İlk {shown.length} satır gösteriliyor; tamamı için CSV indirin.</div>}
      </div>
      <div className="modal-foot">
        <div className="spacer" />
        <button className="btn" onClick={csv}>
          1m verisini CSV indir
        </button>
        <button className="btn primary" onClick={onClose}>
          Kapat
        </button>
      </div>
    </Modal>
  );
}
