import { useEffect, useRef, useState } from 'react';
import { DEFAULT_FIB, type Drawing } from '../../core/types';
import {
  BUILTIN_TEMPLATES, clearTemplate, deleteNamed, factoryReset, hasNamed, loadNamed, loadTemplate, namedTemplateOf, restoreBuiltins, saveNamed, saveTemplate, templateOf,
} from '../../prefs/drawingTemplates';
import { toast, useStore } from '../../store';
import { type Any, TITLES } from './dialogParts';

/**
 * Şablon (TradingView gibi): şablon listesi (hazır ICT şablonlarıyla başlar: PDH, BSL, +OB, BISI, MSS…; hepsi
 * değiştirilebilir), şablonu farklı kaydet (aynı ad = üzerine yaz), sil, varsayılan olarak kaydet / uygula / fabrika ayarları.
 * Bir şablonu değiştirmek: uygula → ayarlardan rengi / stili / metni değiştir → aynı adla "farklı kaydet".
 * inToolbar: grafiğin üstündeki çubukta, menü aşağı açılır.
 */
export function TemplateMenu({ d, set, inToolbar }: { d: Drawing; set: (p: Any) => void; inToolbar?: boolean }) {
  const [open, setOpen] = useState(false);
  const [, refresh] = useState(0);
  const ref = useRef<HTMLDivElement>(null);
  const type = d.type as keyof typeof TITLES;
  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    window.addEventListener('mousedown', h, true); // yakalama aşaması: pencere mousedown olayını durdurduğu için
    return () => window.removeEventListener('mousedown', h, true);
  }, [open]);
  const run = (fn: () => void) => () => {
    fn();
    setOpen(false);
  };
  const item = (label: string, fn: () => void) => (
    <button className="tvd-menuitem" onClick={run(fn)}>
      {label}
    </button>
  );
  const list = open ? loadNamed(type) : [];
  const hasBuiltins = (BUILTIN_TEMPLATES[type]?.length ?? 0) > 0;
  return (
    <div className="tvd-tpl" ref={ref}>
      <button className={inToolbar ? 'btn small' : 'tvd-btn'} disabled={inToolbar && d.locked} title="Şablon: kayıtlı stiller (PDH, BSL, +OB, BISI, MSS…)" onClick={() => setOpen(!open)}>
        Şablon ▾
      </button>
      {open && (
        <div className={`tvd-menu ${inToolbar ? 'down' : ''}`}>
          {list.length > 0 && (
            <div className="tvd-chips">
              {list.map((t) => (
                <div key={t.name} className="tvd-chip" title={`${t.name} uygula`} style={{ color: (t.style.textColor ?? t.style.color) as string }} onClick={run(() => set({ borderColor: undefined, ...t.style }))}>
                  <span>{t.name}</span>
                  <button
                    className="tvd-chipdel"
                    title="Şablonu sil"
                    onClick={(e) => {
                      e.stopPropagation();
                      deleteNamed(type, t.name);
                      refresh((n) => n + 1);
                    }}
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          )}
          {list.length > 0 && <div className="tvd-menusep" />}
          {item('Şablonu farklı kaydet…', () => {
            const name = window.prompt('Şablon adı (aynı ad yazılırsa o şablon güncellenir):', (d as { text?: string }).text ?? '')?.trim();
            if (!name) return;
            if (hasNamed(type, name) && !window.confirm(`"${name}" şablonu zaten var. Üzerine yazılsın mı?`)) return;
            saveNamed(type, name, namedTemplateOf(d));
            toast(`"${name}" şablonu kaydedildi.`);
          })}
          {item('Varsayılan olarak kaydet', () => {
            saveTemplate(type, templateOf(d));
            toast(`${TITLES[type]} stili varsayılan olarak kaydedildi (yeni çizimler bununla başlar).`);
          })}
          {item('Varsayılanı uygula', () => set({ ...loadTemplate(type) }))}
          {item('Fabrika ayarlarına dön', () => {
            clearTemplate(type);
            set(factoryReset(type, useStore.getState().session?.fibDefaults ?? DEFAULT_FIB));
          })}
          {hasBuiltins &&
            item('Hazır şablonları geri yükle', () => {
              restoreBuiltins(type);
              toast('Hazır şablonlar ilk hâline döndü (senin eklediklerin duruyor).');
            })}
        </div>
      )}
    </div>
  );
}
