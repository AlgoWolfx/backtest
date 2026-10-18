import { useEffect, useState } from 'react';
import { setChartTheme, useStore } from '../../store';
import { DEFAULT_THEME, THEME_PRESETS, withColors, type ChartTheme, type ChartType } from '../../prefs/chartTheme';
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
