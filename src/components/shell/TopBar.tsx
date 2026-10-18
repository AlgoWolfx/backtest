import { useEffect, useRef, useState } from 'react';
import { TIMEFRAMES } from '../../core/timeframes';
import type { ChartType } from '../../prefs/chartTheme';
import { closeSession, setChartTheme, setSymbol, setTf, useStore, setSessionSettings } from '../../store';
import { Icons } from '../common/icons';
import { LayoutMenu } from '../chart/LayoutMenu';
import { toggleFullscreen, useFullscreen } from '../../lib/fullscreen';
import { AccountInfo } from './AccountMeters';

function ChartTypePicker() {
  const type = useStore((s) => s.chartTheme.chartType);
  const th = useStore((s) => s.chartTheme);
  return (
    <select className="select chart-type-select" value={type} title="Grafik türü" onChange={(e) => setChartTheme({ ...th, chartType: e.target.value as ChartType })}>
      {(
        [
          ['candles', 'Mumlar'],
          ['hollow', 'Boş mumlar'],
          ['bars', 'Barlar'],
          ['line', 'Çizgi'],
          ['area', 'Alan'],
        ] as const
      ).map(([id, label]) => (
        <option key={id} value={id}>
          {label}
        </option>
      ))}
    </select>
  );
}

/** Seans / killzone katmanını açıp kapatır (ayrıntılar Grafik ayarları > Seanslar). */
function SessionToggle() {
  const s = useStore((st) => st.sessionSettings);
  return (
    <button
      className={`btn ghost ${s.enabled ? 'on' : ''}`}
      onClick={() => setSessionSettings({ ...s, enabled: !s.enabled })}
      onContextMenu={(e) => {
        e.preventDefault();
        useStore.setState({ chartSettingsOpen: true, chartSettingsTab: 'sessions' });
      }}
      title="Seans / killzone katmanı: aç-kapa. Sağ tık: seans ayarları"
    >
      <Icons.sessions /> <span className="lbl-optional">Seanslar</span>
    </button>
  );
}

function FullscreenButton() {
  const on = useFullscreen();
  return (
    <button className={`btn ghost ${on ? 'on' : ''}`} onClick={toggleFullscreen} title="Tam ekran (Shift+F)">
      {on ? <Icons.exitFullscreen /> : <Icons.fullscreen />}
    </button>
  );
}

export function TopBar() {
  const name = useStore((s) => s.session?.name);
  const symbol = useStore((s) => s.session?.symbol ?? '');
  const tf = useStore((s) => s.session?.tf);
  const panelOpen = useStore((s) => s.panelOpen);
  const openCount = useStore((s) => s.session?.trades.filter((t) => t.status === 'open' || t.status === 'pending').length ?? 0);

  return (
    <header className="topbar">
      <button className="icon-btn" title="Oturumlara dön" onClick={closeSession}>
        <Icons.back />
      </button>
      <Icons.logo />
      <span className="session-name" title="Oturum">
        {name}
      </span>
      <SymbolPicker symbol={symbol} />
      <div className="tf-group">
        {TIMEFRAMES.map((t) => (
          <button key={t.id} className={`tf ${tf === t.id ? 'on' : ''}${['2m', '3m', '30m'].includes(t.id) ? ' tf-minor' : ''}`} onClick={() => setTf(t.id)}>
            {t.label}
          </button>
        ))}
      </div>
      <ChartTypePicker />
      <LayoutMenu />
      <button className="btn ghost" onClick={() => useStore.setState({ jumpOpen: true })} title="Replay tarihini değiştir">
        <Icons.calendar /> <span className="lbl-optional">Tarihe git</span>
      </button>
      <div className="spacer" />
      <AccountInfo />
      <SessionToggle />
      <FullscreenButton />
      <button className="btn ghost" onClick={() => useStore.setState({ chartSettingsOpen: true })} title="Grafik renkleri ve görünüm ayarları">
        <Icons.settings />
      </button>
      <button className="btn ghost" onClick={() => useStore.setState({ perfOpen: true })} title="Performans istatistikleri ve işlem günlüğü (ekran görüntüleriyle)">
        <Icons.chart /> <span className="lbl-optional">Performans</span>
      </button>
      <button className={`btn ghost ${panelOpen ? 'on' : ''}`} onClick={() => useStore.setState({ panelOpen: !panelOpen })} title="İşlem paneli">
        <Icons.list /> İşlemler{openCount ? <span className="badge">{openCount}</span> : null}
      </button>
    </header>
  );
}

function SymbolPicker({ symbol }: { symbol: string }) {
  const symbols = useStore((s) => s.symbols);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    window.addEventListener('mousedown', close);
    return () => window.removeEventListener('mousedown', close);
  }, [open]);
  return (
    <div className="symbol-picker" ref={ref}>
      <button className="btn ghost symbol-btn" onClick={() => setOpen(!open)}>
        {symbol} <span className="caret">▾</span>
      </button>
      {open && (
        <div className="menu">
          {symbols.map((s) => (
            <button
              key={s.id}
              className={`menu-item ${s.id === symbol ? 'on' : ''}`}
              disabled={!s.available}
              onClick={() => {
                setOpen(false);
                setSymbol(s.id);
              }}
            >
              <b>{s.id}</b>
              <span>{s.available ? s.name : 'veri yok'}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
