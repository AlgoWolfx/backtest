import { type ReactNode } from 'react';
import { nyLocalToUtc, toNyLocal } from '../../../shared/nytime.js';
import { type Fib, HLine, LineEnd, LineStyleName, Position, Rect, RectExtend, TextNote, TrendLine, VLine } from '../../core/types';

export type Editable = Rect | TrendLine | HLine | VLine | TextNote | Fib | Position;

export type Tab = 'style' | 'text' | 'inputs' | 'coords' | 'vis';

export type Any = Record<string, unknown>;

export const TITLES: Record<Editable['type'], string> = { rect: 'Dikdörtgen', trend: 'Trend çizgisi', hline: 'Yatay ışın', vline: 'Dikey çizgi', text: 'Metin notu', fib: 'Fib düzeltme', long: 'Long pozisyon', short: 'Short pozisyon' };

const LINE_STYLES: LineStyleName[] = ['solid', 'dashed', 'dotted'];

const STYLE_LABEL: Record<LineStyleName, string> = { solid: '───', dashed: '- - -', dotted: '· · ·' };

export function StyleButton({ value, onChange }: { value: LineStyleName; onChange: (v: LineStyleName) => void }) {
  return (
    <button className="tvd-linebtn" title="Çizgi stili" onClick={() => onChange(LINE_STYLES[(LINE_STYLES.indexOf(value) + 1) % LINE_STYLES.length])}>
      {STYLE_LABEL[value]}
    </button>
  );
}

export const Row = ({ label, children, check }: { label?: ReactNode; children?: ReactNode; check?: ReactNode }) => (
  <div className="tvd-row">
    {check}
    {label != null && <span className="tvd-label">{label}</span>}
    <div className="tvd-ctl">{children}</div>
  </div>
);

export const Check = ({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) => <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />;

export const WidthSelect = ({ value, onChange }: { value: number; onChange: (w: number) => void }) => (
  <select className="tvd-select sm" value={value} onChange={(e) => onChange(Number(e.target.value))} title="Kalınlık">
    {[1, 2, 3, 4].map((w) => (
      <option key={w} value={w}>
        {w}px
      </option>
    ))}
  </select>
);

const extendOf = (d: { extendLeft?: boolean; extendRight?: boolean }): RectExtend => (d.extendLeft && d.extendRight ? 'both' : d.extendLeft ? 'left' : d.extendRight ? 'right' : 'none');

export const ExtendSelect = ({ d, set }: { d: { extendLeft?: boolean; extendRight?: boolean }; set: (p: Any) => void }) => (
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
export const toInput = (t: number) => new Date(toNyLocal(t) * 1000).toISOString().slice(0, 16);

export const fromInput = (s: string): number | null => {
  const ms = Date.parse(`${s}:00Z`);
  return Number.isFinite(ms) ? nyLocalToUtc(ms / 1000) : null;
};

export const SIZES = [8, 10, 11, 12, 14, 16, 20, 24, 28, 32, 40];

export const END_OPTS: { id: LineEnd; label: string }[] = [
  { id: 'normal', label: 'Normal' },
  { id: 'arrow', label: 'Ok' },
];
