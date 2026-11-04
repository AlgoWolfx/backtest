import { describe, expect, it } from 'vitest';
import { getSymbol } from '../../shared/symbols.js';
import { effectiveStepTf } from './replay';
import { widenStop } from './trading';

describe('adım zaman dilimi eşlemesi', () => {
  it('eşleme açıkken (veya alan yokken) grafiğin zaman dilimini kullanır', () => {
    expect(effectiveStepTf({ tf: '5m', stepTf: '1m' })).toBe('5m');
    expect(effectiveStepTf({ tf: '1h', stepTf: '1m', stepSync: true })).toBe('1h');
  });

  it('eşleme kapalıyken elle seçilen adımı kullanır', () => {
    expect(effectiveStepTf({ tf: '5m', stepTf: '1m', stepSync: false })).toBe('1m');
    expect(effectiveStepTf({ tf: '1D', stepTf: '15m', stepSync: false })).toBe('15m');
  });
});

describe('stop tamponu', () => {
  const eur = getSymbol('EURUSD');
  const us100 = getSymbol('US100');

  it('long stopunu aşağı, short stopunu yukarı genişletir', () => {
    expect(widenStop(eur, 'long', 1.0990, 5)).toBeCloseTo(1.0985, 8);
    expect(widenStop(eur, 'short', 1.1010, 5)).toBeCloseTo(1.1015, 8);
  });

  it('birim sembolün pip/puan ölçüsüdür', () => {
    expect(widenStop(us100, 'long', 20000, 10)).toBe(19990);
    expect(widenStop(getSymbol('USDJPY'), 'short', 150, 3)).toBeCloseTo(150.03, 8);
  });

  it('tampon 0, negatif veya geçersizse stopu değiştirmez', () => {
    expect(widenStop(eur, 'long', 1.099, 0)).toBe(1.099);
    expect(widenStop(eur, 'long', 1.099, -3)).toBe(1.099);
    expect(widenStop(eur, 'long', 1.099, NaN)).toBe(1.099);
  });
});
