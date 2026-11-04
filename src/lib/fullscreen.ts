// Tarayıcı tam ekran (Fullscreen API). Reddedilirse (ör. kullanıcı hareketi yok) sessizce yok sayılır.

import { useEffect, useState } from 'react';

export const isFullscreen = () => !!document.fullscreenElement;

export async function toggleFullscreen() {
  try {
    if (document.fullscreenElement) await document.exitFullscreen();
    else await document.documentElement.requestFullscreen();
  } catch {
    /* tarayıcı reddetti */
  }
}

/** Tam ekran durumunu izler (F11 / Esc ile değişse de güncel kalır). */
export function useFullscreen(): boolean {
  const [on, setOn] = useState(isFullscreen());
  useEffect(() => {
    const h = () => setOn(isFullscreen());
    document.addEventListener('fullscreenchange', h);
    return () => document.removeEventListener('fullscreenchange', h);
  }, []);
  return on;
}
