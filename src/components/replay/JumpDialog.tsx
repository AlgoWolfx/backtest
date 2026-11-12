import { useEffect, useState } from 'react';
import { nyLocalToUtc, toNyLocal } from '../../../shared/nytime.js';
import { fmtNy, pad } from '../../lib/format';
import { currentData, jumpTo, toast, useStore } from '../../store';
import { Modal } from '../common/Modal';
import { randomTradingDay } from '../../lib/randomDay';

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
  // İşlem varken geçmişe dönülemez (kronoloji): rastgele gün yalnızca replay zamanından sonra seçilir.
  const s = useStore.getState().session;
  const randomFrom = d ? (s?.trades.length ? Math.max(s.replayTime, d.meta.from) : d.meta.from) : 0;
  const randomDate = () => {
    if (!d) return;
    const date = randomTradingDay(randomFrom, d.meta.to, v.time, Math.random, s?.trades.length ? 86400 : undefined);
    if (date) setV({ ...v, date });
    else toast('Rastgele gün için uygun aralık yok (açık / kapanmış işlem varken yalnızca ileri gidilebilir).', 'error');
  };
  const go = () => {
    const utc = fromNyInputs(v.date, v.time);
    if (utc == null) return;
    jumpTo(utc);
    close();
  };
  return (
    <Modal
      title="Replay tarihini değiştir"
      wkey="jump"
      width={302}
      onClose={close}
      footer={
        <>
          <div className="spacer" />
          <button className="tvd-btn" onClick={close}>
            İptal
          </button>
          <button className="tvd-btn primary" onClick={go}>
            Git
          </button>
        </>
      }
    >
      <p className="hint">Seçilen New York saatinden sonraki mumlar gizlenir. Açık pozisyon varken yalnızca ileri gidilebilir; aradaki mumlar SL/TP için işlenir.</p>
      <div className="form-row jump-row">
        <input type="date" value={v.date} onChange={(e) => setV({ ...v, date: e.target.value })} onKeyDown={(e) => e.stopPropagation()} />
        <input type="time" value={v.time} onChange={(e) => setV({ ...v, time: e.target.value })} onKeyDown={(e) => e.key === 'Enter' ? go() : e.stopPropagation()} />
        <span className="muted">NY</span>
      </div>
      <button type="button" className="tvd-btn" title="Verinin olduğu rastgele bir hafta içi gün seç (saat aynı kalır)" onClick={randomDate}>
        Rastgele gün
      </button>
      {d && (
        <p className="hint">
          Veri aralığı: {fmtNy(d.meta.from)} → {fmtNy(d.meta.to)}
        </p>
      )}
    </Modal>
  );
}
