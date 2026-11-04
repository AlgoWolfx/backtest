import { useEffect, useRef, useState } from 'react';
import { DEFAULT_FIB, type Drawing } from '../../core/types';
import { clearTemplate, factoryReset, loadTemplate, saveTemplate, templateOf } from '../../prefs/drawingTemplates';
import { toast, useStore } from '../../store';
import { type Any, TITLES } from './dialogParts';

/** Şablon: bu çizim türü için stilleri varsayılan olarak kaydet / uygula / fabrika ayarlarına dön. */
export function TemplateMenu({ d, set }: { d: Drawing; set: (p: Any) => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const type = d.type as keyof typeof TITLES;
  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    window.addEventListener('mousedown', h, true); // yakalama aşaması: pencere mousedown olayını durdurduğu için
    return () => window.removeEventListener('mousedown', h, true);
  }, [open]);
  const item = (label: string, fn: () => void) => (
    <button
      className="tvd-menuitem"
      onClick={() => {
        fn();
        setOpen(false);
      }}
    >
      {label}
    </button>
  );
  return (
    <div className="tvd-tpl" ref={ref}>
      <button className="tvd-btn" onClick={() => setOpen(!open)}>
        Şablon ▾
      </button>
      {open && (
        <div className="tvd-menu">
          {item('Varsayılan olarak kaydet', () => {
            saveTemplate(type, templateOf(d));
            toast(`${TITLES[type]} stili varsayılan olarak kaydedildi (yeni çizimler bununla başlar).`);
          })}
          {item('Varsayılanı uygula', () => set({ ...loadTemplate(type) }))}
          {item('Fabrika ayarlarına dön', () => {
            clearTemplate(type);
            set(factoryReset(type, useStore.getState().session?.fibDefaults ?? DEFAULT_FIB));
          })}
        </div>
      )}
    </div>
  );
}
