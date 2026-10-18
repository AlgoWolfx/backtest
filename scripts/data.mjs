// Geçmiş 1 dakikalık veriyi HistData.com'dan indirir ve uygulamanın okuduğu ikili formata çevirir.
//
// Kullanım:
//   npm run data                       -> tüm semboller, eksik dosyaları indir + derle
//   npm run data -- EURUSD XAUUSD      -> sadece seçilen semboller
//   npm run data -- --build-only       -> indirmeden, mevcut zip'lerden yeniden derle
//
// HistData saat damgaları: UTC-5, yaz saati ise AVRUPA kuralıyla (Mart'ın son pazarı ->
// Ekim'in son pazarı, 01:00 UTC). Belgelerde "sabit EST" yazıyor ama veri bunu doğrulamıyor:
//   - NFP (08:30 NY) sıçramaları 2020-2026 boyunca kışın ve yazın 08:30'da görünüyor,
//   - ABD ile AB yaz saati geçişleri arasındaki haftalarda ise US100/DXY'nin günlük işlem
//     araları tam 1 saat kayık görünüyor (ör. 16:15->18:00 yerine 15:15->17:00).
// Burada gerçek UTC'ye çevrilir; uygulama NY saatini ABD kuralıyla ayrıca hesaplar.
// Eksik dakikalar uydurulmaz, olduğu gibi bırakılır.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { unzipSync, strFromU8 } from 'fflate';
import { SYMBOLS } from '../shared/symbols.js';
import { nyOffset, HOUR } from '../shared/nytime.js';
import { decodeDay } from './dukascopy.mjs';
import { findGaps, gapDays } from './gaps.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DATA_DIR = process.env.BACKTEST_DATA_DIR || path.join(ROOT, 'data');
const RAW_DIR = path.join(DATA_DIR, 'raw');
const BARS_DIR = path.join(DATA_DIR, 'bars');

const START_YEAR = 2020;
const BASE = 'https://www.histdata.com';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36';
const PAUSE_MS = 1500;

const args = process.argv.slice(2);
const buildOnly = args.includes('--build-only');
const wanted = args.filter((a) => !a.startsWith('--')).map((a) => a.toUpperCase());
const symbols = wanted.length ? SYMBOLS.filter((s) => wanted.includes(s.id)) : SYMBOLS;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function periods() {
  const now = new Date();
  const curYear = now.getUTCFullYear();
  const list = [];
  for (let y = START_YEAR; y < curYear; y++) list.push({ key: String(y), urlPart: String(y) });
  for (let m = 1; m <= now.getUTCMonth() + 1; m++) {
    list.push({ key: `${curYear}-${String(m).padStart(2, '0')}`, urlPart: `${curYear}/${m}`, current: m === now.getUTCMonth() + 1 });
  }
  return list;
}

async function fetchWithRetry(url, init, tries = 4) {
  for (let i = 1; ; i++) {
    try {
      const res = await fetch(url, init);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res;
    } catch (err) {
      if (i >= tries) throw err;
      await sleep(3000 * i);
    }
  }
}

async function download(sym, period, dest) {
  const pageUrl = `${BASE}/download-free-forex-historical-data/?/ascii/1-minute-bar-quotes/${sym.source}/${period.urlPart}`;
  const html = await (await fetchWithRetry(pageUrl, { headers: { 'User-Agent': UA } })).text();
  const form = html.match(/<form id="file_down"[\s\S]*?<\/form>/)?.[0];
  if (!form) throw new Error(`İndirme formu bulunamadı: ${pageUrl}`);
  const body = new URLSearchParams();
  for (const m of form.matchAll(/<input[^>]*name="([^"]+)"[^>]*value="([^"]*)"/g)) body.set(m[1], m[2]);
  const res = await fetchWithRetry(`${BASE}/get.php`, {
    method: 'POST',
    headers: { 'User-Agent': UA, Referer: pageUrl, 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length < 100 || buf[0] !== 0x50 || buf[1] !== 0x4b) throw new Error(`Zip yerine beklenmeyen yanıt geldi (${buf.length} bayt)`);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.writeFileSync(dest + '.part', buf);
  fs.renameSync(dest + '.part', dest);
  return buf.length;
}

async function downloadSymbol(sym) {
  for (const period of periods()) {
    const dest = path.join(RAW_DIR, sym.id, `${period.key}.zip`);
    if (fs.existsSync(dest)) {
      // İçinde bulunulan ay her çalıştırmada yenilenir (12 saatten eskiyse).
      const age = Date.now() - fs.statSync(dest).mtimeMs;
      if (!period.current || age < 12 * 3600 * 1000) continue;
    }
    process.stdout.write(`  ${sym.id} ${period.key} indiriliyor... `);
    try {
      const size = await download(sym, period, dest);
      console.log(`${(size / 1e6).toFixed(1)} MB`);
    } catch (err) {
      console.log(`HATA: ${err.message}`);
    }
    await sleep(PAUSE_MS);
  }
}

const euDstCache = new Map();
/** Avrupa yaz saati aralığı (UTC): Mart'ın son pazarı 01:00 -> Ekim'in son pazarı 01:00. */
function euDst(year) {
  let r = euDstCache.get(year);
  if (!r) {
    const lastSunday = (m) => {
      const last = new Date(Date.UTC(year, m + 1, 0));
      return last.getUTCDate() - last.getUTCDay();
    };
    r = [Date.UTC(year, 2, lastSunday(2), 1) / 1000, Date.UTC(year, 9, lastSunday(9), 1) / 1000];
    euDstCache.set(year, r);
  }
  return r;
}

/** HistData yerel saatini (UTC gibi kodlanmış saniye) gerçek UTC'ye çevirir. */
function histdataToUtc(local) {
  const utc = local + 5 * HOUR;
  const [a, b] = euDst(new Date(utc * 1000).getUTCFullYear());
  return utc - HOUR >= a && utc - HOUR < b ? utc - HOUR : utc;
}

/** HistData satırı: "20200101 170000;1.121200;1.121210;1.121170;1.121200;0" */
function parseCsv(text, cols) {
  let pos = 0;
  const n = text.length;
  while (pos < n) {
    let end = text.indexOf('\n', pos);
    if (end === -1) end = n;
    const line = text.slice(pos, end).trim();
    pos = end + 1;
    if (line.length < 20) continue;
    const parts = line.split(';');
    if (parts.length < 5) continue;
    const d = parts[0];
    const local = Date.UTC(+d.slice(0, 4), +d.slice(4, 6) - 1, +d.slice(6, 8), +d.slice(9, 11), +d.slice(11, 13)) / 1000;
    cols.t.push(histdataToUtc(local));
    cols.o.push(+parts[1]);
    cols.h.push(+parts[2]);
    cols.l.push(+parts[3]);
    cols.c.push(+parts[4]);
    if (cols.t.length % 97 === 0) for (let i = 1; i <= 4; i++) cols.decimals = Math.max(cols.decimals, decimalsOf(parts[i]));
  }
}

function decimalsOf(str) {
  const i = str.indexOf('.');
  if (i === -1) return 0;
  let j = str.length;
  while (j > i + 1 && str[j - 1] === '0') j--;
  return j - i - 1;
}

function lowerBound(arr, x, n) {
  let lo = 0, hi = n;
  while (lo < hi) {
    const m = (lo + hi) >>> 1;
    if (arr[m] < x) lo = m + 1;
    else hi = m;
  }
  return lo;
}

/**
 * Önbellekteki Dukascopy günleriyle çapraz kontrol + boşluk doldurma.
 * HistData ile Dukascopy aynı akış olduğu için ortak dakikalar birebir aynı olmalı.
 * Bir günde ortak dakikaların %90'ından azı aynıysa o günden doldurma yapılmaz.
 */
function dukascopyMerge(sym, t, o, h, l, c, k) {
  const dir = path.join(RAW_DIR, 'dukascopy', sym.id);
  const files = fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => f.endsWith('.bi5')).sort() : [];
  const days = files.map((f) => ({ day: f.slice(0, 10), rows: decodeDay(path.join(dir, f), f.slice(0, 10)) })).filter((d) => d.rows.length);
  const info = { daysCached: files.length, daysWithData: days.length, factor: null, crossCheck: { days: 0, minutes: 0, identical: 0, maxDiffPoints: 0, badDays: [] }, filledMinutes: 0, filledByYear: {} };
  if (!days.length) return { fill: [], info };

  // Fiyat ölçeği: HistData kapanışı / Dukascopy kapanışı = 10^f
  const ratios = [];
  for (const d of days) {
    for (const r of d.rows) {
      const i = lowerBound(t, r.t, k);
      if (i < k && t[i] === r.t && r.c) ratios.push(c[i] / r.c);
    }
    if (ratios.length > 5000) break;
  }
  if (!ratios.length) return { fill: [], info };
  ratios.sort((a, b) => a - b);
  const med = ratios[ratios.length >> 1];
  const f = Math.round(Math.log10(med));
  if (Math.abs(med / 10 ** f - 1) > 0.02) {
    info.error = `Fiyat ölçeği uyuşmuyor (oran ${med}); Dukascopy verisi kullanılmadı.`;
    return { fill: [], info };
  }
  info.factor = f;
  const conv = (v) => (f >= 0 ? v * 10 ** f : Math.round(v / 10 ** -f));

  const fill = [];
  const cc = info.crossCheck;
  for (const d of days) {
    let overlap = 0, same = 0, maxDiff = 0;
    const missing = [];
    for (const r of d.rows) {
      const row = { t: r.t, o: conv(r.o), h: conv(r.h), l: conv(r.l), c: conv(r.c) };
      const i = lowerBound(t, r.t, k);
      if (i < k && t[i] === r.t) {
        overlap++;
        const diff = Math.max(Math.abs(o[i] - row.o), Math.abs(h[i] - row.h), Math.abs(l[i] - row.l), Math.abs(c[i] - row.c));
        if (diff === 0) same++;
        if (diff > maxDiff) maxDiff = diff;
      } else missing.push(row);
    }
    cc.days++;
    cc.minutes += overlap;
    cc.identical += same;
    cc.maxDiffPoints = Math.max(cc.maxDiffPoints, maxDiff);
    if (overlap >= 30 && same / overlap < 0.9) {
      cc.badDays.push({ day: d.day, overlap, identicalPct: Math.round((same / overlap) * 1000) / 10 });
      continue;
    }
    for (const row of missing) {
      fill.push(row);
      const y = new Date(row.t * 1000).getUTCFullYear();
      info.filledByYear[y] = (info.filledByYear[y] || 0) + 1;
    }
  }
  info.filledMinutes = fill.length;
  return { fill, info };
}

function buildSymbol(sym) {
  const dir = path.join(RAW_DIR, sym.id);
  if (!fs.existsSync(dir)) return console.log(`  ${sym.id}: ham veri yok, atlandı`);
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.zip')).sort();
  const cols = { t: [], o: [], h: [], l: [], c: [], decimals: 0 };
  for (const f of files) {
    const zip = unzipSync(fs.readFileSync(path.join(dir, f)));
    for (const [name, data] of Object.entries(zip)) if (name.toLowerCase().endsWith('.csv')) parseCsv(strFromU8(data), cols);
  }
  const minT = Date.UTC(START_YEAR, 0, 1) / 1000 - 7 * HOUR;
  const order = [];
  for (let i = 0; i < cols.t.length; i++) if (cols.t[i] >= minT) order.push(i);
  order.sort((a, b) => cols.t[a] - cols.t[b] || a - b);
  const decimals = Math.min(cols.decimals, 6);
  const scale = 10 ** decimals;

  const n = order.length;
  let t = new Int32Array(n), o = new Int32Array(n), h = new Int32Array(n), l = new Int32Array(n), c = new Int32Array(n);
  let k = 0, fixed = 0;
  for (const i of order) {
    if (k > 0 && t[k - 1] === cols.t[i]) k--; // aynı dakika iki dosyada varsa sonuncusu geçerli
    t[k] = cols.t[i];
    o[k] = Math.round(cols.o[i] * scale);
    c[k] = Math.round(cols.c[i] * scale);
    const hi = Math.round(cols.h[i] * scale), lo = Math.round(cols.l[i] * scale);
    const mx = Math.max(o[k], c[k]), mn = Math.min(o[k], c[k]);
    if (hi < mx || lo > mn) fixed++;
    h[k] = Math.max(hi, mx);
    l[k] = Math.min(lo, mn);
    k++;
  }

  const sourceGaps = findGaps(t, k);
  const { fill, info: duka } = dukascopyMerge(sym, t, o, h, l, c, k);

  // Doldurulan dakikaları ekle ve sırala. src: 0 = HistData, 1 = Dukascopy
  const total = k + fill.length;
  const src = new Uint8Array(total);
  if (fill.length) {
    const time = (i) => (i < k ? t[i] : fill[i - k].t);
    const idx = Array.from({ length: total }, (_, i) => i).sort((a, b) => time(a) - time(b));
    const T = new Int32Array(total), O = new Int32Array(total), H = new Int32Array(total), L = new Int32Array(total), C = new Int32Array(total);
    for (let j = 0; j < total; j++) {
      const i = idx[j];
      if (i < k) {
        T[j] = t[i]; O[j] = o[i]; H[j] = h[i]; L[j] = l[i]; C[j] = c[i];
      } else {
        const r = fill[i - k];
        T[j] = r.t; O[j] = r.o; C[j] = r.c;
        H[j] = Math.max(r.h, r.o, r.c);
        L[j] = Math.min(r.l, r.o, r.c);
        src[j] = 1;
      }
    }
    [t, o, h, l, c] = [T, O, H, L, C];
  }
  k = total;
  const { gaps, missingHoursByYear } = findGaps(t, k);

  // Dosya formatı 2: 5 adet Int32 sütun (t, o, h, l, c) + 1 adet Uint8 sütun (kaynak)
  fs.mkdirSync(BARS_DIR, { recursive: true });
  const out = Buffer.alloc(k * 21);
  [t, o, h, l, c].forEach((arr, i) => Buffer.from(arr.buffer, 0, k * 4).copy(out, i * k * 4));
  Buffer.from(src.buffer, 0, k).copy(out, 20 * k);
  fs.writeFileSync(path.join(BARS_DIR, `${sym.id}.bin`), out);
  const meta = {
    id: sym.id,
    format: 2,
    count: k,
    scale,
    from: t[0],
    to: t[k - 1] + 60,
    gaps,
    missingHoursByYear,
    histdata: { files, minutes: k - fill.length, gaps: sourceGaps.gaps.length, missingHoursByYear: sourceGaps.missingHoursByYear, ohlcFixed: fixed },
    sourceGapDays: gapDays(sourceGaps.gaps),
    dukascopy: duka,
    builtAt: new Date().toISOString(),
    source: 'HistData.com 1m bid (UTC-5 + AB yaz saati -> UTC); boşluklar Dukascopy ile (aynı akış, UTC) doldurulur',
  };
  fs.writeFileSync(path.join(BARS_DIR, `${sym.id}.json`), JSON.stringify(meta));
  const fmt = (s) => new Date((s + nyOffset(s)) * 1000).toISOString().slice(0, 16).replace('T', ' ');
  const cc = duka.crossCheck;
  const pct = ((cc.identical / Math.max(1, cc.minutes)) * 100).toFixed(2);
  const dukaTxt = duka.daysWithData
    ? `Dukascopy: ${duka.daysWithData} gün, ortak ${cc.minutes} dk'nın %${pct}'i birebir aynı, ${cc.badDays.length} uyumsuz gün, ${fill.length} dk dolduruldu`
    : 'Dukascopy: önbellekte gün yok';
  const yrs = Object.entries(missingHoursByYear).map(([y, hr]) => `${y}:${Math.round(hr)}s`).join(' ');
  console.log(`  ${sym.id}: ${k.toLocaleString('tr-TR')} mum, ${fmt(t[0])} -> ${fmt(t[k - 1])} NY, ölçek 1e${decimals}, ${gaps.length} boşluk (${yrs})`);
  console.log(`     ${dukaTxt}${duka.error ? ' — ' + duka.error : ''}`);
}

if (!buildOnly) {
  console.log('İndiriliyor (HistData.com)...');
  for (const s of symbols) await downloadSymbol(s);
}
console.log('Derleniyor...');
for (const s of symbols) buildSymbol(s);
console.log('Tamam.');

