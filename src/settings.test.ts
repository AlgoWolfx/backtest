import { describe, expect, it } from 'vitest';
import { DEFAULT_SESSION_SETTINGS } from './core/sessions';
import type { Rect } from './core/types';
import { loadRectTemplate, rectTemplateOf } from './drawingTemplates';
import { sanitizeSessionSettings } from './sessionSettings';

describe('seans ayarları doğrulaması', () => {
  it('geçersiz kayıt varsayılana döner', () => {
    expect(sanitizeSessionSettings(null)).toEqual(DEFAULT_SESSION_SETTINGS);
    expect(sanitizeSessionSettings('x')).toEqual(DEFAULT_SESSION_SETTINGS);
  });

  it('sınırlar uygulanır, geçersiz seçenekler varsayılana döner', () => {
    const s = sanitizeSessionSettings({ historyDays: 99, lineWidth: 0, lineStyle: 'Wavy', labelSize: 'Huge', boxTransp: 150, rightOffset: -5 });
    expect(s.historyDays).toBe(10);
    expect(s.lineWidth).toBe(1);
    expect(s.lineStyle).toBe('Solid');
    expect(s.labelSize).toBe('Huge');
    expect(s.boxTransp).toBe(100);
    expect(s.rightOffset).toBe(0);
  });

  it('geçersiz saatli / eksik seans satırları atılır, geçerliler korunur', () => {
    const s = sanitizeSessionSettings({
      sessions: [
        { id: 'a', name: 'İyi', start: '08:00', end: '09:00', color: '#112233', highText: 'H', lowText: 'L' },
        { id: 'b', name: 'Kötü', start: '25:00', end: '09:00' },
        null,
      ],
    });
    expect(s.sessions.map((x) => x.id)).toEqual(['a']);
    expect(s.sessions[0].color).toBe('#112233');
  });
});

describe('dikdörtgen şablonu', () => {
  const rect: Rect = { id: 'r', type: 'rect', color: '#2962ff', width: 2, fill: 'rgba(0,0,0,.1)', a: { t: 1, p: 1 }, b: { t: 2, p: 2 }, text: 'gizli', hiddenTfs: ['1m'], fillAlpha: 0.3, bold: true, midline: true };

  it('yalnızca stil alanları şablona girer (koordinat, metin ve görünürlük girmez)', () => {
    const t = rectTemplateOf(rect) as Record<string, unknown>;
    expect(t.width).toBe(2);
    expect(t.fillAlpha).toBe(0.3);
    expect(t.bold).toBe(true);
    expect(t.midline).toBe(true);
    expect('a' in t || 'text' in t || 'hiddenTfs' in t || 'id' in t).toBe(false);
  });

  it('depolama yokken (test ortamı) boş şablon döner', () => {
    expect(loadRectTemplate()).toEqual({});
  });
});
