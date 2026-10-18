// Favori araç çubuğu (TradingView "Grafik üstünde favori çizim araçları"): sol çubukta yıldızlanan araçlar grafiğin
// üstünde taşınabilir bir çubukta toplanır. Favoriler, konum ve görünürlük tarayıcıda saklanır.

import { useEffect, useState } from 'react';
import type { Tool } from './core/types';

/** Favoriye eklenebilen araçlar (imleç hariç). */
export const FAV_CANDIDATES: Tool[] = ['trend', 'hline', 'rect', 'fib', 'long', 'short', 'measure'];
/** İlk açılışta çubukta görünenler. */
export const DEFAULT_FAVS: Tool[] = ['trend', 'hline', 'rect', 'fib', 'long', 'short'];

export interface FavBarPos {
  /** Çubuğun, grafik alanının sol üst köşesine göre konumu (px); null = üstte ortalı */
  x: number;
  y: number;
}

/** Kayıtlı favori listesini çözer: yok / bozuksa varsayılan; geçersiz ve tekrarlı araçlar atılır; boş liste geçerlidir. */
export function parseFavs(raw: string | null): Tool[] {
  if (raw == null) return DEFAULT_FAVS;
  try {
    const v = JSON.parse(raw);
    if (!Array.isArray(v)) return DEFAULT_FAVS;
    const seen = new Set<Tool>();
    for (const t of v) if (FAV_CANDIDATES.includes(t)) seen.add(t);
    // Sıra sabit: çubukta her zaman aday sırasıyla görünür
    return FAV_CANDIDATES.filter((t) => seen.has(t));
  } catch {
    return DEFAULT_FAVS;
  }
}

export function parsePos(raw: string | null): FavBarPos | null {
  try {
    const v = JSON.parse(raw ?? 'null') as Partial<FavBarPos> | null;
    return v && Number.isFinite(v.x) && Number.isFinite(v.y) ? { x: v.x!, y: v.y! } : null;
  } catch {
    return null;
  }
}

/** Çubuğu kapsayıcıya sığdırır (kısmen dışarıda kalamaz). */
export function clampPos(p: FavBarPos, box: { w: number; h: number }, size: { w: number; h: number }): FavBarPos {
  return { x: Math.min(Math.max(0, box.w - size.w), Math.max(0, p.x)), y: Math.min(Math.max(0, box.h - size.h), Math.max(0, p.y)) };
}

const K_FAVS = 'backtest.favTools';
const K_POS = 'backtest.favToolsPos';
const K_VIS = 'backtest.favToolsVisible';

const read = (k: string) => {
  try {
    return localStorage.getItem(k);
  } catch {
    return null;
  }
};
const write = (k: string, v: string) => {
  try {
    localStorage.setItem(k, v);
  } catch {
    /* kaydedilemedi */
  }
};

let favs: Tool[] = parseFavs(read(K_FAVS));
let pos: FavBarPos | null = parsePos(read(K_POS));
let visible = read(K_VIS) !== '0';
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((f) => f());

export function toggleFavTool(id: Tool) {
  if (!FAV_CANDIDATES.includes(id)) return;
  const has = favs.includes(id);
  favs = FAV_CANDIDATES.filter((t) => (t === id ? !has : favs.includes(t)));
  write(K_FAVS, JSON.stringify(favs));
  // İlk favori eklenince çubuk görünür olsun
  if (!has && !visible) setFavBarVisible(true);
  else emit();
}

export function setFavBarVisible(v: boolean) {
  visible = v;
  write(K_VIS, v ? '1' : '0');
  emit();
}

export function setFavBarPos(p: FavBarPos | null) {
  pos = p;
  write(K_POS, JSON.stringify(p));
  emit();
}

export function useFavBar() {
  const [, force] = useState(0);
  useEffect(() => {
    const f = () => force((n) => n + 1);
    listeners.add(f);
    return () => {
      listeners.delete(f);
    };
  }, []);
  return { favs, pos, visible };
}
