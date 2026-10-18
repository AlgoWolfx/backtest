// TradingView tarzı düzen seçici: ekran sayısına göre gruplanmış düzen simgeleri, yıldızlı favoriler (üst çubukta kısayol
// olarak görünür) ve "Yerleşimde senkronize et" anahtarları (sembol, aralık, artı işareti, zaman, tarih aralığı).

import { useEffect, useMemo, useRef, useState } from 'react';
import { LAYOUT_IDS, LAYOUTS, isLayoutId, layoutGeometry, type LayoutId } from '../../core/layouts';
import type { Session, SyncCfg } from '../../core/types';
import { setLayout, setSync, syncOf, useStore } from '../../store';

const FAV_KEY = 'backtest.layoutFavs';

function loadFavs(): LayoutId[] {
  try {
    const v = JSON.parse(localStorage.getItem(FAV_KEY) ?? '[]');
    return Array.isArray(v) ? v.filter(isLayoutId) : [];
  } catch {
    return [];
  }
}

/** Favoriler tarayıcıda saklanır; birden çok bileşen aynı listeyi görsün diye küçük bir abonelik. */
const favListeners = new Set<() => void>();
let favs: LayoutId[] = loadFavs();
function toggleFav(id: LayoutId) {
  favs = favs.includes(id) ? favs.filter((x) => x !== id) : [...favs, id];
  try {
    localStorage.setItem(FAV_KEY, JSON.stringify(favs));
  } catch {
    /* kaydedilemedi */
  }
  favListeners.forEach((f) => f());
}
function useFavs(): LayoutId[] {
  const [, force] = useState(0);
  useEffect(() => {
    const f = () => force((n) => n + 1);
    favListeners.add(f);
    return () => {
      favListeners.delete(f);
    };
  }, []);
  return favs;
}

/** Düzenin küçük çizimi: her ekran bir dikdörtgen. */
export function LayoutIcon({ id, size = 22 }: { id: LayoutId; size?: number }) {
  const { panes } = layoutGeometry(id);
  const W = 24;
  const H = 18;
  return (
    <svg width={size * (W / H) * 0.82} height={size * 0.82} viewBox={`0 0 ${W} ${H}`} fill="none" stroke="currentColor" strokeWidth="1.2" aria-hidden>
      {panes.map((r, i) => (
        <rect key={i} x={r.x * W + 0.9} y={r.y * H + 0.9} width={Math.max(1, r.w * W - 1.8)} height={Math.max(1, r.h * H - 1.8)} rx="1" />
      ))}
    </svg>
  );
}

const SYNCS: { key: keyof SyncCfg; label: string; hint: string }[] = [
  { key: 'symbol', label: 'Sembol', hint: 'Bir ekranda sembol değişince hepsi değişir' },
  { key: 'tf', label: 'Aralık', hint: 'Bir ekranda zaman dilimi değişince hepsi değişir' },
  { key: 'crosshair', label: 'Artı işareti', hint: 'İmleç aynı zamanı diğer ekranlarda da gösterir' },
  { key: 'time', label: 'Zaman', hint: 'Bir grafiği kaydırınca diğerlerinin sağ kenarı aynı zamana gelir (yakınlaştırmaları ayrı kalır)' },
  { key: 'range', label: 'Tarih aralığı', hint: 'Görünen tarih aralığı (kaydırma + yakınlaştırma) tüm ekranlarda aynı olur' },
];

export function LayoutMenu() {
  const layout = useStore((s) => s.session?.layout ?? '1') as LayoutId;
  // Seçici kararlı bir referans döndürmeli (yeni nesne üretmek zustand'da sonsuz yeniden çizime yol açar)
  const stored = useStore((s) => s.session?.sync);
  const sync = useMemo(() => syncOf({ sync: stored } as Session), [stored]);
  const favorites = useFavs();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const down = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    const key = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    window.addEventListener('mousedown', down);
    window.addEventListener('keydown', key);
    return () => {
      window.removeEventListener('mousedown', down);
      window.removeEventListener('keydown', key);
    };
  }, [open]);

  const counts = [...new Set(LAYOUT_IDS.map((id) => LAYOUTS[id].count))];
  const pick = (id: LayoutId) => {
    setLayout(id);
    setOpen(false);
  };
  const cell = (id: LayoutId) => (
    <span key={id} className={`lm-cell ${layout === id ? 'on' : ''}`}>
      <button className="lm-pick" title={LAYOUTS[id].label} onClick={() => pick(id)}>
        <LayoutIcon id={id} />
      </button>
      <button className={`lm-star ${favorites.includes(id) ? 'on' : ''}`} title={favorites.includes(id) ? 'Favorilerden çıkar' : 'Favorilere ekle (üst çubukta kısayol olur)'} onClick={() => toggleFav(id)}>
        {favorites.includes(id) ? '★' : '☆'}
      </button>
    </span>
  );

  return (
    <div className="lm" ref={ref}>
      {favorites.map((id) => (
        <button key={id} className={`lm-fav ${layout === id ? 'on' : ''}`} title={`${LAYOUTS[id].label} (favori)`} onClick={() => pick(id)}>
          <LayoutIcon id={id} size={18} />
        </button>
      ))}
      <button className={`btn ghost lm-btn ${open ? 'on' : ''}`} title="Ekran düzeni (çoklu grafik). Bir grafiğe tıklayınca aktif olur; üst çubuk aktif grafiği değiştirir." onClick={() => setOpen(!open)}>
        <LayoutIcon id={layout} size={18} /> <span className="caret">▾</span>
      </button>
      {open && (
        <div className="lm-pop">
          {favorites.length > 0 && (
            <div className="lm-row">
              <span className="lm-n">★</span>
              <div className="lm-cells">{favorites.map(cell)}</div>
            </div>
          )}
          {counts.map((n) => (
            <div className="lm-row" key={n}>
              <span className="lm-n">{n}</span>
              <div className="lm-cells">{LAYOUT_IDS.filter((id) => LAYOUTS[id].count === n).map(cell)}</div>
            </div>
          ))}
          <div className="lm-sync">
            <h5>Yerleşimde senkronize et</h5>
            {SYNCS.map((s) => (
              <label key={s.key} className="lm-toggle" title={s.hint}>
                <span>{s.label}</span>
                <input type="checkbox" checked={sync[s.key]} onChange={(e) => setSync({ [s.key]: e.target.checked })} />
                <i />
              </label>
            ))}
            <p className="hint">Tek ekranda senkronun etkisi yoktur. Ekranları ayıran çizgileri sürükleyerek boyutlandır; çift tıkla sıfırla.</p>
          </div>
        </div>
      )}
    </div>
  );
}
