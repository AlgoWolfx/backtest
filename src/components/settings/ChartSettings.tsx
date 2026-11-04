import { useEffect, useRef, useState } from 'react';
import { setChartTheme, toast, useStore } from '../../store';
import {
  DEFAULT_THEME, THEME_PRESETS, deleteChartTemplate, loadChartTemplates, saveChartTemplate, themeFromTemplate, withColors, type ChartTheme, type ChartType, type ThemeColors,
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
      <TvColor color={t[key] as string} withAlpha={false} onChange={(c) => upd({ [key]: c } as Partial<ChartTheme>)} />
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
          {color('Ölçek çizgileri', 'scaleLine')}
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
        <ChartTemplateMenu t={t} />
        <div className="spacer" />
        <button className="btn small ghost" onClick={() => setChartTheme({ ...DEFAULT_THEME })}>
          Varsayılana dön
        </button>
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
  const list = open ? loadChartTemplates() : [];
  return (
    <div className="tvd-tpl" ref={ref}>
      <button className="btn small" aria-expanded={open} onClick={() => setOpen(!open)}>
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
              <button
                className="tvd-menudel"
                title="Şablonu sil"
                aria-label={`${x.name} şablonunu sil`}
                onClick={() => {
                  deleteChartTemplate(x.name);
                  refresh((n) => n + 1);
                }}
              >
                ×
              </button>
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
        </div>
      )}
    </div>
  );
}
