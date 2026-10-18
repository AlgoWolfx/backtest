# Backtest

Yerelde çalışan, FX Replay / TradingView benzeri **manuel** backtest aracı. Geçmiş bir tarihten
başlayıp mumları tek tek ilerletir, çizim araçlarıyla analiz yapar, Long/Short pozisyon
aracıyla işlem açarsınız. Gösterge, sinyal veya yapay zekâ yoktur.

## Başlatma

`Backtest.bat` dosyasına çift tıklayın. Tarayıcıda `http://localhost:3737` açılır.

Terminalden:

```bash
npm install        # ilk seferde
npm run data:dukascopy   # Dukascopy bid+ask verisini indir ve derle (ilk seferde ~1,5 saat)
npm start                # arayüzü derle ve sunucuyu başlat
```

Geliştirme modu (kod değiştikçe sayfa yenilenir): `npm run dev`

## Veri kaynakları

Her oturum bir veri kaynağıyla açılır; üst çubuktaki seçiciyle (açık işlem yokken) değiştirilebilir.
Aynı mumu iki akışta karşılaştırmak için kullanışlıdır.

### Dukascopy (önerilen, ücretsiz, bid + ask)

Dukascopy'nin (İsviçre bankası) orijinal 1 dakikalık akışı, **bid ve ask** ayrı ayrı (gerçek spread),
2020'den bugüne, UTC zaman damgalı. HistData'daki 2023 boşlukları bu kaynakta yok. HistData ile
dakika dakika karşılaştırmada %99,95-100 birebir aynıdır. Varsayılan kaynak budur.

```bash
npm run data:dukascopy                         # 8 sembol, 2020 → bugün (~1,5 saat, ~350 MB)
npm run data:dukascopy -- EURUSD               # tek sembol
npm run data:dukascopy -- --from=2026-10       # yalnızca son ay(lar)ı güncelle
npm run data:dukascopy -- --build-only         # indirmeden yeniden derle
```

Veri, [dukascopy-node](https://www.dukascopy-node.app) kütüphanesinin kullandığı servisten ay ay indirilir
(`data/raw/dukascopy-full/<SEMBOL>/<BID|ASK>/<YYYY-MM>.json.gz`). Servis (AWS WAF) yalnızca tarayıcı
başlıklarıyla (`Referer`/`Origin: https://www.dukascopy.com` ve Chrome User-Agent) tam veri döndürür; betik bunları ekler.
Yarıda kalırsa kaldığı aydan devam eder. Çıktı: `data/bars-dukascopy/`. Oturum açarken varsayılan kaynak budur.

### HistData (eski kaynak, yalnızca bid; artık gerekli değil)

- [HistData.com](https://www.histdata.com) 1 dakikalık **bid** verisi, 2020'den bugüne. 8 sembolün hepsi:
  EURUSD, GBPUSD, USDJPY, XAUUSD, XAGUSD, US100 (NSXUSD), US500 (SPXUSD), DXY (UDXUSD).
- **Bu veri Dukascopy'nin (İsviçre bankası) fiyat akışıdır:** Dukascopy'nin UTC zaman damgalı orijinal
  dosyalarıyla dakika dakika karşılaştırıldığında %99,96 birebir aynıdır.
- **Saat dilimi:** HistData belgelerinde "sabit EST" yazsa da dosyalar UTC-5 + **Avrupa** yaz saati
  kuralıyla kodlanmış. Bu; NFP sıçramalarının (08:30 NY), US100/DXY günlük aralarının ve Dukascopy'nin
  UTC verisiyle birebir eşleşmenin konumundan doğrulandı. Veri gerçek UTC'ye çevrilir.
- **Eksik veri:** Eksik dakikalar uydurulmaz. HistData'nın **2023 yılında tüm sembollerde ~800+ saat**
  boşluğu var (ör. 10 Mart 2023 08:00-09:00 NY, NFP saati); aynı saatler HistData'nın tick verisinde de
  yok. Bu boşluklar Dukascopy'nin aynı akışından doldurulabilir (aşağıda). Replay sırasında boşluğa
  girildiğinde grafiğin üstünde uyarı çıkar; açılış ekranındaki "Veri durumu" tablosu yıllara göre
  eksik saatleri gösterir.
- Güncelleme: `npm run data` (yalnızca eksik dosyalar + içinde bulunulan ay). Tek sembol: `npm run data -- EURUSD`.

### Boşlukları eski Dukascopy .bi5 akışıyla doldurma (yalnızca HistData için, yavaş)

```bash
npm run fetch:dukascopy          # gereken günleri indirir (kaldığı yerden devam eder)
npm run data -- --build-only     # boşlukları doldurur ve çapraz kontrol yapar
```

Dukascopy sunucusu çok sıkı hız sınırı uyguluyor (çoğu isteğe 503 döner, toplu indirme için ücretli
S3 deposu öneriyor). Bu yüzden indirme saatler sürebilir; bir gece açık bırakılabilir. Sadece HistData
boşluğu olan günler ve doğrulama örnekleri indirilir. Ortak dakikaların %90'ından azı aynı olan
günlerden asla doldurma yapılmaz. Doldurulan dakikalar mum inceleyicide "Dukascopy" olarak görünür.

### OANDA (isteğe bağlı, gerekli değil; yalnızca sahte sunucuyla test edildi)

FX Replay ve TradingView'daki `OANDA:EURUSD` grafikleriyle aynı akış. Bid **ve ask** geldiği için
işlemler **gerçek spread** ile simüle edilir. DXY OANDA'da yok (HistData kullanılır).

1. [oanda.com](https://www.oanda.com) üzerinden ücretsiz **demo (fxTrade Practice)** hesabı açın.
2. Hesap ayarlarından **API anahtarı** (Manage API Access) oluşturun.
3. Proje klasöründe `.env` dosyası oluşturup içine yazın: `OANDA_TOKEN=anahtarınız`
   (canlı hesap anahtarıysa ayrıca `OANDA_ENV=live`).
4. `npm run data:oanda` (~20 dakika). Yeni oturumda "Veri kaynağı: OANDA" seçin.

## Doğrulama

```bash
npm run verify     # sonuç: data/verify-report.md
```

Uygulamanın saat kodundan bağımsız olarak (Intl saat dilimi veritabanıyla) şunları denetler:

- 1H/4H/1D/1W/1M mumlarının doğru New York kovasına düşmesi (sembol başına 2000 örnek),
- günlük ve 4H OHLC'nin 1m veriden bağımsız yeniden hesaplanmasıyla aynı olması,
- Dukascopy (UTC) ile dakika dakika eşleşme, OANDA varsa HistData ile saat hizalaması,
- sıra / tekrar / OHLC tutarlılığı, Cumartesi mumu, ani sıçramalar.

Uygulama içinde: OHLC göstergesi (imlecin altındaki mum), **sağ tık → "Bu mumu incele"** (mumu
oluşturan 1m mumlar, kaynaklarıyla) ve **sağ tık → "Görünen mumları CSV indir"** ile başka
platformlardaki mumlarla karşılaştırabilirsiniz. Farklı broker akışlarında (ör. TradingView FX:,
OANDA:) fitillerde birkaç pip'e kadar fark normaldir; mum zamanları ve yapı aynı olmalıdır.

## Mum oluşturma kuralları

Üst zaman dilimleri 1m veriden New York saatine göre oluşturulur (TradingView/OANDA ile aynı):

| Zaman dilimi | Mum başlangıcı (NY) |
| --- | --- |
| 1m-1H | saat başına hizalı |
| 4H | 01, 05, 09, 13, 17, 21 |
| 1D | 17:00 (Pazar 17:00 açılışı Pazartesi mumudur) |
| 1W | Pazar 17:00 |
| 1M | ayın ilk işlem günü |

**Geleceğe bakma yok:** Replay zamanından sonraki hiçbir veri grafiğe, göstergeye, inceleyiciye veya
CSV'ye verilmez. Tamamlanmamış üst zaman dilimi mumu, yalnızca o ana kadar açıklanmış 1m mumlardan
oluşturulur. Örneğin 1H mumun bitmesine 20 dakika varsa mum 40 dakikalık veriyle gösterilir.

## Kısayollar

| İşlem | Kısayol |
| --- | --- |
| İleri / geri adım | → / ← (butonlar basılı tutulunca seri ilerler) |
| Grafikteki mumu tamamla (mum kapanışı) | Shift+→ |
| Sonraki NY saatine ileri sar | alt çubuk → "NY saatine" (00:00, 02:00, 07:00, 08:30, 09:30, 10:00, 13:30, 17:00, 20:00 veya özel saat; hafta sonu atlanır) |
| Grafikten başlangıç seç | alt çubuk → makas ikonu, sonra bir muma tıkla |
| Oynat / duraklat | Boşluk |
| Zaman dilimi | yazıp Enter: `1` `5` `15` `60` `240` `4h` `D` `W` `M` |
| Trend / Yatay / Dikdörtgen / Fib | Alt+T / Alt+H / Alt+R / Alt+F |
| Long / Short pozisyon | Alt+L / Alt+S, grafiğe tek tık |
| Ölçüm (fiyat, pip, mum, süre) | Shift + sürükle (veya Alt+M) |
| Geri al / yinele (çizimler) | Ctrl+Z / Ctrl+Y (veya Ctrl+Shift+Z) |
| Kopyala / yapıştır çizim | Ctrl+C / Ctrl+V (semboller arasında da) |
| Çizim ayarları (renk, çizgi stili, dolgu, orta çizgi %50 / orta nokta, sola-sağa uzatma) | çizime çift tık; seçili kare/trend için üstteki araç çubuğunda "½ Orta" |
| Sil / iptal | Delete / Esc |
| Mum inceleme, CSV, son muma git | grafikte sağ tık |

**Replay'i geri alma:** Kayıtlı bir işlem olayından (emir, açılış, kapanış) önceki bir zamana replay geri alınamaz;
aksi halde gelecekteki kâr bakiyede kalır ve aynı hareket bilerek tekrar işlenebilirdi. Geçmişe bakmak için grafiği
kaydırın; aynı hareketi yeniden denemek için yeni oturum açın. İşlem yokken geri almak serbesttir.

Geri al yalnızca çizimleri etkiler; işlemler geri alınamaz. Aktif işleme bağlı pozisyon çizimi geri
alma ile silinmez (SL/TP değişikliği geri alınabilir).

## Çoklu ekran

Üst çubuktaki **Ekran düzeni** menüsünden 1, 2 (yan yana / alt alta), 3 veya 4 ekran seçin. Her grafiğin sembolü ve zaman dilimi ayrıdır (ör. solda EURUSD 15m, sağda 4H, altta US100). Bir grafiğe tıklayınca **aktif** olur (mavi çerçeve): üst çubuktaki sembol / zaman dilimi, çizim araçları, Buy/Sell ve işlem paneli o grafiğe göre çalışır. Tüm grafikler aynı replay zamanını paylaşır (ileri sarma hepsini birlikte ilerletir). Çizimler sembole bağlıdır; aynı sembol iki grafikte görünüyorsa çizim ikisinde de çıkar. Düzen oturumla birlikte kaydedilir.

## Grafik görünümü ve yenileme

- **Sağ tık → "Grafiği yenile":** elle yapılan fiyat/zaman ölçeklemesini sıfırlar (otomatik ölçek, varsayılan mum aralığı, son muma gider).
- **Grafik ayarları** (sağ tık, üst çubuktaki dişli veya grafiğin sağ altındaki ⚙) TradingView gibi sekmelidir: *Semboller* (grafik türü: mum / boş mum / bar / çizgi / alan, mum renkleri, hazır temalar), *Durum çubuğu* (sembol, kaynak, OHLC, değişim, filigran), *Ölçekler ve çizgiler* (normal / % / 100'e indeksli / logaritmik, ters çevir, son fiyat çizgisi ve etiketi, mum kapanışına kalan süre, üst-alt-sağ boşluk, yazı boyutu), *Tuval* (arka plan, ızgara, artı imleç rengi / stili / kalınlığı / mıknatıs). Değişiklikler anında görünür, tarayıcıda saklanır ve tüm oturumlarda geçerlidir.
- **Sağ altta Auto / log / %** düğmeleri: Auto fiyat eksenini görünen mumlara sığdırır (eksenden elle ölçekleyince kapanır). Fiyat ekseni seçenekleri sağ tık menüsünde de vardır.

## İşlemler

Long/Short aracını çizin, üstte çıkan "Piyasa emri" (anlık fiyattan) veya "Limit / Stop emri"
(çizimdeki giriş fiyatından bekleyen emir) butonuna basın. Lot, "Risk %" ve stop mesafesine göre
hesaplanır. Açık işlemin SL/TP'si grafikte sürüklenebilir.

**TradingView tarzı emir (alt çubuk):** Emir tipini seçin (Market / Limit / Stop), Buy veya Sell'e basın,
sonra grafikte sırayla tıklayın (tüm emir yolları aynı boyutlandırma kuralını kullanır: **Risk %** modunda lot bütçeyi
aşmayacak şekilde aşağı yuvarlanır, en küçük lot bile sığmıyorsa emir reddedilir; Shift+Buy/Sell de Risk %'ye uyar): (Limit/Stop'ta önce giriş fiyatı) → Stop (SL) → Hedef (TP).
Fare hareket ederken giriş, stop, hedef, R:R ve risk tutarı canlı görünür. Yanlış tarafa
tıklarsanız (ör. Buy için SL girişin üstünde) reddedilir. Esc iptal eder. Boyut "Risk %" (SL'ye göre lot
hesaplanır) veya sabit "Lot" ile verilir. Shift+Buy/Sell eski hızlı emirdir (SL = 1,5×ATR, TP = 2R).
Limit: Buy için giriş anlık fiyatın altında, Sell için üstünde; Stop: tersi.

**Simülasyon kuralları:**

- Grafik bid fiyatıdır. Kaynakta ask varsa (Dukascopy, OANDA): long ask'tan açılır / bid ile kapanır, short
  bid'den açılır / ask ile kapanır; SL/TP ilgili tarafın fiyatıyla tetiklenir. HistData'da ask olmadığından spread 0.
- Komisyon yok. Aynı 1m mumda hem SL hem TP görülürse SL vurulmuş sayılır. Fiyat SL/TP'nin ötesinde
  açılırsa (gap) çıkış açılış fiyatından olur; hiçbir çıkış mumun işlem görmediği bir fiyattan yazılmaz.
- **Mum içi sıra:** 1m OHLC, high/low sırasını söylemez; tick verisi olmadan kesin sıra iddia edilmez.
  Sıranın sonucu değiştirdiği durumlar işlemde işaretlenir (günlükte "⚠ mum içi sıra varsayımı"):
  aynı mumda SL ve TP ikisi de görülmüşse SL-önce; bekleyen emir mumun **açılışında** doluyorsa (gap) mumun
  tamamı dolumdan sonradır ve TP de sayılır; emir mum **içinde** doluyorsa SL görüldüyse zarar, TP sayılmaz.
- R, ilk SL mesafesine göre hesaplanır; |R| < 0,1 ise sonuç BE sayılır. Bir işlem kapandığında oynatma durur.

İleri sarmalarda (NY saatine, mum kapanışına, tarihe git) açık işlem SL/TP'ye değerse veya bekleyen emir
dolarsa sarma tam o dakikada durur. Oynatma da emir dolduğunda ve işlem kapandığında durur.

## Hesap türü ve kurallar (kişisel / fon)

Yeni oturumda **Hesap türü** seçilir; alanlar elle değiştirilebilir (boş = kural yok):

| Hazır ayar | Hedef | Günlük kayıp | Maks. kayıp | Düşüş | Min. gün |
| --- | --- | --- | --- | --- | --- |
| Kişisel hesap | — | — | — | — | — |
| Fon · 2 adım · Faz 1 | %10 | %5 | %10 | statik | 4 |
| Fon · 2 adım · Faz 2 | %5 | %5 | %10 | statik | 4 |
| Fon · 1 adım | %10 | %3 | %6 | trailing | — |
| Fonlu hesap | — | %5 | %10 | statik | — |

- Limitler **equity** (bakiye + açık pozisyonların o dakikadaki en kötü değeri) ile her 1m mumda denetlenir.
  Aynı dakikaya düşen tüm semboller birlikte işlenir, sonuç sembol sırasına bağlı değildir.
- **Belirsiz mum:** Aynı dakikada **TP ile kapanan** işlem, kapanıştan önce mum dibini görmüş olabilir (1m OHLC sırayı
  söylemez). Bu olasılık limiti aşıyorsa hesap **patlatılmaz**; Performans sayfasında "Belirsiz mum" uyarısı yazılır.
  Kesin ihlal (SL ile gerçekleşmiş zarar, açık pozisyonun mum içi dibi) hesabı patlatır.
- **Gün başlangıcı:** Piyasa emri, emrin verildiği replay anındaki işlem gününe (NY 17:00 sınırı) ve seansa yazılır.
- **Günlük kayıp:** işlem günü başındaki (NY 17:00) bakiyeden, başlangıç bakiyesinin %'si kadar.
- **Maks. kayıp (hesap patlama):** statikte başlangıçtan; trailing'de en yüksek kapanmış bakiyeden (taban en fazla
  başlangıç seviyesine kadar yükselir).
- Limit aşılırsa tüm pozisyonlar o dakikanın fiyatından kapanır ("Limit ihlali"), bekleyen emirler iptal olur,
  hesap **patlar** ve yeni işlem açılamaz.
- **Kâr hedefi (fon geçme):** kapanmış bakiye hedefe ulaşır, açık işlem yoksa ve min. işlem günü sağlanmışsa geçilir.
- Üst çubukta hedef / günlük / patlama göstergeleri, Performans sayfasında hesap kartı bulunur.

## Performans ve günlük

Üst çubuk → **Performans**. Her işlem açıldığında ve kapandığında grafiğin ekran görüntüsü otomatik
alınır (üstünde sembol, zaman dilimi, NY saati, giriş/SL/TP veya sonuç yazılı) ve
`data/sessions/<oturum>/shots/` altına kaydedilir. Sayfada:

- net K/Z, kazanma oranı, toplam/ortalama R, profit factor, seriler, ortalama süre,
- **iki ayrı düşüş:** *bakiye düşüşü* (yalnızca kapanmış işlemler) ve hesap kartında *equity düşüşü* (açık P&L dahil; dakika
  sonu ve mum içi en kötü olmak üzere iki ayrı ölçü; para ve yüzde maksimumları bağımsız). Eski oturumlarda equity düşüşü
  yalnızca bu sürümden sonra ilerleyen replay'den itibaren birikir,
- bakiye eğrisi (üzerine gelince işlem ayrıntısı),
- sembol, yön, giriş seansı (NY) ve güne göre kırılımlar,
- işlem günlüğü: her işlem için giriş/çıkış görüntüsü (tıklayınca büyür) ve not alanı.

Görüntü yalnızca işlemin sembolü grafikte açıkken alınabilir. Oturum silinince görüntüleri de silinir.

Oturumlar `data/sessions/` altında JSON olarak otomatik kaydedilir. İşlem geçmişi CSV olarak indirilebilir.

## Geliştirme

```bash
npm test           # çekirdek mantık testleri (NY saati, mum kovaları, geleceğe bakmama, SL/TP, spread)
npm run verify     # gerçek veri doğrulaması
npm run typecheck
```

- `scripts/dukascopy-full.mjs`: Dukascopy bid+ask ay ay indirme + derleme (`data/bars-dukascopy/`, varsayılan kaynak)
- `scripts/data.mjs`: HistData indirme + derleme (+ Dukascopy çapraz kontrol / doldurma)
- `scripts/oanda.mjs`: OANDA indirme + derleme (`data/bars-oanda/`)
- `scripts/dukascopy.mjs`, `scripts/fetch-dukascopy.mjs`: Dukascopy günlük dosyaları
- `server/index.mjs`: veri, oturum API'si ve arayüz
- `src/core/`: zaman dilimleri, birleştirme, işlem simülasyonu (saf fonksiyonlar)
- `src/chart/`: lightweight-charts sarmalayıcısı ve çizim katmanı
- `verify/`: gerçek veri doğrulama testleri
- Tarayıcı konsolunda `window.__bt` ile store'a ve grafiğe erişilebilir.
