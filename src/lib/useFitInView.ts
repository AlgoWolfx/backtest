import { useLayoutEffect, useRef } from 'react';

/**
 * Açılır menüyü pencereye sığdırır (TradingView gibi): alttan / sağdan taşarsa yukarı / sola kaydırır.
 * Uygulama kabı overflow: hidden olduğundan taşan kısım kesilir ve alttaki seçenekler görünmez.
 */
export function useFitInView<T extends HTMLElement>(dep: unknown) {
  const ref = useRef<T>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.transform = '';
    const r = el.getBoundingClientRect();
    const dx = Math.max(4 - r.left, Math.min(0, window.innerWidth - 4 - r.right));
    const dy = Math.max(4 - r.top, Math.min(0, window.innerHeight - 4 - r.bottom));
    if (dx || dy) el.style.transform = `translate(${dx}px, ${dy}px)`;
  }, [dep]);
  return ref;
}
