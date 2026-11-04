import { useMemo, useState } from 'react';
import { setSplits, useStore } from '../../store';
import { LAYOUTS } from '../../core/types';
import { dragSplit, layoutGeometry, type PaneRect, type SplitterGeom } from '../../core/layouts';
import { FavToolbar } from './FavToolbar';
import { ChartView } from './ChartView';

const FULL: PaneRect = { x: 0, y: 0, w: 1, h: 1 };

/** Çoklu ekran düzenine göre grafikleri yerleştirir; aralarındaki bölücüler sürüklenerek boyutlandırılır. */
export function ChartArea() {
  const layout = useStore((s) => s.session?.layout ?? '1');
  const splits = useStore((s) => s.session?.splits);
  const maxPane = useStore((s) => (s.maxPane != null && s.maxPane < LAYOUTS[s.session?.layout ?? '1'].count ? s.maxPane : null));
  const geo = useMemo(() => layoutGeometry(layout, splits), [layout, splits]);
  return (
    <div className={`chart-area layout-${layout} ${maxPane != null ? 'has-max' : ''}`}>
      {geo.panes.map((r, i) => (
        <ChartView key={i} pane={i} rect={maxPane == null ? r : i === maxPane ? FULL : null} />
      ))}
      {maxPane == null && geo.splitters.map((g) => <Splitter key={`${g.path}:${g.index}`} g={g} />)}
      <FavToolbar />
    </div>
  );
}

/** İki ekran arasındaki sürüklenebilir bölücü (çift tık: bu bölünmenin oranlarını varsayılana döndür). */
function Splitter({ g }: { g: SplitterGeom }) {
  const [drag, setDrag] = useState(false);
  const row = g.dir === 'row'; // satır: ekranlar yan yana, bölücü dikey çizgi
  const move = (e: React.PointerEvent<HTMLDivElement>) => {
    const r = e.currentTarget.parentElement!.getBoundingClientRect();
    const p = row ? (e.clientX - r.left) / r.width : (e.clientY - r.top) / r.height;
    setSplits(g.path, dragSplit(g.ratios, g.index, (p - g.nodeStart) / g.nodeLen));
  };
  const style: React.CSSProperties = row
    ? { left: `${g.at * 100}%`, top: `${g.from * 100}%`, height: `${(g.to - g.from) * 100}%` }
    : { top: `${g.at * 100}%`, left: `${g.from * 100}%`, width: `${(g.to - g.from) * 100}%` };
  return (
    <div
      className={`splitter splitter-${row ? 'x' : 'y'} ${drag ? 'drag' : ''}`}
      style={style}
      title="Sürükle: grafik boyutunu ayarla · Çift tık: sıfırla"
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId);
        setDrag(true);
      }}
      onPointerMove={(e) => drag && move(e)}
      onPointerUp={() => setDrag(false)}
      onPointerCancel={() => setDrag(false)}
      onDoubleClick={() => setSplits(g.path, null)}
    />
  );
}
