import { useEffect, type ReactNode } from 'react';
import { Icons } from './icons';
import { useWindow } from '../../lib/useWindow';

/**
 * TradingView diyaloğu: ekranın ortasında açılır, başlıktan sürüklenir, boyutu değiştirilemez, küçültülemez.
 * Arka plan karartılmaz ama tıklamaları tutar (pencere dışına tıklamak kapatmaz). Esc ve × = onClose (iptal).
 * Başlık 68 px; alt çubuk (footer) verilirse 16/20 px boşluklu ayrı şerittir.
 */
export function Modal({
  title,
  onClose,
  children,
  width = 420,
  height,
  wkey = 'modal',
  footer,
  bodyClass = '',
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  width?: number;
  height?: number;
  wkey?: string;
  footer?: ReactNode;
  bodyClass?: string;
}) {
  const win = useWindow(wkey, true);
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [onClose]);
  return (
    <div className="modal-bg" onMouseDown={(e) => e.stopPropagation()}>
      <div ref={win.winRef} role="dialog" aria-label={title} className="modal" style={{ width, height, ...win.style }}>
        <div className="modal-head" {...win.headProps}>
          <b>{title}</b>
          <button className="modal-x" aria-label="Kapat" title="Kapat" onClick={onClose}>
            <Icons.close />
          </button>
        </div>
        <div className={`modal-body ${bodyClass}`}>{children}</div>
        {footer && <div className="tvd-foot">{footer}</div>}
      </div>
    </div>
  );
}
