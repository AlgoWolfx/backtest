import { useEffect, useState } from 'react';
import { createSession, deleteSession, openSession, useStore } from '../store';
import { DATA_SOURCES, type DataSource } from '../core/data';
import { ACCOUNT_PRESETS, type AccountRules } from '../core/account';
import { fmtMoney, fmtNy } from '../format';
import { fromNyInputs } from './Dialogs';
import { Icons } from './icons';

/** Boş bırakılabilen yüzde alanı (boş = kural yok). */
function PctField({ label, value, onChange }: { label: string; value: number | null; onChange: (v: number | null) => void }) {
  const [text, setText] = useState(value == null ? '' : String(value));
  useEffect(() => setText(value == null ? '' : String(value)), [value]);
  return (
    <label>
      <span>{label}</span>
      <input
        value={text}
        placeholder="yok"
        inputMode="decimal"
        onChange={(e) => setText(e.target.value)}
        onBlur={() => {
          const t = text.trim().replace(',', '.');
          const v = t === '' ? null : Number(t);
          if (v === null || (Number.isFinite(v) && v > 0 && v < 100)) onChange(v);
          else setText(value == null ? '' : String(value));
        }}
      />
    </label>
  );
}

/** Kuralları sade bir cümleyle özetler. */
export function describeRules(r: AccountRules, balance: number): string {
  const $ = (v: number) => fmtMoney(v);
  const parts: string[] = [];
  if (r.profitTargetPct != null) parts.push(`hedef ${$(balance * (1 + r.profitTargetPct / 100))} (+%${r.profitTargetPct})`);
  if (r.dailyLossPct != null) parts.push(`günlük en fazla ${$((balance * r.dailyLossPct) / 100)} kayıp (NY 17:00'de sıfırlanır)`);
  if (r.maxLossPct != null) parts.push(`${r.drawdownType === 'trailing' ? 'zirveden' : 'başlangıçtan'} en fazla ${$((balance * r.maxLossPct) / 100)} kayıp`);
  if (r.minTradingDays) parts.push(`en az ${r.minTradingDays} işlem günü`);
  if (!parts.length) return 'Kural yok: hesap patlamaz, hedef yok (serbest kişisel hesap).';
  return `Kurallar: ${parts.join(' · ')}. Limitler equity (açık pozisyon dahil) ile her dakika denetlenir; aşılırsa tüm pozisyonlar kapanır ve hesap patlar.`;
}

export function SessionScreen() {
  const sessions = useStore((s) => s.sessions);
  const symbols = useStore((s) => s.symbols);
  const loading = useStore((s) => s.loading);
  const available = symbols.filter((s) => s.available);
  const [form, setForm] = useState({ name: '', symbol: 'EURUSD', date: '2025-01-06', time: '02:00', balance: 100000, source: 'histdata' as DataSource });
  const ready = (src: DataSource) => symbols.some((s) => s.sources?.[src]);
  // Dukascopy indirildiyse varsayılan kaynak o olsun.
  useEffect(() => {
    if (symbols.some((s) => s.sources?.dukascopy)) setForm((f) => (f.source === 'histdata' ? { ...f, source: 'dukascopy' } : f));
  }, [symbols]);
  const [busy, setBusy] = useState(false);
  const [preset, setPreset] = useState('personal');
  const [rules, setRules] = useState<AccountRules>(ACCOUNT_PRESETS[0].rules);
  const pickPreset = (id: string) => {
    setPreset(id);
    const p = ACCOUNT_PRESETS.find((x) => x.id === id);
    if (p) setRules(p.rules);
  };
  const setRule = (patch: Partial<AccountRules>) => {
    setRules((r) => ({ ...r, ...patch }));
    setPreset('custom');
  };

  const create = async () => {
    const startTime = fromNyInputs(form.date, form.time);
    if (startTime == null) return;
    setBusy(true);
    try {
      await createSession({ name: form.name || `${form.symbol} ${form.date}`, symbol: form.symbol, startTime, balance: form.balance, source: form.source, rules });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="sessions-screen">
      <div className="sessions-inner">
        <h1>
          <Icons.logo /> Backtest
        </h1>

        <section className="card">
          <h2>Yeni oturum</h2>
          <div className="new-session">
            <label>
              <span>Ad</span>
              <input value={form.name} placeholder="ör. EURUSD NY seansı Ocak" onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </label>
            <label>
              <span>Parite</span>
              <select value={form.symbol} onChange={(e) => setForm({ ...form, symbol: e.target.value })}>
                {available.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.id} · {s.name}
                  </option>
                ))}
              </select>
            </label>
            <label title={DATA_SOURCES.find((x) => x.id === form.source)!.detail}>
              <span>Veri kaynağı</span>
              <select value={form.source} onChange={(e) => setForm({ ...form, source: e.target.value as DataSource })}>
                {DATA_SOURCES.map((d) => (
                  <option key={d.id} value={d.id} disabled={!ready(d.id)}>
                    {d.label}
                    {!ready(d.id) ? ' (indirilmemiş)' : ''}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>Başlangıç (NY)</span>
              <div className="row">
                <input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
                <input type="time" value={form.time} onChange={(e) => setForm({ ...form, time: e.target.value })} />
              </div>
            </label>
          </div>
          <h3>Hesap</h3>
          <div className="account-form">
            <label>
              <span>Hesap türü</span>
              <select value={preset} onChange={(e) => pickPreset(e.target.value)}>
                {ACCOUNT_PRESETS.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.label}
                  </option>
                ))}
                <option value="custom">Özel</option>
              </select>
            </label>
            <label>
              <span>Başlangıç bakiyesi ($)</span>
              <input type="number" value={form.balance} min={100} step={1000} onChange={(e) => setForm({ ...form, balance: Number(e.target.value) })} />
            </label>
            <PctField label={rules.type === 'prop' ? 'Fon geçme hedefi %' : 'Kâr hedefi %'} value={rules.profitTargetPct} onChange={(v) => setRule({ profitTargetPct: v })} />
            <PctField label="Günlük kayıp limiti %" value={rules.dailyLossPct} onChange={(v) => setRule({ dailyLossPct: v })} />
            <PctField label="Hesap patlama (maks. kayıp) %" value={rules.maxLossPct} onChange={(v) => setRule({ maxLossPct: v })} />
            <label>
              <span>Düşüş türü</span>
              <select value={rules.drawdownType} onChange={(e) => setRule({ drawdownType: e.target.value as AccountRules['drawdownType'] })}>
                <option value="static">Statik (başlangıçtan)</option>
                <option value="trailing">Trailing (zirveden)</option>
              </select>
            </label>
            <label>
              <span>Min. işlem günü</span>
              <input type="number" min={0} value={rules.minTradingDays} onChange={(e) => setRule({ minTradingDays: Math.max(0, Number(e.target.value) || 0) })} />
            </label>
            <button className="btn primary" disabled={busy || !available.length} onClick={create}>
              {busy ? (loading ? `Yükleniyor %${Math.round(loading.progress * 100)}` : 'Hazırlanıyor…') : 'Oturumu başlat'}
            </button>
          </div>
          <p className="hint">{describeRules(rules, form.balance)}</p>
          {!available.length && <p className="hint neg">Veri bulunamadı. Terminalde "npm run data" çalıştırın.</p>}
        </section>

        {sessions.length > 0 && (
          <section className="card">
            <h2>Oturumlar</h2>
            <table className="sessions">
              <thead>
                <tr>
                  <th>Ad</th>
                  <th>Parite</th>
                  <th>Replay zamanı (NY)</th>
                  <th>İşlem</th>
                  <th>Bakiye</th>
                  <th>Hesap</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {sessions.map((s) => (
                  <tr key={s.id} onClick={() => openSession(s.id)}>
                    <td>
                      <b>{s.name}</b>
                    </td>
                    <td>{s.symbol}</td>
                    <td>{fmtNy(s.replayTime)}</td>
                    <td>{s.trades}</td>
                    <td className={s.balance >= s.initialBalance ? 'pos' : 'neg'}>{fmtMoney(s.balance)}</td>
                    <td>
                      {s.accountType === 'prop' ? 'Fon' : 'Kişisel'}{' '}
                      {s.accountStatus && s.accountStatus !== 'active' && <span className={`pill ${s.accountStatus === 'passed' ? 'win' : 'loss'}`}>{s.accountStatus === 'passed' ? 'Geçti' : 'Patladı'}</span>}
                    </td>
                    <td>
                      <button
                        className="icon-btn"
                        title="Oturumu sil"
                        onClick={(e) => {
                          e.stopPropagation();
                          if (window.confirm(`"${s.name}" oturumu silinsin mi?`)) deleteSession(s.id);
                        }}
                      >
                        <Icons.trash />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        )}

        <section className="card">
          <h2>Veri durumu</h2>
          <p className="hint">
            1 dakikalık veriden New York saatine göre üst zaman dilimleri oluşturulur. Yıl sütunları, normal işlem saatleri içinde verinin olmadığı süreyi gösterir (tatiller dahil). Eksik
            dakikalar uydurulmaz. Dukascopy önerilen kaynaktır: orijinal akış, bid + ask (gerçek spread), boşluksuz.
          </p>
          <table className="data-status">
            <thead>
              <tr>
                <th>Sembol</th>
                <th>Kaynak</th>
                <th>Aralık (NY)</th>
                <th>1m mum</th>
                <th>Spread</th>
                {years(symbols).map((y) => (
                  <th key={y}>{y}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {symbols.flatMap((s) => {
                const rows = DATA_SOURCES.filter((d) => s.sources?.[d.id]);
                if (!rows.length)
                  return [
                    <tr key={s.id}>
                      <td>
                        <b>{s.id}</b>
                      </td>
                      <td colSpan={4 + years(symbols).length} className="neg">
                        İndirilmemiş
                      </td>
                    </tr>,
                  ];
                return rows.map((d, i) => {
                  const m = s.sources[d.id]!;
                  return (
                    <tr key={s.id + d.id}>
                      <td>{i === 0 && <b>{s.id}</b>}</td>
                      <td className={i === 0 ? '' : 'muted'}>{d.label}</td>
                      <td>
                        {fmtNy(m.from, false)} → {fmtNy(m.to, false)}
                      </td>
                      <td>{m.count.toLocaleString('tr-TR')}</td>
                      <td className="muted">{m.spread ? `${m.spread.median}` : '—'}</td>
                      {years(symbols).map((y) => {
                        const h = m.missingHoursByYear?.[y] ?? 0;
                        return (
                          <td key={y} className={h > 400 ? 'neg' : h > 150 ? 'warn' : 'muted'} title="Veri olmayan saat (tatiller dahil)">
                            {Math.round(h)} s
                          </td>
                        );
                      })}
                    </tr>
                  );
                });
              })}
            </tbody>
          </table>
        </section>
      </div>
    </div>
  );
}

function years(symbols: ReturnType<typeof useStore.getState>['symbols']): string[] {
  const set = new Set<string>();
  for (const s of symbols) for (const m of Object.values(s.sources ?? {})) for (const y of Object.keys(m?.missingHoursByYear ?? {})) set.add(y);
  return [...set].sort();
}
