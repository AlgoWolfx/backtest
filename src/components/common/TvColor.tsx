import { useEffect, useRef, useState } from 'react';
import { hexToRgba } from '../../chart/drawUtil';

/** TradingView benzeri palet: gri tonlar + 8 renk x 5 ton. */
const PALETTE: string[][] = [
  ['#ffffff', '#d1d4dc', '#b2b5be', '#9598a1', '#787b86', '#5d606b', '#434651', '#2a2e39', '#131722', '#000000'],
  ['#fccbcd', '#ffe0b2', '#fff9c4', '#c8e6c9', '#b2dfdb', '#b2ebf2', '#bbd6fb', '#d1c4e9', '#e1bee7', '#f8bbd0'],
  ['#faa1a4', '#ffcc80', '#fff59d', '#a5d6a7', '#80cbc4', '#80deea', '#90bff9', '#b39ddb', '#ce93d8', '#f48fb1'],
  ['#f77c80', '#ffb74d', '#fff176', '#81c784', '#4db6ac', '#4dd0e1', '#5b9cf6', '#9575cd', '#ba68c8', '#f06292'],
  ['#f23645', '#ff9800', '#ffeb3b', '#4caf50', '#089981', '#00bcd4', '#2962ff', '#673ab7', '#9c27b0', '#e91e63'],
  ['#b22833', '#e65100', '#f9a825', '#2e7d32', '#056656', '#00838f', '#1848cc', '#311b92', '#6a1b9a', '#880e4f'],
];

/** Renk kutusu + palet / özel renk / opaklık penceresi (TradingView renk seçicisi). */
export function TvColor({ color, alpha = 1, onChange, withAlpha = true }: { color: string; alpha?: number; onChange: (color: string, alpha: number) => void; withAlpha?: boolean }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    window.addEventListener('mousedown', h, true); // yakalama aşaması: pencere mousedown olayını durdurduğu için
    return () => window.removeEventListener('mousedown', h, true);
  }, [open]);
  const hex = /^#[0-9a-fA-F]{6}$/.test(color) ? color : '#2962ff';
  return (
    <div className="tvc" ref={ref}>
      <button className="tvc-box" title="Renk" onClick={() => setOpen(!open)}>
        <span className="tvc-fill" style={{ background: hexToRgba(hex, alpha) }} />
      </button>
      {open && (
        <div className="tvc-pop">
          {PALETTE.map((row, i) => (
            <div className="tvc-row" key={i}>
              {row.map((c) => (
                <button key={c} className={`tvc-sw ${c.toLowerCase() === hex.toLowerCase() ? 'on' : ''}`} style={{ background: c }} onClick={() => onChange(c, alpha)} />
              ))}
            </div>
          ))}
          <div className="tvc-custom">
            <label>
              Özel
              <input type="color" value={hex} onChange={(e) => onChange(e.target.value, alpha)} />
            </label>
            {withAlpha && (
              <label className="tvc-alpha">
                Opaklık
                <input type="range" min={0} max={100} value={Math.round(alpha * 100)} onChange={(e) => onChange(hex, Number(e.target.value) / 100)} />
                <span>{Math.round(alpha * 100)}%</span>
              </label>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
