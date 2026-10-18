import { ChartController } from '../../chart/ChartController';
import { cloneDrawing, deleteDrawing, drawingsOf, reorderDrawing, updateDrawing, useStore } from '../../store';

/** Çizime sağ tık menüsü: ayarlar, kopyala, kilitle, bu zaman diliminde gizle, öne/arkaya, sil. */
export function DrawingMenu({ c, menu, onClose }: { c: ChartController; menu: { x: number; y: number; drawingId?: string }; onClose: () => void }) {
  const session = useStore((s) => s.session);
  const d = drawingsOf(session).find((x) => x.id === menu.drawingId);
  if (!d) return null;
  const isPos = d.type === 'long' || d.type === 'short';
  const tf = c.tf;
  const hiddenHere = !!d.hiddenTfs?.includes(tf);
  const item = (label: string, fn: () => void, hint?: string, disabled = false) => (
    <button
      className="menu-item"
      disabled={disabled}
      onClick={() => {
        fn();
        onClose();
      }}
    >
      {label} {hint && <span>{hint}</span>}
    </button>
  );
  return (
    <div className="menu context" style={{ left: menu.x, top: menu.y }} onMouseDown={(e) => e.stopPropagation()}>
      {item('Ayarlar…', () => useStore.setState({ editingId: d.id, selectedId: d.id }), 'çift tık')}
      {item('Kopyala', () => cloneDrawing(d.id, (t) => c.logicalToTime(c.timeToLogical(t) + 5)), undefined, isPos)}
      {item(d.locked ? 'Kilidi aç' : 'Kilitle', () => updateDrawing(d.id, { locked: !d.locked }))}
      {item(hiddenHere ? `${tf} zaman diliminde göster` : `${tf} zaman diliminde gizle`, () => updateDrawing(d.id, { hiddenTfs: hiddenHere ? (d.hiddenTfs ?? []).filter((x) => x !== tf) : [...(d.hiddenTfs ?? []), tf] }))}
      <div className="menu-sep" />
      {item('Öne getir', () => reorderDrawing(d.id, 'front'))}
      {item('Arkaya gönder', () => reorderDrawing(d.id, 'back'))}
      <div className="menu-sep" />
      {item('Sil', () => deleteDrawing(d.id), 'Delete')}
    </div>
  );
}
