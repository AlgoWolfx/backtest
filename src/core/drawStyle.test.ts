import { describe, expect, it } from 'vitest';
import { hexToRgba, rectFillCss } from '../chart/drawUtil';
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
