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
