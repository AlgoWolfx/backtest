import { useState } from 'react';
import { hexToRgba } from '../../chart/drawUtil';
import { type Fib, FibLevel, HLine, Position, Rect, StatsMode, TextHAlign, TextNote, TextVAlign, TrendLine, VLine } from '../../core/types';
import { setFibDefaults } from '../../store';
import { NumberInput } from '../common/NumberInput';
import { Icons } from '../common/icons';
import { type Any, StyleButton, Row, Check, WidthSelect, ExtendSelect, SIZES, END_OPTS } from './dialogParts';
import { TvColor } from '../common/TvColor';

/** Metin ayarları: renk, boyut, B / I, metin kutusu, hizalama (dikdörtgen, trend ve yatay çizgi ortak). */
export function TextTab({ d, set, aligns }: { d: Rect | TrendLine | HLine | VLine | TextNote; set: (p: Any) => void; aligns?: { h: TextHAlign; v: TextVAlign } }) {
  return (
    <>
      <div className="tvd-textbar">
        <TvColor color={d.textColor ?? (d.type === 'rect' ? '#ffffff' : d.color)} onChange={(c) => set({ textColor: c })} withAlpha={false} />
        <select className="tvd-select sm" value={d.textSize ?? (d.type === 'rect' || d.type === 'text' ? 14 : 12)} onChange={(e) => set({ textSize: Number(e.target.value) })}>
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
      {aligns && d.type !== 'text' && (
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
      )}
    </>
  );
}

export function TrendStyle({ d, set }: { d: TrendLine; set: (p: Any) => void }) {
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

export function RectStyle({ d, set }: { d: Rect; set: (p: Any) => void }) {
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

export function VLineStyle({ d, set }: { d: VLine; set: (p: Any) => void }) {
  return (
    <Row label="Çizgi">
      <TvColor color={d.color} alpha={d.lineAlpha ?? 1} onChange={(c, a) => set({ color: c, lineAlpha: a })} />
      <WidthSelect value={d.width} onChange={(width) => set({ width })} />
      <StyleButton value={d.style ?? 'solid'} onChange={(style) => set({ style })} />
    </Row>
  );
}

export function TextNoteStyle({ d, set }: { d: TextNote; set: (p: Any) => void }) {
  return (
    <>
      <Row label="Metin rengi">
        <TvColor color={d.textColor ?? d.color} onChange={(c) => set({ textColor: c, color: c })} withAlpha={false} />
      </Row>
      <Row label="Arkaplan" check={<Check checked={!!d.bgOn} onChange={(v) => set({ bgOn: v })} />}>
        <TvColor color={d.bgColor ?? '#2a2e39'} alpha={d.bgAlpha ?? 0.85} onChange={(c, a) => set({ bgColor: c, bgAlpha: a, bgOn: a > 0 })} />
      </Row>
    </>
  );
}

export function HLineStyle({ d, set }: { d: HLine; set: (p: Any) => void }) {
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

export function FibStyle({ d, set }: { d: Fib; set: (p: Any) => void }) {
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

export function PositionStyle({ d, set }: { d: Position; set: (p: Any) => void }) {
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
