import { useEffect, type ReactNode } from 'react';
import { Icons } from './icons';
import { useWindow } from '../../lib/useWindow';

export function Modal({ title, onClose, children, width = 420, bare = false, wkey = 'modal' }: { title: string; onClose: () => void; children: ReactNode; width?: number; bare?: boolean; wkey?: string }) {
  const win = useWindow(wkey);
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [onClose]);
  return (
    <div className={`modal-bg ${bare ? 'bare' : ''} ${win.min ? 'min' : ''}`} onMouseDown={onClose}>
      <div ref={win.winRef} className={`modal ${win.min ? 'min' : ''}`} style={{ width, ...win.style }} onMouseDown={(e) => e.stopPropagation()}>
        <div className="modal-head" {...win.headProps}>
          <b>{title}</b>
          <span className="tvd-head-btns">
            <button className="icon-btn" title={win.min ? 'Büyüt' : 'Küçült'} onClick={win.toggleMin}>
              {win.min ? '▢' : '–'}
            </button>
            <button className="icon-btn" onClick={onClose}>
              <Icons.close />
            </button>
          </span>
        </div>
        <div className="modal-body">{children}</div>
      </div>
    </div>
  );
}
