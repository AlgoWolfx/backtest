// Enstrüman tanımları. Hem veri scriptleri hem de uygulama bu dosyayı kullanır.
//
// dukascopy:     Dukascopy enstrüman kodu (1m bid + ask verisinin kaynağı)
// contractSize:  1 lot = kaç birim (P&L = lot * contractSize * fiyat farkı)
// pip:           mesafe gösteriminde kullanılan birim (pip / puan)
// quote:         kâr/zararın hangi para biriminde oluştuğu (JPY ise USD'ye çevrilir)
// digits:        fiyat gösteriminde ondalık basamak sayısı

/** @typedef {{id:string,dukascopy:string,name:string,type:'forex'|'metal'|'index',contractSize:number,pip:number,pipLabel:string,quote:'USD'|'JPY',digits:number,minLot?:number,lotStep?:number}} SymbolSpec */
// minLot / lotStep (isteğe bağlı): en küçük işlem büyüklüğü ve adımı; yoksa 0.01 / 0.01 varsayılır.

/** @type {SymbolSpec[]} */
export const SYMBOLS = [
  { id: 'EURUSD', dukascopy: 'EURUSD', name: 'EUR/USD', type: 'forex', contractSize: 100000, pip: 0.0001, pipLabel: 'pip', quote: 'USD', digits: 5 },
  { id: 'GBPUSD', dukascopy: 'GBPUSD', name: 'GBP/USD', type: 'forex', contractSize: 100000, pip: 0.0001, pipLabel: 'pip', quote: 'USD', digits: 5 },
  { id: 'USDJPY', dukascopy: 'USDJPY', name: 'USD/JPY', type: 'forex', contractSize: 100000, pip: 0.01, pipLabel: 'pip', quote: 'JPY', digits: 3 },
  { id: 'XAUUSD', dukascopy: 'XAUUSD', name: 'Altın (XAU/USD)', type: 'metal', contractSize: 100, pip: 0.1, pipLabel: 'pip', quote: 'USD', digits: 2 },
  { id: 'XAGUSD', dukascopy: 'XAGUSD', name: 'Gümüş (XAG/USD)', type: 'metal', contractSize: 5000, pip: 0.01, pipLabel: 'pip', quote: 'USD', digits: 3 },
  { id: 'US100', dukascopy: 'USATECHIDXUSD', name: 'Nasdaq 100 (US100)', type: 'index', contractSize: 1, pip: 1, pipLabel: 'puan', quote: 'USD', digits: 1 },
  { id: 'US500', dukascopy: 'USA500IDXUSD', name: 'S&P 500 (US500)', type: 'index', contractSize: 1, pip: 1, pipLabel: 'puan', quote: 'USD', digits: 1 },
  { id: 'DXY', dukascopy: 'DOLLARIDXUSD', name: 'Dolar Endeksi (DXY)', type: 'index', contractSize: 1000, pip: 0.01, pipLabel: 'puan', quote: 'USD', digits: 3 },
];

/** @param {string} id */
export function getSymbol(id) {
  const s = SYMBOLS.find((x) => x.id === id);
  if (!s) throw new Error(`Bilinmeyen sembol: ${id}`);
  return s;
}
