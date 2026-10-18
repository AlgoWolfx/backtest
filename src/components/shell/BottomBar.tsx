import { getSymbol } from '../../../shared/symbols.js';
import { cancelTicket, marketOrder, startTicket, type OrderKind, setAutoOrder, setLots, setRiskPct, setSlBuffer, useStore } from '../../store';
import { ReplayClock, ReplayControls } from '../replay/ReplayControls';
import { NumberInput } from '../common/NumberInput';

export function BottomBar() {
  const lots = useStore((s) => s.session?.lots ?? 1);
  const riskPct = useStore((s) => s.session?.riskPct ?? 1);
  const kind = useStore((s) => s.orderKind);
  const autoOrder = useStore((s) => s.autoOrder);
  const sizing = useStore((s) => s.sizing);
  const ticket = useStore((s) => s.ticket);
  const slBuffer = useStore((s) => s.session?.slBuffer ?? 0);
  const symbolPip = useStore((s) => (s.session ? getSymbol(s.session.symbol).pipLabel : 'pip'));
  const KINDS: { id: OrderKind; label: string; hint: string }[] = [
    { id: 'market', label: 'Market', hint: 'Anlık fiyattan gir; SL ve TP noktalarını grafikte tıklayarak seç' },
    { id: 'limit', label: 'Limit', hint: 'Giriş, SL ve TP noktalarını grafikte sırayla tıkla (giriş anlık fiyatın lehine tarafında)' },
    { id: 'stop', label: 'Stop', hint: 'Giriş, SL ve TP noktalarını grafikte sırayla tıkla (giriş anlık fiyatın aleyhine tarafında, kırılımda gir)' },
  ];
  const order = (side: 'long' | 'short', quick: boolean) => {
    if (quick) return marketOrder(side);
    if (ticket && ticket.side === side && ticket.kind === kind) return cancelTicket();
    startTicket(side);
  };

  return (
    <footer className="bottombar">
      <div className="trade-btns">
        <div className="seg" title="Emir tipi">
          {KINDS.map((k) => (
            <button key={k.id} className={kind === k.id ? 'on' : ''} title={k.hint} onClick={() => useStore.setState({ orderKind: k.id, ticket: null })}>
              {k.label}
            </button>
          ))}
        </div>
        <button className={`buy ${ticket?.side === 'long' ? 'armed' : ''}`} onClick={(e) => order('long', e.shiftKey)} title="Buy: grafikte SL ve TP noktalarını seç (Shift+tık: ATR'ye göre hızlı emir)">
          ↗ Buy
        </button>
        <button className={`sell ${ticket?.side === 'short' ? 'armed' : ''}`} onClick={(e) => order('short', e.shiftKey)} title="Sell: grafikte SL ve TP noktalarını seç (Shift+tık: ATR'ye göre hızlı emir)">
          ↘ Sell
        </button>
        <div className="seg" title="Long / Short aracını grafiğe bıraktığında emir hemen verilir: bıraktığın fiyat limit (veya stop) olarak bekler. Kapalıyken araç yalnızca çizim bırakır; emri araç çubuğundan sen verirsin.">
          <button className={autoOrder ? 'on' : ''} onClick={() => setAutoOrder(!autoOrder)}>
            Çizince emir
          </button>
        </div>
        <div className="seg" title="Emir boyutu: bakiyenin risk yüzdesi veya sabit lot">
          <button className={sizing === 'risk' ? 'on' : ''} onClick={() => useStore.setState({ sizing: 'risk' })}>
            Risk %
          </button>
          <button className={sizing === 'lots' ? 'on' : ''} onClick={() => useStore.setState({ sizing: 'lots' })}>
            Lot
          </button>
        </div>
        {sizing === 'risk' ? (
          <label className="field" title="Her işlemde SL vurulursa kaybedilecek bakiye yüzdesi (lot buna göre hesaplanır)">
            <NumberInput value={riskPct} min={0.01} step={0.25} onChange={setRiskPct} />
            <span>%</span>
          </label>
        ) : (
          <label className="field" title="Sabit lot miktarı">
            <NumberInput value={lots} min={0.01} step={0.01} onChange={setLots} />
            <span>lot</span>
          </label>
        )}
        <label className="field" title={`Stop tamponu: SL'ye tıkladığın noktanın ${symbolPip} kadar ötesine konur (long'da aşağı, short'ta yukarı). Risk % modunda lot genişlemiş stopa göre hesaplanır. 0 = kapalı`}>
          <span>SL +</span>
          <NumberInput value={slBuffer} min={0} step={0.5} onChange={setSlBuffer} />
          <span className="muted">{symbolPip}</span>
        </label>
      </div>

      <div className="bottom-right">
        <ReplayControls />
        <ReplayClock />
      </div>
    </footer>
  );
}
