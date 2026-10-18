import { useState } from 'react';
import { createSession, deleteSession, openSession, useStore } from '../../store';
import { DATA_SOURCES } from '../../core/data';
import { ACCOUNT_PRESETS, validateRules, type AccountRules } from '../../core/account';
import { AccountSetup } from './AccountSetup';
import { fmtMoney, fmtNy } from '../../lib/format';
import { fromNyInputs } from '../replay/JumpDialog';
import { Icons } from '../common/icons';

/** Kuralları sade bir cümleyle özetler. */
export function describeRules(r: AccountRules, balance: number): string {
  const $ = (v: number) => fmtMoney(v);
  const parts: string[] = [];
  if (r.profitTargetPct != null) parts.push(`hedef ${$(balance * (1 + r.profitTargetPct / 100))} (+%${r.profitTargetPct})`);
  if (r.dailyLossPct != null) parts.push(`günlük en fazla ${$((balance * r.dailyLossPct) / 100)} kayıp (${r.resetMode === 'cet0' ? 'Avrupa gece yarısı CE(S)T 00:00' : 'NY 17:00'}'de sıfırlanır)`);
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
  const [form, setForm] = useState({ name: '', symbol: 'EURUSD', date: '2025-01-06', time: '02:00', balance: 100000, commission: 0 });
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

  const invalid = validateRules(rules, form.balance).errors.length > 0;

  const create = async () => {
    const startTime = fromNyInputs(form.date, form.time);
    if (startTime == null || invalid) return;
    setBusy(true);
    try {
      await createSession({ name: form.name || `${form.symbol} ${form.date}`, symbol: form.symbol, startTime, balance: form.balance, source: 'dukascopy', rules, commissionPerLot: form.commission });
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
            <label>
              <span>Başlangıç (NY)</span>
              <div className="row">
                <input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
                <input type="time" value={form.time} onChange={(e) => setForm({ ...form, time: e.target.value })} />
              </div>
            </label>
          </div>
          <h3>Hesap</h3>
          <AccountSetup
            rules={rules}
            presetId={preset}
            balance={form.balance}
            commission={form.commission}
            onPreset={pickPreset}
            onRules={setRule}
            onBalance={(balance) => setForm({ ...form, balance })}
            onCommission={(commission) => setForm({ ...form, commission })}
          />
          <div className="acct-start">
            <button className="btn primary" disabled={busy || !available.length || invalid} onClick={create}>
              {busy ? (loading ? `Yükleniyor %${Math.round(loading.progress * 100)}` : 'Hazırlanıyor…') : 'Oturumu başlat'}
            </button>
          </div>
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
            dakikalar uydurulmaz. Veri Dukascopy 1m bid + ask akışıdır (gerçek spread).
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
