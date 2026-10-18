// Çizim yardımcıları (DrawingLayer ve şekil kayıt sistemi ortak kullanır; döngüsel içe aktarmayı önler).

import type { LineStyleName } from '../core/types';

/** Çizgi stiline göre kesik çizgi dizisi. */
export function dashOf(style: LineStyleName | undefined, width: number): number[] {
  if (style === 'dashed') return [6 + width, 4 + width];
  if (style === 'dotted') return [width, 3 + width];
  return [];
}

/**
 * Dikdörtgen arkaplanının CSS rengi (kapalıysa null). Her zaman fillColor / color + fillAlpha'dan hesaplanır;
 * yalnızca hiçbir yeni alanı olmayan eski kayıtlarda kayıtlı `fill` kullanılır. (Eskiden `fill` içine gömülü
 * opaklık 0 ise arkaplan açılınca görünmez kalıyor, fabrika ayarında `fill` silinince renk rastgele oluyordu.)
 */
export function rectFillCss(d: { color: string; fill?: string; fillOn?: boolean; fillColor?: string; fillAlpha?: number }): string | null {
  const on = d.fillOn ?? (d.fillAlpha ?? 0.15) > 0;
  if (!on) return null;
  if (!d.fillColor && d.fillAlpha === undefined && d.fill) return d.fill;
  return hexToRgba(d.fillColor ?? d.color, d.fillAlpha ?? 0.15);
}

export function hexToRgba(hex: string, a: number): string {
  const h = hex.replace('#', '');
  const n = parseInt(h.length === 3 ? h.replace(/./g, (c) => c + c) : h, 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}
