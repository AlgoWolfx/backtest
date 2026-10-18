// Enstrüman tanımları. Hem veri scriptleri hem de uygulama bu dosyayı kullanır.
//
// source:        HistData.com sembol kodu (ücretsiz 1m bid verisi, ana kaynak)
// oanda:         OANDA v20 enstrüman adı (null = OANDA'da yok)
// dukascopy:     Dukascopy datafeed kodu (HistData ile aynı akış; boşluk doldurma + doğrulama)
// contractSize:  1 lot = kaç birim (P&L = lot * contractSize * fiyat farkı)
// pip:           mesafe gösteriminde kullanılan birim (pip / puan)
// quote:         kâr/zararın hangi para biriminde oluştuğu (JPY ise USD'ye çevrilir)
// digits:        fiyat gösteriminde ondalık basamak sayısı

/** @typedef {{id:string,oanda:string|null,dukascopy:string,name:string,source:string,type:'forex'|'metal'|'index',contractSize:number,pip:number,pipLabel:string,quote:'USD'|'JPY',digits:number,minLot?:number,lotStep?:number}} SymbolSpec */
// minLot / lotStep (isteğe bağlı): en küçük işlem büyüklüğü ve adımı; yoksa 0.01 / 0.01 varsayılır.

/** @type {SymbolSpec[]} */
export const SYMBOLS = [
  { id: 'EURUSD', oanda: 'EUR_USD', dukascopy: 'EURUSD', name: 'EUR/USD', source: 'eurusd', type: 'forex', contractSize: 100000, pip: 0.0001, pipLabel: 'pip', quote: 'USD', digits: 5 },
  { id: 'GBPUSD', oanda: 'GBP_USD', dukascopy: 'GBPUSD', name: 'GBP/USD', source: 'gbpusd', type: 'forex', contractSize: 100000, pip: 0.0001, pipLabel: 'pip', quote: 'USD', digits: 5 },
  { id: 'USDJPY', oanda: 'USD_JPY', dukascopy: 'USDJPY', name: 'USD/JPY', source: 'usdjpy', type: 'forex', contractSize: 100000, pip: 0.01, pipLabel: 'pip', quote: 'JPY', digits: 3 },
  { id: 'XAUUSD', oanda: 'XAU_USD', dukascopy: 'XAUUSD', name: 'Altın (XAU/USD)', source: 'xauusd', type: 'metal', contractSize: 100, pip: 0.1, pipLabel: 'pip', quote: 'USD', digits: 2 },
  { id: 'XAGUSD', oanda: 'XAG_USD', dukascopy: 'XAGUSD', name: 'Gümüş (XAG/USD)', source: 'xagusd', type: 'metal', contractSize: 5000, pip: 0.01, pipLabel: 'pip', quote: 'USD', digits: 3 },
  { id: 'US100', oanda: 'NAS100_USD', dukascopy: 'USATECHIDXUSD', name: 'Nasdaq 100 (US100)', source: 'nsxusd', type: 'index', contractSize: 1, pip: 1, pipLabel: 'puan', quote: 'USD', digits: 1 },
  { id: 'US500', oanda: 'SPX500_USD', dukascopy: 'USA500IDXUSD', name: 'S&P 500 (US500)', source: 'spxusd', type: 'index', contractSize: 1, pip: 1, pipLabel: 'puan', quote: 'USD', digits: 1 },
  { id: 'DXY', oanda: null, dukascopy: 'DOLLARIDXUSD', name: 'Dolar Endeksi (DXY)', source: 'udxusd', type: 'index', contractSize: 1000, pip: 0.01, pipLabel: 'puan', quote: 'USD', digits: 3 },
];

/** @param {string} id */
export function getSymbol(id) {
  const s = SYMBOLS.find((x) => x.id === id);
  if (!s) throw new Error(`Bilinmeyen sembol: ${id}`);
  return s;
}
