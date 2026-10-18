// GERALT Session Liquidity (geralt.pine v1.1.0) mantığının saf (testli) uyarlaması.
//
// Pine göstergesindeki davranışlar:
//   - Her seans için killzone KUTUSU: seans high/low aralığını kaplar, seans boyunca büyür.
//   - Seans açıkken güncel high/low, sağda kısa "canlı" çizgilerle gösterilir.
//   - Seans bitince high ve low LİKİDİTE çizgileri oluşur: extreme mumdan başlar, sağa uzar;
//     fiyat düzeye değince (high >= seviye, low <= seviye) çizgi o mumda biter ve silikleşir.
//   - Seviyeler ve kutular oluştuktan `historyDays` gün sonra silinir.
//   - True Day Open: seçili saat diliminde günün ilk mumunun açılışı; bugün + geçmiş günler.
//   - Yalnızca belirlenen zaman dilimi ve altında çalışır (varsayılan 15 dk).
//
// Replay'e uyum: tüm hesaplar yalnızca replay zamanına kadar AÇIKLANMIŞ 1m mumlardan yapılır
// (devam eden seansın high/low'u o ana kadarki değerdir; sweep yalnızca açıklanmış mumlara göre işaretlenir).
// Pine'daki "timenow" yerine replay zamanı kullanılır. Saat dilimi America/New_York'tur (yaz/kış otomatik).

import { DAY, nyLocalToUtc, toNyLocal } from '../../shared/nytime.js';
import { upperBound, type M1Data } from './data';

export type LineStyleName = 'Solid' | 'Dashed' | 'Dotted';
export type LabelPos = 'Sağ' | 'Başlangıç';
export type LabelVPos = 'Otomatik' | 'Üst' | 'Alt' | 'Seviye';
export type LabelSize = 'Tiny' | 'Small' | 'Normal' | 'Large' | 'Huge';

export interface SessionDef {
  id: string;
  name: string;
  show: boolean;
  /** NY saati "HH:MM" */
  start: string;
  end: string;
  color: string;
  highText: string;
  lowText: string;
}

export interface TdoSettings {
  show: boolean;
  /** Bugüne ek olarak gösterilecek geçmiş gün sayısı (0-10) */
  days: number;
  color: string;
  pastColor: string;
  pastTransp: number;
  width: number;
  style: LineStyleName;
  showLabel: boolean;
  labelText: string;
  /** Seanslar için izin verilen zaman diliminden büyük (4 saate kadar) grafiklerde de göster */
  showHtf: boolean;
}

/** geralt.pine girdilerinin birebir karşılığı (Pine'daki şeffaflık: 0 = opak, 100 = görünmez). */
export interface SessionSettings {
  /** Göstergenin ana anahtarı */
  enabled: boolean;
  // General
  historyDays: number;
  lineWidth: number;
  lineStyle: LineStyleName;
  /** En yüksek zaman dilimi (dakika); Pine'da 15 */
  maxTfMinutes: number;
  // Live Session
  showLive: boolean;
  liveBars: number;
  liveTransp: number;
  // Killzone Box
  showBox: boolean;
  boxTransp: number;
  boxBorderTransp: number;
  // Liquidity Appearance
  activeTransp: number;
  takenTransp: number;
  takenLabelTransp: number;
  showTakenLabels: boolean;
  // Labels
  showLabels: boolean;
  labelPos: LabelPos;
  labelVPos: LabelVPos;
  labelSize: LabelSize;
  rightOffset: number;
  vOffsetTicks: number;
  sessions: SessionDef[];
  tdo: TdoSettings;
}

/** geralt.pine varsayılan seans saatleri ve renkleri (rgb -> hex). */
export const DEFAULT_SESSIONS: SessionDef[] = [
  { id: 'asia', name: 'Asia', show: true, start: '20:00', end: '00:00', color: '#4682ff', highText: 'Asia High', lowText: 'Asia Low' },
  { id: 'london', name: 'London', show: true, start: '02:00', end: '05:00', color: '#ff5a5a', highText: 'London High', lowText: 'London Low' },
  { id: 'nyam', name: 'New York AM', show: true, start: '09:30', end: '12:00', color: '#28c8a0', highText: 'NY AM High', lowText: 'NY AM Low' },
  { id: 'nylunch', name: 'New York Lunch', show: true, start: '12:00', end: '13:00', color: '#dcb446', highText: 'NY Lunch High', lowText: 'NY Lunch Low' },
  { id: 'nypm', name: 'New York PM', show: true, start: '13:30', end: '16:00', color: '#b464dc', highText: 'NY PM High', lowText: 'NY PM Low' },
  { id: 'cbdr', name: 'CBDR', show: true, start: '14:00', end: '20:00', color: '#a0a0a0', highText: 'CBDR High', lowText: 'CBDR Low' },
];

export const DEFAULT_SESSION_SETTINGS: SessionSettings = {
  enabled: true,
  historyDays: 3,
  lineWidth: 1,
  lineStyle: 'Solid',
  maxTfMinutes: 15,
  showLive: true,
  liveBars: 4,
  liveTransp: 15,
  showBox: true,
  boxTransp: 85,
  boxBorderTransp: 60,
  activeTransp: 0,
  takenTransp: 80,
  takenLabelTransp: 80,
  showTakenLabels: true,
  showLabels: true,
  labelPos: 'Sağ',
  labelVPos: 'Otomatik',
  labelSize: 'Small',
  rightOffset: 2,
  vOffsetTicks: 5,
  sessions: DEFAULT_SESSIONS,
  tdo: { show: true, days: 3, color: '#ffa500', pastColor: '#a0a0a0', pastTransp: 50, width: 1, style: 'Dashed', showLabel: true, labelText: 'True Day Open', showHtf: true },
};

/** "HH:MM" -> gün başından dakika; geçersizse null. */
export function parseHm(s: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(s.trim());
  if (!m) return null;
  const h = +m[1];
  const mi = +m[2];
  return h < 24 && mi < 60 ? h * 60 + mi : null;
}

export const fmtHm = (min: number) => `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;

/** Pine şeffaflığı (0 opak, 100 görünmez) -> canvas alfa. */
export const alphaOf = (transp: number) => Math.max(0, Math.min(1, 1 - transp / 100));

export interface Window {
  start: number;
  end: number;
}

/**
 * Bir seansın [from, to] ile kesişen pencereleri (UTC). Bitiş <= başlangıçsa seans gece yarısını aşar
 * (Asya 20:00-00:00 gibi; Pine'daki "2000-0000" ile aynı).
 */
export function sessionWindows(def: Pick<SessionDef, 'start' | 'end'>, from: number, to: number): Window[] {
  const sMin = parseHm(def.start);
  const eMin = parseHm(def.end);
  if (sMin == null || eMin == null || sMin === eMin) return [];
  const out: Window[] = [];
  const d0 = Math.floor(toNyLocal(from) / DAY) - 1;
  const d1 = Math.floor(toNyLocal(to) / DAY);
  for (let d = d0; d <= d1; d++) {
    const start = nyLocalToUtc(d * DAY + sMin * 60);
    const end = nyLocalToUtc(d * DAY + (eMin > sMin ? eMin : eMin + 24 * 60) * 60);
    if (end > from && start < to) out.push({ start, end });
  }
  return out;
}

export interface RangeStats {
  /** Pencerede açıklanmış mum sayısı */
  n: number;
  hi: number;
  lo: number;
  /** high / low'un oluştuğu mumun başlangıcı (UTC) */
  hiAt: number;
  loAt: number;
  /** Penceredeki ilk ve son açıklanmış mumun başlangıcı */
  firstT: number;
  lastT: number;
}

/**
 * [start, end) penceresinde, replayTime'a kadar AÇIKLANMIŞ 1m mumların (bid) high/low'u.
 * Eşit high/low'da ilk oluşan mum alınır (Pine'da `>` ile güncellenir). Veri yoksa null.
 */
export function rangeStats(d: M1Data, start: number, end: number, replayTime: number): RangeStats | null {
  const i0 = upperBound(d.t, start - 1); // start'tan itibaren ilk mum
  const i1 = upperBound(d.t, Math.min(end, replayTime) - 60); // t + 60 <= min(end, replayTime)
  if (i1 <= i0) return null;
  let hi = -Infinity;
  let lo = Infinity;
  let hiAt = 0;
  let loAt = 0;
  for (let i = i0; i < i1; i++) {
    if (d.h[i] > hi) {
      hi = d.h[i];
      hiAt = d.t[i];
    }
    if (d.l[i] < lo) {
      lo = d.l[i];
      loAt = d.t[i];
    }
  }
  return { n: i1 - i0, hi: hi / d.scale, lo: lo / d.scale, hiAt, loAt, firstT: d.t[i0], lastT: d.t[i1 - 1] };
}

/** Sweep takibi için artımlı tarama durumu. */
export interface SweepState {
  /** Sonraki taranacak mum indeksi */
  next: number;
  /** Seviyeyi alan mumun başlangıcı; yok = henüz alınmadı */
  at: number | null;
}

/**
 * Seviyenin alındığı ilk açıklanmış mumu arar (Pine: high >= seviye / low <= seviye; dokunuş da "alındı" sayılır).
 * [fromT, limitT) ve replayTime ile sınırlıdır; durum artımlıdır. Replay geri alındıysa (alan mum artık açıklanmamışsa)
 * sıfırlanır.
 */
export function advanceSweep(d: M1Data, st: SweepState | undefined, isHigh: boolean, level: number, fromT: number, limitT: number, replayTime: number): SweepState {
  let s = st;
  if (!s || (s.at != null && s.at + 60 > replayTime)) s = { next: upperBound(d.t, fromT - 1), at: null };
  if (s.at != null) return s;
  const end = upperBound(d.t, Math.min(limitT, replayTime) - 60);
  if (s.next > end) s = { next: upperBound(d.t, fromT - 1), at: null };
  const lv = Math.round(level * d.scale);
  for (let i = s.next; i < end; i++) {
    if (isHigh ? d.h[i] >= lv : d.l[i] <= lv) return { next: i + 1, at: d.t[i] };
  }
  return { next: end, at: null };
}

// ---------------------------------------------------------------- hesaplanan öğeler

/** Killzone kutusu: seans high/low aralığı, seans başlangıcından son açıklanmış muma kadar. */
export interface BoxItem {
  def: SessionDef;
  /** İlk ve son açıklanmış seans mumunun başlangıcı */
  firstT: number;
  lastT: number;
  hi: number;
  lo: number;
  inProgress: boolean;
}

/** Seans açıkken sağda kısa canlı çizgi çizilen güncel high/low. */
export interface LiveItem {
  def: SessionDef;
  hi: number;
  lo: number;
}

/** Bitmiş seansın likidite seviyesi. */
export interface LevelItem {
  id: string;
  def: SessionDef;
  isHigh: boolean;
  price: number;
  text: string;
  /** Extreme mumun başlangıcı: çizgi buradan başlar */
  startT: number;
  /** Seviyeyi alan mum; null = hâlâ aktif (sağa uzar) */
  takenAt: number | null;
}

export interface TdoItem {
  /** Günün ilk açıklanmış mumu */
  from: number;
  /** Geçmiş günlerde günün son mumunun bitişi; bugün için null (sağa uzar) */
  to: number | null;
  price: number;
  today: boolean;
}

export interface Overlay {
  boxes: BoxItem[];
  live: LiveItem[];
  levels: LevelItem[];
  tdo: TdoItem[];
}

export const EMPTY_OVERLAY: Overlay = { boxes: [], live: [], levels: [], tdo: [] };

/** Sweep durumları önbelleği; M1Data başına tutulur. */
export type OverlayCache = Map<string, SweepState>;
const caches = new WeakMap<M1Data, OverlayCache>();
export function overlayCache(d: M1Data): OverlayCache {
  let c = caches.get(d);
  if (!c) caches.set(d, (c = new Map()));
  return c;
}

/** Seanslar bu zaman diliminde çalışır mı? (Pine: allowedTF) */
export const sessionsAllowedTf = (s: SessionSettings, tfSeconds: number) => tfSeconds <= s.maxTfMinutes * 60;
/** True Day Open bu zaman diliminde görünür mü? (Pine: tdoActive) */
export const tdoAllowedTf = (s: SessionSettings, tfSeconds: number) => s.tdo.show && (sessionsAllowedTf(s, tfSeconds) || (s.tdo.showHtf && tfSeconds > s.maxTfMinutes * 60 && tfSeconds <= 4 * 3600));

/** NY takvim günü numarası (00:00 NY sınırı). */
const nyDayNo = (t: number) => Math.floor(toNyLocal(t) / DAY);

function tdoItems(d: M1Data, s: SessionSettings, replayTime: number): TdoItem[] {
  const out: TdoItem[] = [];
  const iLast = upperBound(d.t, replayTime - 60); // açıklanmış mum sayısı
  if (iLast <= 0) return out;
  let day = nyDayNo(d.t[iLast - 1]);
  const want = Math.max(0, Math.min(10, Math.round(s.tdo.days))) + 1;
  // Pine'da yeni gün çizgisi, günün ilk mumunda açılır; veri olmayan günler (hafta sonu) atlanır.
  for (let back = 0; out.length < want && back < 30; back++, day--) {
    const dayStart = nyLocalToUtc(day * DAY);
    const dayEnd = nyLocalToUtc((day + 1) * DAY);
    const i0 = upperBound(d.t, dayStart - 1);
    const i1 = Math.min(upperBound(d.t, dayEnd - 1), iLast);
    if (i1 <= i0) continue;
    const today = out.length === 0;
    out.push({ from: d.t[i0], to: today ? null : d.t[i1 - 1] + 60, price: d.o[i0] / d.scale, today });
  }
  return out;
}

/**
 * Göstergenin çizeceği her şeyi replay zamanına göre hesaplar (hepsi yalnızca açıklanmış veriden).
 * tfSeconds: grafiğin zaman dilimi (izin verilen aralığın dışında boş döner).
 */
export function computeOverlay(d: M1Data, s: SessionSettings, replayTime: number, tfSeconds: number, cache: OverlayCache = overlayCache(d)): Overlay {
  if (!s.enabled) return EMPTY_OVERLAY;
  const boxes: BoxItem[] = [];
  const live: LiveItem[] = [];
  const levels: LevelItem[] = [];
  const hist = Math.max(1, Math.round(s.historyDays)) * DAY;

  if (sessionsAllowedTf(s, tfSeconds)) {
    for (const def of s.sessions) {
      if (!def.show) continue;
      // Pencere: replay'den historyDays + 1 gün geriye kadar (seans uzunluğu için pay)
      for (const w of sessionWindows(def, replayTime - hist - DAY, replayTime)) {
        if (w.start >= replayTime) continue; // henüz başlamamış
        const finished = w.end <= replayTime;
        // Bitmiş seans: oluşumundan (seans bitişi) historyDays geçtiyse silinir
        if (finished && replayTime - w.end > hist) continue;
        const st = rangeStats(d, w.start, w.end, replayTime);
        if (!st) continue;
        if (s.showBox) boxes.push({ def, firstT: st.firstT, lastT: st.lastT, hi: st.hi, lo: st.lo, inProgress: !finished });
        if (!finished) {
          if (s.showLive) live.push({ def, hi: st.hi, lo: st.lo });
          continue;
        }
        for (const isHigh of [true, false]) {
          const price = isHigh ? st.hi : st.lo;
          const key = `${def.id}:${w.start}:${isHigh ? 'h' : 'l'}`;
          const sw = advanceSweep(d, cache.get(key), isHigh, price, w.end, Math.min(replayTime, w.end + hist), replayTime);
          cache.set(key, sw);
          levels.push({ id: key, def, isHigh, price, text: isHigh ? def.highText : def.lowText, startT: isHigh ? st.hiAt : st.loAt, takenAt: sw.at });
        }
      }
    }
  }
  const tdo = tdoAllowedTf(s, tfSeconds) ? tdoItems(d, s, replayTime) : [];
  return { boxes, live, levels, tdo };
}

// ---------------------------------------------------------------- seans seans ilerleme

export interface Boundary {
  /** NY saati */
  h: number;
  m: number;
  label: string;
  kind: 'start' | 'end';
  sessionId: string;
}

/** Görünür seansların başlangıç ve bitişleri (NY saati), gün içi sıralı. */
export function sessionBoundaries(s: Pick<SessionSettings, 'sessions'>): Boundary[] {
  const out: Boundary[] = [];
  for (const def of s.sessions) {
    if (!def.show) continue;
    for (const kind of ['start', 'end'] as const) {
      const min = parseHm(def[kind]);
      if (min == null) continue;
      out.push({ h: Math.floor(min / 60), m: min % 60, kind, sessionId: def.id, label: `${def.name} ${kind === 'start' ? 'başlangıcı' : 'bitişi'} ${fmtHm(min)}` });
    }
  }
  return out.sort((a, b) => a.h * 60 + a.m - (b.h * 60 + b.m) || (a.kind === 'end' ? -1 : 1));
}

/** replayTime'dan sonraki ilk seans sınırı (gün içi sıra; gün aşımında ilkine döner). */
export function nextBoundary(s: Pick<SessionSettings, 'sessions'>, replayTime: number): Boundary | null {
  const bs = sessionBoundaries(s);
  if (!bs.length) return null;
  const nowMin = Math.floor((((toNyLocal(replayTime) % DAY) + DAY) % DAY) / 60);
  return bs.find((b) => b.h * 60 + b.m > nowMin) ?? bs[0];
}
