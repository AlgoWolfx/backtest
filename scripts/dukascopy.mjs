// Dukascopy datafeed: günlük 1m bid dosyaları (.bi5 = LZMA sıkıştırılmış, UTC zaman damgalı).
//
// Sunucu sıkı hız sınırı uygular (çoğu istek 503 döner) ve toplu indirme için ücretli bir S3
// deposu önerir. Bu yüzden burada yalnızca GEREKEN günler (HistData boşlukları + doğrulama örnekleri)
// tek tek, yavaşça ve kaldığı yerden devam edecek şekilde indirilir. Hata yanıtları asla kaydedilmez.
//
// Dosya formatı: 24 baytlık kayıtlar, big-endian:
//   int32 saniye (gün başından) | int32 open | int32 close | int32 low | int32 high | float32 hacim
// Hacmi 0 olan dakikalar işlem görmemiş "düz" dakikalardır (hafta sonu vb.) ve atılır.

import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const lzma = require('lzma');

const ROOT = 'https://datafeed.dukascopy.com/datafeed';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36';
const MIN_INTERVAL_MS = 1500;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let lastRequest = 0;
let backoff = 4000;

export function dayPath(rawDir, symbolId, day) {
  return path.join(rawDir, 'dukascopy', symbolId, `${day}.bi5`);
}

/** 'YYYY-MM-DD' (UTC) gününün dosyasını indirir. Dosya yoksa (404) 0 baytlık işaret dosyası yazar. */
export async function fetchDay(code, day, dest) {
  if (fs.existsSync(dest)) return 'cached';
  const [y, m, d] = day.split('-').map(Number);
  const url = `${ROOT}/${code}/${y}/${String(m - 1).padStart(2, '0')}/${String(d).padStart(2, '0')}/BID_candles_min_1.bi5`;
  for (let attempt = 1; attempt <= 12; attempt++) {
    const wait = lastRequest + MIN_INTERVAL_MS - Date.now();
    if (wait > 0) await sleep(wait);
    lastRequest = Date.now();
    let res;
    try {
      res = await fetch(url, { headers: { 'User-Agent': UA } });
    } catch {
      await sleep(backoff);
      continue;
    }
    if (res.status === 200) {
      const buf = Buffer.from(await res.arrayBuffer());
      if (buf.length > 0 && buf[0] !== 0x5d) throw new Error(`Beklenmeyen içerik: ${url}`);
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      fs.writeFileSync(dest + '.part', buf);
      fs.renameSync(dest + '.part', dest);
      backoff = 4000;
      return 'ok';
    }
    if (res.status === 404) {
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      fs.writeFileSync(dest, Buffer.alloc(0));
      return 'missing';
    }
    await res.arrayBuffer().catch(() => {});
    // 503 / 429: hız sınırı. Beklemeyi artırarak tekrar dene.
    await sleep(backoff);
    backoff = Math.min(120000, backoff * 1.4);
  }
  throw new Error(`Çok fazla deneme: ${url}`);
}

/** Bir günlük dosyayı çözer. Fiyatlar Dukascopy'nin tam sayı "point" biriminde döner. */
export function decodeDay(file, day) {
  const raw = fs.readFileSync(file);
  if (raw.length === 0) return [];
  const out = lzma.decompress(raw);
  if (typeof out === 'string') throw new Error(`Çözülemedi: ${file}`);
  const buf = Buffer.from(out);
  const start = Date.parse(day + 'T00:00:00Z') / 1000;
  const rows = [];
  for (let i = 0; i + 24 <= buf.length; i += 24) {
    const v = buf.readFloatBE(i + 20);
    if (!(v > 0)) continue;
    rows.push({ t: start + buf.readInt32BE(i), o: buf.readInt32BE(i + 4), c: buf.readInt32BE(i + 8), l: buf.readInt32BE(i + 12), h: buf.readInt32BE(i + 16) });
  }
  return rows;
}
