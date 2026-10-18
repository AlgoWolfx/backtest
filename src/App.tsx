import { useEffect, useState } from 'react';
import { chartRef } from './chartRef';
import { TIMEFRAMES, type TF } from './core/timeframes';
import type { Tool } from './core/types';
import { BottomBar, LeftToolbar, TopBar } from './components/Bars';
import { ChartArea } from './components/ChartView';
import { ChartSettings, DrawingEditor, JumpDialog, Toast } from './components/Dialogs';
import { SessionScreen } from './components/SessionScreen';
import { TradePanel } from './components/TradePanel';
import { PerformancePage } from './components/PerformancePage';
import { cancelTicket, copySelected, deleteDrawing, forwardToBarClose, init, pasteClipboard, redo, setTf, stepBack, stepForward, toast, togglePlay, undo, useStore } from './store';

const TOOL_KEYS: Record<string, Tool> = { KeyT: 'trend', KeyH: 'hline', KeyR: 'rect', KeyF: 'fib', KeyL: 'long', KeyS: 'short', KeyM: 'measure' };

/** TradingView gibi yazılan zaman dilimi: "15" -> 15m, "60" -> 1H, "4h" -> 4H, "D" -> 1D ... */
export function parseTfInput(s: string): TF | null {
  const v = s.trim();
  if (/^\d+$/.test(v)) {
    const map: Record<string, TF> = { '1': '1m', '2': '2m', '3': '3m', '5': '5m', '15': '15m', '30': '30m', '60': '1h', '240': '4h' };
    return map[v] ?? null;
  }
  const m = v.match(/^(\d*)([a-zA-Z])$/);
  if (!m) return null;
  const n = m[1] || '1';
  const u = m[2];
  const id = u === 'M' ? `${n}M` : u.toLowerCase() === 'h' ? `${n}h` : u.toLowerCase() === 'd' ? `${n}D` : u.toLowerCase() === 'w' ? `${n}W` : `${n}m`;
  return TIMEFRAMES.some((t) => t.id === id) ? (id as TF) : null;
}

export function App() {
  const hasSession = useStore((s) => !!s.session);
  const panelOpen = useStore((s) => s.panelOpen);
  const error = useStore((s) => s.error);
  const [tfBuf, setTfBuf] = useState('');

  useEffect(() => {
    init();
  }, []);

  useEffect(() => {
    let buf = '';
    let timer: ReturnType<typeof setTimeout> | null = null;
    const setBuf = (v: string) => {
      buf = v;
      setTfBuf(v);
      if (timer) clearTimeout(timer);
      if (v) timer = setTimeout(() => setBuf(''), 3000);
    };
    const shift = (t: number) => {
      const c = chartRef.current;
      return c ? c.logicalToTime(c.timeToLogical(t) + 5) : t;
    };

    const onKey = (e: KeyboardEvent) => {
      const st = useStore.getState();
      if (!st.session || st.editingId || st.jumpOpen || st.perfOpen || st.chartSettingsOpen) return;
      const el = e.target as HTMLElement;
      if (el.tagName === 'INPUT' || el.tagName === 'SELECT' || el.tagName === 'TEXTAREA') return;
      const ctrl = e.ctrlKey || e.metaKey;

      if (ctrl) {
        const k = e.key.toLowerCase();
        if (k === 'z' && !e.shiftKey) undo();
        else if (k === 'y' || (k === 'z' && e.shiftKey)) redo();
        else if (k === 'c') {
          if (!copySelected()) return;
        } else if (k === 'v') pasteClipboard(shift);
        else return;
        e.preventDefault();
        return;
      }
      if (e.altKey && TOOL_KEYS[e.code]) {
        e.preventDefault();
        useStore.setState({ tool: TOOL_KEYS[e.code], selectedId: null });
        return;
      }
      if (e.altKey) return;

      // Zaman dilimi yazma: rakam veya h/d/w/m harfleri, Enter ile uygula
      if (/^[0-9]$/.test(e.key) || (/^[hdwmHDWM]$/.test(e.key) && (buf === '' || /^\d+$/.test(buf)))) {
        setBuf(buf + e.key);
        return;
      }
      if (buf) {
        if (e.key === 'Enter') {
          const tf = parseTfInput(buf);
          if (tf) setTf(tf);
          else toast(`"${buf}" desteklenen bir zaman dilimi değil (1, 2, 3, 5, 15, 30, 60/1h, 240/4h, D, W, M).`, 'error');
          setBuf('');
          e.preventDefault();
          return;
        }
        if (e.key === 'Escape') return setBuf('');
        if (e.key === 'Backspace') return setBuf(buf.slice(0, -1));
      }

      switch (e.key) {
        case ' ':
          e.preventDefault();
          togglePlay();
          break;
        case 'ArrowRight':
          e.preventDefault();
          if (e.shiftKey) forwardToBarClose();
          else stepForward();
          break;
        case 'ArrowLeft':
          e.preventDefault();
          stepBack();
          break;
        case 'Delete':
        case 'Backspace':
          if (st.selectedId) deleteDrawing(st.selectedId);
          break;
        case 'Escape': {
          const layer = chartRef.current?.layer;
          if (st.ticket) cancelTicket();
          else if (st.pickingStart) useStore.setState({ pickingStart: false });
          else if (!layer?.cancelCreate() && !layer?.clearMeasure()) useStore.setState({ tool: 'cursor', selectedId: null });
          break;
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  if (error) return <div className="fatal">{error}</div>;
  if (!hasSession) return <SessionScreen />;

  const preview = tfBuf ? parseTfInput(tfBuf) : null;
  return (
    <div className={`app ${panelOpen ? 'with-panel' : ''}`}>
      <TopBar />
      <LeftToolbar />
      <ChartArea />
      {panelOpen && <TradePanel />}
      <BottomBar />
      <DrawingEditor />
      <JumpDialog />
      <ChartSettings />
      <PerformancePage />
      <Toast />
      {tfBuf && (
        <div className="tf-typing">
          {tfBuf}
          <span>{preview ? `Enter → ${TIMEFRAMES.find((t) => t.id === preview)!.label}` : 'geçersiz zaman dilimi'}</span>
        </div>
      )}
    </div>
  );
}
