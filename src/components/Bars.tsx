import { useEffect, useRef, useState } from 'react';
import { getSymbol } from '../../shared/symbols.js';
import { TIMEFRAMES } from '../core/timeframes';
import { liquidationPnl } from '../core/trading';
import { snapshot } from '../core/account';
import { type Tool } from '../core/types';
import { fmtMoney } from '../format';
import type { ChartType } from '../chartTheme';
import {
  balanceOf,
  clearDrawings,
  closeSession,
  drawingsOf,
  setAllLocked,
  exitPriceNow,
  cancelTicket,
  marketOrder,
  startTicket,
  type OrderKind,
  setChartTheme,
  setLots,
  setRiskPct,
  setSlBuffer,
  setSymbol,
  setTf,
  useStore,
  setSessionSettings,
} from '../store';
import { Icons } from './icons';
import { LayoutMenu } from './LayoutMenu';
import { toggleFullscreen, useFullscreen } from '../fullscreen';
import { ReplayClock, ReplayControls } from './ReplayControls';

// ---------------------------------------------------------------- üst çubuk

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

/** Kapanmış bakiye ve açık pozisyonların anlık K/Z'si. */
function useBalance() {
  const session = useStore((s) => s.session);
  useStore((s) => s.data);
  if (!session) return null;
  const balance = balanceOf(session);
  let floating = 0;
  for (const t of session.trades) {
    if (t.status !== 'open') continue;
    const px = exitPriceNow(t);
    if (px != null) floating += liquidationPnl(getSymbol(t.symbol), t, px);
  }
  return { session, balance, floating };
}

function AccountInfo() {
  const b = useBalance();
  if (!b) return null;
  const { session, balance, floating } = b;
  const net = balance - session.initialBalance;
  const status = session.account?.state.status;
  return (
    <div className="account">
      <div>
        <span className="muted">Bakiye</span> <b>{fmtMoney(balance)}</b> <span className={net >= 0 ? 'pos' : 'neg'}>({fmtMoney(net, true)})</span>
      </div>
      {floating !== 0 && (
        <div>
          <span className="muted">Açık K/Z</span> <b className={floating >= 0 ? 'pos' : 'neg'}>{fmtMoney(floating, true)}</b>
        </div>
      )}
      {status && status !== 'active' && <span className={`pill ${status === 'passed' ? 'win' : 'loss'}`}>{status === 'passed' ? 'GEÇTİ' : 'PATLADI'}</span>}
    </div>
  );
}

/** Alt çubukta hesap kuralı göstergeleri: hedef, günlük kayıp, hesap patlama. */
export function AccountMeters() {
  const b = useBalance();
  if (!b?.session.account) return null;
  const { session, balance, floating } = b;
  const snap = snapshot(session.account!, session.initialBalance, session.replayTime, balance, balance + floating);
  const pct = (v: number) => ((v / session.initialBalance) * 100).toFixed(2);
  if (!snap.target && !snap.daily && !snap.max) return null;
  return (
    <div className="meters">
      {snap.target && (
        <Meter label="Hedef" title={`Kâr hedefi: ${fmtMoney(snap.target.have, true)} / ${fmtMoney(snap.target.need)}`} value={snap.target.have} max={snap.target.need} text={`${pct(snap.target.have)} / ${pct(snap.target.need)}%`} tone="good" />
      )}
      {snap.daily && (
        <Meter label="Günlük" title={`Bugünkü kayıp (equity): ${fmtMoney(snap.daily.used)} / limit ${fmtMoney(snap.daily.limit)} · NY 17:00'de sıfırlanır`} value={snap.daily.used} max={snap.daily.limit} text={`${pct(snap.daily.used)} / ${pct(snap.daily.limit)}%`} tone="bad" />
      )}
      {snap.max && (
        <Meter label="Patlama" title={`Maks. kayıp limitinden kullanılan: ${fmtMoney(snap.max.used)} / ${fmtMoney(snap.max.limit)}`} value={snap.max.used} max={snap.max.limit} text={`${pct(snap.max.used)} / ${pct(snap.max.limit)}%`} tone="bad" />
      )}
    </div>
  );
}

/** Küçük ilerleme göstergesi (hedef / limit kullanımı). */
function Meter({ label, title, value, max, text, tone }: { label: string; title: string; value: number; max: number; text: string; tone: 'good' | 'bad' }) {
  const ratio = max > 0 ? Math.max(0, Math.min(1, value / max)) : 0;
  const level = tone === 'good' ? 'good' : ratio >= 0.8 ? 'crit' : ratio >= 0.5 ? 'warn' : 'ok';
  return (
    <div className="meter" title={title}>
      <span className="muted">{label}</span>
      <span className="meter-bar">
        <span className={`meter-fill ${level}`} style={{ width: `${ratio * 100}%` }} />
      </span>
      <span className="meter-text">{text}</span>
    </div>
  );
}

// ---------------------------------------------------------------- sol araç çubuğu

const TOOLS: { id: Tool; label: string; key: string; icon: () => React.JSX.Element }[] = [
  { id: 'cursor', label: 'İmleç', key: 'Esc', icon: Icons.cursor },
  { id: 'trend', label: 'Trend çizgisi', key: 'Alt+T', icon: Icons.trend },
  { id: 'hline', label: 'Yatay çizgi', key: 'Alt+H', icon: Icons.hline },
  { id: 'rect', label: 'Dikdörtgen (FVG / OB)', key: 'Alt+R', icon: Icons.rect },
  { id: 'fib', label: 'Fibonacci düzeltme', key: 'Alt+F', icon: Icons.fib },
  { id: 'long', label: 'Long pozisyon', key: 'Alt+L', icon: Icons.long },
  { id: 'short', label: 'Short pozisyon', key: 'Alt+S', icon: Icons.short },
  { id: 'measure', label: 'Ölçüm (fiyat / mum / süre)', key: 'Shift+sürükle', icon: Icons.ruler },
];

export function LeftToolbar() {
  const tool = useStore((s) => s.tool);
  const magnet = useStore((s) => s.magnet);
  const magnetMode = useStore((s) => s.magnetMode);
  const stayInDraw = useStore((s) => s.stayInDraw);
  const hide = useStore((s) => s.hideDrawings);
  const allLocked = useStore((s) => {
    const list = drawingsOf(s.session);
    return list.length > 0 && list.every((d) => d.locked);
  });
  // Mıknatıs: kapalı -> zayıf -> güçlü -> kapalı (TradingView "Zayıf / Güçlü mıknatıs")
  const cycleMagnet = () => {
    if (!magnet) useStore.setState({ magnet: true, magnetMode: 'weak' });
    else if (magnetMode === 'weak') useStore.setState({ magnetMode: 'strong' });
    else useStore.setState({ magnet: false });
  };
  return (
    <nav className="lefttools">
      {TOOLS.map((t) => (
        <button key={t.id} className={`tool ${tool === t.id ? 'on' : ''}`} title={`${t.label} (${t.key})`} onClick={() => useStore.setState({ tool: t.id, selectedId: null })}>
          <t.icon />
        </button>
      ))}
      <div className="tool-sep" />
      <button
        className={`tool ${magnet ? 'on' : ''}`}
        title={`Mıknatıs: ${!magnet ? 'kapalı' : magnetMode === 'weak' ? 'zayıf (yakındaki OHLC noktalarına)' : 'güçlü (her zaman en yakın OHLC noktasına)'} — tıklayınca değişir`}
        onClick={cycleMagnet}
      >
        <Icons.magnet />
        {magnet && <span className="tool-badge">{magnetMode === 'weak' ? 'Z' : 'G'}</span>}
      </button>
      <button className={`tool ${stayInDraw ? 'on' : ''}`} title="Çizim modunda kal: çizim bitince araç seçili kalır" onClick={() => useStore.setState({ stayInDraw: !stayInDraw })}>
        <Icons.stay />
      </button>
      <button className={`tool ${allLocked ? 'on' : ''}`} title={allLocked ? 'Tüm çizimlerin kilidini aç' : 'Tüm çizimleri kilitle'} onClick={() => setAllLocked(!allLocked)}>
        {allLocked ? <Icons.lock /> : <Icons.unlock />}
      </button>
      <button className={`tool ${hide ? 'on' : ''}`} title="Çizimleri gizle / göster" onClick={() => useStore.setState({ hideDrawings: !hide })}>
        {hide ? <Icons.eyeOff /> : <Icons.eye />}
      </button>
      <button
        className="tool"
        title="Bu sembolün tüm çizimlerini sil (aktif işlemlere bağlı olanlar hariç)"
        onClick={() => {
          if (confirmDelete()) clearDrawings();
        }}
      >
        <Icons.trash />
      </button>
    </nav>
  );
}

function confirmDelete() {
  return window.confirm('Bu sembolün tüm çizimleri silinsin mi?');
}

// ---------------------------------------------------------------- alt çubuk (replay)

export function BottomBar() {
  const lots = useStore((s) => s.session?.lots ?? 1);
  const riskPct = useStore((s) => s.session?.riskPct ?? 1);
  const kind = useStore((s) => s.orderKind);
  const sizing = useStore((s) => s.sizing);
  const ticket = useStore((s) => s.ticket);
  const slBuffer = useStore((s) => s.session?.slBuffer ?? 0);
  const symbolPip = useStore((s) => (s.session ? getSymbol(s.session.symbol).pipLabel : 'pip'));
  const KINDS: { id: OrderKind; label: string; hint: string }[] = [
    { id: 'market', label: 'Market', hint: 'Anlık fiyattan gir; SL ve TP noktalarını grafikte tıklayarak seç' },
    { id: 'limit', label: 'Limit', hint: 'Giriş, SL ve TP noktalarını grafikte sırayla tıkla (giriş anlık fiyatın lehine tarafında)' },
    { id: 'stop', label: 'Stop', hint: 'Giriş, SL ve TP noktalarını grafikte sırayla tıkla (giriş anlık fiyatın aleyhine tarafında, kırılımda gir)' },
  ];
  const order = (side: 'long' | 'short', quick: boolean) => {
    if (quick) return marketOrder(side);
    if (ticket && ticket.side === side && ticket.kind === kind) return cancelTicket();
    startTicket(side);
  };

  return (
    <footer className="bottombar">
      <div className="trade-btns">
        <div className="seg" title="Emir tipi">
          {KINDS.map((k) => (
            <button key={k.id} className={kind === k.id ? 'on' : ''} title={k.hint} onClick={() => useStore.setState({ orderKind: k.id, ticket: null })}>
              {k.label}
            </button>
          ))}
        </div>
        <button className={`buy ${ticket?.side === 'long' ? 'armed' : ''}`} onClick={(e) => order('long', e.shiftKey)} title="Buy: grafikte SL ve TP noktalarını seç (Shift+tık: ATR'ye göre hızlı emir)">
          ↗ Buy
        </button>
        <button className={`sell ${ticket?.side === 'short' ? 'armed' : ''}`} onClick={(e) => order('short', e.shiftKey)} title="Sell: grafikte SL ve TP noktalarını seç (Shift+tık: ATR'ye göre hızlı emir)">
          ↘ Sell
        </button>
        <div className="seg" title="Emir boyutu: bakiyenin risk yüzdesi veya sabit lot">
          <button className={sizing === 'risk' ? 'on' : ''} onClick={() => useStore.setState({ sizing: 'risk' })}>
            Risk %
          </button>
          <button className={sizing === 'lots' ? 'on' : ''} onClick={() => useStore.setState({ sizing: 'lots' })}>
            Lot
          </button>
        </div>
        {sizing === 'risk' ? (
          <label className="field" title="Her işlemde SL vurulursa kaybedilecek bakiye yüzdesi (lot buna göre hesaplanır)">
            <NumberInput value={riskPct} min={0.01} step={0.25} onChange={setRiskPct} />
            <span>%</span>
          </label>
        ) : (
          <label className="field" title="Sabit lot miktarı">
            <NumberInput value={lots} min={0.01} step={0.01} onChange={setLots} />
            <span>lot</span>
          </label>
        )}
        <label className="field" title={`Stop tamponu: SL'ye tıkladığın noktanın ${symbolPip} kadar ötesine konur (long'da aşağı, short'ta yukarı). Risk % modunda lot genişlemiş stopa göre hesaplanır. 0 = kapalı`}>
          <span>SL +</span>
          <NumberInput value={slBuffer} min={0} step={0.5} onChange={setSlBuffer} />
          <span className="muted">{symbolPip}</span>
        </label>
      </div>

      <div className="bottom-right">
        <ReplayControls />
        <ReplayClock />
      </div>
    </footer>
  );
}

export function NumberInput({ value, onChange, min, step }: { value: number; onChange: (v: number) => void; min?: number; step?: number }) {
  const [text, setText] = useState(String(value));
  useEffect(() => setText(String(value)), [value]);
  const commit = () => {
    const v = Number(text.replace(',', '.'));
    if (Number.isFinite(v) && (min == null || v >= min)) onChange(v);
    else setText(String(value));
  };
  return (
    <input
      className="num"
      value={text}
      inputMode="decimal"
      step={step}
      onChange={(e) => setText(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
        e.stopPropagation();
      }}
    />
  );
}
