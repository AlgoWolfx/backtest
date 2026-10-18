import { useEffect, useState } from 'react';
import { nyLocalToUtc, toNyLocal } from '../../../shared/nytime.js';
import { fmtNy, pad } from '../../lib/format';
import { currentData, jumpTo, useStore } from '../../store';
import { Modal } from '../common/Modal';

export function toNyInputs(utc: number) {
  const d = new Date(toNyLocal(utc) * 1000);
  return { date: `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`, time: `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}` };
}

export function fromNyInputs(date: string, time: string): number | null {
  const m = date.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const t = time.match(/^(\d{1,2}):(\d{2})$/);
  if (!m || !t) return null;
  return nyLocalToUtc(Date.UTC(+m[1], +m[2] - 1, +m[3], +t[1], +t[2]) / 1000);
}

export function JumpDialog() {
  const open = useStore((s) => s.jumpOpen);
  const replayTime = useStore((s) => s.session?.replayTime ?? 0);
  const [v, setV] = useState(() => toNyInputs(replayTime));
  useEffect(() => {
    if (open) setV(toNyInputs(useStore.getState().session!.replayTime));
  }, [open]);
  if (!open) return null;
  const d = currentData();
  const close = () => useStore.setState({ jumpOpen: false });
  const go = () => {
    const utc = fromNyInputs(v.date, v.time);
    if (utc == null) return;
    jumpTo(utc);
    close();
  };
  return (
    <Modal title="Replay tarihini değiştir" wkey="jump" onClose={close}>
      <p className="hint">Seçilen New York saatinden sonraki mumlar gizlenir. Açık pozisyon varken yalnızca ileri gidilebilir; aradaki mumlar SL/TP için işlenir.</p>
      <div className="form-row">
        <input type="date" value={v.date} onChange={(e) => setV({ ...v, date: e.target.value })} onKeyDown={(e) => e.stopPropagation()} />
        <input type="time" value={v.time} onChange={(e) => setV({ ...v, time: e.target.value })} onKeyDown={(e) => e.key === 'Enter' ? go() : e.stopPropagation()} />
        <span className="muted">NY</span>
      </div>
      {d && (
        <p className="hint">
          Veri aralığı: {fmtNy(d.meta.from)} → {fmtNy(d.meta.to)}
        </p>
      )}
      <div className="modal-foot">
        <div className="spacer" />
        <button className="btn" onClick={close}>
          Vazgeç
        </button>
        <button className="btn primary" onClick={go}>
          Git
        </button>
      </div>
    </Modal>
  );
}
