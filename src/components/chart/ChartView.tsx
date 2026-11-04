import { useEffect, useRef, useState } from 'react';
import { getSymbol } from '../../../shared/symbols.js';
import { ChartController } from '../../chart/ChartController';
import { paneControllers } from '../../chart/chartRef';
import { type M1Data } from '../../core/data';
import { tfInfo } from '../../core/timeframes';
import { fmtPrice } from '../../lib/format';
import { activatePane, pendingKindAt, placePendingAt, hasClipboard, paneCfg, pasteClipboard, setChartTheme, toggleMaxPane, useStore } from '../../store';
import type { ChartTheme } from '../../prefs/chartTheme';
import { LAYOUTS } from '../../core/types';
import { type PaneRect } from '../../core/layouts';
import { broadcastCrosshair, broadcastRange } from '../../chart/paneSync';
import { DrawingToolbar } from '../drawing/DrawingToolbar';
import { AccountMeters } from '../shell/AccountMeters';
import { DrawingMenu } from './DrawingMenu';
import { ChartLegend } from './ChartLegend';
import { exportVisible, BarInspector } from './BarInspector';
import { AccountBanner, DataNotice } from './ChartNotices';

export function ChartView({ pane, rect }: { pane: number; rect: PaneRect | null }) {
  const ref = useRef<HTMLDivElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const loading = useStore((s) => s.loading);
  const multi = useStore((s) => LAYOUTS[s.session?.layout ?? '1'].count > 1);
  const isActive = useStore((s) => (s.session?.active ?? 0) === pane);
  const isMax = useStore((s) => s.maxPane === pane);
  const [c, setC] = useState<ChartController | null>(null);
  const [menu, setMenu] = useState<{ x: number; y: number; L: number | null; price: number | null; drawingId?: string } | null>(null);
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
      if (!hit) activatePane(pane); // emirler aktif grafiğin sembolüne verilir
      const raw = c.yToPrice(ly);
      setMenu({ x: lx, y: ly, L: c.xToLogical(lx), price: raw == null ? null : c.roundPrice(raw), drawingId: hit?.id });
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
          {menu.price != null && <div className="menu-sep" />}
          {menu.price != null &&
            (['long', 'short'] as const).map((side) => {
              const kind = pendingKindAt(side, menu.price!);
              if (!kind) return null;
              const spec = getSymbol(cfgSymbol ?? useStore.getState().session!.symbol);
              return (
                <button
                  key={side}
                  className="menu-item"
                  onClick={() => {
                    const L = menu.L ?? c.lastK - c.winStart;
                    const dist = (c.atrAt(L) ?? 0) * 1.5 || menu.price! * 0.002;
                    placePendingAt(side, menu.price!, c.logicalToTime(L), c.logicalToTime(L + 25), dist);
                    setMenu(null);
                  }}
                >
                  <span className={side === 'long' ? 'pos' : 'neg'}>{side === 'long' ? 'Alış' : 'Satış'}</span> {kind === 'limit' ? 'limit' : 'stop'} emri <span>{fmtPrice(menu.price!, spec)}</span>
                </button>
              );
            })}
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
