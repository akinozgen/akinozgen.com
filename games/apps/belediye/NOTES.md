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
