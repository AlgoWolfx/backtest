import { useEffect, useState, type ReactNode } from 'react';
import { getSymbol } from '../../shared/symbols.js';
import { nyLocalToUtc, toNyLocal } from '../../shared/nytime.js';
import { hexToRgba } from '../chart/DrawingLayer';
import { lotsForRisk, stopRiskPerLot, usdPerPriceUnit } from '../core/trading';
import type { Drawing, FibLevel, Position } from '../core/types';
import { fmtDistance, fmtMoney, fmtNy, pad } from '../format';
import { balanceOf, currentData, deleteDrawing, drawingsOf, jumpTo, placeOrderFromDrawing, setChartTheme, setFibDefaults, updateDrawing, useStore } from '../store';
import { DEFAULT_THEME, THEME_PRESETS, withColors, type ChartTheme, type ChartType } from '../chartTheme';
import { COLORS } from './DrawingToolbar';
import { NumberInput } from './Bars';
import { Icons } from './icons';

export function Modal({ title, onClose, children, width = 420, bare = false }: { title: string; onClose: () => void; children: ReactNode; width?: number; bare?: boolean }) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [onClose]);
  return (
    <div className={`modal-bg ${bare ? 'bare' : ''}`} onMouseDown={onClose}>
      <div className="modal" style={{ width }} onMouseDown={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <b>{title}</b>
          <button className="icon-btn" onClick={onClose}>
            <Icons.close />
          </button>
        </div>
        <div className="modal-body">{children}</div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- çizim ayarları

const TITLES: Record<Drawing['type'], string> = {
  hline: 'Yatay çizgi',
  trend: 'Trend çizgisi',
  rect: 'Dikdörtgen',
  fib: 'Fibonacci düzeltme',
  long: 'Long pozisyon',
  short: 'Short pozisyon',
};

export function DrawingEditor() {
  const session = useStore((s) => s.session);
  const editingId = useStore((s) => s.editingId);
  const d = drawingsOf(session).find((x) => x.id === editingId);
  if (!d || !session) return null;
  const close = () => useStore.setState({ editingId: null });
  const spec = getSymbol(session.symbol);
  const set = (patch: Partial<Drawing>) => updateDrawing(d.id, patch);

  return (
    <Modal title={TITLES[d.type]} onClose={close} width={d.type === 'fib' ? 460 : 400}>
      {d.type !== 'long' && d.type !== 'short' && (
        <div className="form-row">
          <span>Renk</span>
          <div className="swatches">
            {COLORS.map((c) => (
              <button key={c} className={`swatch ${d.color === c ? 'on' : ''}`} style={{ background: c }} onClick={() => set(d.type === 'rect' ? { color: c, fill: hexToRgba(c, d.fillAlpha ?? 0.15) } : { color: c })} />
            ))}
            <input type="color" className="color-input" title="Özel renk" value={d.color.length === 7 ? d.color : '#2962ff'} onChange={(e) => set(d.type === 'rect' ? { color: e.target.value, fill: hexToRgba(e.target.value, d.fillAlpha ?? 0.15) } : { color: e.target.value })} />
          </div>
        </div>
      )}
      {(d.type === 'hline' || d.type === 'trend' || d.type === 'rect') && (
        <div className="form-row">
          <span>Çizgi stili</span>
          <div className="seg">
            {([['solid', 'Düz'], ['dashed', 'Kesik'], ['dotted', 'Noktalı']] as const).map(([id, label]) => (
              <button key={id} className={(d.style ?? 'solid') === id ? 'on' : ''} onClick={() => set({ style: id })}>
                {label}
              </button>
            ))}
          </div>
        </div>
      )}
      {d.type === 'rect' && (
        <>
          <div className="form-row">
            <span>Dolgu</span>
            <div className="seg">
              {[0, 0.08, 0.15, 0.3, 0.5].map((a) => (
                <button key={a} className={(d.fillAlpha ?? 0.15) === a ? 'on' : ''} onClick={() => set({ fillAlpha: a, fill: hexToRgba(d.color, a) })}>
                  {a === 0 ? 'Yok' : `%${Math.round(a * 100)}`}
                </button>
              ))}
            </div>
          </div>
          <label className="form-row check">
            <input type="checkbox" checked={!!d.midline} onChange={(e) => set({ midline: e.target.checked })} />
            <span>Orta çizgi (%50) ve fiyatı</span>
          </label>
          <label className="form-row check">
            <input type="checkbox" checked={!!d.extendLeft} onChange={(e) => set({ extendLeft: e.target.checked })} />
            <span>Sola uzat</span>
          </label>
        </>
      )}
      {d.type === 'trend' && (
        <>
          <label className="form-row check">
            <input type="checkbox" checked={!!d.extendLeft} onChange={(e) => set({ extendLeft: e.target.checked })} />
            <span>Sola uzat</span>
          </label>
          <label className="form-row check">
            <input type="checkbox" checked={!!d.extendRight} onChange={(e) => set({ extendRight: e.target.checked })} />
            <span>Sağa uzat</span>
          </label>
          <label className="form-row check">
            <input type="checkbox" checked={!!d.midpoint} onChange={(e) => set({ midpoint: e.target.checked })} />
            <span>Orta noktayı göster</span>
          </label>
        </>
      )}
      {d.type !== 'long' && d.type !== 'short' && (
        <div className="form-row">
          <span>Kalınlık</span>
          <div className="seg">
            {[1, 2, 3, 4].map((w) => (
              <button key={w} className={d.width === w ? 'on' : ''} onClick={() => set({ width: w })}>
                {w}px
              </button>
            ))}
          </div>
        </div>
      )}
      {d.type === 'hline' && (
        <div className="form-row">
          <span>Fiyat</span>
          <NumberInput value={d.p} onChange={(p) => set({ p })} />
        </div>
      )}
      {(d.type === 'rect' || d.type === 'fib') && (
        <label className="form-row check">
          <input type="checkbox" checked={!!d.extendRight} onChange={(e) => set({ extendRight: e.target.checked })} />
          <span>Sağa uzat</span>
        </label>
      )}
      {d.type === 'fib' && <FibLevels levels={d.levels} onChange={(levels) => set({ levels })} />}
      {(d.type === 'long' || d.type === 'short') && <PositionFields d={d} digits={spec.digits} />}
      <div className="modal-foot">
        <button
          className="btn danger"
          onClick={() => {
            deleteDrawing(d.id);
            close();
          }}
        >
          Sil
        </button>
        <div className="spacer" />
        <button className="btn primary" onClick={close}>
          Tamam
        </button>
      </div>
    </Modal>
  );
}

function FibLevels({ levels, onChange }: { levels: FibLevel[]; onChange: (l: FibLevel[]) => void }) {
  const [newLevel, setNewLevel] = useState('');
  const sorted = [...levels].sort((a, b) => a.v - b.v);
  const upd = (i: number, patch: Partial<FibLevel>) => onChange(sorted.map((l, j) => (j === i ? { ...l, ...patch } : l)));
  return (
    <div className="fib-levels">
      <div className="fib-grid">
        {sorted.map((l, i) => (
          <div key={i} className="fib-level">
            <input type="checkbox" checked={l.on} onChange={(e) => upd(i, { on: e.target.checked })} />
            <NumberInput value={l.v} onChange={(v) => upd(i, { v })} />
            <button className="icon-btn" title="Seviyeyi kaldır" onClick={() => onChange(sorted.filter((_, j) => j !== i))}>
              <Icons.close />
            </button>
          </div>
        ))}
      </div>
      <div className="form-row">
        <input className="num" placeholder="ör. 0.62" value={newLevel} onChange={(e) => setNewLevel(e.target.value)} onKeyDown={(e) => e.stopPropagation()} />
        <button
          className="btn small"
          onClick={() => {
            const v = Number(newLevel.replace(',', '.'));
            if (Number.isFinite(v)) onChange([...sorted, { v, on: true }]);
            setNewLevel('');
          }}
        >
          Seviye ekle
        </button>
        <div className="spacer" />
        <button className="btn small ghost" title="Yeni Fibonacci çizimleri bu seviyelerle başlasın" onClick={() => setFibDefaults(sorted)}>
          Varsayılan yap
        </button>
      </div>
      <p className="hint">0 = ikinci tıklanan nokta, 1 = ilk nokta. Dipten tepeye çizince 0 tepede olur.</p>
    </div>
  );
}

function PositionFields({ d, digits }: { d: Position; digits: number }) {
  const session = useStore((s) => s.session)!;
  const spec = getSymbol(session.symbol);
  const trade = d.tradeId ? session.trades.find((t) => t.id === d.tradeId) : undefined;
  const lockedEntry = trade && trade.status !== 'pending';
  const locked = trade && (trade.status === 'closed' || trade.status === 'cancelled');
  const risk = Math.abs(d.entry.p - d.sl);
  const rr = risk ? Math.abs(d.tp - d.entry.p) / risk : 0;
  const sized = trade ? trade.lots : lotsForRisk(spec, balanceOf(session), d.riskPct, d.entry.p, d.sl, session.commissionPerLot);
  const lots = sized ?? 0; // null: risk bütçesine sığan lot yok
  const r =(v: number) => Math.round(v * 10 ** digits) / 10 ** digits;
  const long = d.type === 'long';
  const valid = long ? d.sl < d.entry.p && d.tp > d.entry.p : d.sl > d.entry.p && d.tp < d.entry.p;
  return (
    <>
      <div className="form-row">
        <span>Giriş</span>
        {lockedEntry ? <b>{d.entry.p.toFixed(digits)}</b> : <NumberInput value={d.entry.p} onChange={(p) => updateDrawing(d.id, { entry: { ...d.entry, p: r(p) } })} />}
      </div>
      <div className="form-row">
        <span>Stop-loss</span>
        {locked ? <b>{d.sl.toFixed(digits)}</b> : <NumberInput value={d.sl} onChange={(sl) => updateDrawing(d.id, { sl: r(sl) })} />}
        <span className="muted">{fmtDistance(d.sl - d.entry.p, spec)}</span>
      </div>
      <div className="form-row">
        <span>Take-profit</span>
        {locked ? <b>{d.tp.toFixed(digits)}</b> : <NumberInput value={d.tp} onChange={(tp) => updateDrawing(d.id, { tp: r(tp) })} />}
        <span className="muted">{fmtDistance(d.tp - d.entry.p, spec)}</span>
      </div>
      {!trade && (
        <div className="form-row">
          <span>Risk %</span>
          <NumberInput value={d.riskPct} min={0.01} onChange={(riskPct) => updateDrawing(d.id, { riskPct })} />
        </div>
      )}
      <div className="pos-summary">
        <div>
          R:R <b>{rr.toFixed(2)}</b>
        </div>
        <div>
          Lot <b>{sized == null ? 'yok' : lots.toFixed(2)}</b>
        </div>
        <div>
          Risk <b>{fmtMoney(stopRiskPerLot(spec, d.entry.p, d.sl) * lots)}</b>
        </div>
        <div>
          Hedef <b>{fmtMoney(Math.abs(d.tp - d.entry.p) * lots * usdPerPriceUnit(spec, d.tp))}</b>
        </div>
      </div>
      {!trade && sized == null && valid && <p className="hint neg">Risk bütçesine sığan lot yok; stopu daraltın veya risk %'sini artırın.</p>}
      {!valid && <p className="hint neg">{long ? 'Long: SL girişin altında, TP üstünde olmalı.' : 'Short: SL girişin üstünde, TP altında olmalı.'}</p>}
      {!trade && (
        <div className="form-row">
          <button className="btn primary" onClick={() => placeOrderFromDrawing(d.id, true)}>
            Piyasa emri
          </button>
          <button className="btn" onClick={() => placeOrderFromDrawing(d.id, false)}>
            Limit / Stop emri ({d.entry.p.toFixed(digits)})
          </button>
        </div>
      )}
    </>
  );
}

// ---------------------------------------------------------------- grafik ayarları

type SettingsTab = 'symbol' | 'status' | 'scales' | 'canvas';
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
  const [tab, setTab] = useState<SettingsTab>('symbol');
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
  ];
  return (
    <Modal title="Grafik ayarları" width={460} bare onClose={() => useStore.setState({ chartSettingsOpen: false })}>
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
    <Modal title="Replay tarihini değiştir" onClose={close}>
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
