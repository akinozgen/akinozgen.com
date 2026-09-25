# Geliştirme günlüğü

> Oyun, Claude'a "bir projeyle şaşırt beni" denmesiyle bir oturumda yazıldı. Bu dosya o oturumun not defteri:
> kararlar, denge ölçümleri ve oyuncu geri bildirimleriyle yapılan değişiklikler. İlk hâli `Desktop/asdf/_journal.md`.
> Aşağıdaki eski yollar (`caylar-belediyeden/`, `smoke.mjs` …) taşınmadan önceki düzene aittir; güncel düzen README'de.

## 2026-09-23 — Keşif
- Klasör boş. Elde: node, deno, cargo, dotnet, git, ffmpeg, wsl.
- Başkan "go wild" dedi, admin izni var, tooling serbest.

## Fikir
**"MAKAM" — İlçe Belediye Başkanı Simülatörü.** Reigns tarzı kart oyunu:
kartı sağa/sola kaydır, dört gösterge dengede kalsın:
- 👥 Halk · 💰 Kasa · 🏪 Esnaf · 🏛️ Ankara
Herhangi biri 0'a düşer ya da 100'e fırlarsa görevden düşersin (her biri için ayrı komik son).
Fikret (makam şefi) danışman olarak kartlarda yer alır. Karakterler: Muhtar, çaycı, esnaf odası,
muhalefet, vali, imam, emekli amcalar, influencer yeğen, ...
Ekstralar:
- Paylaşımlı "Başkanlar Onur Listesi" (en uzun görev süresi) — artifact db capability varsa.
- Easter egg: "otogarda cinayet var" kartı, "ah memleket" son ekranı.
- Tek HTML, telefon + masaüstü, sürükle/klavye ile oynanır, WebAudio ile küçük sesler.

## Karar: "Çaylar Belediyeden"
- Kurgusal ilçe: **Karakavak** (meşhur ürünü kavun). Başlangıç Nisan 2029, her kart = 1 ay, dönem 60 ay, Mart'ta seçim.
- Kart = resmî evrak (T.C. Karakavak Belediye Başkanlığı başlığı, Sayı/Konu, ataşlı vesikalık, "Gereğini arz ederim", mavi tükenmez ıslak imza).
  Sağa/sola kaydırınca mühür (sol: kırmızı, sağ: mor mürekkep).
- Masa: yeşil deri sümen + dikiş, ceviz ray, pirinç isimlik "BELEDİYE BAŞKANI".
- Oyun sonu: **Karakavak Postası** gazetesi (halftone foto). `sample` varsa Muhabir Tuncay (Claude) haberi yazar.
- **Eski Belediye Başkanlarımız** duvarı (db): yağlı boya koridor duvarı (alt yarı nane yeşili), yaldızlı çerçeveler.
- Tekir: 3 kez mama verirsen ölümcül bir kararda evrakın üstüne yatıp kurtarır.
- Fikret'e sor: dönemde 3 hak, Claude makam şefi ağzıyla ipucu verir.

### Tasarım planı
- Renk: masa yeşili #1b3a2e · ceviz #2a1a11 · evrak #f3f2ec · daktilo mürekkebi #23212a · mühür moru #4f3aa6 · mühür kırmızısı #b3341f · pirinç #c9a54c
- Yazı: Alfa Slab One (başlık/manşet) · Courier Prime (daktilo evrak) · Barlow Condensed (etiket/mühür/buton) · Old Standard TT (gazete gövdesi)
- Yerleşim: tek ekran masa; üstte ceviz rayda 4 gösterge, ortada evrak yığını, altta iki seçenek, en altta pirinç isimlik.
- Tek görünüm (koyu masa) bilinçli tercih, iki temada da aynı.

### Mimari
`caylar-belediyeden/src/{cards,engine,portrait,ui}.js + style.css + index.html` → `build.mjs` tek HTML'e gömer → `dist/`.
`sim.mjs` motoru node'da binlerce kez oynatıp denge ölçer.

## Yapılacaklar
- [x] artifact quickstart + tasarım/capability skill'leri
- [x] oyun motoru (kart destesi, bayraklar, zincir kartlar, sonlar)
- [x] içerik: 32 karakter, ~120 evrak
- [x] test (sim.mjs denge + smoke.mjs headless Chrome)
- [x] yayınla → https://claude.ai/artifact/2Fm8YLgXeUthNy9dLijN9C (db + user + sample)

## Denge notları (sim.mjs, 3000 oyun)
- İlk sürümde kasa ortalama −2,1/kart eriyordu, rastgele oyunda ölümlerin %53'ü kasadan geliyordu.
  Yıllık bütçe, kira, hurda, kantin gibi gelir kartları ekledim, bazı masrafları kıstım. Kasa ölümü %36'ya indi.
- Seçim formülü: 24 + halk×0,45 + esnaf×0,08 + Ankara×0,04 ± 5. Sırf dengede kalan oyuncu sandıkta kaybeder,
  seçim öncesi halkı kollayan oyuncu kazanır. Bu bilinçli bir tercih.
- Medyan: rastgele oyuncu 23 ay, "insan" (%75 akıllı) 119 ay, mükemmel oyuncu 4 dönem.

## v2: başkanın geri bildirimi ("göstergeler anlaşılmıyor, hep çakılıyoruz, sağ/sol aynı hikâye")
Yapıldı ve derlendi (src + dist güncel, v1 yedeği `caylar-belediyeden/_v1/`):
- Göstergelerde sayı, kararın ardından sayının altına düşen +/− fişi, ↻ işaretli aylık fiş, tehlike uyarısı.
- Sürüklerken/üzerine gelince ▲▼ oklar (1-3 ok = büyüklük; yeşil/beyaz/sarı/kırmızı).
- Motor v2: kartlar yarı yarıya ters çevriliyor (hep sağ ≠ hep kabul), yürürlükteki kararlar (aylık etki/inşaat),
  ilişkiler (−3..+3; dost/küs kartları, sandık bonusu), iki tarafa da ayrı devam kartı, kriz can simitleri,
  yönetmen ağırlığı, yumuşak kenar, yıpranma. Ayarlar `TUNE` (engine.js).
- Denge (sim 2000): rastgele medyan 30 ay, %15 ilk dönem · "insan" %88 ilk dönem, seçim %69, emekli %10.
- Genelge ekranı (Nasıl oynanır), isimlikte anket, seçenek düğmesinde "her ay Kasa −2, 8 ay" notu.
- scene.mjs: motorla durum kurup ekran görüntüsü alan sahne testi.
- Artifact henüz v1 hâliyle yayında (v2 yayınlanmadı).

## ✅ Bağımsız web uygulaması (tamamlandı)
- Claude eklentileri çıktı: Fikret kural tabanlı (seçenekleri bir yıllık etkisiyle tartıyor), gazete şablondan,
  duvar localStorage'da (en uzun 24 dönem, her başkana tohumdan vesikalık), başlıkta "Başkanın adı".
- `dist/web/`: index.html + yerel fontlar (20 woff2, 394 KB, OFL) + ikonlar + manifest + sw.js.
  Yerel sunucuda doğrulandı: SW aktif, sayfayı denetliyor, internet kesikken açılıyor, 10 font yüzü yerelden.
- `dist/oyna.html`: fontlar gömülü tek dosya (~707 KB).
- Artifact v2 olarak yeniden yayınlandı, capabilities temizlendi.

## ⏸ KALDIĞIM YER (başkan mola istedi; buradan aynen devam) — TAMAMLANDI
Başkanın son isteği: **Claude eklentilerini kaldır, siteye konacak bağımsız web uygulaması olsun.**
Plan (hiçbiri henüz başlamadı; kaynaklar şu an tutarlı ve derleniyor):
1. ui.js'ten çıkar: `caps`, `initCaps`, `HIDE`, `sampleErrText`, Claude'lu `danis`/`fikretPrompt`, Tuncay (`tuncay`,
   `tuncayPrompt`, `cleanArt`, `updateTuncay`), db duvarı (`saveRecord`, `updateRecordHeadline`, `subscribeWall`, `cleanRec`),
   `window.claude.hot` önyüklemesi. index.html'den `#btn-tuncay`, `#press`.
2. Fikret'e sor → kural tabanlı danışman (dönemde 3 hak): iki seçeneği risk sezgisiyle karşılaştır, önerdiğini adıyla an,
   ana kazanç/bedel ("kasa epey rahatlar, halk söylenir"), yürürlükteki karar/devam/ilişki/seçim uyarısı, Fikret ağzı.
3. Eski Başkanlarımız → yerel (localStorage) duvar: son ~24 dönem; başlık ekranında "Adınız" alanı (textContent ile);
   her kayda tohumdan üretilmiş vesikalık portre (portrait() + rastgele özellik). Gazetede "Başkan <ad>".
4. Gazete şablonunu zenginleştir (dost/küs, tamamlanan işler).
5. Bağımsız paket `dist/web/`: tam HTML (doctype, meta, favicon SVG, theme-color, OG), fontlar yerel woff2
   (Google Fonts CSS'ini indirip latin + latin-ext), manifest.webmanifest, sw.js (çevrimdışı; file:// iken kaydetme),
   ikon PNG'leri (headless Chrome ile 192/512). build.mjs iki çıktı: web/ ve artifact.html (Google Fonts linkli).
6. Duman testi (sessiz) + sahne testi → artifact'i capabilities {} ile yeniden yayınla (aynı URL) → özet.

## Kaza
- Duman testindeki headless Chrome oyunun seslerini başkanın hoparlöründen çaldı; başkan "nereden geliyor bu ses" diye şaşırdı :)
  Test tarayıcısına `--mute-audio` ekledim.

## Sonraki turlar (başkanın geri bildirimleri)
- Büyük ekranda yazı küçüktü → bütün CSS rem'e çevrildi, kök yazı ekran yüksekliğine bağlandı; sonra "sıkışık" denince %25 küçültüldü (1.75vh / 3.25vw).
- Halk 100 heykel sonu kaldırıldı (halk yalnız dipte tehlikeli, sandıkta ezici zafer mesajı). Erken seçim önerim reddedildi, haklıydı.
- "Yürürlükte" şeridi hep yerinde (evrak kaymıyor), sığmazsa haber bandı gibi akıyor.
- Gazete ve genelge yatay ekranda tek sayfaya sığıyor.
- Telefonda sürükleme: kök sebep, metin kutusunun (overflow:auto) kaydırma kabı olması → tarayıcı pointercancel atıyordu.
  `.card * { touch-action: none }` + interact.js (yön kilidi, fiske hızı). gesture testi: 10/10.

## Siteye taşınma (2026-09-24)
- Kaynaklar `games/apps/belediye/` altına taşındı (pnpm çalışma alanı üyesi `@travelle/belediye`, bağımlılığı yok).
- `build:site` → `public/games/belediye/`; `games` kökünde `pnpm build` artık bütün oyunları siteye derliyor
  (`pnpm -r --if-present build:site`), eski davranış `pnpm build:apps`. Ana projede `npm run build:games`.
- Galeri kaydı `src/data/games.ts` içinde (slug `belediye`).
- Test araçları `tools/` altına alındı; `test/engine.test.mjs` (`node --test`) içerik tutarlılığını ve dengeyi denetliyor.
- pnpm bağımlılıksız paketi kilit dosyasına kendiliğinden yazmadı, `--frozen-lockfile` kurulum da bu yüzden reddediyordu.
  `apps/belediye: {}` kaydı elle eklendi (`packages/core` ile aynı biçim).

## Başlık bardağı ve vesikalıklar (2026-09-24)
- Başlıktaki çay bardağı "çok uzun" bulundu. Başkanın gösterdiği stok görseldeki oranlarla yeniden çizildi: boy/ağız 2,2'den 1,45'e indi, ağız elips oldu, cam kalınlığı göründü. Stok PNG'nin kendisi konmadı; 360px'lik önizlemeydi, lisansı da kaynak göstermek istiyordu. İkonlar da yeni bardağa geçti.
- `tools/icons.mjs` geçici HTML'lerini siliyor; önceden derleme onları da pakete katıyordu.
- Başkanın isteği: "karakter görselleri çalışırken ya da SVG olarak üretilmesin, asset olsun." Vesikalıklar artık `web-src/portraits/*.webp` (32 kişi, 16 eski başkan; 384px, ~6 KB). Tarifler ve çizer `tools/portrait.js`'e taşındı; ilk resimler oradan üretildi, elle konacak gerçek resimler aynı adla üstüne yazılabilir.
- Başkanın isteği: "başkanlar arasından avatar seçebilelim, isim eşlemesi olsun, özel isim de girilsin." 16 başkanlık vesikalığının her birine bir ad verildi (`BASKANLAR`, cards.js; ünlü siyasetçi adlarından kaçınıldı, biri Hülya Kavuncu). Başlıkta vesikalık düğmesi ve seçim ekranı var. Ad kutusu boşsa vesikalığın adı kullanılır (kutuda silik yazıyla görünür), yazılan ad vesikalık değişse de kalır. Seçilen vesikalık isimlikte ve duvarda; eski kayıtlarda yalnız rastgele tohum olduğundan onlar havuzdan eskisi gibi seçiliyor.
- Seçim ekranı broşüre döndü: her adayın lakabı ve kısa, komik bir biyografisi var. Malzeme yerel siyaset araştırmasından: dev meyve heykelleri (Kırkağaç'ın kavunu), seçim öncesi asfalt, araba etrafına dökülen asfalt, denizi olmayan yere liman vaadi, ebedi aday, kasayı boş bulduk basın toplantısı, parti değiştirip çöp kutusu boyamak, akraba istihdamı, kardeş şehir gezileri, rekor denemesinde kırılan kazan. Başkanın isteğiyle biraz da kara mizah: ölü seçmen, taziye kampanyası, haczedilen makam aracı, babadan oğula SGK borcu. Gerçek kişi ve parti adı yok.
- Vesikalıklar SDXL img2img ile parlak oyuncak stiline çevrildi ve oyuna kondu (repo dışında geçici çalışma alanı: strength 0.85, blur 14, aynı seed ve stil). "Brown skin" tarifi bazı yüzleri Afrikalı yaptı, başkan itiraz etti: Anadolu ilçesi. Tanımlara "Turkish, Anatolian features, tanned olive skin" eklendi.

## Yeni evraklar ve zaman (2026-09-24)
Başkanın isteği: "50 yeni seçenek, tekrara düşmeye başladık; süreli, birbirini etkileyen olaylar bol olsun; zorluk çok az artsın; son on yılın Türkiye'sinden taşlama, gerçek ad yok." Önce iki araştırma yapıldı:
- **Tasarım:** Reigns (koşullarla süzülen, ağırlıkla şişen torba), Fallen London'ın kalite tabanlı anlatısı (sayaç eşikleri), Valve'ın salience yaklaşımı. Sonuç: kart motoru zaten bir storylet motoru; eksik olan sayaç eşikleri, teslimde sınanan koşullu zincir, politika etkileşimi ve hatırlama metinleriydi. Gecikmeli bedel telgraflanmalı ve erken kapatılabilmeli.
- **İçerik:** son on yılın Türkiye'si: kur şokları ve etiket üstüne etiket, kira tavanı, öğrenci barınma, tanzim satış, kent lokantaları, müjdeler, garantili yollar, kripto ve saadet zincirleri, yasa dışı bahis sponsorları, tasarruf genelgesi, e-Devlet çöküşü, yerli uygulamalar, IMEI harcı, dokuz günlük bayram, maaş promosyonu, sahte video.

Motor: ortak koşul dili, sayaçlar (`inc/dec`, `reqCnt`), `next: {id, in: [a, b], if, else}`, politika etiketleri ve `SYN` etkileşim tablosu, genel `alt`, salience ağırlığı, vaat defteri (anketten düşer, yeni dönemde yarısı unutulur). Yürürlük sınırı 7'ye çıktı; dolunca en eski sıradan karar oyuncuya haber verilerek kalkıyor, eskiden sessizce siliniyordu. `tools/lint.mjs` içerik grafını denetliyor. Testler, ay 0'da ilk kez görülen bir etkileşimin her ay yeniden tetiklendiği bir hatayı yakaladı.

İçerik: 61 yeni evrak. Altı yay (Müjde, Kur saati, Kira, Kolay para, Garantili yol, Kavun), birbirine değen kararlar (tasarruf, kent lokantası, tanzim, e-Belediye, yerli uygulama, scooter) ve tek evraklar. 11 etkileşim var.

Denge: ilk ölçümde yeni evraklar kasayı fazla emiyordu (seçenek başına −3,2, eskilerde −0,8), "insan" oyuncunun ölümlerinin %51'i kasadandı. Süresiz kararlar süreli yapıldı ve bedeller hafifletildi (−1,75). TUNE: rescue 1,4→1,3, fatigue 7→6,5, base 19→17,5, scale 1,15→1,2. Önce/sonra ("insan"): medyan 177→119 ay, ilk dönem %91→%88, seçim %80→%78, emekli %26→%16. Usta/insan medyan oranı 1,05'ten 1,5'e çıktı; artık beceri önemli.

## Çok adaylı seçim ve seçim gecesi (2026-09-24)
Başkanın itirazı: "%48 ile doğrudan kaybetmek mantıksız, hep iki aday mı çıkacak? Adayı aramızdan seçelim, Tekir de aday olabilsin; 2-3-4-5 adaylı, duruma göre rastgele; Democracy gibi bir seçim ekranı olsun."
- Araştırma: belediye başkanlığı tek turlu, en çok oyu alan kazanır (2972 sayılı kanun). Democracy seçmen gruplarıyla, Türk seçim gecesi yayını "açılan sandık" oranı ve yanıltıcı ilk sandıklarla anılıyor. NYT'nin titreyen ibresi, hareketin yalnız gerçek veriyi izlemesi gerektiğini gösteriyor.
- Model: anket (`pollOf`) sizin teke tek oyunuz olarak kaldı; ana rakip kalanı alır. Her ek aday oyunun `beta` kadarını sizden, kalanını ana rakipten çalar. Aday sayısı "insan" oyuncu için 2: %21, 3: %38, 4: %27, 5: %14. Zaferlerin dörtte biri %50'nin altında geliyor. Denge değişmedi: ilk dönem %88, seçim %78, emekli %17.
- Seçim gecesi: sandıklar mahalle mahalle açılır (köylerden merkeze, en son traktörlü Yukarıkavak). Liderlik gerçekten el değiştirebilir, çünkü her mahallenin seçmen karışımı farklı. Ekranın gösterdiği toplam kesin sonuca eşittir. Atlanabilir, ikinci seçimden sonra daha hızlıdır, hareket azaltmada üç adımda biter.
- Testler: oy sayımı (toplam %100, çoğunluk, dostun aday olmaması, Tekir oranı, döküm tutarlılığı, metin sığması, akış) ve `pnpm election` tarayıcı testi. Yakalanan iki hata: yuvarlama farkı başa baş yarışta sıralamayı bozuyordu (en büyük kalan yöntemine geçildi); öndeki aday rozeti genel bir CSS kuralı yüzünden bütün satırlarda görünüyordu.

## Süreklilik taraması ve erken seçim (2026-09-24)
Başkanın yakaladığı: dev kavun heykelini reddetmiş, yeni oyunda tescil evrakı "kasalarda dev kavun heykelimizin fotoğrafı var" diyor. Heykel teklifi o oyunda daha gelmemiş bile.
- Bütün metinler tek tek okundu. Olaya bağlanmadan anılan yerler: tescil (heykel), tek kullanıcı (e-Belediye yerine ortak ofisle de tetikleniyordu), ova kavgası (tescil yokken alım garantisiyle de), petrol evrakları (1974 model itfaiye aracı satılmış ya da müzeye konmuş olabilir), kiracı (henüz kurulmamış kira masası), imece (yapılmamış olabilecek park), açılış töreni (açılmamış olabilecek çeşme). Heykel ve hurda evrakı artık bayrak koyuyor. Anan metinler bayrağa bağlandı ya da bayrak yoksa geçerli bir varyanta düşüyor. Etkileşim kuralları, anlattıkları karara özel etiketlerle eşleşiyor.
- `tools/lint.mjs`'e `FACTS` kuralı eklendi: bir olayı anan metin, o olayın zinciri dışında ve bayrağı istenmeden gelebiliyorsa hata. Bozuk içerik testi bunu da sınıyor.
- Esnaf 100 olunca "makamı okey masası aldı" diye oyunun bitmesi anlamsızdı. Artık erken seçim oluyor, Hacı Bekir güçlü giriyor (+22). "İnsan" oyuncu için oyun başına ~0,12 erken seçim çıkıyor, %57'si kazanılıyor. Denge değişmedi: ilk dönem %89, seçim %79, emekli %17.
- Simülasyonun yakaladığı hata: erken seçim evrakı imzalanınca esnaf hâlâ 100'de olduğu için yeni bir erken seçim açılıyor, oy hiç sayılmıyordu (sonsuz döngü). Seçim evrakında esnaf tavanı artık yeni bir erken seçim açmıyor. Buna test eklendi.
- Başkanın isteği: normal oyunda seçim ekranını görebilmek için bir hile kodu. Oyun masasında klavyeden "akparti" yazılınca seçim gecesi, oyunun o anki gidişatıyla prova olarak açılır. Hesap oyunun bir kopyası üzerinde yapılır; ay, dönem, kayıt ve günlük değişmez, "Devam" deyince aynı evraka dönülür. "a" kodun ilk harfi ve aynı zamanda sol kısayolu olduğundan 350 ms beklenir; arkasından kodun devamı gelmezse sol seçilir. İlk anlayışım (sonucu lehe çeviren hile) yanlıştı, tamamen geri alındı. 2026-09-25'te seçim gecesi ve menü bitince başkanın isteğiyle kaldırıldı; prova yayınının KJ ve kayan yazı satırları da gitti.

## Seçim gecesi: KARAKAVAK TV yayını (2026-09-24)
Başkanın isteği: seçim ekranı KJ'li bir haber kanalı yayını gibi olsun, bizim aday belli olsun, video yerine anlatan biri olsun. Kayan yazı absürt olsun, ilçeyle sınırlı kalmasın; ülke ve dünya da olsun. Örnek: 2019 İstanbul seçim gecesi yayını (sol sütunda aday kartları, üstte il kutuları, ortada stüdyo, altta KJ ve kayan yazı).
- İş üç ayrı çalışma kopyasında paralel yürüdü. A: yayın ekranının yerleşimi (`index.html`, `style.css`, `tools/tv-mock.mjs`). B: spiker ve stüdyo (`src/anchor.js`). C: yazılar (`src/broadcast.js`). Birleştirme ve akış ana dalda yapıldı.
- Kartlar oy geldikçe yer değiştirir (FLIP), sayılar sandık gelince yuvarlanarak artar. Sizin kartınızda altın çerçeve, "★ SİZ" ve "SİZİN ADAYINIZ" var; mahalle kutularında ve seçmen dökümünde de sizin satırınız altın renkte.
- KJ en az 2,6 sn ekranda kalır. Bekleyen haberlerden önceliklisi gelir (son sandık > liderlik > %25/50/75 ve mahalle). Liderlik haberi gösterilecekken lider yine değiştiyse haber bayatlamış sayılır ve sayım satırına döner. Aynı gece bir satır iki kez çıkmaz.
- Spiker olaylara tepki verir: KJ değişince konuşur, mahalle açılınca kâğıtlarına bakar, yüzdelerde duvarı gösterir, liderlik değişince şaşırıp öne eğilir, son sandıkta ışıklar titrer, Tekir yarışıyorsa sayım ortasında masaya çıkıp kalemi düşürür. Sonuçta kazanırsanız sevinir, kaybederseniz üzülür, Tekir kazanırsa sırıtır. Stüdyonun kendi kayan yazısı kırpıldı; yayının bandı yeter.
- Sayım biraz uzadı (ilk seferde ~22 sn, sonrakilerde ~13 sn), yoksa KJ okunmuyordu. Yukarıkavak'ın tek sandığı küçüldü: son sandık gelmeden sayım %99'u geçiyor, traktör beklemesi anlamlı oldu. Sonuçtan sonra KJ'ler döner, mahalle kutuları üçer üçer geçer, 3,8 sn sonra seçmen dökümü açılır.
- Klavyeyle oynayanda `navigator.vibrate` tarayıcı konsoluna hata düşürüyordu; artık kullanıcı sayfayla hiç etkileşmediyse çağrılmıyor.

## Ankara'dan davet (2026-09-24)
Başkanın şikâyeti: "Ankara win de lose gibi; reddetme şansımız da yok." Ankara 100 olunca oyun, hicaz eşliğinde bir yenilgi gibi bitiyordu.
- Artık erken seçim gibi bir yay var. Ankara tavan yapınca `DAVET` evrakı gelir; taraflar çevrilmez: solda ret, sağda kabul. Teklif reddetme sayısına göre büyür: genel merkez (genel başkan yardımcılığı), milletvekilliği (Suat Bey'in sırası), sonra hep bakan yardımcılığı. Dördüncü ve sonraki davetler hatırlama metniyle gelir ("santral sizi sesinizden tanıyor").
- Kabul terfiyle biter. Üç ayrı final var (`a100_gm`, `a100_mv`, `a100`), hepsi `win: true`. Düğmeler "Hayırlı olsun / Karakavak'a selam", gazetede "MÜJDE", hicaz yerine zafer sesi.
- Ret: halk artar, Ankara 64'e, sonra 59'a, sonra 46'ya iner. Peşine zincir gelir: Tuncay'ın manşeti, genel merkezin kırgınlığı ve geciken ödenek, ikinci retten sonra Suat Bey'in vefa ödeneği (reddi en çok o sever, sıra ona kalır), üçüncüden sonra "rutin" denetim ve kavun skandalı. `ankara_ret` bayrağını ödül evrakı ve seçim gecesinin kayan yazısı okur.
- Seçim evrakında Ankara tavanı, esnafınki gibi sandığı bekletmez; davet seçimden sonra gelir. Fikret'in öğüdü davette hesap değil gönül konuşur.
- Simülasyona "ankaracı" oyuncu eklendi: Ankara'yı hep yukarı iter, davetleri hep reddeder. Oyun başına ~1 genel merkez, ~0,8 milletvekilliği, ~1,4 bakan yardımcılığı daveti görür. İlk dönemi %91 bitirir ama seçimlerin yalnız %49'unu kazanır; Ankara'nın adamı sandıkta zorlanır. Diğer oyuncu tiplerinin dengesi değişmedi (insan: medyan 119 ay, ilk dönem %89, seçim %79). "Hiçbir oyuncu tipinde çıkmayan evrak" raporu da eklendi; şu an boş.

## Ad zarı (2026-09-25)
Başkanın isteği: aday kaydında ad kutusuna bir zar; basınca vesikalığa uygun, rastgele bir ad soyad gelsin. Kadının vesikalığında erkek adı kalmasın, tersi de; gerçek bir siyasetçinin ya da ünlünün adı hiç çıkmasın.
- `src/adlar.js`: 299 kadın, 313 erkek adı (16'sı iki cinse de konan: Deniz, Derya, Evren, Umut...), 488 soyadı. Adlar ninelerden (Hanife, Münevver, Gülendam) yeni kuşağa (Ecrin, Eymen, Poyraz), doğudan (Berfin, Diyar) karışık. Soyadlarının beşte biri çarşıdan ve lakaptan: Semaverci, Tespihçi, Kavunoğlu, Arzuhalci, Mühürcü, Duymaz, Çokbilir, Demirbaş.
- Her vesikalığa resmine bakılarak cins verildi (`BASKANLAR.cins`): 10 kadın, 6 erkek. Varsayılan adlar da kendi havuzunda; test bunu da sınıyor.
- Gerçek kişi yok. Cumhurbaşkanı, başbakan, parti lideri, bakan, büyükşehir başkanı ve ünlülerin soyadları (`YASAK_SOYAD`, 255) havuza girmez. Soyadı sıradan olan ünlülerin tam adı (`YASAK_TAM`, 124: Mesut Yılmaz, Cem Yılmaz, Sezen Aksu, Hakan Fidan...) üretilemez; test zarı tam o ada düşürüp başka ad geldiğini görüyor. Tayyip, Devlet gibi tek kişiyle özdeşleşmiş adlar da yok. Örnek diye önerilen Kavakçı, Merve Kavakçı yüzünden yasak listeye girdi.
- Seçimde rakip çıkabilen oyun kişilerinin adları (Nermin, Suat, Cengiz, Kaan...) ve Fikret havuzda yok, yoksa seçim gecesi iki Nermin yarışırdı. BASKANLAR'ın soyadları da yok: zar başka bir adayın adını vermesin.
- Zarın verdiği ad yazılan ad gibi saklanır, ayrıca `nameZar` ile zardan geldiği hatırlanır. Karşı cinsten vesikalığa geçilince zar kendiliğinden yeniden atılır (ortak adlar kalır). Oyuncu kutuya bir harf yazarsa ad onundur, bir daha değişmez. Art arda aynı ad gelmez; son 8 atıştaki adlar ve soyadlar da tekrarlamaz.
- "ADAY" kaşesi kartın sağ üstündeydi, zarın üstüne biniyordu; vesikalığın köşesine basıldı. Zar kutudan yer alınca telefonda uzun adlar (yer tutucudaki "Mehmet Emin Yurtsever" bile) taşacaktı; yazı artık harf sayısıyla küçülüyor (`--n` ve kap birimi, en az ~11px).
- Testler: `test/adlar.test.mjs` (havuz boyu, tekrar, yazım ve İ/ı, yasak listeler, 20 bin ad, art arda tekrar). `tools/menu.mjs` telefonda ve masaüstünde zarın adı değiştirdiğini, cins havuzunu, Enter ile atılmayı, karşı cinse geçince yenilenmeyi, yazılan adın kalmasını, zarın yazıya binmemesini ve 24 harfin sığmasını deniyor.

## Ana menü (2026-09-25)
Başkanın isteği: ana menü gerçek bir oyunun ana menüsü gibi olsun.
- Poster yerine tam ekran menü var. Solda logo ve dikey liste: Devam et (altında kayıt satırı), Yeni dönem, Eski başkanlarımız, Nasıl oynanır, Ayarlar, Künye. Liste ↑/↓, fare ve dokunmayla kullanılır; madde değişince yumuşak bir tık sesi çıkar. Sağ üstte raptiyeli ilan panosu (yenilikler) var. Sağ altta seçili maddenin bilgi kartı durur: kayıtta göstergeler ve anket, duvarda ilk üç başkan.
- Yeni dönem önce aday kaydı formunu açar: vesikalık ızgarası, ad, lakap, biyografi, rastgele aday ve ad zarı. Kayıtlı dönem varsa "o dönem kapanır" uyarısı çıkar. Ayarlarda ses, ses düzeyi, titreşim, hızlı seçim gecesi, tanıtımı yeniden gösterme ve iki adımlı "hepsini sil" var. Künyede lisanslar ve kurgu uyarısı. Sürüm derlemede basılır.
- Arka plan: önce bir ajan canlı SVG meydan çizdi (`tools/meydan.js`: belediye binası, bayrak, çay ocağı, kıraathane, tavlacı amcalar, kavun anıtı, Tekir; 613 düğüm, 18 animasyon). Güzeldi ama başkanın tarayıcısını kilitledi, öbür sekmede video dondu: SVG'nin içindeki her hareket bütün sahneyi her karede yeniden boyatıyordu, bilgi kartının arkadaki bulanıklaştırması da her karede yeniden hesaplanıyordu. Artık tek resim var. Üstünde yalnız opacity/transform ile oynayan birkaç ufak katman duruyor (lamba ve pencere ışığı, semaver buharı, gece yıldızları). Fare parallaksı yalnız resmin kutusunu kaydırır. "Devam et" makam penceresine yaklaşıp sıcak ışıkla oyuna geçer.
- Resmi oyuncak diyoramaya çevirmek için önce SDXL img2img denendi (`vesikalik-sd/scene.py`, ControlNet canny ile birlikte). Düşük güçte bulanık kaldı, Tekir kayboldu. Yüksek güçte sahne dağıldı, amcalar masaya dönüştü. Başkan resimleri ChatGPT'ye yaptırdı: `meydan-render` karesi, üç portre stil örneği ve masaüstündeki `meydan-chatgpt/OKU-BENI.md` promptlarıyla. Sonuç 3:2 (1536×1024). Üç hâlde bina biraz farklı yerde durduğu için ışık noktaları palete göre `MD_NOKTA`'da tutuluyor. Palet yerel saate göre seçilir: 21-5 gece, 6-16 gündüz, 17-20 akşamüstü. `?saat=23` gibi bir adres önizletir.
- Telefonda sahne 9vh aşağı iner ki bina logonun altında kalsın; üstte açılan boşluk resmin üst kenar rengiyle dolar. Service worker'ın önbellek adı artık resimlerden de türüyor; aynı adla yenilenen resim eski önbellekte kalmıyor.
- Testler: `tools/menu.mjs` yeni. `election`, `fit`, `scene` testleri "Devam et"in giriş geçişini bekliyor.

## Vite'a geçiş (2026-09-25)
Başkanın isteği: tek sayfaya gömülü derleme yerine Vite ile parçalı derleme; ardından adım adım TypeScript. "Zart diye geçirme, test ede ede."
- 1. adım: dosyalar ES modülü oldu. Eskiden `build.mjs` altı dosyayı tek kapsamda birleştiriyordu. Hangi dosyanın hangi adı kullandığı betikle çıkarıldı, yanlış eşleşmeler elle ayıklandı (`pick`, `tick` ve `$` gibi). `...CRISES` gibi yaymaları ilk taramada kaçırmıştım, ikinci taramada çıktı. `ui.js` dışındaki her dosyanın üst düzey adları dışa açık.
- Derleme Vite'ta: `index.html` kökte, `src/main.js` giriş. `public/` (vesikalıklar, meydan, ikonlar, manifest, font lisansı) olduğu gibi kopyalanıyor. Fontlar CSS'ten özetli adlarla çıkıyor. interact.js npm paketi olarak koda katılıyor; yedek sürükleme (`bindDragBasic`) kalktı. Service worker `vite.config.js`'teki eklentiden üretiliyor ve derlemenin bütün dosyalarını önbelleğe alıyor; önbellek adı dosya içeriklerinden türüyor.
- Tek dosyalık `oyna.html` ve claude.ai önizlemesi kalktı: gömülü sayfa, bu geçişin kaldırmak istediği şeydi.
- Önce: 439 KB'lık tek `index.html` (gzip 139 KB), içinde bütün JS ve CSS. Sonra: 24 KB HTML (gzip 7,5 KB) + JS 340 KB (gzip 123 KB) + CSS 77 KB (gzip 17 KB), ayrı ve özetli adlı. Artık tarayıcı önbelleğinde tutulabiliyorlar. Parçalama 2. adımda.
- Testler vitest'e geçti (travelle gibi). Eskiden her test kodu `new Function` ile taze kopyalıyordu; testlerin eklediği deneme kartları öbür testlere sızmasın diye artık `test/yukle.mjs` her çağrıda modülleri sıfırlayıp yeniden yüklüyor. Tarayıcı testleri `dist/`'i kendi açtıkları yerel sunucudan oynuyor (modül kodu dosyadan açılınca çalışmaz). Gösteri araçları (tv-mock, anchor-demo) modülleri `betik()` ile düz betiğe çevirip sayfaya gömüyor.
- Doğrulama: 63 birim testi, altı tarayıcı testi (smoke, menu, gesture, fit, election, scene), tv-mock, anchor-demo, meydan-render, sesler ve 300 oyunluk simülasyon (insan: medyan 119 ay, ilk dönem %88, seçim %79; eskisiyle aynı). `pnpm dev` de modülleri doğrudan sunuyor.
