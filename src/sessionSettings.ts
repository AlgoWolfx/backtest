// GERALT seans göstergesi ayarlarının tarayıcıda saklanması (grafik temasıyla aynı yaklaşım: tüm oturumlarda geçerli).

import {
  DEFAULT_SESSION_SETTINGS,
  DEFAULT_SESSIONS,
  parseHm,
  type LabelPos,
  type LabelSize,
  type LabelVPos,
  type LineStyleName,
  type SessionDef,
  type SessionSettings,
  type TdoSettings,
} from './core/sessions';

const KEY = 'backtest.geraltSessions';

const STYLES: LineStyleName[] = ['Solid', 'Dashed', 'Dotted'];
const POS: LabelPos[] = ['Sağ', 'Başlangıç'];
const VPOS: LabelVPos[] = ['Otomatik', 'Üst', 'Alt', 'Seviye'];
const SIZES: LabelSize[] = ['Tiny', 'Small', 'Normal', 'Large', 'Huge'];

const bool = (v: unknown, def: boolean) => (typeof v === 'boolean' ? v : def);
const num = (v: unknown, min: number, max: number, def: number) => (typeof v === 'number' && Number.isFinite(v) ? Math.min(max, Math.max(min, Math.round(v))) : def);
const pick = <T extends string>(v: unknown, opts: readonly T[], def: T): T => (opts.includes(v as T) ? (v as T) : def);
const color = (v: unknown, def: string) => (typeof v === 'string' && /^#[0-9a-fA-F]{6}$/.test(v) ? v : def);
const text = (v: unknown, def: string, max = 32) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : def);

function sanitizeTdo(raw: unknown): TdoSettings {
  const d = DEFAULT_SESSION_SETTINGS.tdo;
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  return {
    show: bool(r.show, d.show),
    days: num(r.days, 0, 10, d.days),
    color: color(r.color, d.color),
    pastColor: color(r.pastColor, d.pastColor),
    pastTransp: num(r.pastTransp, 0, 100, d.pastTransp),
    width: num(r.width, 1, 4, d.width),
    style: pick(r.style, STYLES, d.style),
    showLabel: bool(r.showLabel, d.showLabel),
    labelText: text(r.labelText, d.labelText),
    showHtf: bool(r.showHtf, d.showHtf),
  };
}

/** Bozuk / eski kayıtlara karşı alanları doğrular; geçersiz seans satırları atılır. */
export function sanitizeSessionSettings(raw: unknown): SessionSettings {
  const d = DEFAULT_SESSION_SETTINGS;
  if (!raw || typeof raw !== 'object') return d;
  const r = raw as Record<string, unknown>;
  const sessions: SessionDef[] = Array.isArray(r.sessions)
    ? (r.sessions as unknown[]).flatMap((x, i) => {
        if (!x || typeof x !== 'object') return [];
        const s = x as Record<string, unknown>;
        const start = typeof s.start === 'string' && parseHm(s.start) != null ? s.start : null;
        const end = typeof s.end === 'string' && parseHm(s.end) != null ? s.end : null;
        if (!start || !end) return [];
        const name = text(s.name, `Seans ${i + 1}`, 24);
        return [
          {
            id: typeof s.id === 'string' && s.id ? s.id : `s${i}`,
            name,
            show: bool(s.show, true),
            start,
            end,
            color: color(s.color, '#787b86'),
            highText: text(s.highText, `${name} High`),
            lowText: text(s.lowText, `${name} Low`),
          },
        ];
      })
    : DEFAULT_SESSIONS;
  return {
    enabled: bool(r.enabled, d.enabled),
    historyDays: num(r.historyDays, 1, 10, d.historyDays),
    lineWidth: num(r.lineWidth, 1, 4, d.lineWidth),
    lineStyle: pick(r.lineStyle, STYLES, d.lineStyle),
    maxTfMinutes: num(r.maxTfMinutes, 1, 240, d.maxTfMinutes),
    showLive: bool(r.showLive, d.showLive),
    liveBars: num(r.liveBars, 1, 20, d.liveBars),
    liveTransp: num(r.liveTransp, 0, 100, d.liveTransp),
    showBox: bool(r.showBox, d.showBox),
    boxTransp: num(r.boxTransp, 0, 100, d.boxTransp),
    boxBorderTransp: num(r.boxBorderTransp, 0, 100, d.boxBorderTransp),
    activeTransp: num(r.activeTransp, 0, 100, d.activeTransp),
    takenTransp: num(r.takenTransp, 0, 100, d.takenTransp),
    takenLabelTransp: num(r.takenLabelTransp, 0, 100, d.takenLabelTransp),
    showTakenLabels: bool(r.showTakenLabels, d.showTakenLabels),
    showLabels: bool(r.showLabels, d.showLabels),
    labelPos: pick(r.labelPos, POS, d.labelPos),
    labelVPos: pick(r.labelVPos, VPOS, d.labelVPos),
    labelSize: pick(r.labelSize, SIZES, d.labelSize),
    rightOffset: num(r.rightOffset, 0, 30, d.rightOffset),
    vOffsetTicks: num(r.vOffsetTicks, 0, 100, d.vOffsetTicks),
    sessions,
    tdo: sanitizeTdo(r.tdo),
  };
}

export function loadSessionSettings(): SessionSettings {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return sanitizeSessionSettings(JSON.parse(raw));
  } catch {
    /* depolama yok / bozuk: varsayılan */
  }
  return DEFAULT_SESSION_SETTINGS;
}

export function saveSessionSettings(s: SessionSettings) {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* kaydedilemedi */
  }
}
