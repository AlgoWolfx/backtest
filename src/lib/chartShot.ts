// Aktif grafiğin görüntüsünü PNG olarak indirir ve (tarayıcı izin verirse) panoya kopyalar.

import { chartRef } from '../chart/chartRef';
import { toast, useStore } from '../store';
import { fmtNy } from './format';

export async function saveChartImage() {
  const c = chartRef.current;
  const s = useStore.getState().session;
  if (!c || !s) return toast('Grafik hazır değil.', 'error');
  const canvas = c.chart.takeScreenshot(true, false); // çizimler dahil, imleç hariç
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
  if (!blob) return toast('Görüntü oluşturulamadı.', 'error');

  let copied = false;
  try {
    await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
    copied = true;
  } catch {
    /* pano izni yok: yalnızca indirilir */
  }
  const stamp = fmtNy(s.replayTime).replace(/\D+/g, '');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `${s.symbol}_${c.tf}_${stamp}.png`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  toast(copied ? 'Grafik görüntüsü indirildi ve panoya kopyalandı.' : 'Grafik görüntüsü indirildi.');
}
