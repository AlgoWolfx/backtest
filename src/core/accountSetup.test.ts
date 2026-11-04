import { describe, expect, it } from 'vitest';
import { ACCOUNT_GROUPS, ACCOUNT_PRESETS, groupOf, presetOf, ruleAmounts, validateRules, type AccountRules } from './account';

const base: AccountRules = { type: 'prop', profitTargetPct: 10, dailyLossPct: 5, maxLossPct: 10, drawdownType: 'static', minTradingDays: 4 };

describe('hazır hesap türleri', () => {
  it('kimlikler benzersiz, her grup en az bir hazır ayara sahip', () => {
    expect(new Set(ACCOUNT_PRESETS.map((p) => p.id)).size).toBe(ACCOUNT_PRESETS.length);
    for (const g of ACCOUNT_GROUPS) expect(ACCOUNT_PRESETS.some((p) => p.group === g.id)).toBe(true);
  });
  it('her hazır ayar kendi grubuyla tutarlı ve geçerli', () => {
    for (const p of ACCOUNT_PRESETS) {
      expect(groupOf(p.rules)).toBe(p.group);
      expect(validateRules(p.rules, 100_000).errors, p.id).toEqual([]);
      expect(validateRules(p.rules, 100_000).warnings, p.id).toEqual([]);
    }
  });
  it('presetOf: resetMode varsayılanı farkı eşleşmeyi bozmaz, özel kural bulunamaz', () => {
    const p = ACCOUNT_PRESETS.find((x) => x.id === 'prop-2s-p1')!;
    expect(presetOf({ ...p.rules, resetMode: 'ny17' })?.id).toBe('prop-2s-p1');
    expect(presetOf({ ...p.rules, dailyLossPct: 4 })).toBeUndefined();
    expect(presetOf({ ...p.rules, resetMode: 'cet0' })).toBeUndefined();
  });
});

describe('ruleAmounts', () => {
  it('dolar karşılıkları kuruşa yuvarlanır (kayan nokta hatası yok)', () => {
    const a = ruleAmounts(base, 100_000);
    expect(a.target).toBe(110_000);
    expect(a.targetGain).toBe(10_000);
    expect(a.dailyLoss).toBe(5_000);
    expect(a.maxLoss).toBe(10_000);
    expect(a.floor).toBe(90_000);
  });
  it('olmayan kural null', () => {
    const a = ruleAmounts({ ...base, profitTargetPct: null, maxLossPct: null }, 50_000);
    expect(a.target).toBeNull();
    expect(a.floor).toBeNull();
    expect(a.dailyLoss).toBe(2_500);
  });
});

describe('validateRules', () => {
  it('geçersiz yüzde ve küçük bakiye hata verir', () => {
    expect(validateRules({ ...base, dailyLossPct: 0 }, 100_000).errors.length).toBe(1);
    expect(validateRules({ ...base, maxLossPct: 100 }, 100_000).errors.length).toBe(1);
    expect(validateRules(base, 50).errors.length).toBe(1);
    expect(validateRules(base, NaN).errors.length).toBe(1);
  });
  it('trailing, maks. kayıp olmadan hata', () => {
    expect(validateRules({ ...base, maxLossPct: null, drawdownType: 'trailing' }, 100_000).errors.length).toBe(1);
  });
  it('tutarsız ama geçerli kurallar uyarı verir', () => {
    expect(validateRules({ ...base, dailyLossPct: 12 }, 100_000).warnings.length).toBe(1);
    expect(validateRules({ ...base, dailyLossPct: null, maxLossPct: null }, 100_000).warnings.length).toBe(1);
    expect(validateRules({ ...base, profitTargetPct: null }, 100_000).warnings.length).toBe(1);
  });
  it('kişisel hesap kuralsız geçerli ve uyarısız', () => {
    const r: AccountRules = { type: 'personal', profitTargetPct: null, dailyLossPct: null, maxLossPct: null, drawdownType: 'static', minTradingDays: 0 };
    expect(validateRules(r, 100_000)).toEqual({ errors: [], warnings: [] });
  });
});
