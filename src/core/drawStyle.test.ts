import { describe, expect, it } from 'vitest';
import { hexToRgba, rectEdgePatch, rectFillCss } from '../chart/drawUtil';
import { STYLE_KEYS, TOOL_DEFAULTS, factoryReset } from '../prefs/drawingTemplates';
import { DEFAULT_FIB } from './types';

describe('rectFillCss', () => {
  it('kapalıysa null', () => {
    expect(rectFillCss({ color: '#2962ff', fillOn: false })).toBeNull();
    expect(rectFillCss({ color: '#2962ff', fillAlpha: 0 })).toBeNull();
  });

  it('eski kayıt (yalnızca fill): kayıtlı fill kullanılır', () => {
    expect(rectFillCss({ color: '#2962ff', fill: 'rgba(1,2,3,0.4)' })).toBe('rgba(1,2,3,0.4)');
  });

  it('gömülü opaklığı 0 olan fill, arkaplan açılınca görünmez kalmaz', () => {
    // araç çubuğunda opaklık 0 -> fill 'rgba(...,0)'; sonra ayarlardan arkaplan açılır (fillAlpha 0.15, fillOn true)
    const css = rectFillCss({ color: '#2962ff', fill: hexToRgba('#2962ff', 0), fillOn: true, fillAlpha: 0.15 });
    expect(css).toBe('rgba(41,98,255,0.15)');
  });

  it('fabrika ayarı sonrası (fill silinmiş) varsayılan renk ve 0.15 opaklık', () => {
    expect(rectFillCss({ color: '#2962ff', fill: undefined })).toBe('rgba(41,98,255,0.15)');
  });

  it('fillColor, çizim renginden önceliklidir', () => {
    expect(rectFillCss({ color: '#2962ff', fillColor: '#ff0000', fillAlpha: 0.5 })).toBe('rgba(255,0,0,0.5)');
  });
});

describe('factoryReset', () => {
  it.each(['rect', 'trend', 'hline', 'vline', 'text', 'fib', 'long', 'short'] as const)('%s: renk ve kalınlık tanımsız kalmaz', (type) => {
    const r = factoryReset(type, DEFAULT_FIB);
    expect(r.color).toBe(TOOL_DEFAULTS[type].color);
    expect(r.width).toBe(TOOL_DEFAULTS[type].width);
    for (const k of STYLE_KEYS[type]) if (k !== 'color' && k !== 'width' && k !== 'levels' && k !== 'fill') expect(r[k]).toBeUndefined();
  });

  it('fib: seviyeler varsayılana döner (kopya)', () => {
    const r = factoryReset('fib', DEFAULT_FIB);
    expect(r.levels).toEqual(DEFAULT_FIB);
    expect(r.levels).not.toBe(DEFAULT_FIB);
  });

  it('long/short opaklıkları ayrı alanlar olarak şablona girer', () => {
    for (const t of ['long', 'short'] as const) {
      expect(STYLE_KEYS[t]).toContain('profitAlpha');
      expect(STYLE_KEYS[t]).toContain('lossAlpha');
    }
    expect(STYLE_KEYS.fib).toContain('bgColor');
  });
});

describe('rectEdgePatch (kenar tutamaçları)', () => {
  const a = { t: 100, p: 1.2 }; // yüksek fiyat, erken zaman
  const b = { t: 200, p: 1.1 }; // düşük fiyat, geç zaman
  const to = { t: 150, p: 1.25 };

  it('üst kenar: yüksek fiyatlı noktanın fiyatı değişir, zamanlar sabit', () => {
    expect(rectEdgePatch(a, b, 'top', to)).toEqual({ a: { t: 100, p: 1.25 } });
    expect(rectEdgePatch(a, b, 'bottom', { t: 150, p: 1.05 })).toEqual({ b: { t: 200, p: 1.05 } });
  });
  it('sol / sağ kenar: erken / geç zamanlı noktanın zamanı değişir, fiyatlar sabit', () => {
    expect(rectEdgePatch(a, b, 'left', to)).toEqual({ a: { t: 150, p: 1.2 } });
    expect(rectEdgePatch(a, b, 'right', { t: 300, p: 9 })).toEqual({ b: { t: 300, p: 1.1 } });
  });
  it('a ve b ters çizilmiş olsa da aynı kenar çekilir', () => {
    // b yüksek ve erken, a düşük ve geç
    const a2 = { t: 200, p: 1.1 };
    const b2 = { t: 100, p: 1.2 };
    expect(rectEdgePatch(a2, b2, 'top', to)).toEqual({ b: { t: 100, p: 1.25 } });
    expect(rectEdgePatch(a2, b2, 'left', to)).toEqual({ b: { t: 150, p: 1.2 } });
    expect(rectEdgePatch(a2, b2, 'bottom', to)).toEqual({ a: { t: 200, p: 1.25 } });
    expect(rectEdgePatch(a2, b2, 'right', to)).toEqual({ a: { t: 150, p: 1.1 } });
  });
});
