// Yerel sunucu: veri dosyalarını, backtest oturumlarını ve arayüzü servis eder.
//   node server/index.mjs         -> derlenmiş arayüz (dist/)
//   node server/index.mjs --dev   -> Vite geliştirme modu (anında yenileme)

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { exec } from 'node:child_process';
import { SYMBOLS } from '../shared/symbols.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DATA_DIR = process.env.BACKTEST_DATA_DIR || path.join(ROOT, 'data');
const BARS_DIRS = { dukascopy: path.join(DATA_DIR, 'bars-dukascopy'), histdata: path.join(DATA_DIR, 'bars'), oanda: path.join(DATA_DIR, 'bars-oanda') };
const SESSIONS_DIR = path.join(DATA_DIR, 'sessions');
const DIST_DIR = path.join(ROOT, 'dist');
const PORT = Number(process.env.PORT || 3737);
const DEV = process.argv.includes('--dev');
const OPEN = process.argv.includes('--open');

fs.mkdirSync(SESSIONS_DIR, { recursive: true });

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.json': 'application/json', '.png': 'image/png', '.ico': 'image/x-icon', '.woff2': 'font/woff2' };

function sendJson(res, status, body) {
  const data = JSON.stringify(body);
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(data);
}

function readBuffer(req, limit) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > limit) reject(new Error('Gövde çok büyük'));
      else chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

function readBody(req, limit = 20e6) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > limit) reject(new Error('Gövde çok büyük'));
      else chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

/**
 * Klasörü içeriğiyle siler. fs.rmSync kullanılmaz: Node 24'te Windows'ta ASCII dışı karakter
 * içeren yollarda (ör. "Masaüstü") hata vermeden hiçbir şey silmiyor.
 */
function removeDir(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) removeDir(p);
    else fs.unlinkSync(p);
  }
  fs.rmdirSync(dir);
}

const validId =(id) => /^[a-zA-Z0-9_-]{1,64}$/.test(id);
const sessionPath = (id) => path.join(SESSIONS_DIR, `${id}.json`);

function readMeta(source, id) {
  const dir = BARS_DIRS[source];
  const metaPath = path.join(dir, `${id}.json`);
  if (!fs.existsSync(metaPath) || !fs.existsSync(path.join(dir, `${id}.bin`))) return null;
  return JSON.parse(fs.readFileSync(metaPath, 'utf8'));
}

function listSymbols() {
  return SYMBOLS.map((s) => {
    const sources = {};
    for (const src of Object.keys(BARS_DIRS)) {
      const m = readMeta(src, s.id);
      if (m) sources[src] = m;
    }
    // available/meta: uygulamanın tercih ettiği kaynak (Dukascopy varsa o, yoksa HistData)
    const best = sources.dukascopy ?? sources.histdata ?? null;
    return { ...s, available: !!best, meta: best, sources };
  });
}

function listSessions() {
  return fs
    .readdirSync(SESSIONS_DIR)
    .filter((f) => f.endsWith('.json'))
    .map((f) => {
      try {
        const s = JSON.parse(fs.readFileSync(path.join(SESSIONS_DIR, f), 'utf8'));
        const closed = (s.trades || []).filter((t) => t.status === 'closed');
        const pnl = closed.reduce((a, t) => a + (t.pnl || 0), 0);
        return { id: s.id, name: s.name, symbol: s.symbol, replayTime: s.replayTime, startTime: s.startTime, updatedAt: s.updatedAt, initialBalance: s.initialBalance, balance: s.initialBalance + pnl, trades: closed.length, accountStatus: s.account?.state?.status ?? null, accountType: s.account?.rules?.type ?? null };
      } catch {
        return null;
      }
    })
    .filter(Boolean)
    .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
}

async function handleApi(req, res, url) {
  const parts = url.pathname.split('/').filter(Boolean); // ['api', ...]
  if (parts[1] === 'symbols' && req.method === 'GET') return sendJson(res, 200, listSymbols());

  if (parts[1] === 'bars' && req.method === 'GET') {
    const id = parts[2];
    if (!SYMBOLS.some((s) => s.id === id)) return sendJson(res, 404, { error: 'Sembol yok' });
    const source = url.searchParams.get('source') || 'histdata';
    if (!BARS_DIRS[source]) return sendJson(res, 400, { error: 'Geçersiz kaynak' });
    const file = path.join(BARS_DIRS[source], `${id}.bin`);
    if (!fs.existsSync(file)) return sendJson(res, 404, { error: 'Veri indirilmemiş. "npm run data" çalıştırın.' });
    const { size } = fs.statSync(file);
    res.writeHead(200, { 'Content-Type': 'application/octet-stream', 'Content-Length': size, 'Cache-Control': 'no-cache' });
    return fs.createReadStream(file).pipe(res);
  }

  // İşlem ekran görüntüleri: /api/sessions/<id>/shots/<dosya>
  if (parts[1] === 'sessions' && parts[3] === 'shots') {
    const id = parts[2];
    const name = parts[4];
    if (!validId(id) || !/^[a-zA-Z0-9_-]{1,80}\.(jpg|png)$/.test(name || '')) return sendJson(res, 400, { error: 'Geçersiz dosya' });
    const dir = path.join(SESSIONS_DIR, id, 'shots');
    const file = path.join(dir, name);
    if (req.method === 'GET') {
      if (!fs.existsSync(file)) return sendJson(res, 404, { error: 'Görüntü yok' });
      res.writeHead(200, { 'Content-Type': name.endsWith('.png') ? 'image/png' : 'image/jpeg', 'Cache-Control': 'no-cache' });
      return fs.createReadStream(file).pipe(res);
    }
    if (req.method === 'PUT') {
      const body = await readBuffer(req, 15e6);
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(file, body);
      return sendJson(res, 200, { ok: true, name });
    }
    return sendJson(res, 405, { error: 'Desteklenmiyor' });
  }

  if (parts[1] === 'sessions') {
    const id = parts[2];
    if (!id && req.method === 'GET') return sendJson(res, 200, listSessions());
    if (!id || !validId(id)) return sendJson(res, 400, { error: 'Geçersiz oturum' });
    const file = sessionPath(id);
    if (req.method === 'GET') {
      if (!fs.existsSync(file)) return sendJson(res, 404, { error: 'Oturum bulunamadı' });
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
      return fs.createReadStream(file).pipe(res);
    }
    // POST: sayfa kapanırken navigator.sendBeacon ile gelen son kayıt
    if (req.method === 'PUT' || req.method === 'POST') {
      const body = await readBody(req);
      const parsed = JSON.parse(body);
      if (parsed.id !== id) return sendJson(res, 400, { error: 'Kimlik uyuşmuyor' });
      fs.writeFileSync(file + '.tmp', body);
      fs.renameSync(file + '.tmp', file);
      return sendJson(res, 200, { ok: true });
    }
    if (req.method === 'DELETE') {
      if (fs.existsSync(file)) fs.unlinkSync(file);
      const shotsDir = path.join(SESSIONS_DIR, id);
      // Windows/OneDrive klasörü kısa süre tutabilir: birkaç kez dene. Boş klasör kalırsa zararsızdır.
      const removeShots = () => {
        try {
          if (fs.existsSync(shotsDir)) removeDir(shotsDir);
        } catch {
          /* bir sonraki denemede */
        }
      };
      removeShots();
      // OneDrive yeni dosyaları yüklerken kısa süre kilitleyebilir; kalırsa sonra tekrar dene.
      for (const ms of [10_000, 60_000]) setTimeout(removeShots, ms).unref();
      return sendJson(res, 200, { ok: true });
    }
  }
  return sendJson(res, 404, { error: 'Bulunamadı' });
}

function serveStatic(req, res, url) {
  let rel = decodeURIComponent(url.pathname);
  if (rel === '/') rel = '/index.html';
  let file = path.join(DIST_DIR, rel);
  if (!file.startsWith(DIST_DIR) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(DIST_DIR, 'index.html');
  if (!fs.existsSync(file)) {
    res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
    return res.end('Arayüz derlenmemiş. "npm start" ile çalıştırın.');
  }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
}

let vite = null;
if (DEV) {
  const { createServer } = await import('vite');
  vite = await createServer({ root: ROOT, server: { middlewareMode: true }, appType: 'spa' });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  try {
    if (url.pathname.startsWith('/api/')) return await handleApi(req, res, url);
    if (vite) return vite.middlewares(req, res);
    return serveStatic(req, res, url);
  } catch (err) {
    console.error(err);
    if (!res.headersSent) sendJson(res, 500, { error: String(err.message || err) });
    else res.end();
  }
});

server.listen(PORT, '127.0.0.1', () => {
  const addr = `http://localhost:${PORT}`;
  console.log(`Backtest hazır: ${addr}${DEV ? ' (geliştirme modu)' : ''}`);
  if (OPEN) exec(process.platform === 'win32' ? `start "" ${addr}` : `open ${addr}`);
});
