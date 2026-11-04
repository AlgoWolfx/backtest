import { describe, expect, it } from 'vitest';
import { newAccount, snapshot, type AccountRules } from './account';

const rules: AccountRules = { type: 'prop', profitTargetPct: null, dailyLossPct: 5, maxLossPct: 10, drawdownType: 'static', minTradingDays: 0 } as AccountRules;
const t0 = 1736146800; // Pzt 6 Oca 2025, NY 02:00

describe('hesap göstergeleri (snapshot)', () => {
  it('kârlı TP sonrası kayıp 0, K/Z pozitif görünür', () => {
    const s = snapshot(newAccount(rules, 100000, t0), 100000, t0 + 3600, 101692.78, 101692.78);
    expect(s.daily).toMatchObject({ used: 0, limit: 5000 });
    expect(s.daily!.pnl).toBeCloseTo(1692.78);
    expect(s.max).toMatchObject({ used: 0, limit: 10000 });
    expect(s.max!.pnl).toBeCloseTo(1692.78);
  });
  it('açık zarar kullanılan limite ve negatif K/Z ye yansır', () => {
    const s = snapshot(newAccount(rules, 100000, t0), 100000, t0 + 60, 100000, 99752.22);
    expect(s.daily!.used).toBeCloseTo(247.78);
    expect(s.daily!.pnl).toBeCloseTo(-247.78);
    expect(s.max!.used).toBeCloseTo(247.78);
    expect(s.max!.pnl).toBeCloseTo(-247.78);
  });
});
