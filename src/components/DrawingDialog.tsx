// TradingView tarzı çizim ayar penceresi: Stil / Metin / Girdiler / Kordinatlar / Görünürlük sekmeleri, renk + opaklık
// seçici, Şablon menüsü ve İptal / Tamam. Mevcut tüm araçlar için: dikdörtgen, trend çizgisi, yatay çizgi, Fibonacci,
// long / short pozisyon. Değişiklikler canlı uygulanır; İptal (veya Esc / ×) pencere açıldığı hâle döndürür.

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { getSymbol } from '../../shared/symbols.js';
import { nyLocalToUtc, toNyLocal } from '../../shared/nytime.js';
import { hexToRgba } from '../chart/drawUtil';
import { TIMEFRAMES, type TF } from '../core/timeframes';
import { lotsForRisk, stopRiskPerLot, usdPerPriceUnit } from '../core/trading';
import { DEFAULT_FIB, type Drawing, type Fib, FibLevel, HLine, LineEnd, LineStyleName, Position, Rect, RectExtend, StatsMode, TextHAlign, TextVAlign, TrendLine } from '../core/types';
import { clearTemplate, factoryReset, loadTemplate, saveTemplate, templateOf } from '../drawingTemplates';
import { fmtDistance, fmtMoney } from '../format';
import { balanceOf, placeOrderFromDrawing, recordUndo, setFibDefaults, toast, updateDrawing, useStore } from '../store';
import { useWindow } from '../useWindow';
import { NumberInput } from './Bars';
import { SizeControl } from './SizeControl';
import { Icons } from './icons';

type Editable = Rect | TrendLine | HLine | Fib | Position;
type Tab = 'style' | 'text' | 'inputs' | 'coords' | 'vis';
type Any = Record<string, unknown>;

const TITLES: Record<Editable['type'], string> = { rect: 'Dikdörtgen', trend: 'Trend çizgisi', hline: 'Yatay ışın', fib: 'Fib düzeltme', long: 'Long pozisyon', short: 'Short pozisyon' };

/** TradingView benzeri palet: gri tonlar + 8 renk x 5 ton. */
const PALETTE: string[][] = [
  ['#ffffff', '#d1d4dc', '#b2b5be', '#9598a1', '#787b86', '#5d606b', '#434651', '#2a2e39', '#131722', '#000000'],
  ['#fccbcd', '#ffe0b2', '#fff9c4', '#c8e6c9', '#b2dfdb', '#b2ebf2', '#bbd6fb', '#d1c4e9', '#e1bee7', '#f8bbd0'],
  ['#faa1a4', '#ffcc80', '#fff59d', '#a5d6a7', '#80cbc4', '#80deea', '#90bff9', '#b39ddb', '#ce93d8', '#f48fb1'],
  ['#f77c80', '#ffb74d', '#fff176', '#81c784', '#4db6ac', '#4dd0e1', '#5b9cf6', '#9575cd', '#ba68c8', '#f06292'],
  ['#f23645', '#ff9800', '#ffeb3b', '#4caf50', '#089981', '#00bcd4', '#2962ff', '#673ab7', '#9c27b0', '#e91e63'],
  ['#b22833', '#e65100', '#f9a825', '#2e7d32', '#056656', '#00838f', '#1848cc', '#311b92', '#6a1b9a', '#880e4f'],
];

/** Renk kutusu + palet / özel renk / opaklık penceresi (TradingView renk seçicisi). */
export function TvColor({ color, alpha = 1, onChange, withAlpha = true }: { color: string; alpha?: number; onChange: (color: string, alpha: number) => void; withAlpha?: boolean }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    window.addEventListener('mousedown', h, true); // yakalama aşaması: pencere mousedown olayını durdurduğu için
    return () => window.removeEventListener('mousedown', h, true);
  }, [open]);
  const hex = /^#[0-9a-fA-F]{6}$/.test(color) ? color : '#2962ff';
  return (
    <div className="tvc" ref={ref}>
      <button className="tvc-box" title="Renk" onClick={() => setOpen(!open)}>
        <span className="tvc-fill" style={{ background: hexToRgba(hex, alpha) }} />
      </button>
      {open && (
        <div className="tvc-pop">
          {PALETTE.map((row, i) => (
            <div className="tvc-row" key={i}>
              {row.map((c) => (
                <button key={c} className={`tvc-sw ${c.toLowerCase() === hex.toLowerCase() ? 'on' : ''}`} style={{ background: c }} onClick={() => onChange(c, alpha)} />
              ))}
            </div>
          ))}
          <div className="tvc-custom">
            <label>
              Özel
              <input type="color" value={hex} onChange={(e) => onChange(e.target.value, alpha)} />
            </label>
            {withAlpha && (
              <label className="tvc-alpha">
                Opaklık
                <input type="range" min={0} max={100} value={Math.round(alpha * 100)} onChange={(e) => onChange(hex, Number(e.target.value) / 100)} />
                <span>{Math.round(alpha * 100)}%</span>
              </label>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

const LINE_STYLES: LineStyleName[] = ['solid', 'dashed', 'dotted'];
const STYLE_LABEL: Record<LineStyleName, string> = { solid: '───', dashed: '- - -', dotted: '· · ·' };

function StyleButton({ value, onChange }: { value: LineStyleName; onChange: (v: LineStyleName) => void }) {
  return (
    <button className="tvd-linebtn" title="Çizgi stili" onClick={() => onChange(LINE_STYLES[(LINE_STYLES.indexOf(value) + 1) % LINE_STYLES.length])}>
      {STYLE_LABEL[value]}
    </button>
  );
}

const Row = ({ label, children, check }: { label?: ReactNode; children?: ReactNode; check?: ReactNode }) => (
  <div className="tvd-row">
    {check}
    {label != null && <span className="tvd-label">{label}</span>}
    <div className="tvd-ctl">{children}</div>
  </div>
);

const Check = ({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) => <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />;

const WidthSelect = ({ value, onChange }: { value: number; onChange: (w: number) => void }) => (
  <select className="tvd-select sm" value={value} onChange={(e) => onChange(Number(e.target.value))} title="Kalınlık">
    {[1, 2, 3, 4].map((w) => (
      <option key={w} value={w}>
        {w}px
      </option>
    ))}
  </select>
);

const extendOf = (d: { extendLeft?: boolean; extendRight?: boolean }): RectExtend => (d.extendLeft && d.extendRight ? 'both' : d.extendLeft ? 'left' : d.extendRight ? 'right' : 'none');
const ExtendSelect = ({ d, set }: { d: { extendLeft?: boolean; extendRight?: boolean }; set: (p: Any) => void }) => (
  <select
    className="tvd-select"
    value={extendOf(d)}
    onChange={(e) => {
      const v = e.target.value as RectExtend;
      set({ extendLeft: v === 'left' || v === 'both', extendRight: v === 'right' || v === 'both' });
    }}
  >
    <option value="none">Yok</option>
    <option value="left">Sola</option>
    <option value="right">Sağa</option>
    <option value="both">İki yana</option>
  </select>
);

/** UTC saniye <-> NY yerel "YYYY-MM-DDTHH:MM" (datetime-local) */
const toInput = (t: number) => new Date(toNyLocal(t) * 1000).toISOString().slice(0, 16);
const fromInput = (s: string): number | null => {
  const ms = Date.parse(`${s}:00Z`);
  return Number.isFinite(ms) ? nyLocalToUtc(ms / 1000) : null;
};

const SIZES = [8, 10, 11, 12, 14, 16, 20, 24, 28, 32, 40];

/** Metin ayarları: renk, boyut, B / I, metin kutusu, hizalama (dikdörtgen, trend ve yatay çizgi ortak). */
function TextTab({ d, set, aligns }: { d: Rect | TrendLine | HLine; set: (p: Any) => void; aligns: { h: TextHAlign; v: TextVAlign } }) {
  return (
    <>
      <div className="tvd-textbar">
        <TvColor color={d.textColor ?? (d.type === 'rect' ? '#ffffff' : d.color)} onChange={(c) => set({ textColor: c })} withAlpha={false} />
        <select className="tvd-select sm" value={d.textSize ?? (d.type === 'rect' ? 14 : 12)} onChange={(e) => set({ textSize: Number(e.target.value) })}>
          {SIZES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        <button className={`tvd-tog ${d.bold ? 'on' : ''}`} title="Kalın" onClick={() => set({ bold: !d.bold })}>
          <b>B</b>
        </button>
        <button className={`tvd-tog ${d.italic ? 'on' : ''}`} title="İtalik" onClick={() => set({ italic: !d.italic })}>
          <i>I</i>
        </button>
      </div>
      <textarea className="tvd-textarea" placeholder="Metin ekle" value={d.text ?? ''} onChange={(e) => set({ text: e.target.value })} />
      <Row label="Metin hizalama">
        <select className="tvd-select" value={d.vAlign ?? aligns.v} onChange={(e) => set({ vAlign: e.target.value as TextVAlign })}>
          <option value="top">Üst</option>
          <option value="middle">{d.type === 'rect' ? 'İçeri' : 'Orta'}</option>
          <option value="bottom">Alt</option>
        </select>
        <select className="tvd-select" value={d.hAlign ?? aligns.h} onChange={(e) => set({ hAlign: e.target.value as TextHAlign })}>
          <option value="left">Sol</option>
          <option value="center">Orta</option>
          <option value="right">Sağ</option>
        </select>
      </Row>
    </>
  );
}

const END_OPTS: { id: LineEnd; label: string }[] = [
  { id: 'normal', label: 'Normal' },
  { id: 'arrow', label: 'Ok' },
];

function TrendStyle({ d, set }: { d: TrendLine; set: (p: Any) => void }) {
  const mode: StatsMode = d.statsMode ?? 'hidden';
  const stat = (label: string, key: keyof TrendLine, def: boolean) => (
    <label className="tvd-statrow">
      <Check checked={(d[key] as boolean | undefined) ?? def} onChange={(v) => set({ [key]: v })} />
      <span>{label}</span>
    </label>
  );
  return (
    <>
      <Row label="Çizgi">
        <TvColor color={d.color} alpha={d.lineAlpha ?? 1} onChange={(c, a) => set({ color: c, lineAlpha: a })} />
        <WidthSelect value={d.width} onChange={(width) => set({ width })} />
        <StyleButton value={d.style ?? 'solid'} onChange={(style) => set({ style })} />
      </Row>
      <Row label="Sol uç">
        <select className="tvd-select" value={d.leftEnd ?? 'normal'} onChange={(e) => set({ leftEnd: e.target.value })}>
          {END_OPTS.map((o) => (
            <option key={o.id} value={o.id}>
              {o.label}
            </option>
          ))}
        </select>
      </Row>
      <Row label="Sağ uç">
        <select className="tvd-select" value={d.rightEnd ?? 'normal'} onChange={(e) => set({ rightEnd: e.target.value })}>
          {END_OPTS.map((o) => (
            <option key={o.id} value={o.id}>
              {o.label}
            </option>
          ))}
        </select>
      </Row>
      <Row label="Uzat">
        <ExtendSelect d={d} set={set} />
      </Row>
      <Row label="Orta nokta" check={<Check checked={!!d.midpoint} onChange={(v) => set({ midpoint: v })} />} />
      <Row label="Fiyat etiketleri" check={<Check checked={!!d.showPriceLabels} onChange={(v) => set({ showPriceLabels: v })} />} />
      <Row label="İstatistikler">
        <select className="tvd-select" value={mode} onChange={(e) => set({ statsMode: e.target.value })}>
          <option value="hidden">Gizli</option>
          <option value="always">Her zaman</option>
          <option value="selected">Seçiliyken</option>
        </select>
      </Row>
      {mode !== 'hidden' && (
        <div className="tvd-stats">
          {stat('Fiyat aralığı', 'statPrice', true)}
          {stat('% değişim', 'statPct', true)}
          {stat('Mum sayısı', 'statBars', true)}
          {stat('Tarih / süre', 'statTime', false)}
          {stat('Mesafe', 'statDist', false)}
          {stat('Açı', 'statAngle', false)}
        </div>
      )}
    </>
  );
}

function RectStyle({ d, set }: { d: Rect; set: (p: Any) => void }) {
  return (
    <>
      <Row label="Uzat">
        <ExtendSelect d={d} set={set} />
      </Row>
      <Row label="Kenar" check={<Check checked={d.borderOn !== false && (d.borderAlpha ?? 1) > 0} onChange={(v) => set({ borderOn: v, borderAlpha: v && !(d.borderAlpha ?? 1) ? 1 : d.borderAlpha })} />}>
        <TvColor color={d.borderColor ?? d.color} alpha={d.borderAlpha ?? 1} onChange={(c, a) => set({ borderColor: c, borderAlpha: a, borderOn: a > 0 })} />
        <WidthSelect value={d.width} onChange={(width) => set({ width })} />
        <StyleButton value={d.style ?? 'solid'} onChange={(style) => set({ style })} />
      </Row>
      <Row label="Orta çizgi" check={<Check checked={!!d.midline} onChange={(v) => set({ midline: v })} />}>
        <TvColor color={d.midColor ?? d.borderColor ?? d.color} onChange={(c) => set({ midColor: c })} withAlpha={false} />
        <StyleButton value={d.midStyle ?? 'dashed'} onChange={(midStyle) => set({ midStyle })} />
      </Row>
      <Row label="Arkaplan" check={<Check checked={d.fillOn ?? (d.fillAlpha ?? 0.15) > 0} onChange={(v) => set({ fillOn: v, fillAlpha: v && !(d.fillAlpha ?? 0.15) ? 0.15 : d.fillAlpha })} />}>
        <TvColor color={d.fillColor ?? d.color} alpha={d.fillAlpha ?? 0.15} onChange={(c, a) => set({ fillColor: c, fillAlpha: a, fillOn: a > 0, fill: hexToRgba(c, a) })} />
      </Row>
    </>
  );
}

function HLineStyle({ d, set }: { d: HLine; set: (p: Any) => void }) {
  return (
    <>
      <Row label="Çizgi">
        <TvColor color={d.color} alpha={d.lineAlpha ?? 1} onChange={(c, a) => set({ color: c, lineAlpha: a })} />
        <WidthSelect value={d.width} onChange={(width) => set({ width })} />
        <StyleButton value={d.style ?? 'solid'} onChange={(style) => set({ style })} />
      </Row>
      {d.t != null && <Row label="Sola da uzat" check={<Check checked={!!d.extendLeft} onChange={(v) => set({ extendLeft: v })} />} />}
      <Row label="Fiyat etiketi" check={<Check checked={d.showPriceLabel !== false} onChange={(v) => set({ showPriceLabel: v })} />} />
    </>
  );
}

function FibLevels({ levels, baseColor, onChange }: { levels: FibLevel[]; baseColor: string; onChange: (l: FibLevel[]) => void }) {
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
            <TvColor color={l.color ?? baseColor} onChange={(c) => upd(i, { color: c })} withAlpha={false} />
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

function FibStyle({ d, set }: { d: Fib; set: (p: Any) => void }) {
  return (
    <>
      <Row label="Trend çizgisi" check={<Check checked={d.showTrend !== false} onChange={(v) => set({ showTrend: v })} />}>
        <TvColor color={d.trendColor ?? d.color} onChange={(c) => set({ trendColor: c })} withAlpha={false} />
        <WidthSelect value={d.trendWidth ?? 1} onChange={(trendWidth) => set({ trendWidth })} />
        <StyleButton value={d.trendStyle ?? 'dashed'} onChange={(trendStyle) => set({ trendStyle })} />
      </Row>
      <Row label="Seviye çizgisi">
        <WidthSelect value={d.levelWidth ?? d.width} onChange={(levelWidth) => set({ levelWidth })} />
        <StyleButton value={d.levelStyle ?? 'solid'} onChange={(levelStyle) => set({ levelStyle })} />
      </Row>
      <Row label="Renk">
        <TvColor color={d.color} onChange={(c) => set({ color: c })} withAlpha={false} />
        <label className="tvd-statrow">
          <Check checked={!!d.oneColor} onChange={(v) => set({ oneColor: v })} />
          <span>Tek renk</span>
        </label>
      </Row>
      <FibLevels levels={d.levels} baseColor={d.color} onChange={(levels) => set({ levels })} />
      <Row label="Uzat">
        <ExtendSelect d={d} set={set} />
      </Row>
      <Row label="Ters çevir" check={<Check checked={!!d.reverse} onChange={(v) => set({ reverse: v })} />} />
      <Row label="Fiyatlar" check={<Check checked={d.showPrices !== false} onChange={(v) => set({ showPrices: v })} />} />
      <Row label="Seviyeler" check={<Check checked={d.showLevels !== false} onChange={(v) => set({ showLevels: v })} />} />
      <Row label="Etiket konumu">
        <select className="tvd-select" value={d.labelH ?? 'left'} onChange={(e) => set({ labelH: e.target.value })}>
          <option value="left">Sol</option>
          <option value="right">Sağ</option>
        </select>
        <select className="tvd-select" value={d.labelV ?? 'middle'} onChange={(e) => set({ labelV: e.target.value })}>
          <option value="top">Üst</option>
          <option value="middle">Orta</option>
          <option value="bottom">Alt</option>
        </select>
      </Row>
      <Row label="Arkaplan" check={<Check checked={!!d.bgOn && (d.bgAlpha ?? 0.15) > 0} onChange={(v) => set({ bgOn: v, bgAlpha: v && !(d.bgAlpha ?? 0.15) ? 0.15 : d.bgAlpha })} />}>
        <TvColor color={d.bgColor ?? d.color} alpha={d.bgAlpha ?? 0.15} onChange={(c, a) => set({ bgColor: c, bgAlpha: a, bgOn: a > 0 })} />
        {d.bgColor && (
          <button className="tvd-btn" title="Her aralık kendi seviye renginde olsun" onClick={() => set({ bgColor: undefined })}>
            Seviye renkleri
          </button>
        )}
      </Row>
    </>
  );
}

function PositionStyle({ d, set }: { d: Position; set: (p: Any) => void }) {
  return (
    <>
      <Row label="Kâr bölgesi">
        <TvColor color={d.profitColor ?? '#089981'} alpha={d.profitAlpha ?? d.zoneAlpha ?? 0.2} onChange={(c, a) => set({ profitColor: c, profitAlpha: a })} />
      </Row>
      <Row label="Zarar bölgesi">
        <TvColor color={d.lossColor ?? '#f23645'} alpha={d.lossAlpha ?? d.zoneAlpha ?? 0.2} onChange={(c, a) => set({ lossColor: c, lossAlpha: a })} />
      </Row>
      <Row label="Giriş çizgisi">
        <TvColor color={d.lineColor ?? '#787b86'} onChange={(c) => set({ lineColor: c })} withAlpha={false} />
      </Row>
      <Row label="Yazı rengi">
        <TvColor color={d.textColor ?? '#ffffff'} onChange={(c) => set({ textColor: c })} withAlpha={false} />
      </Row>
      <Row label="İstatistikleri her zaman göster" check={<Check checked={!!d.alwaysStats} onChange={(v) => set({ alwaysStats: v })} />} />
      <Row label="Kompakt" check={<Check checked={!!d.compact} onChange={(v) => set({ compact: v })} />} />
    </>
  );
}

/** Pozisyon girdileri: giriş, SL, TP, risk %, özet ve emir butonları. */
function PositionInputs({ d, digits }: { d: Position; digits: number }) {
  const session = useStore((s) => s.session)!;
  const spec = getSymbol(session.symbol);
  const trade = d.tradeId ? session.trades.find((t) => t.id === d.tradeId) : undefined;
  const lockedEntry = trade && trade.status !== 'pending';
  const locked = trade && (trade.status === 'closed' || trade.status === 'cancelled');
  const risk = Math.abs(d.entry.p - d.sl);
  const rr = risk ? Math.abs(d.tp - d.entry.p) / risk : 0;
  const sized = trade ? trade.lots : d.lots != null ? d.lots : lotsForRisk(spec, balanceOf(session), d.riskPct, d.entry.p, d.sl, session.commissionPerLot);
  const lots = sized ?? 0; // null: risk bütçesine sığan lot yok
  const r = (v: number) => Math.round(v * 10 ** digits) / 10 ** digits;
  const long = d.type === 'long';
  const valid = long ? d.sl < d.entry.p && d.tp > d.entry.p : d.sl > d.entry.p && d.tp < d.entry.p;
  return (
    <>
      <div className="form-row">
        <span>Giriş</span>
        {lockedEntry ? <b>{d.entry.p.toFixed(digits)}</b> : <NumberInput value={d.entry.p} onChange={(p) => updateDrawing(d.id, { entry: { ...d.entry, p: r(p) } }, false)} />}
      </div>
      <div className="form-row">
        <span>Stop-loss</span>
        {locked ? <b>{d.sl.toFixed(digits)}</b> : <NumberInput value={d.sl} onChange={(sl) => updateDrawing(d.id, { sl: r(sl) }, false)} />}
        <span className="muted">{fmtDistance(d.sl - d.entry.p, spec)}</span>
      </div>
      <div className="form-row">
        <span>Take-profit</span>
        {locked ? <b>{d.tp.toFixed(digits)}</b> : <NumberInput value={d.tp} onChange={(tp) => updateDrawing(d.id, { tp: r(tp) }, false)} />}
        <span className="muted">{fmtDistance(d.tp - d.entry.p, spec)}</span>
      </div>
      {(!trade || trade.status === 'pending') && (
        <div className="form-row">
          <span>Boyut</span>
          <SizeControl d={d} record={false} />
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

export function DrawingDialog({ d }: { d: Editable }) {
  const [tab, setTab] = useState<Tab>('style');
  const win = useWindow('drawing');
  const snapshot = useRef<Editable>(structuredClone(d));
  const digits = useStore((s) => (s.session ? Math.max(0, Math.min(8, (s.data[s.session.symbol]?.scale ?? 1e5).toString().length - 1)) : 5));
  useEffect(() => {
    recordUndo(); // Ctrl+Z, pencere sonrası tüm değişikliği geri alabilsin
  }, []);

  const set = (patch: Any) => updateDrawing(d.id, patch as never, false);
  const close = () => useStore.setState({ editingId: null });
  const cancel = () => {
    const snap = snapshot.current as unknown as Record<string, unknown>;
    const undo: Record<string, unknown> = { ...snap };
    for (const k of Object.keys(d)) if (!(k in snap)) undo[k] = undefined;
    updateDrawing(d.id, undo as never, false);
    close();
  };
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === 'Escape' && cancel();
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  });

  const hidden = d.hiddenTfs ?? [];
  const toggleTf = (tf: TF, on: boolean) => set({ hiddenTfs: on ? hidden.filter((x) => x !== tf) : [...hidden, tf] });
  const isPos = d.type === 'long' || d.type === 'short';
  const hasText = d.type === 'rect' || d.type === 'trend' || d.type === 'hline';
  const tabs: { id: Tab; label: string }[] = [
    { id: 'style', label: 'Stil' },
    ...(hasText ? [{ id: 'text' as Tab, label: 'Metin' }] : []),
    ...(isPos ? [{ id: 'inputs' as Tab, label: 'Girdiler' }] : []),
    { id: 'coords', label: 'Kordinatlar' },
    { id: 'vis', label: 'Görünürlük' },
  ];
  const price = (v: number) => (Number.isFinite(v) ? v.toFixed(digits) : '');

  const priceInput = (key: string, p: number, apply: (v: number) => Any) => (
    <input
      className="tvd-input"
      defaultValue={price(p)}
      key={`${key}${p}`}
      onBlur={(e) => {
        const v = Number(e.target.value.replace(',', '.'));
        if (Number.isFinite(v)) set(apply(v));
      }}
    />
  );
  const timeInput = (key: string, t: number, apply: (v: number) => Any) => (
    <input
      className="tvd-input"
      type="datetime-local"
      key={`${key}${t}`}
      defaultValue={toInput(t)}
      onBlur={(e) => {
        const v = fromInput(e.target.value);
        if (v != null) set(apply(v));
      }}
    />
  );

  return (
    <div ref={win.winRef} style={win.style} className={`tvd ${win.min ? 'min' : ''}`} onMouseDown={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
      <div className="tvd-head" {...win.headProps}>
        <b>{TITLES[d.type]}</b>
        <span className="tvd-head-btns">
          <button className="icon-btn" title={win.min ? 'Büyüt' : 'Küçült (çizimi görmek için)'} onClick={win.toggleMin}>
            {win.min ? '▢' : '–'}
          </button>
          <button className="icon-btn tvd-x" title="Kapat (Esc: iptal)" onClick={cancel}>
            <Icons.close />
          </button>
        </span>
      </div>
      <div className="tvd-tabs">
        {tabs.map((t) => (
          <button key={t.id} className={tab === t.id ? 'on' : ''} onClick={() => setTab(t.id)}>
            {t.label}
          </button>
        ))}
      </div>

      <div className="tvd-body">
        {tab === 'style' && d.type === 'rect' && <RectStyle d={d} set={set} />}
        {tab === 'style' && d.type === 'trend' && <TrendStyle d={d} set={set} />}
        {tab === 'style' && d.type === 'hline' && <HLineStyle d={d} set={set} />}
        {tab === 'style' && d.type === 'fib' && <FibStyle d={d} set={set} />}
        {tab === 'style' && isPos && <PositionStyle d={d as Position} set={set} />}

        {tab === 'text' && d.type === 'rect' && <TextTab d={d} set={set} aligns={{ h: 'right', v: 'middle' }} />}
        {tab === 'text' && d.type === 'trend' && <TextTab d={d} set={set} aligns={{ h: 'center', v: 'top' }} />}
        {tab === 'text' && d.type === 'hline' && <TextTab d={d} set={set} aligns={{ h: 'right', v: 'top' }} />}

        {tab === 'inputs' && isPos && <PositionInputs d={d as Position} digits={digits} />}

        {tab === 'coords' && (
          <>
            {d.type === 'hline' && <Row label="Fiyat">{priceInput('p', d.p, (v) => ({ p: v }))}</Row>}
            {d.type === 'hline' && d.t != null && <Row label="Başlangıç zamanı (NY)">{timeInput('t', d.t, (t) => ({ t }))}</Row>}
            {(d.type === 'rect' || d.type === 'trend' || d.type === 'fib') &&
              (['a', 'b'] as const).map((k, i) => (
                <div key={k} className="tvd-coord">
                  <Row label={`Fiyat ${i + 1}`}>{priceInput(k, d[k].p, (v) => ({ [k]: { ...d[k], p: v } }))}</Row>
                  <Row label={`Zaman ${i + 1} (NY)`}>{timeInput(k, d[k].t, (t) => ({ [k]: { ...d[k], t } }))}</Row>
                </div>
              ))}
            {isPos && (
              <>
                <Row label="Giriş zamanı (NY)">{timeInput('e', (d as Position).entry.t, (t) => ({ entry: { ...(d as Position).entry, t } }))}</Row>
                <Row label="Bitiş zamanı (NY)">{timeInput('x', (d as Position).tEnd, (t) => ({ tEnd: t }))}</Row>
              </>
            )}
            <p className="hint">Zaman New York saatidir ve gerçek zamana bağlıdır; zaman dilimi değişse de çizim aynı yerde kalır.</p>
          </>
        )}

        {tab === 'vis' && (
          <>
            <p className="hint">Çizim yalnızca işaretli zaman dilimlerinde görünür.</p>
            <div className="tvd-vis">
              {TIMEFRAMES.map((t) => (
                <label key={t.id} className="tvd-visrow">
                  <input type="checkbox" checked={!hidden.includes(t.id)} onChange={(e) => toggleTf(t.id, e.target.checked)} />
                  <span>{t.label}</span>
                </label>
              ))}
            </div>
          </>
        )}
      </div>

      <div className="tvd-foot">
        <TemplateMenu d={d} set={set} />
        <div className="spacer" />
        <button className="tvd-btn" onClick={cancel}>
          İptal
        </button>
        <button className="tvd-btn primary" onClick={close}>
          Tamam
        </button>
      </div>
    </div>
  );
}

/** Şablon: bu çizim türü için stilleri varsayılan olarak kaydet / uygula / fabrika ayarlarına dön. */
function TemplateMenu({ d, set }: { d: Drawing; set: (p: Any) => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const type = d.type as keyof typeof TITLES;
  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    window.addEventListener('mousedown', h, true); // yakalama aşaması: pencere mousedown olayını durdurduğu için
    return () => window.removeEventListener('mousedown', h, true);
  }, [open]);
  const item = (label: string, fn: () => void) => (
    <button
      className="tvd-menuitem"
      onClick={() => {
        fn();
        setOpen(false);
      }}
    >
      {label}
    </button>
  );
  return (
    <div className="tvd-tpl" ref={ref}>
      <button className="tvd-btn" onClick={() => setOpen(!open)}>
        Şablon ▾
      </button>
      {open && (
        <div className="tvd-menu">
          {item('Varsayılan olarak kaydet', () => {
            saveTemplate(type, templateOf(d));
            toast(`${TITLES[type]} stili varsayılan olarak kaydedildi (yeni çizimler bununla başlar).`);
          })}
          {item('Varsayılanı uygula', () => set({ ...loadTemplate(type) }))}
          {item('Fabrika ayarlarına dön', () => {
            clearTemplate(type);
            set(factoryReset(type, useStore.getState().session?.fibDefaults ?? DEFAULT_FIB));
          })}
        </div>
      )}
    </div>
  );
}
