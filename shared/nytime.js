// America/New_York saat dilimi yardımcıları. Tüm zamanlar saniye cinsinden UTC epoch'tur.
//
// ABD yaz saati (2007 sonrası kuralı):
//   Mart ayının 2. pazarı 02:00 yerel (07:00 UTC) -> UTC-4
//   Kasım ayının 1. pazarı 02:00 yerel (06:00 UTC) -> UTC-5

const HOUR = 3600;
const DAY = 86400;

const yearCache = new Map();

/** @param {number} year */
function yearInfo(year) {
  let info = yearCache.get(year);
  if (info) return info;
  const marDow = new Date(Date.UTC(year, 2, 1)).getUTCDay();
  const secondSunMar = 1 + ((7 - marDow) % 7) + 7;
  const novDow = new Date(Date.UTC(year, 10, 1)).getUTCDay();
  const firstSunNov = 1 + ((7 - novDow) % 7);
  info = {
    start: Date.UTC(year, 0, 1) / 1000,
    end: Date.UTC(year + 1, 0, 1) / 1000,
    dstStart: Date.UTC(year, 2, secondSunMar, 7) / 1000,
    dstEnd: Date.UTC(year, 10, firstSunNov, 6) / 1000,
  };
  yearCache.set(year, info);
  return info;
}

let last = yearInfo(2020);

/**
 * New York'un UTC'ye göre farkı (saniye): -14400 (EDT) veya -18000 (EST).
 * @param {number} t UTC saniye
 */
export function nyOffset(t) {
  if (t < last.start || t >= last.end) last = yearInfo(new Date(t * 1000).getUTCFullYear());
  return t >= last.dstStart && t < last.dstEnd ? -4 * HOUR : -5 * HOUR;
}

/** UTC -> NY yerel saatine kaydırılmış "sahte UTC" saniye (gösterim ve kova hesabı için). */
export function toNyLocal(t) {
  return t + nyOffset(t);
}

/**
 * NY yerel saatini ("sahte UTC" saniye) gerçek UTC'ye çevirir.
 * DST geçişindeki olmayan/çift saatlerde makul bir sonuç döndürür.
 */
export function nyLocalToUtc(local) {
  const guess = local + 5 * HOUR;
  const off = nyOffset(guess);
  const t = local - off;
  return nyOffset(t) === off ? t : local - nyOffset(t);
}

/**
 * İşlem günü numarası (NY 17:00 kapanışına göre). Pazar 17:00 NY -> Pazartesi günü.
 * Dönen değer: 1970-01-01'den itibaren gün sayısı.
 */
export function tradingDay(t) {
  return Math.floor((toNyLocal(t) + 7 * HOUR) / DAY);
}

export { HOUR, DAY };
