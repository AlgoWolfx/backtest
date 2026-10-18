// İşlem kapanınca açılan değerlendirme penceresi: neden girdim, hatalarım, ders, kalite puanı.
// Taşınabilir ve küçültülebilir; "Atla" ile kapatılırsa Performans > işlem günlüğünden sonradan doldurulabilir.

import { useEffect, useState } from 'react';
import { getSymbol } from '../../../shared/symbols.js';
import { MISTAKE_TAGS, NO_MISTAKE } from '../../core/review';
import type { Trade } from '../../core/trading';
import { fmtMoney, fmtNy, fmtPrice, fmtR, reasonLabel } from '../../lib/format';
import { saveReview, skipReview, useStore } from '../../store';
import { useWindow } from '../../lib/useWindow';
import { Icons } from '../common/icons';

export function TradeReviewModal() {
  const id = useStore((s) => s.reviewQueue[0]);
  const waiting = useStore((s) => Math.max(0, s.reviewQueue.length - 1));
  const trade = useStore((s) => (id ? s.session?.trades.find((t) => t.id === id) : undefined));
  // İşlem artık yoksa (oturum değişti) sıradan düşür.
  useEffect(() => {
    if (id && !trade) skipReview(id);
  }, [id, trade]);
  if (!id || !trade) return null;
  return <ReviewForm key={id} trade={trade} waiting={waiting} />;
}

function ReviewForm({ trade: t, waiting }: { trade: Trade; waiting: number }) {
  const win = useWindow('review');
  const prev = t.review;
  const [reason, setReason] = useState(prev?.reason ?? '');
  const [mistakes, setMistakes] = useState<string[]>(prev?.mistakes ?? []);
  const [mistakeText, setMistakeText] = useState(prev?.mistakeText ?? '');
  const [lesson, setLesson] = useState(prev?.lesson ?? '');
  const [rating, setRating] = useState<number | undefined>(prev?.rating);
  const spec = getSymbol(t.symbol);
  const empty = !reason.trim() && !mistakes.length && !mistakeText.trim() && !lesson.trim() && !rating;

  const save = () => saveReview(t.id, { reason: reason.trim(), mistakes, mistakeText: mistakeText.trim(), lesson: lesson.trim(), rating });
  const skip = () => skipReview(t.id);
  const toggle = (tag: string) =>
    setMistakes((m) => {
      if (m.includes(tag)) return m.filter((x) => x !== tag);
      // "Hata yok" ile hata etiketleri birlikte seçilemez
      return tag === NO_MISTAKE ? [NO_MISTAKE] : [...m.filter((x) => x !== NO_MISTAKE), tag];
    });

  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && empty) skip();
      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) save();
    };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  });

  const win$ = (
    <div ref={win.winRef} style={win.style} className={`review ${win.min ? 'min' : ''}`} onMouseDown={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
      <div className="review-head" {...win.headProps}>
        <b>İşlem değerlendirmesi</b>
        {waiting > 0 && <span className="muted">+{waiting} bekliyor</span>}
        <span className="spacer" />
        <button className="icon-btn" title={win.min ? 'Büyüt' : 'Küçült (grafiği görmek için)'} onClick={win.toggleMin}>
          {win.min ? '▢' : '–'}
        </button>
        <button className="icon-btn" title="Atla (sonra Performans sayfasından doldurabilirsin)" onClick={skip}>
          <Icons.close />
        </button>
      </div>

      <div className="review-sum">
        <b>{t.symbol}</b>
        <span className={t.side === 'long' ? 'pos' : 'neg'}>{t.side === 'long' ? 'Long' : 'Short'}</span>
        <span className="muted">
          {fmtPrice(t.entry, spec)} → {t.exit != null ? fmtPrice(t.exit, spec) : '—'} ({reasonLabel(t.exitReason)})
        </span>
        <span className="spacer" />
        <b className={(t.pnl ?? 0) >= 0 ? 'pos' : 'neg'}>{fmtMoney(t.pnl ?? 0, true)}</b>
        <b className={(t.r ?? 0) >= 0 ? 'pos' : 'neg'}>{fmtR(t.r)}</b>
        {t.closedAt && <span className="muted">{fmtNy(t.closedAt)} NY</span>}
      </div>

      <div className="review-body">
        <label className="review-field">
          <span>Neden bu işleme girdim?</span>
          <textarea autoFocus value={reason} placeholder="Setup, bias, yapı, seviye… (ör. London sweep sonrası FVG retest)" onChange={(e) => setReason(e.target.value)} />
        </label>

        <div className="review-field">
          <span>Hatalarım</span>
          <div className="review-tags">
            <button className={`chip ok ${mistakes.includes(NO_MISTAKE) ? 'on' : ''}`} onClick={() => toggle(NO_MISTAKE)}>
              {NO_MISTAKE}
            </button>
            {MISTAKE_TAGS.map((tag) => (
              <button key={tag} className={`chip ${mistakes.includes(tag) ? 'on' : ''}`} onClick={() => toggle(tag)}>
                {tag}
              </button>
            ))}
          </div>
          <textarea value={mistakeText} placeholder="Ne yanlış gitti? Planın neresinden saptım?" onChange={(e) => setMistakeText(e.target.value)} />
        </div>

        <label className="review-field">
          <span>Ders: bir dahaki sefere</span>
          <textarea value={lesson} placeholder="Aynı durumda ne yapacağım?" onChange={(e) => setLesson(e.target.value)} />
        </label>

        <div className="review-field">
          <span>İşlem kalitesi (plana uyum, sonuçtan bağımsız)</span>
          <div className="review-stars">
            {[1, 2, 3, 4, 5].map((n) => (
              <button key={n} className={(rating ?? 0) >= n ? 'on' : ''} title={`${n} / 5`} onClick={() => setRating(rating === n ? undefined : n)}>
                ★
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="review-foot">
        <button className="btn ghost" onClick={skip}>
          Atla
        </button>
        <div className="spacer" />
        <span className="muted review-hint">Ctrl+Enter: kaydet</span>
        <button className="btn primary" disabled={empty} onClick={save}>
          Kaydet
        </button>
      </div>
    </div>
  );
  return <div className={`review-layer ${win.min ? 'min' : ''}`}>{win$}</div>;
}
