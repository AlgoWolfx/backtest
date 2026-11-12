import { describe, expect, it } from 'vitest';
import type { HLine } from '../core/types';
import { BUILTIN_TEMPLATES, STYLE_KEYS, namedTemplateOf } from './drawingTemplates';

describe('hazır ICT şablonları', () => {
  it('yalnızca o türün stil alanlarını ve etiketi yazar', () => {
    for (const [type, list] of Object.entries(BUILTIN_TEMPLATES)) {
      const allowed = new Set([...STYLE_KEYS[type as keyof typeof STYLE_KEYS], 'text']);
      for (const t of list!) {
        expect(t.style.text).toBe(t.name);
        for (const k of Object.keys(t.style)) expect(allowed.has(k), `${type}/${t.name}: ${k}`).toBe(true);
      }
    }
  });
  it('adlar tür içinde tekil', () => {
    for (const list of Object.values(BUILTIN_TEMPLATES)) expect(new Set(list!.map((t) => t.name)).size).toBe(list!.length);
  });
  it('adlı şablon etiketi de saklar, koordinatları saklamaz', () => {
    const d: HLine = { id: 'd1', type: 'hline', p: 1.1, t: 100, color: '#f23645', width: 1, text: 'PDH' };
    expect(namedTemplateOf(d)).toEqual({ color: '#f23645', width: 1, text: 'PDH' });
  });
});

describe('şablon listesi kullanıcınındır', () => {
  it('hazırlarla başlar; üzerine yaz, sil, geri yükle', async () => {
    const mem = new Map<string, string>();
    const { vi } = await import('vitest');
    vi.stubGlobal('localStorage', { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => void mem.set(k, v), removeItem: (k: string) => void mem.delete(k) });
    const { loadNamed, saveNamed, deleteNamed, restoreBuiltins } = await import('./drawingTemplates');
    const n0 = BUILTIN_TEMPLATES.hline!.length;
    expect(loadNamed('hline').map((t) => t.name)).toEqual(BUILTIN_TEMPLATES.hline!.map((t) => t.name));
    saveNamed('hline', 'PDH', { color: '#ffffff', text: 'PDH' }); // hazırı değiştir: yerinde güncellenir
    expect(loadNamed('hline')[0]).toEqual({ name: 'PDH', style: { color: '#ffffff', text: 'PDH' } });
    saveNamed('hline', 'London Low', { color: '#000000', text: 'London Low' });
    deleteNamed('hline', 'SSL');
    expect(loadNamed('hline').length).toBe(n0); // +1 eklendi, -1 silindi
    restoreBuiltins('hline');
    const after = loadNamed('hline');
    expect(after.length).toBe(n0 + 1);
    expect(after[0].style.color).toBe('#f23645');
    expect(after.some((t) => t.name === 'SSL')).toBe(true);
    expect(after.at(-1)!.name).toBe('London Low');
    // hazırların kendisi bozulmaz
    expect(BUILTIN_TEMPLATES.hline![0].style.color).toBe('#f23645');
    vi.unstubAllGlobals();
  });
});

describe('şablon menüsü grupları', () => {
  it('her hazır şablonun açıklaması ve grubu var', async () => {
    const { TEMPLATE_INFO } = await import('./drawingTemplates');
    for (const list of Object.values(BUILTIN_TEMPLATES)) for (const t of list!) expect(TEMPLATE_INFO[t.name]?.desc, t.name).toBeTruthy();
  });
  it('kendi şablonlarım en üstte, hazırlar gruplarında sırası korunarak', async () => {
    const { groupNamed, MY_GROUP } = await import('./drawingTemplates');
    const g = groupNamed([...BUILTIN_TEMPLATES.hline!, { name: 'Asya high', style: {} }]);
    expect(g.map((x) => x.group)).toEqual([MY_GROUP, 'Önceki gün / hafta / ay', 'Likidite', 'Piyasa yapısı']);
    expect(g[0].items.map((t) => t.name)).toEqual(['Asya high']);
    expect(g[1].items.map((t) => t.name)).toEqual(['PDH', 'PDL', 'PWH', 'PWL', 'PMH', 'PML', 'Midnight Open']);
  });
});
