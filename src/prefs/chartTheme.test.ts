import { afterEach, describe, expect, it, vi } from 'vitest';
import { BUILTIN_CHART_TEMPLATES, DEFAULT_THEME, THEME_PRESETS, deleteChartTemplate, loadChartTemplates, loadTheme, saveChartTemplate, themeFromTemplate } from './chartTheme';

const mem = new Map<string, string>();
const stub = () => {
  mem.clear();
  vi.stubGlobal('localStorage', { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => void mem.set(k, v), removeItem: (k: string) => void mem.delete(k) });
};
afterEach(() => vi.unstubAllGlobals());

describe('grafik teması: ızgara yok', () => {
  it('varsayılan ve hazır temalarda ızgara alanı yok', () => {
    for (const k of ['grid', 'gridV', 'gridH']) {
      expect(k in DEFAULT_THEME).toBe(false);
      for (const p of THEME_PRESETS) expect(k in p.colors, p.name).toBe(false);
    }
  });
  it('eski kayıttaki ızgara ayarları atılır, diğer ayarlar korunur', () => {
    stub();
    mem.set('backtest.chartTheme', JSON.stringify({ grid: '#111', gridV: true, gridH: true, upBody: '#ffffff' }));
    const t = loadTheme();
    expect('gridV' in t).toBe(false);
    expect(t.upBody).toBe('#ffffff');
    expect(t.scaleLine).toBe(DEFAULT_THEME.scaleLine);
  });
});

describe('grafik şablonları', () => {
  it('kaydet, aynı adla üzerine yaz, uygula, sil', () => {
    stub();
    saveChartTemplate('ICT', { ...DEFAULT_THEME, upBody: '#ffffff' });
    saveChartTemplate('ICT', { ...DEFAULT_THEME, upBody: '#000000' });
    const list = loadChartTemplates();
    expect(list).toHaveLength(1);
    expect(themeFromTemplate(list[0]).upBody).toBe('#000000');
    // eski şablon: eksik alanlar varsayılandan, ızgara yok sayılır
    expect(themeFromTemplate({ name: 'eski', theme: { gridV: true, downBody: '#123456' } as never })).toEqual({ ...DEFAULT_THEME, downBody: '#123456' });
    deleteChartTemplate('ICT');
    expect(loadChartTemplates()).toEqual([]);
  });
});

describe('hazır grafik şablonu', () => {
  it('"TradingView ayarım" tam bir tema verir: gri arka plan, mavi / siyah mum, siyah kenar ve fitil', () => {
    const tpl = BUILTIN_CHART_TEMPLATES.find((x) => x.name === 'TradingView ayarım')!;
    const t = themeFromTemplate(tpl);
    expect(t).toMatchObject({ background: '#636363', upBody: '#2962ff', downBody: '#000000', borderVisible: true, upWick: '#000000', text: '#000000', fontSize: 14, marginTop: 10, marginBottom: 8, rightOffset: 10 });
    expect(Object.keys(t).sort()).toEqual(Object.keys(DEFAULT_THEME).sort());
  });
});
