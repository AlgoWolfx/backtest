import { revealedCount } from '../../core/data';
import { fmtNy } from '../../lib/format';
import { paneCfg, useStore } from '../../store';

/** Hesap patladıysa veya değerlendirme geçildiyse grafiğin üstünde kalıcı bant. */
export function AccountBanner() {
  const st = useStore((s) => s.session?.account?.state);
  if (!st || st.status === 'active') return null;
  return (
    <div className={`account-banner ${st.status}`}>
      {st.status === 'failed' ? 'HESAP PATLADI' : 'DEĞERLENDİRME GEÇİLDİ'} · {st.reason}
      {st.statusAt ? ` · ${fmtNy(st.statusAt)} NY` : ''}
      {st.status === 'failed' ? ' · Yeni işlem açılamaz; işlemleri Performans sayfasında inceleyebilirsiniz.' : ''}
    </div>
  );
}

/** Kaynakta eksik olan aralığa yeni girildiyse veya veri bittiyse uyarı gösterir. */
export function DataNotice({ pane }: { pane: number }) {
  const replayTime = useStore((s) => s.session?.replayTime ?? 0);
  const d = useStore((s) => (s.session ? s.data[paneCfg(s.session, pane).symbol] : undefined));
  if (!d) return null;
  if (revealedCount(d, replayTime) >= d.n) return <div className="notice">Veri sonu: {fmtNy(d.meta.to)} NY. Bu tarihten sonrası için "npm run data" ile güncelleyin.</div>;
  const gaps = d.meta.gaps;
  // replayTime'dan önce biten son boşluk (ikili arama)
  let lo = 0, hi = gaps.length;
  while (lo < hi) {
    const m = (lo + hi) >> 1;
    if (gaps[m].to <= replayTime) lo = m + 1;
    else hi = m;
  }
  const inside = gaps[lo] && gaps[lo].from < replayTime ? gaps[lo] : null;
  const recent = lo > 0 && replayTime - gaps[lo - 1].to < 3 * 3600 ? gaps[lo - 1] : null;
  const g = inside ?? recent;
  if (!g) return null;
  const dur = g.minutes >= 120 ? `${(g.minutes / 60).toFixed(1)} saat` : `${g.minutes} dk`;
  return (
    <div className="notice warn">
      Veri yok: {fmtNy(g.from)} → {fmtNy(g.to)} NY ({dur}). Kaynakta eksik ya da piyasa kapalı; mum uydurulmadı.
    </div>
  );
}
