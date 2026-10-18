// İşlem ekran görüntüleri: işlem açıldığında ve kapandığında grafiğin o anki hâli kaydedilir.
// Görüntünün üstüne sembol, zaman dilimi, NY saati ve işlem bilgisi yazılır.

import { getSymbol } from '../../shared/symbols.js';
import { controllerFor } from '../chart/chartRef';
import { tfInfo } from '../core/timeframes';
import { fmtMoney, fmtNy, fmtPrice, fmtR, reasonLabel } from './format';
import { onTradeEvent, setTradeShot, toast, useStore, type TradeEvent } from '../store';

const shotUrl = (sessionId: string, name: string) => `/api/sessions/${sessionId}/shots/${name}`;
export { shotUrl };

async function capture(e: TradeEvent) {
  const st = useStore.getState();
  const s = st.session;
  const tr = s?.trades.find((t) => t.id === e.tradeId);
  // İşlemin sembolünü gösteren grafik (çoklu ekranda aktif olan öncelikli); hiçbiri göstermiyorsa görüntü alınamaz.
  const c = tr ? controllerFor(tr.symbol) : null;
  if (!s || !c || !tr) return;

  // Seçim tutamaçları ve imleç görüntüye girmesin.
  const selected = st.selectedId;
  if (selected) useStore.setState({ selectedId: null });
  c.layer.hoverId = null;
  c.layer.requestUpdate();
  const chartCanvas = c.chart.takeScreenshot(true, false);
  if (selected) useStore.setState({ selectedId: selected });

  const spec = getSymbol(tr.symbol);
  const dpr = chartCanvas.width / Math.max(1, c.el.clientWidth);
  const headH = Math.round(34 * dpr);
  const out = document.createElement('canvas');
  out.width = chartCanvas.width;
  out.height = chartCanvas.height + headH;
  const ctx = out.getContext('2d')!;
  ctx.fillStyle = '#0f1115';
  ctx.fillRect(0, 0, out.width, headH);
  ctx.drawImage(chartCanvas, 0, headH);
  ctx.font = `${Math.round(13 * dpr)}px -apple-system, "Segoe UI", Roboto, sans-serif`;
  ctx.textBaseline = 'middle';
  const side = tr.side === 'long' ? 'LONG' : 'SHORT';
  const parts =
    e.kind === 'open'
      ? [`GİRİŞ · ${tr.symbol} ${tfInfo(c.tf).label}`, `${fmtNy(s.replayTime)} NY`, `${side} ${tr.lots} lot @ ${fmtPrice(tr.entry, spec)}`, `SL ${tr.sl != null ? fmtPrice(tr.sl, spec) : '—'}`, `TP ${tr.tp != null ? fmtPrice(tr.tp, spec) : '—'}`]
      : [`ÇIKIŞ · ${tr.symbol} ${tfInfo(c.tf).label}`, `${fmtNy(s.replayTime)} NY`, `${side} @ ${fmtPrice(tr.exit ?? 0, spec)} (${reasonLabel(tr.exitReason)})`, `${fmtMoney(tr.pnl ?? 0, true)}`, fmtR(tr.r)];
  let x = Math.round(12 * dpr);
  parts.forEach((p, i) => {
    ctx.fillStyle = i === 0 ? '#ffffff' : '#b2b5be';
    if (e.kind === 'close' && i >= 3) ctx.fillStyle = (tr.pnl ?? 0) >= 0 ? '#26c6a6' : '#ff6b77';
    ctx.fillText(p, x, headH / 2);
    x += ctx.measureText(p).width + Math.round(18 * dpr);
  });

  const blob = await new Promise<Blob | null>((r) => out.toBlob(r, 'image/jpeg', 0.88));
  if (!blob) return;
  const name = `${tr.id}-${e.kind}.jpg`;
  const res = await fetch(shotUrl(s.id, name), { method: 'PUT', headers: { 'Content-Type': 'image/jpeg' }, body: blob });
  if (!res.ok) return toast('İşlem ekran görüntüsü kaydedilemedi.', 'error');
  // Oturum hâlâ aynıysa işlemi güncelle.
  if (useStore.getState().session?.id === s.id) setTradeShot(tr.id, e.kind, name);
}

let started = false;
/** Uygulama açılışında bir kez çağrılır. */
export function startTradeShots() {
  if (started) return;
  started = true;
  onTradeEvent((e) => {
    capture(e).catch(() => toast('İşlem ekran görüntüsü alınamadı.', 'error'));
  });
}
