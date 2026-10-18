import { useState, type ReactNode } from 'react';
import { DEFAULT_SESSION_SETTINGS, type LabelPos, type LabelSize, type LabelVPos, type LineStyleName, type SessionDef, type SessionSettings, type TdoSettings } from '../core/sessions';
import { setSessionSettings, useStore } from '../store';

const STYLES: LineStyleName[] = ['Solid', 'Dashed', 'Dotted'];
const POS: LabelPos[] = ['Sağ', 'Başlangıç'];
const VPOS: LabelVPos[] = ['Otomatik', 'Üst', 'Alt', 'Seviye'];
const SIZES: LabelSize[] = ['Tiny', 'Small', 'Normal', 'Large', 'Huge'];

function Check({ label, value, onChange, hint }: { label: string; value: boolean; onChange: (v: boolean) => void; hint?: string }) {
  return (
    <label className="form-row check" title={hint}>
      <input type="checkbox" checked={value} onChange={(e) => onChange(e.target.checked)} />
      <span>{label}</span>
    </label>
  );
}

function Num({ label, value, min, max, onChange, hint }: { label: string; value: number; min: number; max: number; onChange: (v: number) => void; hint?: string }) {
  return (
    <div className="form-row" title={hint}>
      <span>{label}</span>
      <input
        type="number"
        className="num-sm"
        value={value}
        min={min}
        max={max}
        onChange={(e) => onChange(Math.min(max, Math.max(min, Math.round(Number(e.target.value) || min))))}
        onKeyDown={(e) => e.stopPropagation()}
      />
    </div>
  );
}

function Pick<T extends string>({ label, value, options, onChange }: { label: string; value: T; options: readonly T[]; onChange: (v: T) => void }) {
  return (
    <div className="form-row">
      <span>{label}</span>
      <select className="select" value={value} onChange={(e) => onChange(e.target.value as T)}>
        {options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
    </div>
  );
}

function Group({ title, children }: { title: string; children: ReactNode }) {
  const [open, setOpen] = useState(true);
  return (
    <section className="set-group">
      <button className="set-group-head" onClick={() => setOpen(!open)}>
        <span>{open ? '▾' : '▸'}</span> {title}
      </button>
      {open && <div className="set-group-body">{children}</div>}
    </section>
  );
}

/**
 * Grafik ayarları > Seanslar: geralt.pine (GERALT Session Liquidity v1.1.0) girdilerinin birebir karşılığı;
 * grup adları ve girdi sırası Pine'daki gibidir. Şeffaflıklar Pine'daki gibi: 0 = opak, 100 = görünmez.
 */
export function SessionSettingsTab() {
  const s = useStore((st) => st.sessionSettings);
  const upd = (p: Partial<SessionSettings>) => setSessionSettings({ ...s, ...p });
  const updTdo = (p: Partial<TdoSettings>) => upd({ tdo: { ...s.tdo, ...p } });
  const updSession = (id: string, p: Partial<SessionDef>) => upd({ sessions: s.sessions.map((x) => (x.id === id ? { ...x, ...p } : x)) });
  const add = () => {
    const id = `c${Date.now().toString(36)}`;
    upd({ sessions: [...s.sessions, { id, name: 'Yeni seans', show: true, start: '09:30', end: '11:00', color: '#26c6da', highText: 'Yeni High', lowText: 'Yeni Low' }] });
  };
  return (
    <>
      <Check label="GERALT Session Liquidity göstergesi" value={s.enabled} onChange={(v) => upd({ enabled: v })} hint="Seans kutuları, likidite çizgileri ve True Day Open" />
      <p className="hint">Saat dilimi America/New_York (yaz/kış otomatik). Hesaplar yalnızca replay zamanına kadar açıklanmış mumlardan yapılır: açık seansın high/low'u o ana kadarki değerdir. Hiçbir sinyal veya bias yoktur; yalnızca seans likiditesi.</p>

      <Group title="General">
        <Num label="Kaç gün gösterilsin?" value={s.historyDays} min={1} max={10} onChange={(v) => upd({ historyDays: v })} hint="Seviye ve kutular oluştuktan bu kadar gün sonra silinir" />
        <Num label="Çizgi kalınlığı" value={s.lineWidth} min={1} max={4} onChange={(v) => upd({ lineWidth: v })} />
        <Pick label="Çizgi tipi" value={s.lineStyle} options={STYLES} onChange={(v) => upd({ lineStyle: v })} />
        <Num label="En yüksek zaman dilimi (dk)" value={s.maxTfMinutes} min={1} max={240} onChange={(v) => upd({ maxTfMinutes: v })} hint="Pine'da 15: yalnızca 15 dakika ve altında çalışır" />
      </Group>

      <Group title="Live Session">
        <Check label="Aktif session High / Low göster" value={s.showLive} onChange={(v) => upd({ showLive: v })} />
        <Num label="Canlı çizgi uzunluğu (mum)" value={s.liveBars} min={1} max={20} onChange={(v) => upd({ liveBars: v })} />
        <Num label="Canlı çizgi şeffaflığı" value={s.liveTransp} min={0} max={100} onChange={(v) => upd({ liveTransp: v })} />
      </Group>

      <Group title="Killzone Box">
        <Check label="Killzone kutusunu göster" value={s.showBox} onChange={(v) => upd({ showBox: v })} />
        <Num label="Kutu dolgu şeffaflığı" value={s.boxTransp} min={0} max={100} onChange={(v) => upd({ boxTransp: v })} />
        <Num label="Kutu kenarlık şeffaflığı (100 = kenarlık yok)" value={s.boxBorderTransp} min={0} max={100} onChange={(v) => upd({ boxBorderTransp: v })} />
      </Group>

      <Group title="Liquidity Appearance">
        <Num label="Aktif liquidity şeffaflığı" value={s.activeTransp} min={0} max={100} onChange={(v) => upd({ activeTransp: v })} />
        <Num label="Alınmış liquidity şeffaflığı" value={s.takenTransp} min={0} max={100} onChange={(v) => upd({ takenTransp: v })} />
        <Num label="Alınmış yazı şeffaflığı" value={s.takenLabelTransp} min={0} max={100} onChange={(v) => upd({ takenLabelTransp: v })} />
        <Check label="Alınmış seviyelerin yazısını göster" value={s.showTakenLabels} onChange={(v) => upd({ showTakenLabels: v })} />
      </Group>

      <Group title="Labels">
        <Check label="Yazıları göster" value={s.showLabels} onChange={(v) => upd({ showLabels: v })} />
        <Pick label="Yatay konum" value={s.labelPos} options={POS} onChange={(v) => upd({ labelPos: v })} />
        <Pick label="Dikey konum" value={s.labelVPos} options={VPOS} onChange={(v) => upd({ labelVPos: v })} />
        <Pick label="Yazı boyutu" value={s.labelSize} options={SIZES} onChange={(v) => upd({ labelSize: v })} />
        <Num label="Sağa uzaklık (mum)" value={s.rightOffset} min={0} max={30} onChange={(v) => upd({ rightOffset: v })} />
        <Num label="Dikey uzaklık (tick)" value={s.vOffsetTicks} min={0} max={100} onChange={(v) => upd({ vOffsetTicks: v })} />
      </Group>

      <Group title="Seanslar (Asia, London, New York AM / Lunch / PM, CBDR)">
        <div className="sess-head">
          <span className="muted">göster · ad · saat (NY) · renk · High yazısı · Low yazısı</span>
        </div>
        {s.sessions.map((x) => (
          <div className="sess-row2" key={x.id}>
            <input type="checkbox" title="Göster" checked={x.show} onChange={(e) => updSession(x.id, { show: e.target.checked })} />
            <input className="sess-name" value={x.name} maxLength={24} onChange={(e) => updSession(x.id, { name: e.target.value })} onKeyDown={(e) => e.stopPropagation()} />
            <input type="time" value={x.start} onChange={(e) => e.target.value && updSession(x.id, { start: e.target.value })} onKeyDown={(e) => e.stopPropagation()} />
            <input type="time" value={x.end} onChange={(e) => e.target.value && updSession(x.id, { end: e.target.value })} onKeyDown={(e) => e.stopPropagation()} />
            <input type="color" className="color-input" value={x.color} onChange={(e) => updSession(x.id, { color: e.target.value })} />
            <input className="sess-name" value={x.highText} maxLength={32} onChange={(e) => updSession(x.id, { highText: e.target.value })} onKeyDown={(e) => e.stopPropagation()} />
            <input className="sess-name" value={x.lowText} maxLength={32} onChange={(e) => updSession(x.id, { lowText: e.target.value })} onKeyDown={(e) => e.stopPropagation()} />
            <button className="icon-btn" title="Sil" onClick={() => upd({ sessions: s.sessions.filter((y) => y.id !== x.id) })}>
              ×
            </button>
          </div>
        ))}
        <div className="form-row">
          <button className="btn small" onClick={add}>
            + Seans ekle
          </button>
        </div>
        <p className="hint">Bitiş saati başlangıçtan küçükse seans gece yarısını geçer (Asia 20:00-00:00).</p>
      </Group>

      <Group title="True Day Open">
        <Check label="True Day Open göster (00:00)" value={s.tdo.show} onChange={(v) => updTdo({ show: v })} hint="Günün (NY saati) ilk mumunun açılış fiyatı" />
        <Num label="Kaç geçmiş gün gösterilsin?" value={s.tdo.days} min={0} max={10} onChange={(v) => updTdo({ days: v })} hint="Bugünün çizgisine ek geçmiş gün sayısı; 0 = sadece bugün" />
        <div className="form-row">
          <span>Renk</span>
          <input type="color" className="color-input" value={s.tdo.color} onChange={(e) => updTdo({ color: e.target.value })} />
        </div>
        <div className="form-row">
          <span>Geçmiş günlerin rengi</span>
          <input type="color" className="color-input" value={s.tdo.pastColor} onChange={(e) => updTdo({ pastColor: e.target.value })} />
        </div>
        <Num label="Geçmiş günlerin şeffaflığı" value={s.tdo.pastTransp} min={0} max={100} onChange={(v) => updTdo({ pastTransp: v })} />
        <Num label="Çizgi kalınlığı" value={s.tdo.width} min={1} max={4} onChange={(v) => updTdo({ width: v })} />
        <Pick label="Çizgi tipi" value={s.tdo.style} options={STYLES} onChange={(v) => updTdo({ style: v })} />
        <Check label="Yazıyı göster (sadece bugünün çizgisinde)" value={s.tdo.showLabel} onChange={(v) => updTdo({ showLabel: v })} />
        <div className="form-row">
          <span>Yazı</span>
          <input className="sess-name" value={s.tdo.labelText} maxLength={32} onChange={(e) => updTdo({ labelText: e.target.value })} onKeyDown={(e) => e.stopPropagation()} />
        </div>
        <Check label="1H / 4H gibi yüksek zaman dilimlerinde de göster" value={s.tdo.showHtf} onChange={(v) => updTdo({ showHtf: v })} hint="Kapalıyken yalnızca en yüksek zaman dilimi ve altında görünür; açıkken 4 saate kadar" />
      </Group>

      <div className="form-row">
        <button className="btn small ghost" onClick={() => setSessionSettings(DEFAULT_SESSION_SETTINGS)}>
          geralt.pine varsayılanlarına dön
        </button>
      </div>
    </>
  );
}
