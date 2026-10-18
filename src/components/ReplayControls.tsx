import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { DEFAULT_SESSION_SETTINGS as DEFAULT_SS, nextBoundary, sessionBoundaries } from '../core/sessions';
import { NY_PRESETS } from '../core/replay';
import { TIMEFRAMES, tfInfo, type TF } from '../core/timeframes';
import { fmtNy, nyOffsetLabel } from '../format';
import { forwardToBarClose, forwardToNextSessionBoundary, forwardToNyTime, setSpeed, setStepTf, stepBack, stepForward, stopPlay, togglePlay, useStore } from '../store';
import { Icons } from './icons';

const SPEEDS = [0.5, 1, 2, 4, 8, 16, 32];
const STEP_TFS: TF[] = ['1m', '2m', '3m', '5m', '15m', '30m', '1h', '4h', '1D'];

/** Basılı tutulunca tekrar eden buton (TradingView / FX Replay ileri-geri gibi). */
function HoldButton({ onStep, title, children, className = 'icon-btn' }: { onStep: () => void; title: string; children: ReactNode; className?: string }) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const stop = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  };
  const start = () => {
    stopPlay();
    onStep();
    // İlk tekrar 300 ms sonra, sonra 110 ms'den 40 ms'ye hızlanarak.
    const repeat = (delay: number, first: boolean) => {
      timer.current = setTimeout(() => {
        onStep();
        repeat(first ? 110 : Math.max(40, delay * 0.9), false);
      }, delay);
    };
    repeat(300, true);
  };
  useEffect(() => stop, []);
  return (
    <button className={className} title={title} onPointerDown={(e) => (e.button === 0 ? start() : undefined)} onPointerUp={stop} onPointerLeave={stop} onPointerCancel={stop}>
      {children}
    </button>
  );
}

export function ReplayControls() {
  const playing = useStore((s) => s.playing);
  const stepTf = useStore((s) => s.session?.stepTf ?? '1m');
  const speed = useStore((s) => s.session?.speed ?? 1);
  const tf = useStore((s) => s.session?.tf ?? '15m');
  const picking = useStore((s) => s.pickingStart);

  return (
    <div className="replay">
      <button
        className={`icon-btn ${picking ? 'on' : ''}`}
        title="Grafikten başlangıç seç: bir muma tıklayın, replay oradan devam etsin (açık işlem yokken)"
        onClick={() => useStore.setState({ pickingStart: !picking, tool: 'cursor' })}
      >
        <Icons.scissors />
      </button>
      <span className="rsep" />
      <HoldButton onStep={stepBack} title="Bir adım geri (←) — basılı tutun">
        <Icons.stepBack />
      </HoldButton>
      <button className="icon-btn play" title="Oynat / Duraklat (Boşluk)" onClick={togglePlay}>
        {playing ? <Icons.pause /> : <Icons.play />}
      </button>
      <HoldButton onStep={() => stepForward()} title="Bir adım ileri (→) — basılı tutun">
        <Icons.stepFwd />
      </HoldButton>
      <button className="icon-btn" title={`${tfInfo(tf).label} mum kapanışına git (Shift+→)`} onClick={forwardToBarClose}>
        <Icons.barClose />
      </button>
      <ForwardMenu />
      <NextSession />
      <span className="rsep" />
      <select className="select" value={stepTf} onChange={(e) => setStepTf(e.target.value as TF)} title="Her adımda ve oynatırken ilerlenecek süre">
        {STEP_TFS.map((t) => (
          <option key={t} value={t}>
            Adım: {TIMEFRAMES.find((x) => x.id === t)!.label}
          </option>
        ))}
      </select>
      <select className="select" value={speed} onChange={(e) => setSpeed(Number(e.target.value))} title="Oynatma hızı (adım / saniye)">
        {SPEEDS.map((s) => (
          <option key={s} value={s}>
            {s} adım/sn
          </option>
        ))}
      </select>
    </div>
  );
}

/** Bir sonraki seans başlangıcına/bitişine git ("seans seans" ilerleme). */
function NextSession() {
  const replayTime = useStore((s) => s.session?.replayTime ?? 0);
  const settings = useStore((s) => s.sessionSettings);
  const nb = useMemo(() => (replayTime ? nextBoundary(settings, replayTime) : null), [settings, replayTime]);
  return (
    <button className="btn small ghost" disabled={!nb} onClick={forwardToNextSessionBoundary} title={nb ? `Sonraki seans sınırına git: ${nb.label} NY (N)` : 'Görünür seans yok (Grafik ayarları > Seanslar)'}>
      <Icons.sessionNext /> {nb ? nb.label.replace(' başlangıcı', ' ▸').replace(' bitişi', ' ◂') : 'Seans'}
    </button>
  );
}

/** "İleri sar" menüsü: mum kapanışı, NY seans saatleri, özel saat. */
function ForwardMenu() {
  const [open, setOpen] = useState(false);
  const [custom, setCustom] = useState('08:30');
  const tf = useStore((s) => s.session?.tf ?? '15m');
  const sessions = useStore((s) => s.sessionSettings.sessions);
  const boundaries = useMemo(() => sessionBoundaries({ ...DEFAULT_SS, sessions }), [sessions]);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    window.addEventListener('mousedown', close);
    return () => window.removeEventListener('mousedown', close);
  }, [open]);
  const go = (h: number, m: number) => {
    forwardToNyTime(h, m);
    setOpen(false);
  };
  const goCustom = () => {
    const m = custom.match(/^(\d{1,2}):(\d{2})$/);
    if (m && +m[1] < 24 && +m[2] < 60) go(+m[1], +m[2]);
  };
  return (
    <div className="forward-menu" ref={ref}>
      <button className={`btn small ghost ${open ? 'on' : ''}`} title="İleri sar: NY saatine / mum kapanışına" onClick={() => setOpen(!open)}>
        <Icons.fastForward /> NY saatine
      </button>
      {open && (
        <div className="menu up">
          <button className="menu-item" onClick={() => (forwardToBarClose(), setOpen(false))}>
            <b>{tfInfo(tf).label} mum kapanışı</b>
            <span>Shift+→</span>
          </button>
          <div className="menu-title">Sonraki NY saati (hafta sonu atlanır)</div>
          <div className="preset-grid">
            {NY_PRESETS.map((p) => (
              <button key={p.label} className="preset" onClick={() => go(p.h, p.m)} title={p.hint}>
                <b>{p.label}</b>
                <span>{p.hint}</span>
              </button>
            ))}
          </div>
          {boundaries.length > 0 && (
            <>
              <div className="menu-title">Seans sınırları (Grafik ayarları &gt; Seanslar)</div>
              <div className="preset-grid">
                {boundaries.map((b) => (
                  <button key={`${b.sessionId}${b.kind}`} className="preset" onClick={() => go(b.h, b.m)} title={`${b.label} NY`}>
                    <b>{b.kind === 'start' ? '▸' : '◂'} {b.label.replace(' başlangıcı', '').replace(' bitişi', '')}</b>
                    <span>{b.kind === 'start' ? 'başlangıç' : 'bitiş'} {String(b.h).padStart(2, '0')}:{String(b.m).padStart(2, '0')}</span>
                  </button>
                ))}
              </div>
            </>
          )}
          <div className="menu-custom">
            <input type="time" value={custom} onChange={(e) => setCustom(e.target.value)} onKeyDown={(e) => (e.key === 'Enter' ? goCustom() : e.stopPropagation())} />
            <span className="muted">NY</span>
            <button className="btn small primary" onClick={goCustom}>
              Git
            </button>
          </div>
          <p className="hint">Açık işlem SL/TP'ye değerse veya emir dolarsa ileri sarma o dakikada durur.</p>
        </div>
      )}
    </div>
  );
}

export function ReplayClock() {
  const replayTime = useStore((s) => s.session?.replayTime ?? 0);
  if (!replayTime) return null;
  return (
    <div className="clock" title="Replay zamanı (New York). Son görünen mumun kapanışı.">
      <b>{fmtNy(replayTime)}</b> <span className="muted">NY {nyOffsetLabel(replayTime)}</span>
    </div>
  );
}
