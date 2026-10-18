import { drawingsOf, useStore } from '../../store';
import { DrawingDialog } from './DrawingDialog';

export function DrawingEditor() {
  const session = useStore((s) => s.session);
  const editingId = useStore((s) => s.editingId);
  const d = drawingsOf(session).find((x) => x.id === editingId);
  if (!d || !session) return null;
  // Tüm araçlar için TradingView tarzı sekmeli pencere (Stil / Metin / Girdiler / Kordinatlar / Görünürlük)
  return <DrawingDialog key={d.id} d={d} />;
}
