// TradingView tarzı çizim ayar penceresi: Stil / Metin / Koordinatlar / Görünürlük sekmeleri, renk + opaklık seçici,
// Şablon menüsü ve İptal / Tamam. Değişiklikler canlı uygulanır; İptal (veya Esc / ×) pencere açıldığı hâle döndürür.

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { nyLocalToUtc, toNyLocal } from '../../shared/nytime.js';
import { hexToRgba } from '../chart/DrawingLayer';
import { TIMEFRAMES, type TF } from '../core/timeframes';
import type { HLine, LineStyleName, Rect, RectExtend, TextHAlign, TextVAlign, TrendLine } from '../core/types';
import { clearRectTemplate, loadRectTemplate, rectTemplateOf, saveRectTemplate } from '../drawingTemplates';
import { recordUndo, toast, updateDrawing, useStore } from '../store';
import { Icons } from './icons';

type Editable = Rect | TrendLine | HLine;
type Tab = 'style' | 'text' | 'coords' | 'vis';

const TITLES: Record<Editable['type'], string> = { rect: 'Dikdörtgen', trend: 'Trend çizgisi', hline: 'Yatay çizgi' };

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
    window.addEventListener('mousedown', h);
    return () => window.removeEventListener('mousedown', h);
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

const extendOf = (d: Rect): RectExtend => (d.extendLeft && d.extendRight ? 'both' : d.extendLeft ? 'left' : d.extendRight ? 'right' : 'none');

/** UTC saniye <-> NY yerel "YYYY-MM-DDTHH:MM" (datetime-local) */
const toInput = (t: number) => new Date(toNyLocal(t) * 1000).toISOString().slice(0, 16);
const fromInput = (s: string): number | null => {
  const ms = Date.parse(`${s}:00Z`);
  return Number.isFinite(ms) ? nyLocalToUtc(ms / 1000) : null;
};

const SIZES = [8, 10, 11, 12, 14, 16, 20, 24, 28, 32, 40];

export function DrawingDialog({ d }: { d: Editable }) {
  const [tab, setTab] = useState<Tab>('style');
  const snapshot = useRef<Editable>(structuredClone(d));
  const digits = useStore((s) => (s.session ? Math.max(0, Math.min(8, (s.data[s.session.symbol]?.scale ?? 1e5).toString().length - 1)) : 5));
  useEffect(() => {
    recordUndo(); // Ctrl+Z, pencere sonrası tüm değişikliği geri alabilsin
  }, []);

  const set = (patch: Partial<Editable>) => updateDrawing(d.id, patch as never, false);
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

  const rect = d.type === 'rect' ? d : null;
  const hidden = d.hiddenTfs ?? [];
  const toggleTf = (tf: TF, on: boolean) => set({ hiddenTfs: on ? hidden.filter((x) => x !== tf) : [...hidden, tf] });
  const tabs: { id: Tab; label: string }[] = [{ id: 'style', label: 'Stil' }, ...(rect ? [{ id: 'text' as Tab, label: 'Metin' }] : []), { id: 'coords', label: 'Kordinatlar' }, { id: 'vis', label: 'Görünürlük' }];
  const price = (v: number) => (Number.isFinite(v) ? v.toFixed(digits) : '');

  return (
    <div className="tvd" onMouseDown={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
      <div className="tvd-head">
        <b>{TITLES[d.type]}</b>
        <button className="icon-btn tvd-x" title="Kapat (Esc: iptal)" onClick={cancel}>
          <Icons.close />
        </button>
      </div>
      <div className="tvd-tabs">
        {tabs.map((t) => (
          <button key={t.id} className={tab === t.id ? 'on' : ''} onClick={() => setTab(t.id)}>
            {t.label}
          </button>
        ))}
      </div>

      <div className="tvd-body">
        {tab === 'style' && rect && (
          <>
            <Row label="Uzat">
              <select
                className="tvd-select"
                value={extendOf(rect)}
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
            </Row>
            <Row label="Kenar">
              <TvColor color={rect.borderColor ?? rect.color} alpha={rect.borderAlpha ?? 1} onChange={(c, a) => set({ borderColor: c, borderAlpha: a, borderOn: a > 0 })} />
              <select className="tvd-select sm" value={rect.width} onChange={(e) => set({ width: Number(e.target.value) })} title="Kalınlık">
                {[1, 2, 3, 4].map((w) => (
                  <option key={w} value={w}>
                    {w}px
                  </option>
                ))}
              </select>
              <StyleButton value={rect.style ?? 'solid'} onChange={(style) => set({ style })} />
            </Row>
            <Row
              label="Orta çizgi"
              check={<input type="checkbox" checked={!!rect.midline} onChange={(e) => set({ midline: e.target.checked })} />}
            >
              <TvColor color={rect.midColor ?? rect.borderColor ?? rect.color} onChange={(c) => set({ midColor: c })} withAlpha={false} />
              <StyleButton value={rect.midStyle ?? 'dashed'} onChange={(midStyle) => set({ midStyle })} />
            </Row>
            <Row
              label="Arkaplan"
              check={<input type="checkbox" checked={rect.fillOn ?? (rect.fillAlpha ?? 0.15) > 0} onChange={(e) => set({ fillOn: e.target.checked, fillAlpha: e.target.checked && !(rect.fillAlpha ?? 0.15) ? 0.15 : rect.fillAlpha })} />}
            >
              <TvColor
                color={rect.fillColor ?? rect.color}
                alpha={rect.fillAlpha ?? 0.15}
                onChange={(c, a) => set({ fillColor: c, fillAlpha: a, fillOn: a > 0, fill: hexToRgba(c, a) })}
              />
            </Row>
          </>
        )}

        {tab === 'style' && d.type === 'trend' && (
          <>
            <Row label="Çizgi">
              <TvColor color={d.color} onChange={(c) => set({ color: c })} withAlpha={false} />
              <select className="tvd-select sm" value={d.width} onChange={(e) => set({ width: Number(e.target.value) })}>
                {[1, 2, 3, 4].map((w) => (
                  <option key={w} value={w}>
                    {w}px
                  </option>
                ))}
              </select>
              <StyleButton value={d.style ?? 'solid'} onChange={(style) => set({ style })} />
            </Row>
            <Row check={<input type="checkbox" checked={!!d.extendLeft} onChange={(e) => set({ extendLeft: e.target.checked })} />} label="Sola uzat" />
            <Row check={<input type="checkbox" checked={!!d.extendRight} onChange={(e) => set({ extendRight: e.target.checked })} />} label="Sağa uzat" />
            <Row check={<input type="checkbox" checked={!!d.midpoint} onChange={(e) => set({ midpoint: e.target.checked })} />} label="Orta noktayı göster" />
          </>
        )}

        {tab === 'style' && d.type === 'hline' && (
          <Row label="Çizgi">
            <TvColor color={d.color} onChange={(c) => set({ color: c })} withAlpha={false} />
            <select className="tvd-select sm" value={d.width} onChange={(e) => set({ width: Number(e.target.value) })}>
              {[1, 2, 3, 4].map((w) => (
                <option key={w} value={w}>
                  {w}px
                </option>
              ))}
            </select>
            <StyleButton value={d.style ?? 'solid'} onChange={(style) => set({ style })} />
          </Row>
        )}

        {tab === 'text' && rect && (
          <>
            <div className="tvd-textbar">
              <TvColor color={rect.textColor ?? '#ffffff'} onChange={(c) => set({ textColor: c })} withAlpha={false} />
              <select className="tvd-select sm" value={rect.textSize ?? 14} onChange={(e) => set({ textSize: Number(e.target.value) })}>
                {SIZES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
              <button className={`tvd-tog ${rect.bold ? 'on' : ''}`} title="Kalın" onClick={() => set({ bold: !rect.bold })}>
                <b>B</b>
              </button>
              <button className={`tvd-tog ${rect.italic ? 'on' : ''}`} title="İtalik" onClick={() => set({ italic: !rect.italic })}>
                <i>I</i>
              </button>
            </div>
            <textarea className="tvd-textarea" placeholder="Metin ekle" value={rect.text ?? ''} onChange={(e) => set({ text: e.target.value })} />
            <Row label="Metin hizalama">
              <select className="tvd-select" value={rect.vAlign ?? 'middle'} onChange={(e) => set({ vAlign: e.target.value as TextVAlign })}>
                <option value="top">Üst</option>
                <option value="middle">İçeri</option>
                <option value="bottom">Alt</option>
              </select>
              <select className="tvd-select" value={rect.hAlign ?? 'right'} onChange={(e) => set({ hAlign: e.target.value as TextHAlign })}>
                <option value="left">Sol</option>
                <option value="center">Orta</option>
                <option value="right">Sağ</option>
              </select>
            </Row>
          </>
        )}

        {tab === 'coords' && (
          <>
            {d.type === 'hline' ? (
              <Row label="Fiyat">
                <input className="tvd-input" value={price(d.p)} onChange={(e) => Number.isFinite(Number(e.target.value)) && e.target.value !== '' && set({ p: Number(e.target.value) })} />
              </Row>
            ) : (
              (['a', 'b'] as const).map((k, i) => (
                <div key={k} className="tvd-coord">
                  <Row label={`Fiyat ${i + 1}`}>
                    <input
                      className="tvd-input"
                      defaultValue={price(d[k].p)}
                      key={`${k}${d[k].p}`}
                      onBlur={(e) => {
                        const v = Number(e.target.value.replace(',', '.'));
                        if (Number.isFinite(v)) set({ [k]: { ...d[k], p: v } } as Partial<Editable>);
                      }}
                    />
                  </Row>
                  <Row label={`Zaman ${i + 1} (NY)`}>
                    <input
                      className="tvd-input"
                      type="datetime-local"
                      key={`${k}t${d[k].t}`}
                      defaultValue={toInput(d[k].t)}
                      onBlur={(e) => {
                        const t = fromInput(e.target.value);
                        if (t != null) set({ [k]: { ...d[k], t } } as Partial<Editable>);
                      }}
                    />
                  </Row>
                </div>
              ))
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
        {rect ? <TemplateMenu d={rect} set={set} /> : <span />}
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

/** Şablon: varsayılan olarak kaydet / uygula / fabrika ayarlarına dön (yalnızca stil alanları). */
function TemplateMenu({ d, set }: { d: Rect; set: (p: Partial<Editable>) => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    window.addEventListener('mousedown', h);
    return () => window.removeEventListener('mousedown', h);
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
            saveRectTemplate(rectTemplateOf(d));
            toast('Dikdörtgen stili varsayılan olarak kaydedildi (yeni dikdörtgenler bununla başlar).');
          })}
          {item('Varsayılanı uygula', () => set({ ...loadRectTemplate() } as Partial<Editable>))}
          {item('Fabrika ayarlarına dön', () => {
            clearRectTemplate();
            set({
              borderOn: undefined, borderColor: undefined, borderAlpha: undefined, fillOn: undefined, fillColor: undefined,
              midline: false, midColor: undefined, midStyle: undefined, midWidth: undefined, extendLeft: false, extendRight: false,
              textColor: undefined, textSize: undefined, bold: undefined, italic: undefined, vAlign: undefined, hAlign: undefined,
              width: 1, style: undefined, fillAlpha: 0.15, fill: hexToRgba(d.color, 0.15),
            } as Partial<Editable>);
          })}
        </div>
      )}
    </div>
  );
}
