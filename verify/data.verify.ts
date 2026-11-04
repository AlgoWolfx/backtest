// Gerçek veri dosyaları üzerinde doğrulama (npm run verify).
//
// Uygulamanın kendi saat kodundan BAĞIMSIZ olması için New York saati burada Intl
// (ICU saat dilimi veritabanı) ile hesaplanır. Sonuçlar data/verify-report.md dosyasına yazılır.

import fs from 'node:fs';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { SYMBOLS } from '../shared/symbols.js';
import { aggIndexOfM1, aggregate, type M1Data, type SymbolMeta } from '../src/core/data';
import type { TF } from '../src/core/timeframes';

const DATA = process.env.BACKTEST_DATA_DIR || path.resolve('data');
const report: string[] = ['# Veri doğrulama raporu', '', `Oluşturma: ${new Date().toISOString()}`, ''];

function load(id: string, dir = 'bars-dukascopy'): M1Data | null {
  const metaPath = path.join(DATA, dir, `${id}.json`);
  if (!fs.existsSync(metaPath)) return null;
  const meta: SymbolMeta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
  const buf = fs.readFileSync(path.join(DATA, dir, `${id}.bin`));
  const n = meta.count;
  const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.length);
  const col = (k: number) => new Int32Array(ab, k * 4 * n, n);
  const ints = meta.format === 3 ? 9 : 5;
  const src = meta.format && meta.format >= 2 ? new Uint8Array(ab, ints * 4 * n, n) : new Uint8Array(n);
  const ask = ints === 9 ? { o: col(5), h: col(6), l: col(7), c: col(8) } : undefined;
  return { id, source: 'dukascopy', n, scale: meta.scale, t: col(0), o: col(1), h: col(2), l: col(3), c: col(4), src, ask, meta };
}

const SOURCES = [{ dir: 'bars-dukascopy', label: 'Dukascopy' }];

// ---- bağımsız NY saati (Intl)
const fmt = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23', weekday: 'short' });
function ny(utc: number) {
  const p = Object.fromEntries(fmt.formatToParts(new Date(utc * 1000)).map((x) => [x.type, x.value]));
  return { y: +p.year, m: +p.month, d: +p.day, H: +p.hour, M: +p.minute, wd: p.weekday as string };
}
const pad = (n: number) => String(n).padStart(2, '0');
const dateStr = (y: number, m: number, d: number) => {
  const x = new Date(Date.UTC(y, m - 1, d));
  return `${x.getUTCFullYear()}-${pad(x.getUTCMonth() + 1)}-${pad(x.getUTCDate())}`;
};

/** Bağımsız kova etiketi: uygulamanın grafikte gösterdiği zamanla aynı biçimde. */
function expectedLabel(tf: TF, utc: number): string {
  const p = ny(utc);
  // İşlem günü: NY 17:00 ve sonrası ertesi güne aittir
  const td = p.H >= 17 ? dateStr(p.y, p.m, p.d + 1) : dateStr(p.y, p.m, p.d);
  switch (tf) {
    case '1h':
      return `${dateStr(p.y, p.m, p.d)} ${pad(p.H)}:00`;
    case '4h': {
      const back = (p.H - 1 + 24) % 4; // 01,05,09,13,17,21
      const startH = p.H - back;
      return startH < 0 ? `${dateStr(p.y, p.m, p.d - 1)} ${pad(startH + 24)}:00` : `${dateStr(p.y, p.m, p.d)} ${pad(startH)}:00`;
    }
    case '1D':
      return `${td} 00:00`;
    case '1W': {
      const x = new Date(td + 'T00:00:00Z');
      const monday = new Date(x.getTime() - ((x.getUTCDay() + 6) % 7) * 86400e3);
      return `${monday.toISOString().slice(0, 10)} 00:00`;
    }
    case '1M':
      return `${td.slice(0, 7)}-01 00:00`;
    default:
      throw new Error(tf);
  }
}
const appLabel = (chartTime: number) => new Date(chartTime * 1000).toISOString().slice(0, 16).replace('T', ' ');

function rng(seed: number) {
  return () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
}

afterAll(() => {
  fs.writeFileSync(path.join(DATA, 'verify-report.md'), report.join('\n') + '\n');
});

for (const spec of SYMBOLS) for (const src of SOURCES) {
  const d = load(spec.id, src.dir);
  describe.skipIf(!d)(`${spec.id} · ${src.label}`, () => {
    const D = d!;
    const lines: string[] = [`## ${spec.id} · ${src.label}`, ''];
    afterAll(() => report.push(...lines, ''));

    it('yapı: sıralı, tekrarsız, OHLC tutarlı, Cumartesi mumu yok', () => {
      let bad = 0, sat = 0, spikes = 0;
      const spikeList: string[] = [];
      for (let i = 0; i < D.n; i++) {
        if (i > 0 && D.t[i] <= D.t[i - 1]) bad++;
        if (D.t[i] % 60 !== 0) bad++;
        if (D.h[i] < Math.max(D.o[i], D.c[i]) || D.l[i] > Math.min(D.o[i], D.c[i])) bad++;
        if (new Date(D.t[i] * 1000).getUTCDay() === 6) sat++;
        if (i > 0 && D.t[i] - D.t[i - 1] <= 300 && Math.abs(D.c[i] / D.c[i - 1] - 1) > 0.015) {
          spikes++;
          if (spikeList.length < 5) spikeList.push(new Date(D.t[i] * 1000).toISOString().slice(0, 16) + 'Z');
        }
      }
      lines.push(`- 1m mum: ${D.n.toLocaleString('tr-TR')}`);
      lines.push(`- Yapı hatası: ${bad}, Cumartesi (UTC) mumu: ${sat}, 5 dk içinde %1,5+ sıçrama: ${spikes}${spikeList.length ? ' (' + spikeList.join(', ') + ')' : ''}`);
      // Ask'ı olan derlemede ask >= bid olmalı (spread negatif olamaz)
      let askBelowBid = 0;
      if (D.ask) for (let i = 0; i < D.n; i++) if (D.ask.c[i] < D.c[i] || D.ask.o[i] < D.o[i]) askBelowBid++;
      lines.push(`- ask < bid olan dakika: ${askBelowBid}`);
      expect(bad).toBe(0);
      expect(askBelowBid).toBe(0);
    });

    it('mumlar bağımsız hesaplanan NY kovalarına düşüyor (1H, 4H, 1D, 1W, 1M)', () => {
      const r = rng(42);
      const tfs: TF[] = ['1h', '4h', '1D', '1W', '1M'];
      const mism: string[] = [];
      let checks = 0;
      for (const tf of tfs) {
        const agg = aggregate(D, tf);
        for (let s = 0; s < 400; s++) {
          const i = Math.floor(r() * D.n);
          const k = aggIndexOfM1(agg, i);
          const exp = expectedLabel(tf, D.t[i]);
          const got = appLabel(agg.time[k]);
          checks++;
          if (exp !== got && mism.length < 10) mism.push(`${tf} ${new Date(D.t[i] * 1000).toISOString().slice(0, 16)}Z: beklenen ${exp}, uygulama ${got}`);
        }
      }
      lines.push(`- Kova kontrolü: ${checks} örnek, ${mism.length} uyumsuz${mism.length ? ': ' + mism.join('; ') : ''}`);
      expect(mism).toEqual([]);
    });

    it('günlük ve 4H OHLC bağımsız yeniden hesaplamayla aynı', () => {
      const r = rng(7);
      const errs: string[] = [];
      let checks = 0;
      for (const tf of ['1D', '4h'] as TF[]) {
        const agg = aggregate(D, tf);
        for (let s = 0; s < 60; s++) {
          const k = 1 + Math.floor(r() * (agg.n - 2));
          const label = appLabel(agg.time[k]);
          // Etrafındaki 1m mumları bağımsız etikete göre topla
          let o = NaN, h = -Infinity, l = Infinity, c = NaN;
          const from = agg.start[k] - 400 > 0 ? agg.start[k] - 400 : 0;
          const to = Math.min(D.n, agg.end[k] + 400);
          for (let i = from; i < to; i++) {
            if (expectedLabel(tf, D.t[i]) !== label) continue;
            if (Number.isNaN(o)) o = D.o[i];
            h = Math.max(h, D.h[i]);
            l = Math.min(l, D.l[i]);
            c = D.c[i];
          }
          checks++;
          if (o !== agg.o[k] || h !== agg.h[k] || l !== agg.l[k] || c !== agg.c[k]) {
            if (errs.length < 5) errs.push(`${tf} ${label}: beklenen ${o}/${h}/${l}/${c}, uygulama ${agg.o[k]}/${agg.h[k]}/${agg.l[k]}/${agg.c[k]}`);
          }
        }
      }
      lines.push(`- OHLC yeniden hesaplama: ${checks} mum, ${errs.length} hata${errs.length ? ': ' + errs.join('; ') : ''}`);
      expect(errs).toEqual([]);
    });
  });
}
