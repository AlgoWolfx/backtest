// Taşınabilir ve küçültülebilir pencereler: başlık çubuğundan sürüklenir, "–" ile gövde gizlenir.
// Konum ve küçültme durumu pencere türü başına (key) tarayıcıda hatırlanır.

import { useCallback, useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type PointerEvent as RPointerEvent } from 'react';

interface Saved {
  x: number;
  y: number;
  min: boolean;
}

const storeKey = (key: string) => `backtest.window.${key}`;

function load(key: string): Saved {
  try {
    const o = JSON.parse(localStorage.getItem(storeKey(key)) ?? 'null') as Partial<Saved> | null;
    if (o) return { x: Number.isFinite(o.x) ? o.x! : 0, y: Number.isFinite(o.y) ? o.y! : 0, min: false }; // küçültme durumu hatırlanmaz: pencere her açılışta tam boyutta başlar
  } catch {
    /* depolama yok / bozuk */
  }
  return { x: 0, y: 0, min: false };
}

function save(key: string, v: Saved) {
  try {
    localStorage.setItem(storeKey(key), JSON.stringify(v));
  } catch {
    /* kaydedilemedi */
  }
}

/**
 * Pencerenin istenen kaydırmasını (x, y) ekranda başlığı en az `margin` px görünür kalacak şekilde sınırlar.
 * base: pencerenin kaydırma UYGULANMAMIŞ konumu ve genişliği.
 */
export function clampOffset(x: number, y: number, base: { left: number; top: number; width: number }, vw: number, vh: number, margin = 80): { x: number; y: number } {
  const minX = margin - base.width - base.left;
  const maxX = vw - margin - base.left;
  const minY = -base.top;
  const maxY = vh - 40 - base.top;
  return { x: Math.min(maxX, Math.max(minX, x)), y: Math.min(maxY, Math.max(minY, y)) };
}

/** Pencerenin şu an uygulanan kaydırma (ox, oy) çıkarılmış taban konumu. */
function baseOf(el: HTMLElement, ox: number, oy: number) {
  const r = el.getBoundingClientRect();
  return { left: r.left - ox, top: r.top - oy, width: r.width };
}

export function useWindow(key: string) {
  const [state, setState] = useState<Saved>(() => load(key));
  const winRef = useRef<HTMLDivElement>(null);
  const drag = useRef<{ sx: number; sy: number; ox: number; oy: number } | null>(null);
  const latest = useRef(state);
  latest.current = state;

  const refit = useCallback(() => {
    const el = winRef.current;
    if (!el) return;
    const cur = latest.current;
    const c = clampOffset(cur.x, cur.y, baseOf(el, cur.x, cur.y), window.innerWidth, window.innerHeight);
    if (c.x !== cur.x || c.y !== cur.y) setState((s) => ({ ...s, ...c }));
  }, []);

  // Kaydedilmiş konum bugünkü ekrana sığmıyorsa (küçük pencere, başka monitör) geri çek.
  useLayoutEffect(refit, [refit]);

  useEffect(() => {
    window.addEventListener('resize', refit);
    return () => window.removeEventListener('resize', refit);
  }, [refit]);

  const onPointerDown = useCallback((e: RPointerEvent<HTMLElement>) => {
    if (e.button !== 0 || (e.target as HTMLElement).closest('button, input, select, textarea, a')) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { sx: e.clientX, sy: e.clientY, ox: latest.current.x, oy: latest.current.y };
  }, []);
  const onPointerMove = useCallback((e: RPointerEvent<HTMLElement>) => {
    const d = drag.current;
    const el = winRef.current;
    if (!d || !el) return;
    const cur = latest.current;
    const c = clampOffset(d.ox + e.clientX - d.sx, d.oy + e.clientY - d.sy, baseOf(el, cur.x, cur.y), window.innerWidth, window.innerHeight);
    setState((s) => ({ ...s, x: c.x, y: c.y }));
  }, []);
  const onPointerUp = useCallback(() => {
    if (!drag.current) return;
    drag.current = null;
    save(key, latest.current);
  }, [key]);

  const toggleMin = useCallback(() => {
    setState((s) => {
      const n = { ...s, min: !s.min };
      save(key, n);
      return n;
    });
  }, [key]);
  const reset = useCallback(() => {
    setState((s) => {
      const n = { ...s, x: 0, y: 0 };
      save(key, n);
      return n;
    });
  }, [key]);

  const style: CSSProperties = { transform: `translate(${state.x}px, ${state.y}px)` };
  const headProps = { onPointerDown, onPointerMove, onPointerUp, onPointerCancel: onPointerUp, onDoubleClick: toggleMin, style: { cursor: 'move', touchAction: 'none' } as CSSProperties, title: 'Sürükle: taşı · Çift tık: küçült / büyüt' };
  return { winRef, style, min: state.min, toggleMin, reset, headProps };
}
