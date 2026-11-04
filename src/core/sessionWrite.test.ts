import { describe, expect, it } from 'vitest';
import { isStaleWrite } from '../../shared/sessionWrite.js';

describe('eski sekme koruması', () => {
  it('disk, sekmenin bildiği sürümden yeniyse yazılmaz', () => {
    // Sekme A 09:34 sürümünden devam ediyor; sekme B 12:36'da TP kapanışını kaydetti.
    expect(isStaleWrite({ updatedAt: 1_000_200 }, 1_000_100)).toBe(true);
  });
  it('aynı sürümden devam eden sekme yazar (yeni değişikliği updatedAt ileride olsa da)', () => {
    expect(isStaleWrite({ updatedAt: 1_000_100 }, 1_000_100)).toBe(false);
  });
  it('dosya yoksa, base yoksa ya da eski dosyada updatedAt yoksa denetlenmez', () => {
    expect(isStaleWrite(null, 5)).toBe(false);
    expect(isStaleWrite({ updatedAt: 9 }, null)).toBe(false);
    expect(isStaleWrite({}, 5)).toBe(false);
  });
});
