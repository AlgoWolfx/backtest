import { useEffect, useRef, useState } from 'react';
import { type Tool } from '../../core/types';
import { clearDrawings, drawingsOf, setAllLocked, useStore } from '../../store';
import { Icons } from '../common/icons';
import { FAV_CANDIDATES, setFavBarVisible, toggleFavTool, useFavBar } from '../../prefs/favTools';

const TOOLS: { id: Tool; label: string; key: string; icon: () => React.JSX.Element }[] = [
  { id: 'cursor', label: 'İmleç', key: 'Esc', icon: Icons.cursor },
  { id: 'trend', label: 'Trend çizgisi', key: 'Alt+T', icon: Icons.trend },
  { id: 'ray', label: 'Işın (sağa uzayan çizgi)', key: 'Alt+Y', icon: Icons.ray },
  { id: 'hline', label: 'Yatay ışın', key: 'Alt+H', icon: Icons.hline },
  { id: 'vline', label: 'Dikey çizgi', key: 'Alt+V', icon: Icons.vline },
  { id: 'text', label: 'Metin notu', key: 'Alt+X', icon: Icons.text },
  { id: 'rect', label: 'Dikdörtgen (FVG / OB)', key: 'Alt+R', icon: Icons.rect },
  { id: 'fib', label: 'Fibonacci düzeltme', key: 'Alt+F', icon: Icons.fib },
  { id: 'long', label: 'Long pozisyon', key: 'Alt+L', icon: Icons.long },
  { id: 'short', label: 'Short pozisyon', key: 'Alt+S', icon: Icons.short },
  { id: 'measure', label: 'Ölçüm (fiyat / mum / süre)', key: 'Shift+sürükle', icon: Icons.ruler },
];

/** Sol çubuk grupları (TradingView gibi): tıkla = grubun son aracını seç, küçük ok = grubu aç, seçtiğin araç grubun simgesi olur. */
const TOOL_GROUPS: { id: string; label: string; tools: Tool[] }[] = [
  { id: 'cursor', label: 'İmleç', tools: ['cursor'] },
  { id: 'lines', label: 'Çizgiler', tools: ['trend', 'ray', 'hline', 'vline'] },
  { id: 'shapes', label: 'Fibonacci ve şekiller', tools: ['fib', 'rect'] },
  { id: 'text', label: 'Metin', tools: ['text'] },
  { id: 'positions', label: 'Pozisyon', tools: ['long', 'short'] },
  { id: 'measure', label: 'Ölçüm', tools: ['measure'] },
];

const LAST_KEY = 'backtest.toolGroupLast';

const toolDef = (id: Tool) => TOOLS.find((t) => t.id === id)!;

function loadLast(): Record<string, Tool> {
  try {
    const o = JSON.parse(localStorage.getItem(LAST_KEY) ?? '{}') as Record<string, Tool>;
    const out: Record<string, Tool> = {};
    for (const g of TOOL_GROUPS) out[g.id] = g.tools.includes(o[g.id]) ? o[g.id] : g.tools[0];
    return out;
  } catch {
    return Object.fromEntries(TOOL_GROUPS.map((g) => [g.id, g.tools[0]]));
  }
}

function ToolGroups() {
  const tool = useStore((s) => s.tool);
  const [last, setLast] = useState<Record<string, Tool>>(loadLast);
  const [openId, setOpenId] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const { favs } = useFavBar();

  // Araç kısayolla (Alt+T vb.) değişse de grubun simgesi o araca döner.
  useEffect(() => {
    const g = TOOL_GROUPS.find((x) => x.tools.includes(tool));
    if (!g || last[g.id] === tool) return;
    const next = { ...last, [g.id]: tool };
    setLast(next);
    try {
      localStorage.setItem(LAST_KEY, JSON.stringify(next));
    } catch {
      /* kaydedilemedi */
    }
  }, [tool, last]);

  useEffect(() => {
    if (!openId) return;
    const down = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpenId(null);
    const key = (e: KeyboardEvent) => e.key === 'Escape' && setOpenId(null);
    window.addEventListener('mousedown', down);
    window.addEventListener('keydown', key);
    return () => {
      window.removeEventListener('mousedown', down);
      window.removeEventListener('keydown', key);
    };
  }, [openId]);

  const choose = (id: Tool) => {
    useStore.setState({ tool: id, selectedId: null });
    setOpenId(null);
  };

  return (
    <div ref={ref} className="tool-groups">
      {TOOL_GROUPS.map((g) => {
        const shown = toolDef(g.tools.includes(tool) ? tool : last[g.id]);
        const multi = g.tools.length > 1;
        return (
          <div key={g.id} className={`tool-group ${openId === g.id ? 'open' : ''}`}>
            <button className={`tool ${g.tools.includes(tool) ? 'on' : ''}`} title={`${shown.label} (${shown.key})`} onClick={() => choose(shown.id)} onContextMenu={(e) => multi && (e.preventDefault(), setOpenId(g.id))}>
              <shown.icon />
            </button>
            {multi && (
              <button className="tool-arrow" title={`${g.label}: araçları göster`} onClick={() => setOpenId(openId === g.id ? null : g.id)}>
                ›
              </button>
            )}
            {multi && openId === g.id && (
              <div className="tool-fly">
                <h6>{g.label}</h6>
                {g.tools.map((id) => {
                  const t = toolDef(id);
                  return (
                    <div key={id} className={`tool-fly-item ${tool === id ? 'on' : ''}`} onClick={() => choose(id)}>
                      <t.icon />
                      <span>{t.label}</span>
                      <kbd>{t.key}</kbd>
                      {FAV_CANDIDATES.includes(id) && (
                        <button
                          className={`tool-fly-star ${favs.includes(id) ? 'on' : ''}`}
                          title={favs.includes(id) ? 'Favorilerden çıkar' : 'Favorilere ekle (grafik üstündeki çubukta görünür)'}
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleFavTool(id);
                          }}
                        >
                          {favs.includes(id) ? '★' : '☆'}
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

/** Grafik üstündeki favori araç çubuğunu aç / kapat. */
function FavBarToggle() {
  const { visible, favs } = useFavBar();
  return (
    <button className={`tool ${visible && favs.length ? 'on' : ''}`} title={visible ? 'Favori araç çubuğunu gizle' : favs.length ? 'Favori araç çubuğunu göster' : 'Favori yok: araç listesinden ☆ ile ekle'} onClick={() => setFavBarVisible(!visible)}>
      <span style={{ fontSize: 17, lineHeight: 1 }}>{visible && favs.length ? '★' : '☆'}</span>
    </button>
  );
}

export function LeftToolbar() {
  const magnet = useStore((s) => s.magnet);
  const magnetMode = useStore((s) => s.magnetMode);
  const stayInDraw = useStore((s) => s.stayInDraw);
  const hide = useStore((s) => s.hideDrawings);
  const allLocked = useStore((s) => {
    const list = drawingsOf(s.session);
    return list.length > 0 && list.every((d) => d.locked);
  });
  // Mıknatıs: kapalı -> zayıf -> güçlü -> kapalı (TradingView "Zayıf / Güçlü mıknatıs")
  const cycleMagnet = () => {
    if (!magnet) useStore.setState({ magnet: true, magnetMode: 'weak' });
    else if (magnetMode === 'weak') useStore.setState({ magnetMode: 'strong' });
    else useStore.setState({ magnet: false });
  };
  return (
    <nav className="lefttools">
      <ToolGroups />
      <FavBarToggle />
      <div className="tool-sep" />
      <button
        className={`tool ${magnet ? 'on' : ''}`}
        title={`Mıknatıs: ${!magnet ? 'kapalı' : magnetMode === 'weak' ? 'zayıf (yakındaki OHLC noktalarına)' : 'güçlü (her zaman en yakın OHLC noktasına)'} — tıklayınca değişir`}
        onClick={cycleMagnet}
      >
        <Icons.magnet />
        {magnet && <span className="tool-badge">{magnetMode === 'weak' ? 'Z' : 'G'}</span>}
      </button>
      <button className={`tool ${stayInDraw ? 'on' : ''}`} title="Çizim modunda kal: çizim bitince araç seçili kalır" onClick={() => useStore.setState({ stayInDraw: !stayInDraw })}>
        <Icons.stay />
      </button>
      <button className={`tool ${allLocked ? 'on' : ''}`} title={allLocked ? 'Tüm çizimlerin kilidini aç' : 'Tüm çizimleri kilitle'} onClick={() => setAllLocked(!allLocked)}>
        {allLocked ? <Icons.lock /> : <Icons.unlock />}
      </button>
      <button className={`tool ${hide ? 'on' : ''}`} title="Çizimleri gizle / göster" onClick={() => useStore.setState({ hideDrawings: !hide })}>
        {hide ? <Icons.eyeOff /> : <Icons.eye />}
      </button>
      <button
        className="tool"
        title="Bu sembolün tüm çizimlerini sil (aktif işlemlere bağlı olanlar hariç)"
        onClick={() => {
          if (confirmDelete()) clearDrawings();
        }}
      >
        <Icons.trash />
      </button>
    </nav>
  );
}

function confirmDelete() {
  return window.confirm('Bu sembolün tüm çizimleri silinsin mi?');
}
