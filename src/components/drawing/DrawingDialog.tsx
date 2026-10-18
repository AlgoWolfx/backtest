import { useEffect, useRef, useState } from 'react';
import { TIMEFRAMES, type TF } from '../../core/timeframes';
import { Position } from '../../core/types';
import { recordUndo, updateDrawing, useStore } from '../../store';
import { useWindow } from '../../lib/useWindow';
import { Icons } from '../common/icons';
import { type Editable, type Tab, type Any, TITLES, Row, toInput, fromInput } from './dialogParts';
import { TextTab, TrendStyle, RectStyle, HLineStyle, FibStyle, PositionStyle } from './StyleTabs';
import { PositionInputs } from './PositionInputs';
import { TemplateMenu } from './TemplateMenu';

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
