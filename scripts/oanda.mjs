// OANDA v20 REST API'den 1 dakikalık bid + ask mumları indirir ve derler.
// FX Replay / TradingView'daki "OANDA:EURUSD" grafikleriyle aynı fiyat akışıdır.
//
// Gereken: ücretsiz OANDA demo (fxTrade Practice) hesabından alınan API anahtarı.
//   - Proje kökünde .env dosyasına:  OANDA_TOKEN=xxxxxxxx-xxxxxxxx
//   - veya ortam değişkeni OANDA_TOKEN
//   - Canlı hesap anahtarı için ayrıca: OANDA_ENV=live
//
// Kullanım:
//   npm run data:oanda                    -> tüm semboller (DXY OANDA'da yok)
//   npm run data:oanda -- EURUSD XAUUSD
//   npm run data:oanda -- --build-only    -> indirmeden yeniden derle
//
// Ham veri: data/raw/oanda/<SEMBOL>/<YYYY-MM>.csv.gz  (t, bid o/h/l/c, ask o/h/l/c)
// Çıktı:    data/bars-oanda/<SEMBOL>.bin  (format 3: bid + ask + kaynak sütunu)

import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { SYMBOLS } from '../shared/symbols.js';
import { nyOffset } from '../shared/nytime.js';
import { findGaps } from './gaps.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DATA_DIR = process.env.BACKTEST_DATA_DIR || path.join(ROOT, 'data');
const RAW_DIR = path.join(DATA_DIR, 'raw', 'oanda');
const OUT_DIR = path.join(DATA_DIR, 'bars-oanda');
const START = Date.UTC(2020, 0, 1) / 1000;

function readEnvFile() {
  const f = path.join(ROOT, '.env');
  if (!fs.existsSync(f)) return {};
  const out = {};
  for (const line of fs.readFileSync(f, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z_]+)\s*=\s*(.*?)\s*$/);
    if (m) out[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
  return out;
}
const env = { ...readEnvFile(), ...process.env };
const TOKEN = env.OANDA_TOKEN;
const HOST = env.OANDA_HOST || (env.OANDA_ENV === 'live' ? 'https://api-fxtrade.oanda.com' : 'https://api-fxpractice.oanda.com');

const args = process.argv.slice(2);
const buildOnly = args.includes('--build-only');
const wanted = args.filter((a) => !a.startsWith('--')).map((a) => a.toUpperCase());
const symbols = SYMBOLS.filter((s) => s.oanda && (!wanted.length || wanted.includes(s.id)));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function api(url) {
  for (let attempt = 1; ; attempt++) {
    let res;
    try {
      res = await fetch(url, { headers: { Authorization: `Bearer ${TOKEN}`, 'Accept-Datetime-Format': 'UNIX' } });
    } catch (err) {
      if (attempt >= 5) throw err;
      await sleep(2000 * attempt);
      continue;
    }
    if (res.status === 401 || res.status === 403) throw new Error(`OANDA API anahtarı reddedildi (${res.status}). Anahtarı ve OANDA_ENV (practice/live) ayarını kontrol edin.`);
    if (res.ok) return res.json();
    const body = await res.text();
    if (attempt >= 5) throw new Error(`OANDA hatası ${res.status}: ${body.slice(0, 200)}`);
    await sleep(res.status === 429 ? 5000 : 1500 * attempt);
  }
}

/** Bir ayın M1 bid+ask mumlarını indirir. Yalnızca tamamlanmış mumlar alınır. */
async function fetchMonth(instrument, y, m) {
  const monthStart = Date.UTC(y, m, 1) / 1000;
  const monthEnd = Date.UTC(y, m + 1, 1) / 1000;
  const lines = [];
  let from = monthStart;
  while (from < monthEnd) {
    const json = await api(`${HOST}/v3/instruments/${instrument}/candles?price=BA&granularity=M1&from=${from}&count=5000`);
    const candles = json.candles ?? [];
    if (!candles.length) break;
    let last = from;
    for (const c of candles) {
      const t = Math.round(parseFloat(c.time));
      last = t;
      if (t >= monthEnd) break;
      if (!c.complete || !c.bid || !c.ask) continue;
      lines.push([t, c.bid.o, c.bid.h, c.bid.l, c.bid.c, c.ask.o, c.ask.h, c.ask.l, c.ask.c].join(','));
    }
    if (last + 60 <= from) break;
    from = last + 60;
    if (candles.length < 5000) break;
  }
  return lines;
}

async function downloadSymbol(sym) {
  const now = new Date();
  for (let y = 2020; y <= now.getUTCFullYear(); y++) {
    for (let m = 0; m < 12; m++) {
      if (Date.UTC(y, m, 1) > now.getTime()) return;
      const key = `${y}-${String(m + 1).padStart(2, '0')}`;
      const dest = path.join(RAW_DIR, sym.id, `${key}.csv.gz`);
      const current = y === now.getUTCFullYear() && m === now.getUTCMonth();
      if (fs.existsSync(dest) && (!current || Date.now() - fs.statSync(dest).mtimeMs < 12 * 3600e3)) continue;
      process.stdout.write(`  ${sym.id} ${key} ... `);
      const lines = await fetchMonth(sym.oanda, y, m);
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      fs.writeFileSync(dest + '.part', zlib.gzipSync(lines.join('\n')));
      fs.renameSync(dest + '.part', dest);
      console.log(`${lines.length} mum`);
    }
  }
}

function decimalsOf(str) {
  const i = str.indexOf('.');
  return i === -1 ? 0 : str.length - i - 1;
}

function buildSymbol(sym) {
  const dir = path.join(RAW_DIR, sym.id);
  if (!fs.existsSync(dir)) return console.log(`  ${sym.id}: OANDA ham verisi yok, atlandı`);
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.csv.gz')).sort();
  const rows = [];
  let decimals = 0;
  for (const f of files) {
    const text = zlib.gunzipSync(fs.readFileSync(path.join(dir, f))).toString('utf8');
    for (const line of text.split('\n')) {
      if (!line) continue;
      const p = line.split(',');
      if (p.length !== 9) continue;
      if (rows.length % 50 === 0) for (let i = 1; i < 9; i++) decimals = Math.max(decimals, decimalsOf(p[i]));
      rows.push(p);
    }
  }
  const scale = 10 ** Math.min(decimals, 6);
  const all = rows.map((p) => [Number(p[0]), ...p.slice(1).map((v) => Math.round(Number(v) * scale))]).filter((r) => r[0] >= START - 7 * 3600);
  all.sort((a, b) => a[0] - b[0]);
  const n = all.length;
  const cols = Array.from({ length: 9 }, () => new Int32Array(n));
  let k = 0, fixed = 0;
  for (const r of all) {
    if (k > 0 && cols[0][k - 1] === r[0]) k--;
    for (let i = 0; i < 9; i++) cols[i][k] = r[i];
    // OHLC tutarlılığı (bid: 1-4, ask: 5-8)
    for (const b of [1, 5]) {
      const mx = Math.max(cols[b][k], cols[b + 3][k]), mn = Math.min(cols[b][k], cols[b + 3][k]);
      if (cols[b + 1][k] < mx || cols[b + 2][k] > mn) fixed++;
      cols[b + 1][k] = Math.max(cols[b + 1][k], mx);
      cols[b + 2][k] = Math.min(cols[b + 2][k], mn);
    }
    k++;
  }
  if (!k) return console.log(`  ${sym.id}: OANDA verisi boş`);
  const [t] = cols;
  const { gaps, missingHoursByYear } = findGaps(t, k);

  // Spread istatistiği (kapanışlarda, point cinsinden)
  const spreads = [];
  for (let i = 0; i < k; i += 97) spreads.push(cols[8][i] - cols[4][i]);
  spreads.sort((a, b) => a - b);

  fs.mkdirSync(OUT_DIR, { recursive: true });
  // Format 3: t, bid o/h/l/c, ask o/h/l/c (9 x Int32) + kaynak (Uint8, hep 0)
  const order = [0, 1, 2, 3, 4, 5, 6, 7, 8];
  const out = Buffer.alloc(k * 37);
  order.forEach((ci, i) => Buffer.from(cols[ci].buffer, 0, k * 4).copy(out, i * k * 4));
  fs.writeFileSync(path.join(OUT_DIR, `${sym.id}.bin`), out);
  const meta = {
    id: sym.id,
    format: 3,
    count: k,
    scale,
    from: t[0],
    to: t[k - 1] + 60,
    gaps,
    missingHoursByYear,
    spread: { median: spreads[spreads.length >> 1] / scale, p90: spreads[Math.floor(spreads.length * 0.9)] / scale },
    ohlcFixed: fixed,
    sourceFiles: files,
    builtAt: new Date().toISOString(),
    source: `OANDA v20 M1 bid+ask (${sym.oanda}, UTC)`,
  };
  fs.writeFileSync(path.join(OUT_DIR, `${sym.id}.json`), JSON.stringify(meta));
  const fmt = (s) => new Date((s + nyOffset(s)) * 1000).toISOString().slice(0, 16).replace('T', ' ');
  const yrs = Object.entries(missingHoursByYear).map(([y, hr]) => `${y}:${Math.round(hr)}s`).join(' ');
  console.log(`  ${sym.id}: ${k.toLocaleString('tr-TR')} mum, ${fmt(t[0])} -> ${fmt(t[k - 1])} NY, ölçek 1e${Math.log10(scale)}, medyan spread ${meta.spread.median}, ${gaps.length} boşluk (${yrs})`);
}

if (!buildOnly) {
  if (!TOKEN) {
    console.error('OANDA_TOKEN bulunamadı. Proje kökünde .env dosyasına "OANDA_TOKEN=..." yazın (README: OANDA verisi).');
    process.exit(1);
  }
  console.log(`İndiriliyor (OANDA, ${HOST})...`);
  try {
    for (const s of symbols) await downloadSymbol(s);
  } catch (err) {
    console.error(`\nHATA: ${err.message}`);
    process.exit(1);
  }
}
console.log('Derleniyor...');
for (const s of symbols) buildSymbol(s);
console.log('Tamam.');
