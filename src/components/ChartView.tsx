import { useEffect, useMemo, useRef, useState } from 'react';
import type { MouseEventParams, Time } from 'lightweight-charts';
import { getSymbol } from '../../shared/symbols.js';
import { ChartController } from '../chart/ChartController';
import { chartRef, paneControllers } from '../chartRef';
import { revealedCount, sourceLabel, sourceName, type M1Data } from '../core/data';
import { tfInfo } from '../core/timeframes';
import { downloadCsv } from '../csv';
import { fmtNy, fmtNyShort, fmtPrice, fmtShifted } from '../format';
import { activatePane, cloneDrawing, deleteDrawing, drawingsOf, hasClipboard, paneCfg, pasteClipboard, reorderDrawing, setChartTheme, setSplits, toggleMaxPane, updateDrawing, useStore } from '../store';
import type { ChartTheme } from '../chartTheme';
import { LAYOUTS } from '../core/types';
import { dragSplit, layoutGeometry, type PaneRect, type SplitterGeom } from '../core/layouts';
import { broadcastCrosshair, broadcastRange } from '../chart/paneSync';
import { DrawingToolbar } from './DrawingToolbar';
import { AccountMeters } from './Bars';
import { Modal } from './Dialogs';

const FULL: PaneRect = { x: 0, y: 0, w: 1, h: 1 };

/** Çoklu ekran düzenine göre grafikleri yerleştirir; aralarındaki bölücüler sürüklenerek boyutlandırılır. */
export function ChartArea() {
  const layout = useStore((s) => s.session?.layout ?? '1');
  const splits = useStore((s) => s.session?.splits);
  const maxPane = useStore((s) => (s.maxPane != null && s.maxPane < LAYOUTS[s.session?.layout ?? '1'].count ? s.maxPane : null));
  const geo = useMemo(() => layoutGeometry(layout, splits), [layout, splits]);
  return (
    <div className={`chart-area layout-${layout} ${maxPane != null ? 'has-max' : ''}`}>
      {geo.panes.map((r, i) => (
        <ChartView key={i} pane={i} rect={maxPane == null ? r : i === maxPane ? FULL : null} />
      ))}
      {maxPane == null && geo.splitters.map((g) => <Splitter key={`${g.path}:${g.index}`} g={g} />)}
    </div>
  );
}

/** İki ekran arasındaki sürüklenebilir bölücü (çift tık: bu bölünmenin oranlarını varsayılana döndür). */
function Splitter({ g }: { g: SplitterGeom }) {
  const [drag, setDrag] = useState(false);
  const row = g.dir === 'row'; // satır: ekranlar yan yana, bölücü dikey çizgi
  const move = (e: React.PointerEvent<HTMLDivElement>) => {
    const r = e.currentTarget.parentElement!.getBoundingClientRect();
    const p = row ? (e.clientX - r.left) / r.width : (e.clientY - r.top) / r.height;
    setSplits(g.path, dragSplit(g.ratios, g.index, (p - g.nodeStart) / g.nodeLen));
  };
  const style: React.CSSProperties = row
    ? { left: `${g.at * 100}%`, top: `${g.from * 100}%`, height: `${(g.to - g.from) * 100}%` }
    : { top: `${g.at * 100}%`, left: `${g.from * 100}%`, width: `${(g.to - g.from) * 100}%` };
  return (
    <div
      className={`splitter splitter-${row ? 'x' : 'y'} ${drag ? 'drag' : ''}`}
      style={style}
      title="Sürükle: grafik boyutunu ayarla · Çift tık: sıfırla"
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId);
        setDrag(true);
      }}
      onPointerMove={(e) => drag && move(e)}
      onPointerUp={() => setDrag(false)}
      onPointerCancel={() => setDrag(false)}
      onDoubleClick={() => setSplits(g.path, null)}
    />
  );
}

export function ChartView({ pane, rect }: { pane: number; rect: PaneRect | null }) {
  const ref = useRef<HTMLDivElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const loading = useStore((s) => s.loading);
  const multi = useStore((s) => LAYOUTS[s.session?.layout ?? '1'].count > 1);
  const isActive = useStore((s) => (s.session?.active ?? 0) === pane);
  const isMax = useStore((s) => s.maxPane === pane);
  const [c, setC] = useState<ChartController | null>(null);
  const [menu, setMenu] = useState<{ x: number; y: number; L: number | null; drawingId?: string } | null>(null);
  const [inspectL, setInspectL] = useState<number | null>(null);
  const [scrolledAway, setScrolledAway] = useState(false);

  useEffect(() => {
    const c = new ChartController(ref.current!, pane);
    paneControllers.set(pane, c);
    c.onCrosshair = (utc, price) => broadcastCrosshair(c, utc, price);
    c.onUserRange = () => broadcastRange(c);
    let prev: { sessionId: string; symbol: string; tf: string; replayTime: number; data: M1Data | null } = { sessionId: '', symbol: '', tf: '', replayTime: 0, data: null };
    const sync = () => {
      const st = useStore.getState();
      const s = st.session;
      if (!s) return;
      const cfg = paneCfg(s, pane);
      const d = st.data[cfg.symbol];
      if (!d) return;
      if (s.id !== prev.sessionId || cfg.symbol !== prev.symbol || cfg.tf !== prev.tf || d !== prev.data) {
        c.setContext(d, getSymbol(cfg.symbol), cfg.tf, s.replayTime, s.id === prev.sessionId);
      } else if (s.replayTime !== prev.replayTime) {
        c.updateReplay(s.replayTime);
      } else {
        c.layer.requestUpdate();
      }
      prev = { sessionId: s.id, symbol: cfg.symbol, tf: cfg.tf, replayTime: s.replayTime, data: d };
    };
    sync();
    let theme = useStore.getState().chartTheme;
    const unsub = useStore.subscribe((st) => {
      if (st.chartTheme !== theme) {
        theme = st.chartTheme;
        c.applyTheme(theme);
      }
      sync();
    });
    const onRange = () => {
      const r = c.chart.timeScale().getVisibleLogicalRange();
      setScrolledAway(!!r && c.lastK >= 0 && r.to < c.lastK - c.winStart - 2);
    };
    c.chart.timeScale().subscribeVisibleLogicalRangeChange(onRange);
    const onContext = (e: MouseEvent) => {
      e.preventDefault();
      const rect = c.el.getBoundingClientRect();
      const lx = e.clientX - rect.left;
      const ly = e.clientY - rect.top;
      // Bir çizimin üstünde sağ tık: çizim menüsü (TradingView gibi)
      const hit = c.layer.hitTestAt(lx, ly);
      if (hit) useStore.setState({ selectedId: hit.id });
      setMenu({ x: lx, y: ly, L: c.xToLogical(lx), drawingId: hit?.id });
    };
    c.el.addEventListener('contextmenu', onContext);
    // Tıklanan grafik, çizim araçları olayı işlemeden önce aktif olur (yakalama aşaması).
    const wrap = wrapRef.current!;
    const activate = () => activatePane(pane);
    wrap.addEventListener('mousedown', activate, true);
    setC(c);
    return () => {
      unsub();
      wrap.removeEventListener('mousedown', activate, true);
      c.el.removeEventListener('contextmenu', onContext);
      if (paneControllers.get(pane) === c) paneControllers.delete(pane);
      c.destroy();
    };
  }, [pane]);

  const bg = useStore((s) => s.chartTheme.background);
  const th = useStore((s) => s.chartTheme);
  const cfgSymbol = useStore((s) => (s.session ? paneCfg(s.session, pane).symbol : null));
  const cfgTf = useStore((s) => (s.session ? paneCfg(s.session, pane).tf : null));
  const [autoOn, setAutoOn] = useState(true);
  useEffect(() => {
    if (!c) return;
    const id = setInterval(() => setAutoOn(c.isAutoScale()), 400);
    return () => clearInterval(id);
  }, [c]);
  const setMode = (priceMode: ChartTheme['priceMode']) => setChartTheme({ ...th, priceMode });
  return (
    <div ref={wrapRef} className={`chart-wrap ${multi ? 'multi' : ''} ${multi && isActive ? 'active-pane' : ''} ${isMax ? 'is-max' : ''}`} style={{ background: bg, ...(rect ? { left: `${rect.x * 100}%`, top: `${rect.y * 100}%`, width: `${rect.w * 100}%`, height: `${rect.h * 100}%` } : { display: 'none' }) }} onMouseDown={() => menu && setMenu(null)}>
      <div ref={ref} className="chart" />
      {th.watermark && cfgSymbol && cfgTf && (
        <div className="watermark" style={{ color: th.text }}>
          {cfgSymbol}
          <span>{tfInfo(cfgTf).label}</span>
        </div>
      )}
      {c && <ChartLegend c={c} pane={pane} />}
      {c && (
        <div className="scale-btns" onMouseDown={(e) => e.stopPropagation()}>
          <button className={autoOn ? 'on' : ''} title="Otomatik ölçek: fiyat eksenini görünen mumlara sığdır" onClick={() => (c.setAutoScale(true), setAutoOn(true))}>
            Auto
          </button>
          <button className={th.priceMode === 'log' ? 'on' : ''} title="Logaritmik ölçek" onClick={() => setMode(th.priceMode === 'log' ? 'normal' : 'log')}>
            log
          </button>
          <button className={th.priceMode === 'percent' ? 'on' : ''} title="Yüzde ölçeği" onClick={() => setMode(th.priceMode === 'percent' ? 'normal' : 'percent')}>
            %
          </button>
          {multi && (
            <button className={isMax ? 'on' : ''} title={isMax ? 'Grafiği küçült: çoklu düzene dön (Alt+Enter / Esc)' : 'Grafiği büyüt: tüm alanı kapla (Alt+Enter)'} onClick={() => toggleMaxPane(pane)}>
              {isMax ? '❐' : '⛶'}
            </button>
          )}
          <button title="Grafik ayarları" onClick={() => useStore.setState({ chartSettingsOpen: true })}>
            ⚙
          </button>
        </div>
      )}
      <DataNotice pane={pane} />
      {pane === 0 && <AccountMeters />}
      {pane === 0 && <AccountBanner />}
      {isActive && <DrawingToolbar />}
      {scrolledAway && (
        <button className="to-latest" title="Son muma git" onClick={() => c?.scrollToLast()}>
          »
        </button>
      )}
      {menu && c && menu.drawingId && (
        <DrawingMenu c={c} menu={menu} onClose={() => setMenu(null)} />
      )}
      {menu && c && !menu.drawingId && (
        <div className="menu context" style={{ left: menu.x, top: menu.y }} onMouseDown={(e) => e.stopPropagation()}>
          <button className="menu-item" onClick={() => (c.resetView(), setMenu(null))}>
            Grafiği yenile <span>ölçek + konum sıfırla</span>
          </button>
          <button className="menu-item" onClick={() => (useStore.setState({ chartSettingsOpen: true }), setMenu(null))}>
            Grafik ayarları (renkler)…
          </button>
          <div className="menu-sep" />
          <button className="menu-item" onClick={() => (c.setAutoScale(true), setMenu(null))}>
            {autoOn ? '✓ ' : ''}Otomatik ölçek
          </button>
          <button className="menu-item" onClick={() => (setChartTheme({ ...th, invert: !th.invert }), setMenu(null))}>
            {th.invert ? '✓ ' : ''}Ölçeği ters çevir
          </button>
          {(
            [
              ['normal', 'Normal'],
              ['percent', 'Yüzde'],
              ['indexed', "100'e indeksli"],
              ['log', 'Logaritmik'],
            ] as const
          ).map(([id, label]) => (
            <button key={id} className="menu-item" onClick={() => (setMode(id), setMenu(null))}>
              {th.priceMode === id ? '● ' : '○ '}
              {label}
            </button>
          ))}
          <div className="menu-sep" />
          <button className="menu-item" disabled={menu.L == null} onClick={() => (menu.L != null && setInspectL(menu.L), setMenu(null))}>
            Bu mumu incele (1m kaynak verisi)
          </button>
          <button className="menu-item" onClick={() => (exportVisible(), setMenu(null))}>
            Görünen mumları CSV indir
          </button>
          <button className="menu-item" onClick={() => (c.scrollToLast(), setMenu(null))}>
            Son muma git
          </button>
          {hasClipboard() && (
            <button className="menu-item" onClick={() => (pasteClipboard((t) => c.logicalToTime(c.timeToLogical(t) + 5)), setMenu(null))}>
              Yapıştır <span>Ctrl+V</span>
            </button>
          )}
        </div>
      )}
      {inspectL != null && <BarInspector L={inspectL} onClose={() => setInspectL(null)} />}
      {loading && pane === 0 && (
        <div className="loading">
          <div>{loading.symbol} verisi yükleniyor…</div>
          <div className="bar">
            <div style={{ width: `${Math.round(loading.progress * 100)}%` }} />
          </div>
        </div>
      )}
    </div>
  );
}

/** Çizime sağ tık menüsü: ayarlar, kopyala, kilitle, bu zaman diliminde gizle, öne/arkaya, sil. */
function DrawingMenu({ c, menu, onClose }: { c: ChartController; menu: { x: number; y: number; drawingId?: string }; onClose: () => void }) {
  const session = useStore((s) => s.session);
  const d = drawingsOf(session).find((x) => x.id === menu.drawingId);
  if (!d) return null;
  const isPos = d.type === 'long' || d.type === 'short';
  const tf = c.tf;
  const hiddenHere = !!d.hiddenTfs?.includes(tf);
  const item = (label: string, fn: () => void, hint?: string, disabled = false) => (
    <button
      className="menu-item"
      disabled={disabled}
      onClick={() => {
        fn();
        onClose();
      }}
    >
      {label} {hint && <span>{hint}</span>}
    </button>
  );
  return (
    <div className="menu context" style={{ left: menu.x, top: menu.y }} onMouseDown={(e) => e.stopPropagation()}>
      {item('Ayarlar…', () => useStore.setState({ editingId: d.id, selectedId: d.id }), 'çift tık')}
      {item('Kopyala', () => cloneDrawing(d.id, (t) => c.logicalToTime(c.timeToLogical(t) + 5)), undefined, isPos)}
      {item(d.locked ? 'Kilidi aç' : 'Kilitle', () => updateDrawing(d.id, { locked: !d.locked }))}
      {item(hiddenHere ? `${tf} zaman diliminde göster` : `${tf} zaman diliminde gizle`, () => updateDrawing(d.id, { hiddenTfs: hiddenHere ? (d.hiddenTfs ?? []).filter((x) => x !== tf) : [...(d.hiddenTfs ?? []), tf] }))}
      <div className="menu-sep" />
      {item('Öne getir', () => reorderDrawing(d.id, 'front'))}
      {item('Arkaya gönder', () => reorderDrawing(d.id, 'back'))}
      <div className="menu-sep" />
      {item('Sil', () => deleteDrawing(d.id), 'Delete')}
    </div>
  );
}

/** Mumun zaman etiketi: gün içi mumlarda NY saati, D/W/M mumlarda işlem günü tarihi. */
function barLabel(utc: number, chartTime: number, intraday: boolean) {
  return intraday ? fmtNy(utc) : fmtShifted(chartTime, false);
}

/** TradingView'daki gibi: imlecin altındaki mumun OHLC değerleri. */
function ChartLegend({ c, pane }: { c: ChartController; pane: number }) {
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

function exportVisible() {
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
function BarInspector({ L, onClose }: { L: number; onClose: () => void }) {
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

/** Hesap patladıysa veya değerlendirme geçildiyse grafiğin üstünde kalıcı bant. */
function AccountBanner() {
  const st = useStore((s) => s.session?.account?.state);
  if (!st || st.status === 'active') return null;
  return (
    <div className={`account-banner ${st.status}`}>
      {st.status === 'failed' ? 'HESAP PATLADI' : 'DEĞERLENDİRME GEÇİLDİ'} · {st.reason}
      {st.statusAt ? ` · ${fmtNy(st.statusAt)} NY` : ''}
      {st.status === 'failed' ? ' · Yeni işlem açılamaz; işlemleri Performans sayfasında inceleyebilirsiniz.' : ''}
    </div>
  );
}

/** Kaynakta eksik olan aralığa yeni girildiyse veya veri bittiyse uyarı gösterir. */
function DataNotice({ pane }: { pane: number }) {
  const replayTime = useStore((s) => s.session?.replayTime ?? 0);
  const d = useStore((s) => (s.session ? s.data[paneCfg(s.session, pane).symbol] : undefined));
  if (!d) return null;
  if (revealedCount(d, replayTime) >= d.n) return <div className="notice">Veri sonu: {fmtNy(d.meta.to)} NY. Bu tarihten sonrası için "npm run data" ile güncelleyin.</div>;
  const gaps = d.meta.gaps;
  // replayTime'dan önce biten son boşluk (ikili arama)
  let lo = 0, hi = gaps.length;
  while (lo < hi) {
    const m = (lo + hi) >> 1;
    if (gaps[m].to <= replayTime) lo = m + 1;
    else hi = m;
  }
  const inside = gaps[lo] && gaps[lo].from < replayTime ? gaps[lo] : null;
  const recent = lo > 0 && replayTime - gaps[lo - 1].to < 3 * 3600 ? gaps[lo - 1] : null;
  const g = inside ?? recent;
  if (!g) return null;
  const dur = g.minutes >= 120 ? `${(g.minutes / 60).toFixed(1)} saat` : `${g.minutes} dk`;
  return (
    <div className="notice warn">
      Veri yok: {fmtNy(g.from)} → {fmtNy(g.to)} NY ({dur}). Kaynakta eksik ya da piyasa kapalı; mum uydurulmadı.
    </div>
  );
}
