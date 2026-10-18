// Çizim yardımcıları (DrawingLayer ve şekil kayıt sistemi ortak kullanır; döngüsel içe aktarmayı önler).

import type { LineStyleName } from '../core/types';

/** Çizgi stiline göre kesik çizgi dizisi. */
export function dashOf(style: LineStyleName | undefined, width: number): number[] {
  if (style === 'dashed') return [6 + width, 4 + width];
  if (style === 'dotted') return [width, 3 + width];
  return [];
}

export function hexToRgba(hex: string, a: number): string {
  const h = hex.replace('#', '');
  const n = parseInt(h.length === 3 ? h.replace(/./g, (c) => c + c) : h, 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}
