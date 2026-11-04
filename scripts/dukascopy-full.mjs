// Dukascopy'den 2020'den bugüne 1 dakikalık BID + ASK verisini indirir ve derler.
// (dukascopy-node'un kullandığı jetta.dukascopy.com servisi; tarayıcıdaki Dukascopy grafiğiyle aynı istek.)
//
// Kullanım:
//   npm run data                     -> tüm semboller: indir + derle
//   npm run data -- EURUSD XAUUSD
//   npm run data -- --build-only     -> indirmeden yeniden derle
//
// Ham veri:  data/raw/dukascopy-full/<SEMBOL>/<BID|ASK>/<YYYY-MM>.json.gz  (gün -> orijinal JSON yanıtı)
//            Ay ay kaydedilir; yarıda kalırsa kaldığı aydan devam eder.
// Çıktı:     data/bars-dukascopy/<SEMBOL>.bin   (format 3: t, bid o/h/l/c, ask o/h/l/c + kaynak sütunu)
// Zaman damgaları UTC'dir. İşlem görmemiş (hacmi 0) dakikalar atılır; eksik dakika uydurulmaz.

import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { SYMBOLS } from '../shared/symbols.js';
import { nyOffset } from '../shared/nytime.js';
import { findGaps } from './gaps.mjs';

const require = createRequire(import.meta.url);
const { processData, instrumentMetaData } = require('dukascopy-node');

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DATA_DIR = process.env.BACKTEST_DATA_DIR || path.join(ROOT, 'data');
const RAW_DIR = path.join(DATA_DIR, 'raw', 'dukascopy-full');
const OUT_DIR = path.join(DATA_DIR, 'bars-dukascopy');
const START = { y: 2020, m: 0 };
const SIDES = ['BID', 'ASK'];
const WORKERS = 3;
const PAUSE_MS = 150;

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36',
  Accept: 'application/json, text/plain, */*',
  Referer: 'https://www.dukascopy.com/',
  Origin: 'https://www.dukascopy.com',
};

const args = process.argv.slice(2);
const buildOnly = args.includes('--build-only');
const wanted = args.filter((a) => !a.startsWith('--')).map((a) => a.toUpperCase());
const symbols = wanted.length ? SYMBOLS.filter((s) => wanted.includes(s.id)) : SYMBOLS;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const jettaCode = (sym) => instrumentMetaData[sym.dukascopy.toLowerCase()].code;
const dayUrl = (code, side, y, m, d) => `https://jetta.dukascopy.com/v1/candles/minute/${code}/${side}/${y}/${m + 1}/${d}`;

async function fetchDay(url) {
  for (let attempt = 1; attempt <= 6; attempt++) {
    try {
      const res = await fetch(url, { headers: HEADERS });
      const body = await res.text();
      if (res.status === 200 && !res.headers.get('x-amzn-waf-action') && body.startsWith('{')) return body;
      if (res.status === 404) return null;
    } catch {
      /* ağ hatası: tekrar dene */
    }
    await sleep(5000 * attempt);
  }
  throw new Error(`İndirilemedi: ${url}`);
}

/** Ayın günleri (UTC). Cumartesi atlanır (piyasa kapalı). Bugün ve sonrası atlanır. */
function monthDays(y, m) {
  const out = [];
  const today = new Date();
  const todayUtc = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());
  for (let d = 1; d <= 31; d++) {
    const t = Date.UTC(y, m, d);
    if (new Date(t).getUTCMonth() !== m || t >= todayUtc) break;
    if (new Date(t).getUTCDay() !== 6) out.push(d);
  }
  return out;
}

// --from=YYYY-MM / --to=YYYY-MM: ay aralığını sınırla (deneme veya güncelleme için)
const argMonth = (name) => args.find((a) => a.startsWith(`--${name}=`))?.split('=')[1];
const fromKey = argMonth('from') ?? '2020-01';
const toKey = argMonth('to') ?? '9999-12';

function months() {
  const out = [];
  const now = new Date();
  for (let y = START.y; y <= now.getUTCFullYear(); y++) {
    for (let m = y === START.y ? START.m : 0; m < 12; m++) {
      if (Date.UTC(y, m, 1) > now.getTime()) break;
      const key = `${y}-${String(m + 1).padStart(2, '0')}`;
      if (key < fromKey || key > toKey) continue;
      out.push({ y, m, key: `${y}-${String(m + 1).padStart(2, '0')}`, current: y === now.getUTCFullYear() && m === now.getUTCMonth() });
    }
  }
  return out;
}

async function download() {
  const jobs = [];
  for (const sym of symbols) {
    for (const side of SIDES) {
      for (const mo of months()) {
        const dest = path.join(RAW_DIR, sym.id, side, `${mo.key}.json.gz`);
        if (fs.existsSync(dest) && (!mo.current || Date.now() - fs.statSync(dest).mtimeMs < 12 * 3600e3)) continue;
        jobs.push({ sym, side, mo, dest });
      }
    }
  }
  const total = jobs.length;
  console.log(`Dukascopy: ${total} ay dosyası indirilecek (${symbols.map((s) => s.id).join(', ')}; BID + ASK).`);
  if (!total) return;
  const t0 = Date.now();
  let done = 0;
  let failed = 0;
  // Bir ayın günleri sırayla, aylar WORKERS kadar paralel indirilir.
  async function worker() {
    for (;;) {
      const job = jobs.shift();
      if (!job) return;
      const { sym, side, mo, dest } = job;
      const code = jettaCode(sym);
      const out = {};
      try {
        for (const d of monthDays(mo.y, mo.m)) {
          const body = await fetchDay(dayUrl(code, side, mo.y, mo.m, d));
          if (body) out[d] = body;
          await sleep(PAUSE_MS);
        }
        fs.mkdirSync(path.dirname(dest), { recursive: true });
        fs.writeFileSync(dest + '.part', zlib.gzipSync(JSON.stringify(out)));
        fs.renameSync(dest + '.part', dest);
      } catch (err) {
        failed++;
        console.log(`  HATA ${sym.id} ${side} ${mo.key}: ${err.message} (sonraki çalıştırmada tekrar denenir)`);
      }
      done++;
      if (done % 10 === 0 || done === total) {
        const rate = (Date.now() - t0) / done / 1000;
        // rate zaten paralel çalışmayı içeriyor (geçen süre / biten iş)
        console.log(`  ${done}/${total} ay (${sym.id} ${side} ${mo.key}) ~${Math.round(((total - done) * rate) / 60)} dk kaldı`);
      }
    }
  }
  await Promise.all(Array.from({ length: WORKERS }, worker));
  console.log(`İndirme bitti: ${done - failed} ay tamam, ${failed} ay hatalı.`);
}

/** Bir tarafın (BID/ASK) tüm aylarını çözer: Map<t, [o,h,l,c]> (fiyat float) ve ölçek. */
function decodeSide(symId, side, code) {
  const dir = path.join(RAW_DIR, symId, side);
  const map = new Map();
  let multiplier = null;
  if (!fs.existsSync(dir)) return { map, multiplier };
  for (const f of fs.readdirSync(dir).filter((x) => x.endsWith('.json.gz')).sort()) {
    const [y, m] = f.slice(0, 7).split('-').map(Number);
    const days = JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(dir, f))).toString('utf8'));
    for (const [d, body] of Object.entries(days)) {
      const json = JSON.parse(body);
      if (json.multiplier) multiplier = json.multiplier;
      const rows = processData({
        requestedTimeframe: 'm1',
        bufferObjects: [{ url: dayUrl(code, side, y, m - 1, Number(d)), buffer: Buffer.from(body) }],
        priceType: side.toLowerCase(),
        volumes: true,
        volumeUnits: 'millions',
        ignoreFlats: true,
      });
      for (const r of rows) map.set(Math.round(r[0] / 1000), [r[1], r[2], r[3], r[4]]);
    }
  }
  return { map, multiplier };
}

function buildSymbol(sym) {
  const code = jettaCode(sym);
  const bid = decodeSide(sym.id, 'BID', code);
  if (!bid.map.size) return console.log(`  ${sym.id}: Dukascopy verisi yok, atlandı`);
  const ask = decodeSide(sym.id, 'ASK', code);
  const scale = Math.round(1 / (bid.multiplier ?? 1e-5));
  const times = [...bid.map.keys()].sort((a, b) => a - b);
  const n = times.length;
  const cols = Array.from({ length: 9 }, () => new Int32Array(n));
  let noAsk = 0, fixed = 0, badSpread = 0;
  times.forEach((t, k) => {
    const b = bid.map.get(t);
    let a = ask.map.get(t);
    if (!a) {
      // Ask dakikası yoksa (nadir): spread uydurulmaz, ask = bid yazılır ve sayılır.
      noAsk++;
      a = b;
    }
    cols[0][k] = t;
    for (let i = 0; i < 4; i++) {
      cols[1 + i][k] = Math.round(b[i] * scale);
      cols[5 + i][k] = Math.round(a[i] * scale);
    }
    for (const base of [1, 5]) {
      const mx = Math.max(cols[base][k], cols[base + 3][k]), mn = Math.min(cols[base][k], cols[base + 3][k]);
      if (cols[base + 1][k] < mx || cols[base + 2][k] > mn) fixed++;
      cols[base + 1][k] = Math.max(cols[base + 1][k], mx);
      cols[base + 2][k] = Math.min(cols[base + 2][k], mn);
    }
    if (cols[8][k] < cols[4][k]) badSpread++;
  });
  const t = cols[0];
  const { gaps, missingHoursByYear } = findGaps(t, n);
  const spreads = [];
  for (let i = 0; i < n; i += 97) spreads.push(cols[8][i] - cols[4][i]);
  spreads.sort((a, b) => a - b);

  fs.mkdirSync(OUT_DIR, { recursive: true });
  const out = Buffer.alloc(n * 37);
  cols.forEach((c, i) => Buffer.from(c.buffer, 0, n * 4).copy(out, i * n * 4));
  fs.writeFileSync(path.join(OUT_DIR, `${sym.id}.bin`), out);
  const meta = {
    id: sym.id,
    format: 3,
    count: n,
    scale,
    from: t[0],
    to: t[n - 1] + 60,
    gaps,
    missingHoursByYear,
    spread: { median: spreads[spreads.length >> 1] / scale, p90: spreads[Math.floor(spreads.length * 0.9)] / scale },
    askMissingMinutes: noAsk,
    negativeSpreadMinutes: badSpread,
    ohlcFixed: fixed,
    builtAt: new Date().toISOString(),
    source: `Dukascopy 1m bid+ask (${code}, UTC)`,
  };
  fs.writeFileSync(path.join(OUT_DIR, `${sym.id}.json`), JSON.stringify(meta));
  const fmt = (s) => new Date((s + nyOffset(s)) * 1000).toISOString().slice(0, 16).replace('T', ' ');
  const yrs = Object.entries(missingHoursByYear).map(([y, hr]) => `${y}:${Math.round(hr)}s`).join(' ');
  console.log(`  ${sym.id}: ${n.toLocaleString('tr-TR')} mum, ${fmt(t[0])} -> ${fmt(t[n - 1])} NY, medyan spread ${meta.spread.median}, ask'sız ${noAsk} dk, ${gaps.length} boşluk (${yrs})`);
}

if (!buildOnly) await download();
console.log('Derleniyor...');
for (const s of symbols) buildSymbol(s);
console.log('Tamam.');
