import { useEffect, useRef, useState } from 'react';
import { DEFAULT_FIB, type Drawing } from '../../core/types';
import {
  BUILTIN_TEMPLATES, TEMPLATE_INFO, clearTemplate, deleteNamed, factoryReset, groupNamed, hasNamed, loadNamed, loadTemplate, namedTemplateOf, restoreBuiltins, saveNamed, saveTemplate, templateOf,
  type NamedTemplate,
} from '../../prefs/drawingTemplates';
import { hexToRgba } from '../../chart/drawUtil';
import { toast, useStore } from '../../store';
import { type Any, TITLES } from './dialogParts';

/**
 * Şablon (TradingView gibi): şablon listesi (hazır ICT şablonlarıyla başlar: P.Day High, Buy-side Liq, Bull OB, BISI, MSS…; hepsi
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
      <button className={inToolbar ? 'btn small' : 'tvd-btn'} disabled={inToolbar && d.locked} title="Şablon: kayıtlı stiller (P.Day High, P.Week Low, Bull OB, BISI, MSS…)" onClick={() => setOpen(!open)}>
        Şablon ▾
      </button>
      {open && (
        <div className={`tvd-menu ${inToolbar ? 'down' : ''}`}>
          {list.length > 0 && (
            <div className="tpl-list" role="menu">
              {groupNamed(list).map((g) => (
                <div key={g.group} className="tpl-group">
                  <div className="tpl-group-head">{g.group}</div>
                  {g.items.map((t) => (
                    <div
                      key={t.name}
                      role="menuitem"
                      tabIndex={0}
                      className="tpl-row"
                      title={`${t.name} uygula`}
                      onClick={run(() => set({ borderColor: undefined, ...t.style }))}
                      onKeyDown={(e) => e.key === 'Enter' && run(() => set({ borderColor: undefined, ...t.style }))()}
                    >
                      <TemplatePreview type={type} t={t} />
                      <span className="tpl-text">
                        <span className="tpl-name">{t.name}</span>
                        {TEMPLATE_INFO[t.name] && <span className="tpl-desc">{TEMPLATE_INFO[t.name].desc}</span>}
                      </span>
                      <button
                        className="tpl-del"
                        title="Şablonu sil"
                        aria-label={`${t.name} şablonunu sil`}
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

const DASH: Record<string, string | undefined> = { dashed: '4 3', dotted: '1.5 2.5' };

/** Şablonun ne çizdiğinin küçük önizlemesi: çizgi rengi / stili ya da bölge dolgusu + orta çizgi. */
function TemplatePreview({ type, t }: { type: string; t: NamedTemplate }) {
  const st = t.style as Record<string, unknown>;
  const color = (st.color as string) ?? '#2962ff';
  const dash = DASH[st.style as string];
  if (type === 'rect') {
    const fill = (st.fillColor as string) ?? color;
    const alpha = st.fillOn === false ? 0 : ((st.fillAlpha as number) ?? 0.15);
    return (
      <svg className="tpl-prev" viewBox="0 0 32 18" aria-hidden="true">
        <rect x="1.5" y="2.5" width="29" height="13" rx="1" fill={hexToRgba(fill, Math.max(alpha, 0.12))} stroke={st.borderOn === false ? 'none' : color} strokeDasharray={dash} />
        {Boolean(st.midline) && <line x1="2" x2="30" y1="9" y2="9" stroke={(st.midColor as string) ?? color} strokeDasharray="3 2" />}
      </svg>
    );
  }
  const w = Math.min(3, Math.max(1, Number(st.width) || 1));
  return (
    <svg className="tpl-prev" viewBox="0 0 32 18" aria-hidden="true">
      {type === 'trend' ? <line x1="3" y1="14" x2="29" y2="4" stroke={color} strokeWidth={w} strokeDasharray={dash} /> : <line x1="2" y1="9" x2="30" y2="9" stroke={color} strokeWidth={w} strokeDasharray={dash} />}
    </svg>
  );
}
