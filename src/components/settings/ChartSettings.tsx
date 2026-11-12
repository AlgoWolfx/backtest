import { useEffect, useRef, useState, type ReactElement } from 'react';
import { setChartTheme, setSessionSettings, toast, useStore } from '../../store';
import { type SessionSettings } from '../../core/sessions';
import { Icons } from '../common/icons';
import {
  BUILTIN_CHART_TEMPLATES, DEFAULT_THEME, THEME_PRESETS, deleteChartTemplate, loadChartTemplates, saveChartTemplate, themeFromTemplate, withColors, type ChartTheme, type ChartType, type ThemeColors,
} from '../../prefs/chartTheme';
import { TvColor } from '../common/TvColor';
import { NumberInput } from '../common/NumberInput';
import { SessionSettingsTab } from './SessionSettingsTab';
import { Modal } from '../common/Modal';

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
  // İptal için açılıştaki ayarlar (TradingView: değişiklikler canlı görünür, İptal / Esc / × geri alır).
  const initial = useRef<{ theme: ChartTheme; sessions: SessionSettings } | null>(null);
  useEffect(() => {
    if (!open) return;
    const st = useStore.getState();
    initial.current = { theme: st.chartTheme, sessions: st.sessionSettings };
    if (wantedTab) {
      setTab(wantedTab as SettingsTab);
      useStore.setState({ chartSettingsTab: null });
    }
  }, [open, wantedTab]);
  if (!open) return null;
  const close = () => useStore.setState({ chartSettingsOpen: false });
  const cancel = () => {
    const i = initial.current;
    if (i) {
      if (useStore.getState().chartTheme !== i.theme) setChartTheme(i.theme);
      if (useStore.getState().sessionSettings !== i.sessions) setSessionSettings(i.sessions);
    }
    close();
  };
  const upd = (patch: Partial<ChartTheme>) => setChartTheme({ ...t, ...patch });
  const sec = (title: string) => <div className="tvs-sec">{title}</div>;
  const swatch = (key: keyof ChartTheme) => <TvColor color={t[key] as string} withAlpha={false} onChange={(c) => upd({ [key]: c } as Partial<ChartTheme>)} />;
  const color = (label: string, ...keys: (keyof ChartTheme)[]) => (
    <div className="tvs-row">
      <span className="tvs-label">{label}</span>
      {keys.map((k) => (
        <span key={k}>{swatch(k)}</span>
      ))}
    </div>
  );
  const check = (label: string, key: keyof ChartTheme) => (
    <label className="tvs-row tvs-check">
      <input type="checkbox" checked={!!t[key]} onChange={(e) => upd({ [key]: e.target.checked } as Partial<ChartTheme>)} />
      <span>{label}</span>
    </label>
  );
  const pick = <V extends string | number>(label: string, key: keyof ChartTheme, opts: { id: V; label: string }[]) => (
    <div className="tvs-row">
      <span className="tvs-label">{label}</span>
      <select
        className="tvd-select tvs-select"
        value={String(t[key])}
        onChange={(e) => {
          const o = opts.find((x) => String(x.id) === e.target.value);
          if (o) upd({ [key]: o.id } as Partial<ChartTheme>);
        }}
      >
        {opts.map((o) => (
          <option key={String(o.id)} value={String(o.id)}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
  const num = (label: string, key: keyof ChartTheme, min: number, max: number, unit = '') => (
    <div className="tvs-row">
      <span className="tvs-label">{label}</span>
      <NumberInput value={t[key] as number} min={min} onChange={(v) => upd({ [key]: Math.min(max, Math.max(min, v)) } as Partial<ChartTheme>)} />
      <span className="muted">{unit}</span>
    </div>
  );
  const candles = t.chartType === 'candles' || t.chartType === 'hollow';
  const TABS: { id: SettingsTab; label: string; icon: () => ReactElement }[] = [
    { id: 'symbol', label: 'Sembol', icon: Icons.chart },
    { id: 'status', label: 'Durum çubuğu', icon: Icons.list },
    { id: 'scales', label: 'Ölçekler ve çizgiler', icon: Icons.ruler },
    { id: 'canvas', label: 'Tuval', icon: Icons.layers },
    { id: 'sessions', label: 'Seanslar', icon: Icons.sessions },
  ];
  return (
    <Modal
      title="Grafik ayarları"
      wkey="chart-settings"
      width={750}
      height={563}
      bodyClass="tvs"
      onClose={cancel}
      footer={
        <>
          <ChartTemplateMenu t={t} />
          <div className="spacer" />
          <button className="tvd-btn" onClick={cancel}>
            İptal
          </button>
          <button className="tvd-btn primary" onClick={close}>
            Tamam
          </button>
        </>
      }
    >
      <nav className="tvs-side" role="tablist" aria-orientation="vertical">
        {TABS.map((x) => (
          <button key={x.id} role="tab" aria-selected={tab === x.id} className={`tvs-tab ${tab === x.id ? 'on' : ''}`} onClick={() => setTab(x.id)}>
            <span className="tvs-ico" aria-hidden="true">
              <x.icon />
            </span>
            {x.label}
          </button>
        ))}
      </nav>
      <div className="tvs-content" role="tabpanel">
        {tab === 'symbol' && (
          <>
            {sec('Mumlar')}
            {pick('Grafik türü', 'chartType', CHART_TYPES)}
            {(t.chartType === 'line' || t.chartType === 'area') && color('Çizgi', 'lineColor')}
            {(candles || t.chartType === 'bars') && color('Gövde', 'upBody', 'downBody')}
            {t.chartType === 'candles' && check('Kenarlıklar', 'borderVisible')}
            {candles && (t.chartType === 'hollow' || t.borderVisible) && color('Kenarlık', 'upBorder', 'downBorder')}
            {candles && color('Fitil', 'upWick', 'downWick')}
            {sec('Hazır renk temaları')}
            <div className="theme-presets">
              {THEME_PRESETS.map((p) => (
                <button key={p.name} className="theme-preset" title={`${p.name} renklerini uygula`} onClick={() => setChartTheme(withColors(t, p.colors))}>
                  <PresetPreview c={p.colors} />
                  <span>{p.name}</span>
                </button>
              ))}
            </div>
          </>
        )}
        {tab === 'status' && (
          <>
            {sec('Sembol')}
            {check('Sembol adı', 'showSymbol')}
            {check('Veri kaynağı (Dukascopy bid …)', 'showSource')}
            {check('OHLC değerleri', 'showOhlc')}
            {check('Mum değişimi (fark ve %)', 'showChange')}
            {sec('Görünüm')}
            {check('Filigran (büyük sembol ve zaman dilimi)', 'watermark')}
          </>
        )}
        {tab === 'scales' && (
          <>
            {sec('Fiyat ölçeği')}
            {pick('Ölçek türü', 'priceMode', [
              { id: 'normal', label: 'Normal' },
              { id: 'percent', label: 'Yüzde' },
              { id: 'indexed', label: "100'e indeks" },
              { id: 'log', label: 'Logaritmik' },
            ])}
            {check('Ölçeği ters çevir', 'invert')}
            {check('Son fiyat çizgisi', 'lastLine')}
            {check('Son fiyat etiketi (fiyat ekseninde)', 'lastLabel')}
            {check('Mum kapanışına kalan süre', 'countdown')}
            {sec('Boşluklar')}
            {num('Üst', 'marginTop', 0, 40, '%')}
            {num('Alt', 'marginBottom', 0, 40, '%')}
            {num('Sağ', 'rightOffset', 0, 100, 'mum')}
          </>
        )}
        {tab === 'canvas' && (
          <>
            {sec('Grafik temel stilleri')}
            {color('Arka plan', 'background')}
            {color('Ölçek çizgileri', 'scaleLine')}
            {sec('Ölçekler')}
            {color('Yazı rengi', 'text')}
            {num('Yazı boyutu', 'fontSize', 9, 16, 'px')}
            {sec('Artı imleç')}
            {color('Renk', 'crosshair')}
            {pick('Stil', 'crosshairStyle', [
              { id: 'solid', label: 'Düz' },
              { id: 'dashed', label: 'Kesik' },
              { id: 'dotted', label: 'Noktalı' },
            ])}
            {pick('Kalınlık', 'crosshairWidth', [1, 2, 3, 4].map((w) => ({ id: w, label: `${w} px` })))}
            {check('Mumun OHLC değerine yapış (mıknatıs)', 'crosshairMagnet')}
          </>
        )}
        {tab === 'sessions' && <SessionSettingsTab />}
      </div>
    </Modal>
  );
}

/** Hazır temanın küçük önizlemesi: arka plan + iki yükselen, bir düşen mum. */
function PresetPreview({ c }: { c: ThemeColors }) {
  const candle = (x: number, up: boolean, top: number, bot: number, hi: number, lo: number) => (
    <g>
      <line x1={x + 3} x2={x + 3} y1={hi} y2={lo} stroke={up ? c.upWick : c.downWick} />
      <rect x={x} y={top} width={6} height={bot - top} fill={up ? c.upBody : c.downBody} stroke={c.borderVisible ? (up ? c.upBorder : c.downBorder) : 'none'} />
    </g>
  );
  return (
    <svg className="theme-preview" viewBox="0 0 44 28" aria-hidden="true">
      <rect width="44" height="28" rx="3" fill={c.background} />
      {candle(6, true, 12, 20, 8, 23)}
      {candle(19, false, 9, 17, 5, 20)}
      {candle(32, true, 6, 14, 3, 17)}
    </svg>
  );
}

/** TradingView "Şablon" düğmesi: tüm grafik ayarlarını adla kaydet, uygula, sil. */
function ChartTemplateMenu({ t }: { t: ChartTheme }) {
  const [open, setOpen] = useState(false);
  const [, refresh] = useState(0);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    window.addEventListener('mousedown', h, true);
    return () => window.removeEventListener('mousedown', h, true);
  }, [open]);
  const mine = open ? loadChartTemplates() : [];
  // Hazırlar önce; kullanıcı aynı adla kaydettiyse onun kopyası gösterilir (× ile silince hazır hali döner).
  const list = [...BUILTIN_CHART_TEMPLATES.filter((b) => !mine.some((m) => m.name === b.name)), ...mine];
  const builtin = (name: string) => BUILTIN_CHART_TEMPLATES.some((b) => b.name === name);
  return (
    <div className="tvd-tpl" ref={ref}>
      <button className="tvd-btn" aria-expanded={open} onClick={() => setOpen(!open)}>
        Şablon ▾
      </button>
      {open && (
        <div className="tvd-menu">
          {list.map((x) => (
            <div key={x.name} className="tvd-menurow">
              <button
                className="tvd-menuitem"
                onClick={() => {
                  setChartTheme(themeFromTemplate(x));
                  setOpen(false);
                }}
              >
                {x.name}
              </button>
              {mine.includes(x) && (
              <button
                className="tvd-menudel"
                title={builtin(x.name) ? 'Değişikliği sil (hazır hale dön)' : 'Şablonu sil'}
                aria-label={`${x.name} şablonunu sil`}
                onClick={() => {
                  deleteChartTemplate(x.name);
                  refresh((n) => n + 1);
                }}
              >
                ×
              </button>
              )}
            </div>
          ))}
          {list.length > 0 && <div className="tvd-menusep" />}
          <button
            className="tvd-menuitem"
            onClick={() => {
              setOpen(false);
              const name = window.prompt('Grafik şablonu adı (aynı ad yazılırsa güncellenir):')?.trim();
              if (!name) return;
              if (loadChartTemplates().some((x) => x.name === name) && !window.confirm(`"${name}" şablonu zaten var. Üzerine yazılsın mı?`)) return;
              saveChartTemplate(name, t);
              toast(`"${name}" grafik şablonu kaydedildi.`);
            }}
          >
            Şablonu farklı kaydet…
          </button>
          <button
            className="tvd-menuitem"
            onClick={() => {
              setChartTheme({ ...DEFAULT_THEME });
              setOpen(false);
            }}
          >
            Varsayılanları uygula
          </button>
        </div>
      )}
    </div>
  );
}
