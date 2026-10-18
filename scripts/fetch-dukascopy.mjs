// Dukascopy'den gereken günleri indirir:
//   1) doğrulama örnekleri: her sembol ve yıl için 3 gün (biri ABD-AB yaz saati geçiş haftasında)
//   2) HistData'da veri boşluğu olan günler (npm run data sonrası meta.sourceGapDays)
// Kaldığı yerden devam eder. Sonra "npm run data -- --build-only" ile boşluklar doldurulur.
//
// Kullanım: npm run fetch:dukascopy [-- EURUSD XAUUSD] [-- --verify-only]

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { SYMBOLS } from '../shared/symbols.js';
import { dayPath, fetchDay } from './dukascopy.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DATA_DIR = process.env.BACKTEST_DATA_DIR || path.join(ROOT, 'data');
const RAW_DIR = path.join(DATA_DIR, 'raw');
const BARS_DIR = path.join(DATA_DIR, 'bars');

const args = process.argv.slice(2);
const verifyOnly = args.includes('--verify-only');
const wanted = args.filter((a) => !a.startsWith('--')).map((a) => a.toUpperCase());
const symbols = wanted.length ? SYMBOLS.filter((s) => wanted.includes(s.id)) : SYMBOLS;

const iso = (d) => d.toISOString().slice(0, 10);
/** Ayın n. haftanın gününü bulur (dow: 0=Pazar). */
function nthDow(y, m, dow, n) {
  const first = new Date(Date.UTC(y, m, 1));
  return new Date(Date.UTC(y, m, 1 + ((7 + dow - first.getUTCDay()) % 7) + 7 * (n - 1)));
}

/** Doğrulama günleri: Haziran'ın 2. Çarşambası, ABD yaz saatine geçişten sonraki Çarşamba, Kasım'ın 1. Perşembesi. */
export function verificationDays(fromYear, toDate) {
  const days = [];
  for (let y = fromYear; y <= toDate.getUTCFullYear(); y++) {
    const usDst = nthDow(y, 2, 0, 2); // Mart'ın 2. Pazarı
    const cands = [nthDow(y, 5, 3, 2), new Date(usDst.getTime() + 3 * 86400e3), nthDow(y, 10, 4, 1)];
    for (const d of cands) if (d < toDate) days.push(iso(d));
  }
  return days;
}

const queue = [];
const until = new Date(Date.now() - 2 * 86400e3);
for (const s of symbols) for (const day of verificationDays(2020, until)) queue.push({ s, day, kind: 'doğrulama' });
if (!verifyOnly) {
  for (const s of symbols) {
    const metaPath = path.join(BARS_DIR, `${s.id}.json`);
    if (!fs.existsSync(metaPath)) continue;
    const meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
    for (const day of meta.sourceGapDays ?? []) queue.push({ s, day, kind: 'boşluk' });
  }
}
// Önce boşluk günleri (2023 en başta, en çok eksik orada), sonra doğrulama örnekleri.
const rank = (q) => (q.kind === 'boşluk' ? (q.day.startsWith('2023') ? 0 : 1) : 2);
queue.sort((a, b) => rank(a) - rank(b));

// --minutes=N: N dakika sonra temiz biçimde dur (kaldığı yerden devam edilebilir).
const minutesArg = args.find((a) => a.startsWith('--minutes='));
const deadline = minutesArg ? Date.now() + Number(minutesArg.split('=')[1]) * 60e3 : Infinity;

const todo = queue.filter((q) => !fs.existsSync(dayPath(RAW_DIR, q.s.id, q.day)));
console.log(`Dukascopy: ${queue.length} gün gerekli, ${queue.length - todo.length} önbellekte, ${todo.length} indirilecek.`);
const t0 = Date.now();
let done = 0, failed = 0, ok = 0;
for (const q of todo) {
  if (Date.now() > deadline) break;
  let r;
  try {
    r = await fetchDay(q.s.dukascopy, q.day, dayPath(RAW_DIR, q.s.id, q.day));
  } catch {
    r = 'atlandı (sunucu yanıt vermedi, sonraki çalıştırmada denenecek)';
    failed++;
  }
  if (r === 'ok' || r === 'missing') ok++;
  done++;
  if (done % 10 === 0 || done === todo.length) {
    const rate = (Date.now() - t0) / done / 1000;
    console.log(`  ${done}/${todo.length} (${q.kind} ${q.s.id} ${q.day}: ${r}) ~${Math.round(((todo.length - done) * rate) / 60)} dk kaldı`);
  }
}
const left = queue.filter((q) => !fs.existsSync(dayPath(RAW_DIR, q.s.id, q.day))).length;
console.log(`Bitti: bu çalıştırmada ${ok} gün indirildi, ${failed} gün atlandı.`);
console.log(`KALAN_GUN=${left}`);
if (!left) console.log('Tüm günler indi. Şimdi: npm run data -- --build-only');
