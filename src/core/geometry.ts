// Çizim araçları için saf geometri yardımcıları (piksel uzayında; testli).

export interface P2 {
  x: number;
  y: number;
}

/** Noktanın doğru parçasına uzaklığı. */
export function distToSegment(px: number, py: number, x1: number, y1: number, x2: number, y2: number): number {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len = dx * dx + dy * dy;
  const t = len ? Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / len)) : 0;
  return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
}

/** a'dan b yönünde (b'yi geçerek) çok uzaktaki nokta: ışın (ray) ve uzatılmış çizgi uçları için. */
export function farPoint(a: P2, b: P2, reach: number): P2 {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy);
  if (len === 0) return { x: b.x, y: b.y };
  const k = reach / len;
  return { x: a.x + dx * k, y: a.y + dy * k };
}

/** Işın: a başlangıç, b yönünde sonsuz (ekranı aşacak kadar uzak). */
export function rayEnds(a: P2, b: P2, reach: number): [P2, P2] {
  return [a, farPoint(a, b, reach)];
}

/** Uzatılmış çizgi: iki yönde de sonsuz. */
export function extendedEnds(a: P2, b: P2, reach: number): [P2, P2] {
  return [farPoint(b, a, reach), farPoint(a, b, reach)];
}

/** Ok başı: ucun (b) iki kanat noktası. size: kanat uzunluğu (px). */
export function arrowHead(a: P2, b: P2, size: number, spread = Math.PI / 7): [P2, P2] {
  const ang = Math.atan2(b.y - a.y, b.x - a.x);
  return [
    { x: b.x - size * Math.cos(ang - spread), y: b.y - size * Math.sin(ang - spread) },
    { x: b.x - size * Math.cos(ang + spread), y: b.y - size * Math.sin(ang + spread) },
  ];
}

/** Ekran açısı (derece, yukarı pozitif): bilgi çizgisi etiketi için. */
export function screenAngleDeg(a: P2, b: P2): number {
  return (Math.atan2(-(b.y - a.y), b.x - a.x) * 180) / Math.PI;
}

/** Nokta çokgenin içinde mi (ışın atma). */
export function polygonContains(poly: P2[], x: number, y: number): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i];
    const b = poly[j];
    if (a.y > y !== b.y > y && x < ((b.x - a.x) * (y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

/** Elips denklemi değeri (<= 1: içeride). cx, cy merkez; rx, ry yarıçaplar. */
export function ellipseValue(x: number, y: number, cx: number, cy: number, rx: number, ry: number): number {
  const a = rx || 1e-9;
  const b = ry || 1e-9;
  return ((x - cx) / a) ** 2 + ((y - cy) / b) ** 2;
}

/** Elips kenarına yaklaşık piksel uzaklığı (kenar tıklamaları için). */
export function ellipseEdgeDist(x: number, y: number, cx: number, cy: number, rx: number, ry: number): number {
  const v = Math.sqrt(ellipseValue(x, y, cx, cy, rx, ry));
  return Math.abs(v - 1) * Math.min(Math.max(rx, 1), Math.max(ry, 1));
}

/**
 * Mantıksal indeks L'de, (L0,p0)-(L1,p1) doğrusunun fiyatı (doğrusal enterpolasyon / ekstrapolasyon).
 * L0 === L1 ise p0.
 */
export function priceOnLine(L0: number, p0: number, L1: number, p1: number, L: number): number {
  return L1 === L0 ? p0 : p0 + ((p1 - p0) * (L - L0)) / (L1 - L0);
}

/**
 * Paralel kanal: üçüncü noktanın temel doğruya fiyat farkı. Paralel çizgi, temel doğrunun bu fiyat farkı kadar
 * kaydırılmışıdır (TradingView "Parallel Channel" üçüncü nokta).
 */
export function channelOffset(L0: number, p0: number, L1: number, p1: number, L2: number, p2: number): number {
  return p2 - priceOnLine(L0, p0, L1, p1, L2);
}

/** Çoklu noktayı öteler: zaman (mantıksal) ve fiyat farkı. */
export function shiftPoints<T extends { t: number; p: number }>(pts: T[], shiftT: (t: number) => number, dp: number, round: (p: number) => number): T[] {
  return pts.map((q) => ({ ...q, t: shiftT(q.t), p: round(q.p + dp) }));
}

/** Süre metni (örn. "1g 2sa 5dk"). */
export function fmtDuration(secs: number): string {
  const s = Math.abs(Math.round(secs));
  const dd = Math.floor(s / 86400);
  const hh = Math.floor((s % 86400) / 3600);
  const mm = Math.floor((s % 3600) / 60);
  return [dd ? `${dd}g` : '', hh ? `${hh}sa` : '', mm || (!dd && !hh) ? `${mm}dk` : ''].filter(Boolean).join(' ');
}
