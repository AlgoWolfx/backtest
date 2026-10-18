import { useEffect, useState, type ReactNode } from 'react';
import { nyLocalToUtc, toNyLocal } from '../../shared/nytime.js';
import { fmtNy, pad } from '../lib/format';
import { currentData, drawingsOf, jumpTo, setChartTheme, useStore } from '../store';
import { DEFAULT_THEME, THEME_PRESETS, withColors, type ChartTheme, type ChartType } from '../prefs/chartTheme';
import { NumberInput } from './Bars';
import { Icons } from './common/icons';
import { SessionSettingsTab } from './settings/SessionSettingsTab';
import { DrawingDialog } from './drawing/DrawingDialog';
import { useWindow } from '../lib/useWindow';

export function Modal({ title, onClose, children, width = 420, bare = false, wkey = 'modal' }: { title: string; onClose: () => void; children: ReactNode; width?: number; bare?: boolean; wkey?: string }) {
  const win = useWindow(wkey);
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [onClose]);
  return (
    <div className={`modal-bg ${bare ? 'bare' : ''} ${win.min ? 'min' : ''}`} onMouseDown={onClose}>
      <div ref={win.winRef} className={`modal ${win.min ? 'min' : ''}`} style={{ width, ...win.style }} onMouseDown={(e) => e.stopPropagation()}>
        <div className="modal-head" {...win.headProps}>
          <b>{title}</b>
          <span className="tvd-head-btns">
            <button className="icon-btn" title={win.min ? 'Büyüt' : 'Küçült'} onClick={win.toggleMin}>
              {win.min ? '▢' : '–'}
            </button>
            <button className="icon-btn" onClick={onClose}>
              <Icons.close />
            </button>
          </span>
        </div>
        <div className="modal-body">{children}</div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- çizim ayarları

export function DrawingEditor() {
  const session = useStore((s) => s.session);
  const editingId = useStore((s) => s.editingId);
  const d = drawingsOf(session).find((x) => x.id === editingId);
  if (!d || !session) return null;
  // Tüm araçlar için TradingView tarzı sekmeli pencere (Stil / Metin / Girdiler / Kordinatlar / Görünürlük)
  return <DrawingDialog key={d.id} d={d} />;
}

// ---------------------------------------------------------------- grafik ayarları

type SettingsTab = 'symbol' | 'status' | 'scales' | 'canvas' | 'sessions';
const CHART_TYPES: { id: ChartType; label: string }[] = [
  { id: 'candles', label: 'Mumlar' },
  { id: 'hollow', label: 'Boş mumlar' },
  { id: 'bars', label: 'Barlar' },
  { id: 'line', label: 'Çizgi' },
  { id: 'area', label: 'Alan' },
];

export function ChartSettings() {
  const open = useStore((s) => s.chartSettingsOpen);
  const t = useStore((s) => s.chartTheme);
  const wantedTab = useStore((s) => s.chartSettingsTab);
  const [tab, setTab] = useState<SettingsTab>('symbol');
  useEffect(() => {
    if (open && wantedTab) {
      setTab(wantedTab as SettingsTab);
      useStore.setState({ chartSettingsTab: null });
    }
  }, [open, wantedTab]);
  if (!open) return null;
  const upd = (patch: Partial<ChartTheme>) => setChartTheme({ ...t, ...patch });
  const color = (label: string, key: keyof ChartTheme) => (
    <div className="form-row">
      <span>{label}</span>
      <input type="color" className="color-input" value={t[key] as string} onChange={(e) => upd({ [key]: e.target.value } as Partial<ChartTheme>)} />
      <span className="muted">{(t[key] as string).toUpperCase()}</span>
    </div>
  );
  const check = (label: string, key: keyof ChartTheme) => (
    <label className="form-row check">
      <input type="checkbox" checked={!!t[key]} onChange={(e) => upd({ [key]: e.target.checked } as Partial<ChartTheme>)} />
      <span>{label}</span>
    </label>
  );
  const seg = <V extends string | number>(label: string, key: keyof ChartTheme, opts: { id: V; label: string }[]) => (
    <div className="form-row">
      <span>{label}</span>
      <div className="seg">
        {opts.map((o) => (
          <button key={String(o.id)} className={t[key] === o.id ? 'on' : ''} onClick={() => upd({ [key]: o.id } as Partial<ChartTheme>)}>
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
  const num = (label: string, key: keyof ChartTheme, min: number, max: number, unit = '') => (
    <div className="form-row">
      <span>{label}</span>
      <NumberInput value={t[key] as number} min={min} onChange={(v) => upd({ [key]: Math.min(max, Math.max(min, v)) } as Partial<ChartTheme>)} />
      <span className="muted">{unit}</span>
    </div>
  );
  const TABS: { id: SettingsTab; label: string }[] = [
    { id: 'symbol', label: 'Semboller' },
    { id: 'status', label: 'Durum çubuğu' },
    { id: 'scales', label: 'Ölçekler ve çizgiler' },
    { id: 'canvas', label: 'Tuval' },
    { id: 'sessions', label: 'Seanslar' },
  ];
  return (
    <Modal title="Grafik ayarları" wkey="chart-settings" width={460} bare onClose={() => useStore.setState({ chartSettingsOpen: false })}>
      <div className="seg tabs">
        {TABS.map((x) => (
          <button key={x.id} className={tab === x.id ? 'on' : ''} onClick={() => setTab(x.id)}>
            {x.label}
          </button>
        ))}
      </div>
      {tab === 'symbol' && (
        <>
          {seg('Grafik türü', 'chartType', CHART_TYPES)}
          {(t.chartType === 'line' || t.chartType === 'area') && color('Çizgi rengi', 'lineColor')}
          {(t.chartType === 'candles' || t.chartType === 'hollow' || t.chartType === 'bars') && (
            <>
              {color('Yükselen gövde', 'upBody')}
              {color('Düşen gövde', 'downBody')}
            </>
          )}
          {(t.chartType === 'candles' || t.chartType === 'hollow') && (
            <>
              {color('Yükselen fitil', 'upWick')}
              {color('Düşen fitil', 'downWick')}
              {t.chartType === 'candles' && check('Mum kenarlığı', 'borderVisible')}
              {(t.chartType === 'hollow' || t.borderVisible) && (
                <>
                  {color('Yükselen kenarlık', 'upBorder')}
                  {color('Düşen kenarlık', 'downBorder')}
                </>
              )}
            </>
          )}
          <h4 className="sub">Hazır renk temaları</h4>
          <div className="presets">
            {THEME_PRESETS.map((p) => (
              <button key={p.name} className="btn small" onClick={() => setChartTheme(withColors(t, p.colors))}>
                <span className="preset-dot" style={{ background: p.colors.background, borderColor: p.colors.upBody }} />
                {p.name}
              </button>
            ))}
          </div>
        </>
      )}
      {tab === 'sessions' && <SessionSettingsTab />}
      {tab === 'status' && (
        <>
          {check('Sembol adı', 'showSymbol')}
          {check('Veri kaynağı (Dukascopy bid …)', 'showSource')}
          {check('OHLC değerleri', 'showOhlc')}
          {check('Mum değişimi (fark ve %)', 'showChange')}
          {check('Filigran (büyük sembol ve zaman dilimi)', 'watermark')}
        </>
      )}
      {tab === 'scales' && (
        <>
          {seg('Fiyat ölçeği', 'priceMode', [
            { id: 'normal', label: 'Normal' },
            { id: 'percent', label: '%' },
            { id: 'indexed', label: '100\'e indeks' },
            { id: 'log', label: 'Logaritmik' },
          ])}
          {check('Ölçeği ters çevir', 'invert')}
          {check('Son fiyat çizgisi', 'lastLine')}
          {check('Son fiyat etiketi (fiyat ekseninde)', 'lastLabel')}
          {check('Mum kapanışına kalan süre', 'countdown')}
          {num('Üst boşluk', 'marginTop', 0, 40, '%')}
          {num('Alt boşluk', 'marginBottom', 0, 40, '%')}
          {num('Sağ boşluk', 'rightOffset', 0, 100, 'mum')}
          {num('Yazı boyutu', 'fontSize', 9, 16, 'px')}
          {color('Yazı / eksen rengi', 'text')}
        </>
      )}
      {tab === 'canvas' && (
        <>
          {color('Arka plan', 'background')}
          {color('Izgara', 'grid')}
          <div className="form-row check">
            <label>
              <input type="checkbox" checked={t.gridV} onChange={(e) => upd({ gridV: e.target.checked })} /> Dikey ızgara
            </label>
            <label>
              <input type="checkbox" checked={t.gridH} onChange={(e) => upd({ gridH: e.target.checked })} /> Yatay ızgara
            </label>
          </div>
          <h4 className="sub">Artı imleç</h4>
          {color('Renk', 'crosshair')}
          {seg('Stil', 'crosshairStyle', [
            { id: 'solid', label: 'Düz' },
            { id: 'dashed', label: 'Kesik' },
            { id: 'dotted', label: 'Noktalı' },
          ])}
          {seg('Kalınlık', 'crosshairWidth', [1, 2, 3, 4].map((w) => ({ id: w, label: `${w}px` })))}
          {check('Mumun OHLC değerine yapış (mıknatıs)', 'crosshairMagnet')}
        </>
      )}
      <p className="hint">Ayarlar bu tarayıcıda otomatik kaydedilir ve tüm oturumlarda geçerlidir.</p>
      <div className="form-row">
        <div className="spacer" />
        <button className="btn small ghost" onClick={() => setChartTheme({ ...DEFAULT_THEME })}>
          Varsayılana dön
        </button>
      </div>
    </Modal>
  );
}

// ---------------------------------------------------------------- tarihe git

export function toNyInputs(utc: number) {
  const d = new Date(toNyLocal(utc) * 1000);
  return { date: `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`, time: `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}` };
}

export function fromNyInputs(date: string, time: string): number | null {
  const m = date.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const t = time.match(/^(\d{1,2}):(\d{2})$/);
  if (!m || !t) return null;
  return nyLocalToUtc(Date.UTC(+m[1], +m[2] - 1, +m[3], +t[1], +t[2]) / 1000);
}

export function JumpDialog() {
  const open = useStore((s) => s.jumpOpen);
  const replayTime = useStore((s) => s.session?.replayTime ?? 0);
  const [v, setV] = useState(() => toNyInputs(replayTime));
  useEffect(() => {
    if (open) setV(toNyInputs(useStore.getState().session!.replayTime));
  }, [open]);
  if (!open) return null;
  const d = currentData();
  const close = () => useStore.setState({ jumpOpen: false });
  const go = () => {
    const utc = fromNyInputs(v.date, v.time);
    if (utc == null) return;
    jumpTo(utc);
    close();
  };
  return (
    <Modal title="Replay tarihini değiştir" wkey="jump" onClose={close}>
      <p className="hint">Seçilen New York saatinden sonraki mumlar gizlenir. Açık pozisyon varken yalnızca ileri gidilebilir; aradaki mumlar SL/TP için işlenir.</p>
      <div className="form-row">
        <input type="date" value={v.date} onChange={(e) => setV({ ...v, date: e.target.value })} onKeyDown={(e) => e.stopPropagation()} />
        <input type="time" value={v.time} onChange={(e) => setV({ ...v, time: e.target.value })} onKeyDown={(e) => e.key === 'Enter' ? go() : e.stopPropagation()} />
        <span className="muted">NY</span>
      </div>
      {d && (
        <p className="hint">
          Veri aralığı: {fmtNy(d.meta.from)} → {fmtNy(d.meta.to)}
        </p>
      )}
      <div className="modal-foot">
        <div className="spacer" />
        <button className="btn" onClick={close}>
          Vazgeç
        </button>
        <button className="btn primary" onClick={go}>
          Git
        </button>
      </div>
    </Modal>
  );
}

// ---------------------------------------------------------------- bildirim

export function Toast() {
  const toast = useStore((s) => s.toast);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    if (!toast) return;
    setVisible(true);
    const t = setTimeout(() => setVisible(false), toast.kind === 'error' ? 5000 : 3500);
    return () => clearTimeout(t);
  }, [toast]);
  if (!toast || !visible) return null;
  return (
    <div className={`toast ${toast.kind}`} onClick={() => setVisible(false)}>
      {toast.text}
    </div>
  );
}
