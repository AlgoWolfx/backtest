import { type ReactNode } from 'react';
import { getSymbol } from '../../../shared/symbols.js';
import { liquidationPnl } from '../../core/trading';
import { snapshot } from '../../core/account';
import { fmtMoney } from '../../lib/format';
import { balanceOf, exitPriceNow, useStore } from '../../store';

/** Kapanmış bakiye ve açık pozisyonların anlık K/Z'si. */
function useBalance() {
  const session = useStore((s) => s.session);
  useStore((s) => s.data);
  if (!session) return null;
  const balance = balanceOf(session);
  let floating = 0;
  for (const t of session.trades) {
    if (t.status !== 'open') continue;
    const px = exitPriceNow(t);
    if (px != null) floating += liquidationPnl(getSymbol(t.symbol), t, px);
  }
  return { session, balance, floating };
}

export function AccountInfo() {
  const b = useBalance();
  if (!b) return null;
  const { session, balance, floating } = b;
  const net = balance - session.initialBalance;
  const status = session.account?.state.status;
  return (
    <div className="account">
      <div>
        <span className="muted">Bakiye</span> <b>{fmtMoney(balance)}</b> <span className={net >= 0 ? 'pos' : 'neg'}>({fmtMoney(net, true)})</span>
      </div>
      {floating !== 0 && (
        <div>
          <span className="muted">Açık K/Z</span> <b className={floating >= 0 ? 'pos' : 'neg'}>{fmtMoney(floating, true)}</b>
        </div>
      )}
      {status && status !== 'active' && <span className={`pill ${status === 'passed' ? 'win' : 'loss'}`}>{status === 'passed' ? 'GEÇTİ' : 'PATLADI'}</span>}
    </div>
  );
}

/** Alt çubukta hesap kuralı göstergeleri: hedef, günlük kayıp, hesap patlama. */
export function AccountMeters() {
  const b = useBalance();
  if (!b?.session.account) return null;
  const { session, balance, floating } = b;
  const snap = snapshot(session.account!, session.initialBalance, session.replayTime, balance, balance + floating);
  const pct = (v: number) => ((v / session.initialBalance) * 100).toFixed(2);
  const signed = (v: number) => `${v > 0 ? '+' : v < 0 ? '−' : ''}${pct(Math.abs(v))}`;
  const tone = (v: number) => (v > 0 ? 'pos' : v < 0 ? 'neg' : '');
  if (!snap.target && !snap.daily && !snap.max) return null;
  return (
    <div className="meters">
      {snap.target && (
        <Meter label="Hedef" title={`Kâr hedefi: ${fmtMoney(snap.target.have, true)} / ${fmtMoney(snap.target.need)}`} value={snap.target.have} max={snap.target.need} text={`${pct(snap.target.have)} / ${pct(snap.target.need)}%`} tone="good" />
      )}
      {snap.daily && (
        <Meter
          label="Günlük"
          title={`Bugünkü K/Z (equity): ${fmtMoney(snap.daily.pnl, true)} · günlük kayıp limiti ${fmtMoney(snap.daily.limit)} · bugün kalan kayıp payı ${fmtMoney(snap.daily.limit + snap.daily.pnl)} · gün başında sıfırlanır`}
          value={snap.daily.used}
          max={snap.daily.limit}
          text={<><span className={tone(snap.daily.pnl)}>{signed(snap.daily.pnl)}</span> / −{pct(snap.daily.limit)}%</>}
          tone="bad"
        />
      )}
      {snap.max && (
        <Meter
          label="Patlama"
          title={`Toplam K/Z (equity, limitin ölçüldüğü noktaya göre): ${fmtMoney(snap.max.pnl, true)} · maks. kayıp limiti ${fmtMoney(snap.max.limit)} · patlamaya kalan ${fmtMoney(snap.max.limit + snap.max.pnl)}`}
          value={snap.max.used}
          max={snap.max.limit}
          text={<><span className={tone(snap.max.pnl)}>{signed(snap.max.pnl)}</span> / −{pct(snap.max.limit)}%</>}
          tone="bad"
        />
      )}
    </div>
  );
}

/** Küçük ilerleme göstergesi (hedef / limit kullanımı). */
function Meter({ label, title, value, max, text, tone }: { label: string; title: string; value: number; max: number; text: ReactNode; tone: 'good' | 'bad' }) {
  const ratio = max > 0 ? Math.max(0, Math.min(1, value / max)) : 0;
  const level = tone === 'good' ? 'good' : ratio >= 0.8 ? 'crit' : ratio >= 0.5 ? 'warn' : 'ok';
  return (
    <div className="meter" title={title}>
      <span className="muted">{label}</span>
      <span className="meter-bar">
        <span className={`meter-fill ${level}`} style={{ width: `${ratio * 100}%` }} />
      </span>
      <span className="meter-text">{text}</span>
    </div>
  );
}
