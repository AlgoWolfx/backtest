// Grafik üstündeki favori araç çubuğu (TradingView gibi): tutamaçtan sürüklenir, simgeye tıklayınca araç seçilir.

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { Tool } from '../../core/types';
import { clampPos, setFavBarPos, useFavBar, type FavBarPos } from '../../prefs/favTools';
import { useStore } from '../../store';
import { Icons } from '../common/icons';

const ICONS: Partial<Record<Tool, () => React.JSX.Element>> = {
  trend: Icons.trend,
  hline: Icons.hline,
  rect: Icons.rect,
  fib: Icons.fib,
  long: Icons.long,
  short: Icons.short,
  measure: Icons.ruler,
};
const LABELS: Partial<Record<Tool, string>> = {
  trend: 'Trend çizgisi (Alt+T)',
  hline: 'Yatay ışın (Alt+H)',
  rect: 'Dikdörtgen (Alt+R)',
  fib: 'Fibonacci düzeltme (Alt+F)',
  long: 'Long pozisyon (Alt+L)',
  short: 'Short pozisyon (Alt+S)',
  measure: 'Ölçüm (Shift+sürükle)',
};

export function FavToolbar() {
  const { favs, pos, visible } = useFavBar();
  const tool = useStore((s) => s.tool);
  const ref = useRef<HTMLDivElement>(null);
  const drag = useRef<{ sx: number; sy: number; ox: number; oy: number } | null>(null);
  const [live, setLive] = useState<FavBarPos | null>(null);

  const box = () => {
    const el = ref.current;
    const area = el?.parentElement;
    return el && area ? { el, area } : null;
  };
  const sizes = () => {
    const b = box();
    return b ? { box: { w: b.area.clientWidth, h: b.area.clientHeight }, size: { w: b.el.offsetWidth, h: b.el.offsetHeight } } : null;
  };

  // Pencere / düzen küçülünce kayıtlı konum alanın dışında kalmasın.
  const refit = () => {
    const s = sizes();
    if (!s || !pos) return;
    const c = clampPos(pos, s.box, s.size);
    if (c.x !== pos.x || c.y !== pos.y) setFavBarPos(c);
  };
  useLayoutEffect(refit, [pos, favs.length, visible]);
  useEffect(() => {
    window.addEventListener('resize', refit);
    return () => window.removeEventListener('resize', refit);
  });

  if (!visible || !favs.length) return null;

  const shown = live ?? pos;
  const style: React.CSSProperties = shown ? { left: shown.x, top: shown.y } : { left: '50%', top: 14, transform: 'translateX(-50%)' };

  const down = (e: React.PointerEvent<HTMLDivElement>) => {
    const b = box();
    if (!b || e.button !== 0) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    const areaR = b.area.getBoundingClientRect();
    const elR = b.el.getBoundingClientRect();
    drag.current = { sx: e.clientX, sy: e.clientY, ox: elR.left - areaR.left, oy: elR.top - areaR.top };
    setLive({ x: drag.current.ox, y: drag.current.oy });
  };
  const move = (e: React.PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    const s = sizes();
    if (!d || !s) return;
    setLive(clampPos({ x: d.ox + e.clientX - d.sx, y: d.oy + e.clientY - d.sy }, s.box, s.size));
  };
  const up = () => {
    if (!drag.current) return;
    drag.current = null;
    if (live) setFavBarPos(live);
    setLive(null);
  };

  return (
    <div ref={ref} className="favbar" style={style} onMouseDown={(e) => e.stopPropagation()} onContextMenu={(e) => e.preventDefault()}>
      <div className="favbar-grip" title="Sürükle: çubuğu taşı · Çift tık: varsayılan konum" onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up} onDoubleClick={() => setFavBarPos(null)}>
        <i />
        <i />
        <i />
        <i />
        <i />
        <i />
      </div>
      {favs.map((id) => {
        const Icon = ICONS[id];
        if (!Icon) return null;
        return (
          <button key={id} className={`favbar-btn ${tool === id ? 'on' : ''}`} title={LABELS[id]} onClick={() => useStore.setState({ tool: tool === id ? 'cursor' : id, selectedId: null })}>
            <Icon />
          </button>
        );
      })}
    </div>
  );
}
