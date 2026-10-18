import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { getSymbol } from '../../../shared/symbols.js';
import { hasReview, mistakeBreakdown, NO_MISTAKE, reviewSummary } from '../../core/review';
import { breakdown, computeStats, sessionOf, SESSIONS, weekdayOf, WEEKDAYS, closedTrades, type BreakdownRow, type EquityPoint } from '../../core/stats';
import { chronologyIssue, entryTime, EXECUTION_MODEL, type Trade } from '../../core/trading';
import { ACCOUNT_GROUPS, presetOf, type Account } from '../../core/account';
import { describeRules } from '../session/SessionScreen';
import { flagLabel, fmtMoney, fmtNy, fmtPrice, fmtR, reasonLabel } from '../../lib/format';
import { shotUrl } from '../../lib/shots';
import { editReview, setTradeNote, useStore } from '../../store';
import { Icons } from '../common/icons';

/** Performans ve işlem günlüğü (FX Replay "Analytics / Journal" benzeri). */
export function PerformancePage() {
  const open = useStore((s) => s.perfOpen);
  const session = useStore((s) => s.session);
  const [lightbox, setLightbox] = useState<string | null>(null);
  const stats = useMemo(() => (session ? computeStats(session.trades, session.initialBalance) : null), [session]);

  useEffect(() => {
    if (!open) return;
    const k = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (lightbox) setLightbox(null);
      else useStore.setState({ perfOpen: false });
    };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [open, lightbox]);

  if (!open || !session || !stats) return null;
  const close = () => useStore.setState({ perfOpen: false });
  const trades = session.trades;
  const journal = [...closedTrades(trades)].reverse();
  const mistakes = mistakeBreakdown(trades);
  const rs = reviewSummary(trades);
  const balanceAfter = new Map(stats.equity.map((p, i) => [journal[journal.length - 1 - i]?.id, p.balance]));

  return (
    <div className="perf">
      <div className="perf-head">
        <div>
          <h1>Performans ve günlük</h1>
          <span className="muted">
            {session.name} · {fmtNy(session.startTime, false)} → {fmtNy(session.replayTime, false)} · başlangıç {fmtMoney(session.initialBalance)}
          </span>
        </div>
        <button className="icon-btn" title="Kapat (Esc)" onClick={close}>
          <Icons.close />
        </button>
      </div>

      <ModelNotes session={session} />

      {stats.trades === 0 ? (
        <div className="empty">Henüz kapanmış işlem yok. İşlem açıp kapattıkça burada istatistikler ve giriş/çıkış ekran görüntüleri birikir.</div>
      ) : (
        <div className="perf-body">
          <section className="tiles">
            <Tile label="Net kâr / zarar" value={fmtMoney(stats.net, true)} sub={`${stats.netPct >= 0 ? '+' : ''}${stats.netPct.toFixed(2)}%`} tone={stats.net >= 0 ? 'pos' : 'neg'} hero />
            {stats.commission > 0 && <Tile label="Komisyon" value={fmtMoney(-stats.commission)} sub={`brüt ${fmtMoney(stats.grossNet, true)} → net ${fmtMoney(stats.net, true)}`} tone="neg" />}
            <Tile label="İşlem" value={String(stats.trades)} sub={`${stats.wins} W · ${stats.losses} L · ${stats.bes} BE`} />
            <Tile label="Kazanma oranı" value={`${stats.winRate.toFixed(1)}%`} sub={`seri: ${stats.maxWinStreak} kazanç / ${stats.maxLossStreak} kayıp`} />
            <Tile label="Toplam R" value={fmtR(stats.totalR)} sub={`ortalama ${fmtR(stats.avgR)} / işlem`} tone={stats.totalR >= 0 ? 'pos' : 'neg'} />
            <Tile label="Profit factor" value={stats.profitFactor == null ? '—' : stats.profitFactor.toFixed(2)} sub={`ort. kazanç ${fmtR(stats.avgWinR)} · ort. kayıp ${fmtR(stats.avgLossR)}`} />
            <Tile label="Maks. düşüş (bakiye)" value={fmtMoney(-stats.maxDrawdown)} sub={`${stats.maxDrawdownPct.toFixed(2)}% zirveden · yalnızca kapanmış işlemler`} tone={stats.maxDrawdown > 0 ? 'neg' : undefined} />
            <Tile label="En iyi / en kötü" value={fmtMoney(stats.largestWin, true)} sub={`en kötü ${fmtMoney(stats.largestLoss, true)}`} />
            <Tile label="Ort. süre" value={stats.avgHoldMin == null ? '—' : fmtHold(stats.avgHoldMin)} sub="girişten çıkışa" />
          </section>

          {session.account && <AccountCard account={session.account} initial={session.initialBalance} />}

          <section className="card">
            <h2>Bakiye eğrisi</h2>
            <p className="hint">İşlem sırasına göre, her kapanan işlemden sonraki bakiye. Üzerine gelince işlem ayrıntısı.</p>
            <EquityChart points={stats.equity} initial={session.initialBalance} />
          </section>

          <section className="breakdowns">
            <BreakdownTable title="Sembol" rows={breakdown(trades, (t) => t.symbol)} />
            <BreakdownTable title="Yön" rows={breakdown(trades, (t) => (t.side === 'long' ? 'Long' : 'Short'), ['Long', 'Short'])} />
            <BreakdownTable title="Giriş seansı (NY saati)" rows={breakdown(trades, (t) => sessionOf(entryTime(t)), SESSIONS)} />
            <BreakdownTable title="Gün (NY)" rows={breakdown(trades, (t) => weekdayOf(entryTime(t)), WEEKDAYS)} />
            {mistakes.length > 0 && <BreakdownTable title="Hatalar (kendi değerlendirmen)" rows={mistakes} />}
          </section>
          {rs.closed > 0 && (
            <p className="hint">
              Değerlendirilen işlem: {rs.reviewed} / {rs.closed}
              {rs.avgRating != null ? ` · ortalama kalite ${rs.avgRating.toFixed(1)} / 5` : ''}. İşlem kapanınca açılan pencereyi atladıysan, aşağıdaki günlükten "Değerlendir" ile doldurabilirsin.
            </p>
          )}

          <section className="card">
            <h2>İşlem günlüğü</h2>
            <div className="journal">
              {journal.map((t, i) => (
                <JournalEntry key={t.id} trade={t} n={journal.length - i} balance={balanceAfter.get(t.id)} sessionId={session.id} onZoom={setLightbox} />
              ))}
            </div>
          </section>
        </div>
      )}

      {lightbox && (
        <div className="lightbox" onClick={() => setLightbox(null)}>
          <img src={lightbox} alt="İşlem ekran görüntüsü" />
        </div>
      )}
    </div>
  );
}

/** Hangi modelle ölçüldüğü ve simüle EDİLMEYENLER: sonuçların kapsamı açıkça görünür. */
function ModelNotes({ session }: { session: NonNullable<ReturnType<typeof useStore.getState>['session']> }) {
  const bad = chronologyIssue(session.trades, session.replayTime);
  const v = session.executionModel ?? 1;
  // İşlem bazlı sürüm: eski oturumda devam edilince arşiv işlemleri eski, yeni kapanışlar güncel modelle hesaplanır.
  const counts = new Map<number, number>();
  for (const t of session.trades) if (t.status === 'closed') counts.set(t.model ?? v, (counts.get(t.model ?? v) ?? 0) + 1);
  const mixed = [...counts.entries()].sort((a, b) => a[0] - b[0]).map(([m, n]) => `v${m}: ${n} işlem`).join(' + ');
  return (
    <section className="card model-notes">
      <p className="hint">
        Yürütme modeli: oturum v{v} ile açıldı{mixed ? ` · kapanmış işlemler ${mixed}` : ''}
        {counts.size > 1 || v < EXECUTION_MODEL ? ` (güncel v${EXECUTION_MODEL}; eski işlemler yeniden hesaplanmaz, yeni kapanışlar güncel modelle hesaplanır)` : ''}. Komisyon: {session.commissionPerLot ? `${fmtMoney(session.commissionPerLot)} / lot, gidiş-dönüş` : 'yok'}. Simüle edilmeyenler: slippage, swap / gece taşıma maliyeti, margin kontrolü ve stop-out.
      </p>
      {bad != null && <p className="hint neg">Eski kronoloji tutarsız: replay zamanından sonraya ait işlem kaydı var ({fmtNy(bad)} NY); bakiye gelecekteki kapanışları içerir. Kayıtlar silinmedi; ölçüm için yeni oturum açın.</p>}
    </section>
  );
}

/** Hesap kuralları ve sonucu. */
function AccountCard({ account: a, initial }: { account: Account; initial: number }) {
  const st = a.state;
  const r = a.rules;
  const preset = presetOf(r);
  const status = st.status === 'failed' ? 'Patladı' : st.status === 'passed' ? 'Geçildi' : 'Devam ediyor';
  return (
    <section className="card">
      <h2>
        Hesap: {preset ? `${ACCOUNT_GROUPS.find((g) => g.id === preset.group)!.label} · ${preset.label}` : r.type === 'prop' ? 'Fon (özel kurallar)' : 'Kişisel (özel kurallar)'}{' '}
        <span className={`pill ${st.status === 'passed' ? 'win' : st.status === 'failed' ? 'loss' : 'be'}`}>{status}</span>
      </h2>
      <p className="hint">{describeRules(r, initial)}</p>
      {st.status !== 'active' && (
        <p>
          {st.reason}
          {st.statusAt ? ` · ${fmtNy(st.statusAt)} NY` : ''}
        </p>
      )}
      <div className="tiles">
        <Tile label="En büyük günlük kayıp" value={fmtMoney(-st.worstDailyLoss)} sub={`${((st.worstDailyLoss / initial) * 100).toFixed(2)}%${r.dailyLossPct != null ? ` · limit %${r.dailyLossPct}` : ''}`} tone={st.worstDailyLoss > 0 ? 'neg' : undefined} />
        <Tile label="En düşük equity" value={fmtMoney(st.minEquity)} sub={`${(((st.minEquity - initial) / initial) * 100).toFixed(2)}% başlangıca göre`} />
        <Tile label="İşlem günü" value={String(st.tradingDays.length)} sub={r.minTradingDays ? `en az ${r.minTradingDays} gerekli` : 'şart yok'} />
        {st.ddClose && <Tile label="Maks. düşüş (equity, dakika sonu)" value={fmtMoney(-st.ddClose.abs)} sub={`en büyük %${st.ddClose.pct.toFixed(2)} · açık P&L dahil, her dakika kapanışında ölçülür`} tone={st.ddClose.abs > 0 ? 'neg' : undefined} />}
        {st.ddLow && <Tile label="Maks. düşüş (equity, mum içi muhafazakâr tahmin)" value={fmtMoney(-st.ddLow.abs)} sub={`en büyük %${st.ddLow.pct.toFixed(2)} · aynı sembol ortak fiyatla, farklı semboller bağımsız alt sınır; aynı dakikada TP ile kapananların olası dibi dahil değil`} tone={st.ddLow.abs > 0 ? 'neg' : undefined} />}
      </div>
      {st.equityMetricsSince != null && <p className="hint">Equity metrikleri {fmtNy(st.equityMetricsSince)} NY'den itibaren ölçülür; öncesi (eski oturumlar) ölçülmemiştir.</p>}
      {st.status === 'passed' && st.warnings?.length ? <p className="hint amb">Geçildi, ancak belirsiz mum uyarıları var: sonuç kesin olarak doğrulanamadı (aşağıya bakın).</p> : null}
      {st.warnings?.length ? (
        <ul className="hint amb">
          {st.warnings.map((w, i) => (
            <li key={i}>
              {fmtNy(w.t)} NY · {w.text}
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}

function fmtHold(min: number) {
  if (min < 60) return `${Math.round(min)} dk`;
  if (min < 60 * 24) return `${Math.floor(min / 60)}sa ${Math.round(min % 60)}dk`;
  return `${(min / 60 / 24).toFixed(1)} gün`;
}

function Tile({ label, value, sub, tone, hero }: { label: string; value: string; sub?: string; tone?: 'pos' | 'neg'; hero?: boolean }) {
  return (
    <div className={`tile ${hero ? 'hero' : ''}`}>
      <span className="tile-label">{label}</span>
      <span className={`tile-value ${tone ?? ''}`}>{value}</span>
      {sub && <span className="tile-sub">{sub}</span>}
    </div>
  );
}

function BreakdownTable({ title, rows }: { title: string; rows: BreakdownRow[] }) {
  return (
    <div className="card">
      <h2>{title}</h2>
      <table>
        <thead>
          <tr>
            <th />
            <th>İşlem</th>
            <th>Kazanma</th>
            <th>R</th>
            <th>Net</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.key}>
              <td>{r.key}</td>
              <td>{r.trades}</td>
              <td>{r.winRate.toFixed(0)}%</td>
              <td className={r.totalR >= 0 ? 'pos' : 'neg'}>{fmtR(r.totalR)}</td>
              <td className={r.net >= 0 ? 'pos' : 'neg'}>{fmtMoney(r.net, true)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ReviewBlock({ t }: { t: Trade }) {
  const r = t.review;
  if (!r || !hasReview(t)) return null;
  return (
    <div className="rv-block">
      {r.rating ? <span className="warn">{'★'.repeat(r.rating)}{'☆'.repeat(5 - r.rating)}</span> : null}
      {r.reason && (
        <div>
          <b>Giriş nedeni:</b> {r.reason}
        </div>
      )}
      {r.mistakes.length > 0 && (
        <div className="rv-tags">
          {r.mistakes.map((m) => (
            <span key={m} className={`rv-tag ${m === NO_MISTAKE ? 'ok' : ''}`}>
              {m}
            </span>
          ))}
        </div>
      )}
      {r.mistakeText && (
        <div>
          <b>Hatalarım:</b> {r.mistakeText}
        </div>
      )}
      {r.lesson && (
        <div>
          <b>Ders:</b> {r.lesson}
        </div>
      )}
    </div>
  );
}

function JournalEntry({ trade: t, n, balance, sessionId, onZoom }: { trade: Trade; n: number; balance?: number; sessionId: string; onZoom: (url: string) => void }) {
  const spec = getSymbol(t.symbol);
  const [note, setNote] = useState(t.note ?? '');
  useEffect(() => setNote(t.note ?? ''), [t.note]);
  const shot = (kind: 'open' | 'close', label: string) => {
    const name = t.shots?.[kind];
    return (
      <figure className="shot">
        {name ? <img src={shotUrl(sessionId, name)} alt={`${label} ekran görüntüsü`} loading="lazy" onClick={() => onZoom(shotUrl(sessionId, name))} /> : <div className="shot-missing">görüntü yok</div>}
        <figcaption>{label}</figcaption>
      </figure>
    );
  };
  return (
    <article className="entry">
      <header>
        <span className="muted">#{n}</span>
        <b>{t.symbol}</b>
        <span className={t.side === 'long' ? 'pos' : 'neg'}>{t.side === 'long' ? 'Long' : 'Short'}</span>
        <span className="muted">
          {t.openedAt ? fmtNy(entryTime(t)) : '—'} → {t.closedAt ? fmtNy(t.closedAt) : '—'} NY
        </span>
        <span className="spacer" />
        <button className="btn small ghost" onClick={() => editReview(t.id)} title="İşlem değerlendirmesini aç">
          {hasReview(t) ? 'Değerlendirmeyi düzenle' : 'Değerlendir'}
        </button>
        <span className={`pill ${t.result}`}>{t.result === 'win' ? 'Win' : t.result === 'loss' ? 'Loss' : 'BE'}</span>
        <b className={(t.pnl ?? 0) >= 0 ? 'pos' : 'neg'}>{fmtMoney(t.pnl ?? 0, true)}</b>
        <b className={(t.r ?? 0) >= 0 ? 'pos' : 'neg'}>{fmtR(t.r)}</b>
      </header>
      <div className="entry-meta muted">
        Giriş {fmtPrice(t.entry, spec)} · SL {t.initialSl != null ? fmtPrice(t.initialSl, spec) : '—'} · TP {t.tp != null ? fmtPrice(t.tp, spec) : '—'} · Çıkış {t.exit != null ? fmtPrice(t.exit, spec) : '—'} (
        {reasonLabel(t.exitReason)}) · {t.lots} lot{t.commission ? ` · komisyon ${fmtMoney(-t.commission)} (brüt ${fmtMoney(t.grossPnl ?? 0, true)})` : ''}{balance != null ? ` · bakiye ${fmtMoney(balance)}` : ''}
        {t.flags?.length ? (
          <span className="amb" title={t.flags.map(flagLabel).join('\n')}>
            {' '}
            · ⚠ mum içi sıra varsayımı
          </span>
        ) : null}
      </div>
      <ReviewBlock t={t} />
      <div className="entry-body">
        {shot('open', 'Giriş')}
        {shot('close', 'Çıkış')}
        <textarea
          className="note"
          placeholder="Not: setup, neden girdim, ne öğrendim…"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          onBlur={() => note !== (t.note ?? '') && setTradeNote(t.id, note)}
          onKeyDown={(e) => e.stopPropagation()}
        />
      </div>
    </article>
  );
}

/** Tek serili bakiye eğrisi (SVG): 2px çizgi, sönük grid, imleç + tooltip. */
function EquityChart({ points, initial }: { points: EquityPoint[]; initial: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(800);
  const [hover, setHover] = useState<number | null>(null);
  useLayoutEffect(() => {
    const el = ref.current!;
    const ro = new ResizeObserver(() => setW(el.clientWidth));
    ro.observe(el);
    setW(el.clientWidth);
    return () => ro.disconnect();
  }, []);

  const H = 240;
  const pad = { l: 70, r: 16, t: 12, b: 28 };
  const series = [{ n: 0, balance: initial } as EquityPoint, ...points];
  const ys = series.map((p) => p.balance);
  let min = Math.min(...ys);
  let max = Math.max(...ys);
  if (max - min < 1) {
    max += 1;
    min -= 1;
  }
  const span = max - min;
  min -= span * 0.08;
  max += span * 0.08;
  const iw = Math.max(10, w - pad.l - pad.r);
  const ih = H - pad.t - pad.b;
  const x = (i: number) => pad.l + (series.length > 1 ? (i / (series.length - 1)) * iw : iw / 2);
  const y = (v: number) => pad.t + (1 - (v - min) / (max - min)) * ih;
  const ticks = niceTicks(min, max, 4);
  const xTicks = Array.from(new Set([0, Math.round((series.length - 1) / 2), series.length - 1]));
  const path = series.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p.balance).toFixed(1)}`).join('');
  const hp = hover != null ? series[hover] : null;

  const onMove = (e: React.MouseEvent) => {
    const r = ref.current!.getBoundingClientRect();
    const px = e.clientX - r.left - pad.l;
    const i = Math.round((px / iw) * (series.length - 1));
    setHover(Math.max(0, Math.min(series.length - 1, i)));
  };

  return (
    <div className="equity" ref={ref} onMouseMove={onMove} onMouseLeave={() => setHover(null)}>
      <svg width={w} height={H} role="img" aria-label="Bakiye eğrisi">
        {ticks.map((v) => (
          <g key={v}>
            <line x1={pad.l} x2={w - pad.r} y1={y(v)} y2={y(v)} className="grid" />
            <text x={pad.l - 8} y={y(v)} className="axis" textAnchor="end" dominantBaseline="middle">
              {fmtAxis(v)}
            </text>
          </g>
        ))}
        <line x1={pad.l} x2={w - pad.r} y1={y(initial)} y2={y(initial)} className="baseline" />
        {xTicks.map((i) => (
          <text key={i} x={x(i)} y={H - 8} className="axis" textAnchor={i === 0 ? 'start' : i === series.length - 1 ? 'end' : 'middle'}>
            {i === 0 ? 'başlangıç' : `#${i}`}
          </text>
        ))}
        <path d={path} className="eq-line" />
        <circle cx={x(series.length - 1)} cy={y(series[series.length - 1].balance)} r={4} className="eq-dot" />
        {hp && (
          <>
            <line x1={x(hover!)} x2={x(hover!)} y1={pad.t} y2={pad.t + ih} className="crosshair" />
            <circle cx={x(hover!)} cy={y(hp.balance)} r={5} className="eq-dot" />
          </>
        )}
      </svg>
      {hp && (
        <div className="eq-tip" style={{ left: Math.min(Math.max(x(hover!) + 12, 0), w - 230), top: Math.max(0, y(hp.balance) - 70) }}>
          {hover === 0 ? (
            <div>Başlangıç bakiyesi</div>
          ) : (
            <>
              <div className="muted">
                #{hp.n} · {hp.symbol} · {fmtNy(hp.t)} NY
              </div>
              <div className={hp.pnl >= 0 ? 'pos' : 'neg'}>
                {fmtMoney(hp.pnl, true)} ({fmtR(hp.r)})
              </div>
            </>
          )}
          <div>
            Bakiye <b>{fmtMoney(hp.balance)}</b>
          </div>
        </div>
      )}
    </div>
  );
}

function fmtAxis(v: number) {
  return `$${Math.round(v).toLocaleString('en-US')}`;
}

function niceTicks(min: number, max: number, count: number) {
  const step0 = (max - min) / count;
  const mag = 10 ** Math.floor(Math.log10(step0));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= step0) ?? step0;
  const out: number[] = [];
  for (let v = Math.ceil(min / step) * step; v <= max; v += step) out.push(Math.round(v * 100) / 100);
  return out;
}
