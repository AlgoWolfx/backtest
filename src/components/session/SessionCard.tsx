import { computeStats, type PerfStats } from '../../core/stats';
import { fmtMoney, fmtNy, fmtR } from '../../lib/format';
import { deleteSession, openSession, type SessionSummary } from '../../store';
import { Icons } from '../common/icons';

const pct = (v: number) => `%${v.toFixed(0)}`; // winRate zaten yüzde (0-100)
const signCls = (v: number) => (v > 0 ? 'pos' : v < 0 ? 'neg' : '');

export const summaryStats = (s: SessionSummary): PerfStats => computeStats(s.closedTrades ?? [], s.initialBalance);

/** Bakiye eğrisi (işlem başına); en az 2 işlemde çizilir. */
function Sparkline({ initial, stats }: { initial: number; stats: PerfStats }) {
  const ys = [initial, ...stats.equity.map((e) => e.balance)];
  if (ys.length < 3) return <div className="sc-spark sc-spark-empty">{stats.trades ? 'Eğri için en az 2 işlem' : 'Henüz işlem yok'}</div>;
  const W = 280;
  const H = 56;
  const lo = Math.min(...ys);
  const hi = Math.max(...ys);
  const span = hi - lo || 1;
  const pts = ys.map((y, i) => `${((i / (ys.length - 1)) * W).toFixed(1)},${(H - 4 - ((y - lo) / span) * (H - 8)).toFixed(1)}`);
  const up = ys[ys.length - 1] >= initial;
  const base = (H - 4 - ((initial - lo) / span) * (H - 8)).toFixed(1);
  return (
    <svg className={`sc-spark ${up ? 'up' : 'down'}`} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" role="img" aria-label={`Bakiye eğrisi: ${fmtMoney(initial)} → ${fmtMoney(ys[ys.length - 1])}`}>
      <line x1="0" x2={W} y1={base} y2={base} className="sc-spark-base" />
      <polygon points={`0,${H} ${pts.join(' ')} ${W},${H}`} className="sc-spark-fill" />
      <polyline points={pts.join(' ')} className="sc-spark-line" />
    </svg>
  );
}

export function SessionCard({ s }: { s: SessionSummary }) {
  const st = summaryStats(s);
  const status = s.accountStatus && s.accountStatus !== 'active' ? s.accountStatus : null;
  const open = () => openSession(s.id);
  return (
    <article
      className="sc"
      role="button"
      tabIndex={0}
      aria-label={`${s.name} oturumunu aç`}
      onClick={open}
      onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), open())}
    >
      <header className="sc-head">
        <div className="sc-title">
          <b title={s.name}>{s.name}</b>
          <span className="sc-meta">
            <span className="sc-sym">{s.symbol}</span>
            {s.accountType === 'prop' ? 'Fon hesabı' : 'Kişisel'}
            {status && <span className={`pill ${status === 'passed' ? 'win' : 'loss'}`}>{status === 'passed' ? 'Geçti' : 'Patladı'}</span>}
          </span>
        </div>
        <button
          className="icon-btn sc-del"
          title="Oturumu sil"
          aria-label={`${s.name} oturumunu sil`}
          onClick={(e) => {
            e.stopPropagation();
            if (window.confirm(`"${s.name}" oturumu silinsin mi?`)) deleteSession(s.id);
          }}
          onKeyDown={(e) => e.stopPropagation()}
        >
          <Icons.trash />
        </button>
      </header>

      <div className="sc-net">
        <span className={`sc-net-v ${signCls(st.net)}`}>{fmtMoney(st.net, true)}</span>
        <span className={`sc-net-p ${signCls(st.net)}`}>
          {st.netPct >= 0 ? '+' : ''}
          {st.netPct.toFixed(2)}%
        </span>
        <span className="sc-bal">Bakiye {fmtMoney(s.balance)}</span>
      </div>

      <Sparkline initial={s.initialBalance} stats={st} />

      {st.trades > 0 && (
      <dl className="sc-stats">
        <div>
          <dt>Kazanma</dt>
          <dd>{st.trades ? pct(st.winRate) : '—'}</dd>
        </div>
        <div>
          <dt>İşlem</dt>
          <dd>
            {st.trades}
            {st.trades > 0 && (
              <small>
                {' · '}
                {st.wins}K {st.losses}Z
              </small>
            )}
          </dd>
        </div>
        <div>
          <dt>Toplam R</dt>
          <dd className={signCls(st.totalR)}>{st.trades ? fmtR(st.totalR) : '—'}</dd>
        </div>
        <div>
          <dt>Kâr faktörü</dt>
          <dd>{st.profitFactor == null ? '—' : Number.isFinite(st.profitFactor) ? st.profitFactor.toFixed(2) : '∞'}</dd>
        </div>
        <div>
          <dt>Ort. R</dt>
          <dd className={signCls(st.avgR ?? 0)}>{fmtR(st.avgR)}</dd>
        </div>
        <div>
          <dt>Maks. düşüş</dt>
          <dd className={st.maxDrawdownPct > 0 ? 'neg' : ''}>{st.trades ? `${st.maxDrawdownPct.toFixed(2)}%` : '—'}</dd>
        </div>
      </dl>
      )}

      <footer className="sc-foot">
        <span title="Replay zamanı (New York)">
          <Icons.calendar /> {fmtNy(s.replayTime)}
        </span>
        <span className="sc-open">Aç →</span>
      </footer>
    </article>
  );
}
