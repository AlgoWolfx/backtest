// Çizim listesi (TradingView "Nesne ağacı"): aktif sembolün çizimlerini listeler; seç, gizle / göster, kilitle, sil.
// Taşınabilir ve küçültülebilir bir penceredir.

import { getSymbol } from '../../../shared/symbols.js';
import type { Drawing } from '../../core/types';
import { fmtNyShort, fmtPrice } from '../../lib/format';
import { useWindow } from '../../lib/useWindow';
import { deleteDrawing, drawingsOf, updateDrawing, useStore } from '../../store';
import { Icons } from '../common/icons';
import { TITLES } from './dialogParts';

const ICON: Record<Drawing['type'], () => React.JSX.Element> = {
  trend: Icons.trend,
  hline: Icons.hline,
  vline: Icons.vline,
  rect: Icons.rect,
  fib: Icons.fib,
  long: Icons.long,
  short: Icons.short,
  text: Icons.text,
};

/** Listede görünen kısa açıklama: konum / fiyat bilgisi. */
export function describeDrawing(d: Drawing, symbol: string): string {
  const spec = getSymbol(symbol);
  const p = (v: number) => fmtPrice(v, spec);
  switch (d.type) {
    case 'hline':
      return p(d.p);
    case 'vline':
      return fmtNyShort(d.t) + ' NY';
    case 'trend':
      return `${p(d.a.p)} → ${p(d.b.p)}${d.extendRight ? ' (ışın)' : ''}`;
    case 'rect':
      return `${p(d.a.p)} – ${p(d.b.p)}`;
    case 'fib':
      return `${p(d.a.p)} → ${p(d.b.p)}`;
    case 'text':
      return d.text.split('\n')[0] || '(boş)';
    default:
      return `giriş ${p(d.entry.p)} · SL ${p(d.sl)} · TP ${p(d.tp)}`;
  }
}

export function ObjectList() {
  const open = useStore((s) => s.objectsOpen);
  const session = useStore((s) => s.session);
  const selectedId = useStore((s) => s.selectedId);
  const win = useWindow('objects');
  if (!open || !session) return null;
  const list = drawingsOf(session);
  const titleOf = (d: Drawing) => (d.type === 'trend' && d.extendRight ? 'Işın' : TITLES[d.type]);

  return (
    <div ref={win.winRef} style={win.style} className={`objlist ${win.min ? 'min' : ''}`} onMouseDown={(e) => e.stopPropagation()}>
      <div className="objlist-head" {...win.headProps}>
        <b>Çizimler · {session.symbol}</b>
        <span className="muted">{list.length}</span>
        <span className="spacer" />
        <button className="icon-btn" title={win.min ? 'Büyüt' : 'Küçült'} onClick={win.toggleMin}>
          {win.min ? '▢' : '–'}
        </button>
        <button className="icon-btn" title="Kapat" onClick={() => useStore.setState({ objectsOpen: false })}>
          <Icons.close />
        </button>
      </div>
      <div className="objlist-body">
        {list.length === 0 && <p className="hint">Bu sembolde çizim yok.</p>}
        {[...list].reverse().map((d) => {
          const Icon = ICON[d.type];
          const hidden = !!d.hidden;
          return (
            <div key={d.id} className={`objrow ${selectedId === d.id ? 'on' : ''} ${hidden ? 'off' : ''}`} onClick={() => useStore.setState({ selectedId: d.id })} onDoubleClick={() => useStore.setState({ selectedId: d.id, editingId: d.id })}>
              <Icon />
              <span className="objrow-name">
                <b>{titleOf(d)}</b>
                <small>{describeDrawing(d, session.symbol)}</small>
              </span>
              <button className="icon-btn" title={hidden ? 'Göster' : 'Gizle'} onClick={(e) => (e.stopPropagation(), updateDrawing(d.id, { hidden: !hidden }))}>
                {hidden ? <Icons.eyeOff /> : <Icons.eye />}
              </button>
              <button className={`icon-btn ${d.locked ? 'on' : ''}`} title={d.locked ? 'Kilidi aç' : 'Kilitle'} onClick={(e) => (e.stopPropagation(), updateDrawing(d.id, { locked: !d.locked }))}>
                {d.locked ? <Icons.lock /> : <Icons.unlock />}
              </button>
              <button className="icon-btn" title="Sil" onClick={(e) => (e.stopPropagation(), deleteDrawing(d.id))}>
                <Icons.trash />
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
