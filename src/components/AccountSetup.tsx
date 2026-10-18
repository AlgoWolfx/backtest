// Yeni oturumdaki hesap bölümü: tür (kişisel / fon değerlendirmesi / fonlu), hazır ayar kartları, hesap büyüklüğü,
// kural alanları ve doların karşılıklarıyla kural özeti. Tutarsız kurallar için uyarı / hata gösterir.

import { useEffect, useState } from 'react';
import { ACCOUNT_GROUPS, ACCOUNT_PRESETS, groupOf, presetOf, ruleAmounts, validateRules, type AccountGroup, type AccountRules } from '../core/account';
import { fmtMoney } from '../format';

const SIZES = [5_000, 10_000, 25_000, 50_000, 100_000, 200_000];
const sizeLabel = (v: number) => `${v / 1000}K`;

/** Boş bırakılabilen yüzde alanı (boş = kural yok). */
function PctField({ label, hint, value, onChange }: { label: string; hint?: string; value: number | null; onChange: (v: number | null) => void }) {
  const [text, setText] = useState(value == null ? '' : String(value));
  useEffect(() => setText(value == null ? '' : String(value)), [value]);
  return (
    <label className="acct-field" title={hint}>
      <span>{label}</span>
      <div className="acct-unit">
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
          onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
        />
        <i>%</i>
      </div>
    </label>
  );
}

export function AccountSetup({
  rules,
  presetId,
  balance,
  commission,
  onPreset,
  onRules,
  onBalance,
  onCommission,
}: {
  rules: AccountRules;
  presetId: string;
  balance: number;
  commission: number;
  onPreset: (id: string) => void;
  onRules: (patch: Partial<AccountRules>) => void;
  onBalance: (v: number) => void;
  onCommission: (v: number) => void;
}) {
  const group: AccountGroup = presetId === 'custom' ? groupOf(rules) : (ACCOUNT_PRESETS.find((p) => p.id === presetId)?.group ?? groupOf(rules));
  const presets = ACCOUNT_PRESETS.filter((p) => p.group === group);
  const a = ruleAmounts(rules, balance);
  const check = validateRules(rules, balance);
  const isPreset = presetOf(rules)?.id === presetId;
  const grp = ACCOUNT_GROUPS.find((g) => g.id === group)!;
  const personal = rules.type === 'personal';

  const chips = (r: AccountRules) =>
    [r.profitTargetPct != null ? `Hedef %${r.profitTargetPct}` : null, r.dailyLossPct != null ? `Günlük %${r.dailyLossPct}` : null, r.maxLossPct != null ? `Maks. %${r.maxLossPct} ${r.drawdownType === 'trailing' ? 'trailing' : 'statik'}` : null, r.minTradingDays ? `${r.minTradingDays} gün` : null].filter(Boolean) as string[];

  return (
    <div className="acct">
      <div className="acct-tabs" role="tablist">
        {ACCOUNT_GROUPS.map((g) => (
          <button key={g.id} role="tab" aria-selected={g.id === group} className={g.id === group ? 'on' : ''} onClick={() => onPreset(ACCOUNT_PRESETS.find((p) => p.group === g.id)!.id)}>
            {g.label}
          </button>
        ))}
      </div>
      <p className="hint">{grp.desc}</p>

      <div className="acct-presets">
        {presets.map((p) => (
          <button key={p.id} className={`acct-card ${presetId === p.id && isPreset ? 'on' : ''}`} onClick={() => onPreset(p.id)}>
            <b>{p.label}</b>
            <span>{p.desc}</span>
            {chips(p.rules).length > 0 && (
              <span className="acct-chips">
                {chips(p.rules).map((c) => (
                  <i key={c}>{c}</i>
                ))}
              </span>
            )}
          </button>
        ))}
        {presetId === 'custom' && <div className="acct-card on custom"><b>Özel kurallar</b><span>Aşağıdaki alanları elle değiştirdin.</span></div>}
      </div>

      <div className="acct-body">
        <div className="acct-col">
          <h4>Hesap büyüklüğü</h4>
          <div className="acct-sizes">
            {SIZES.map((v) => (
              <button key={v} className={balance === v ? 'on' : ''} onClick={() => onBalance(v)}>
                ${sizeLabel(v)}
              </button>
            ))}
          </div>
          <label className="acct-field">
            <span>Başlangıç bakiyesi</span>
            <div className="acct-unit">
              <i>$</i>
              <input type="number" value={balance} min={100} step={1000} onChange={(e) => onBalance(Number(e.target.value))} />
            </div>
          </label>
          <label className="acct-field" title="Her işlem için gidiş-dönüş komisyon (ECN tarzı). Spread ayrıca veriden gelir.">
            <span>Komisyon (gidiş-dönüş / lot)</span>
            <div className="acct-unit">
              <i>$</i>
              <input type="number" min={0} step={0.5} value={commission} onChange={(e) => onCommission(Math.max(0, Number(e.target.value) || 0))} />
            </div>
          </label>
        </div>

        {!personal && (
          <div className="acct-col">
            <h4>Hedef ve limitler</h4>
            <PctField label="Kâr hedefi" hint="Kapanmış bakiye bu seviyeye ulaşınca (açık işlem yokken) değerlendirme geçilir." value={rules.profitTargetPct} onChange={(v) => onRules({ profitTargetPct: v })} />
            <PctField label="Günlük kayıp limiti" hint="Günün başındaki bakiyeye göre; equity bu tabana değerse hesap patlar." value={rules.dailyLossPct} onChange={(v) => onRules({ dailyLossPct: v })} />
            <PctField label="Maks. kayıp (hesap patlama)" hint="Statik: başlangıçtan. Trailing: kapanmış bakiye zirvesinden." value={rules.maxLossPct} onChange={(v) => onRules({ maxLossPct: v })} />
            <label className="acct-field">
              <span>Düşüş türü</span>
              <select value={rules.drawdownType} onChange={(e) => onRules({ drawdownType: e.target.value as AccountRules['drawdownType'] })}>
                <option value="static">Statik (başlangıçtan)</option>
                <option value="trailing">Trailing (zirveden)</option>
              </select>
            </label>
          </div>
        )}

        {!personal && (
          <div className="acct-col">
            <h4>İşlem günü</h4>
            <label className="acct-field" title="Kâr hedefi için gereken en az işlem günü sayısı (işlem açılan gün).">
              <span>Min. işlem günü</span>
              <input type="number" min={0} value={rules.minTradingDays} onChange={(e) => onRules({ minTradingDays: Math.max(0, Math.floor(Number(e.target.value)) || 0) })} />
            </label>
            <label className="acct-field">
              <span>Günlük sıfırlama</span>
              <select value={rules.resetMode ?? 'ny17'} onChange={(e) => onRules({ resetMode: e.target.value as AccountRules['resetMode'] })}>
                <option value="ny17">NY 17:00 (forex günü)</option>
                <option value="cet0">Avrupa gece yarısı (CE(S)T 00:00)</option>
              </select>
            </label>
          </div>
        )}
      </div>

      {!personal && (
        <div className="acct-summary">
          <h4>Kural özeti · {fmtMoney(balance)} hesap</h4>
          <dl>
            {a.target != null && (
              <>
                <dt>Hedef bakiye</dt>
                <dd className="pos">
                  {fmtMoney(a.target)} <small>(+{fmtMoney(a.targetGain!)})</small>
                </dd>
              </>
            )}
            {a.dailyLoss != null && (
              <>
                <dt>Günlük kayıp limiti</dt>
                <dd className="neg">
                  {fmtMoney(a.dailyLoss)} <small>({rules.resetMode === 'cet0' ? 'CE(S)T 00:00' : 'NY 17:00'}'de sıfırlanır)</small>
                </dd>
              </>
            )}
            {a.maxLoss != null && (
              <>
                <dt>Hesap patlama tabanı</dt>
                <dd className="neg">
                  {fmtMoney(a.floor!)} <small>({rules.drawdownType === 'trailing' ? `zirveden −${fmtMoney(a.maxLoss)}, en çok başlangıç seviyesine kadar yükselir` : `başlangıçtan −${fmtMoney(a.maxLoss)}`})</small>
                </dd>
              </>
            )}
            {rules.minTradingDays > 0 && (
              <>
                <dt>Min. işlem günü</dt>
                <dd>{rules.minTradingDays} gün</dd>
              </>
            )}
          </dl>
          <p className="hint">Limitler equity (açık pozisyon dahil) ile her dakika denetlenir; aşılırsa tüm pozisyonlar kapanır ve hesap patlar.</p>
        </div>
      )}

      {check.errors.map((m) => (
        <p key={m} className="hint neg">
          ✖ {m}
        </p>
      ))}
      {check.warnings.map((m) => (
        <p key={m} className="hint warn">
          ⚠ {m}
        </p>
      ))}
      <p className="hint">Hazır ayarlar genel örnektir, belirli bir firmanın kuralı değildir; firmanın güncel kurallarına göre alanları düzenle. Simüle edilmeyenler: slippage, swap / gece taşıma maliyeti, margin kontrolü ve stop-out.</p>
    </div>
  );
}
