# Çaylar Belediyeden

**akinozgen.com/games/belediye/**

Kurgusal Karakavak ilçesinin belediye başkanı sizsiniz. Her ay masanıza bir evrak gelir; siz onu sağa ya da sola kaydırırsınız. Halkı, kasayı, esnafı ve Ankara'yı dengede tutmanız gerekir. Kasa, Esnaf ya da Ankara dibe vurursa da tavan yaparsa da makam gider. Halk ise yalnız dibe vurursa tehlikelidir; sevgisi fazla gelmez, sandıkta işe yarar. Seçim beş yılda bir yapılır.

Oyun bağımsızdır: sunucu, hesap ya da dış servis gerektirmez. Kayıtlar oyuncunun tarayıcısında tutulur, oyun ilk açılıştan sonra internetsiz de çalışır.

## Yayına alma

```sh
cd games
pnpm build          # bütün oyunlar public/games/<oyun>/ klasörüne derlenir
cd ..
git add -A && git commit -m "…" && git push   # Cloudflare siteyi push'la yayına alır
```

Ana projeden tek komut isterseniz `npm run build:games` aynı işi yapar. Derlenmiş çıktı (`public/games/belediye/`) repoya girer, travelle'de olduğu gibi. Sitenin kendi derlemesi (Astro) bu klasörü olduğu gibi yayınlar.

## Komutlar

`games/apps/belediye` içinde ya da `pnpm --filter @travelle/belediye <komut>` ile:

| Komut | Ne yapar |
|---|---|
| `pnpm build:site` | Oyunu `../../../public/games/belediye/` klasörüne derler; klasörü önce boşaltır |
| `pnpm build` | Yerel çıktılar: `dist/web/` (site kopyasının aynısı), `dist/oyna.html` (fontları gömülü tek dosya), `dist/caylar-belediyeden.html` (claude.ai önizlemesi) |
| `pnpm dev` | Derler ve `dist/web/` klasörünü http://localhost:8765 adresinde açar |
| `pnpm test` | İçerik ve motor testleri (`node --test`) |
| `pnpm sim` | Motoru altı oyuncu tipiyle 2000'er kez oynatır, denge raporu verir. `node tools/sim.mjs 3000 fatigue=6` gibi ayarlar denenebilir |
| `pnpm smoke` · `pnpm gesture` · `pnpm fit` | Headless Chrome testleri: uçtan uca oyun, dokunma ve fiske, telefonlarda sığma. Sessizdir; Chrome yolu farklıysa `CHROME` ortam değişkeniyle verilir. Çıktılar `.cache/` klasörüne yazılır |
| `pnpm icons` | Uygulama ikonlarını yeniden çizer |
| `pnpm portraits` | Eksik vesikalıkları tariften düz çizim olarak üretir; var olan resme dokunmaz. `--force` ya da ad vermek (`node tools/portraits.mjs hans`) mevcut 3D resmin üstüne düz çizim yazar |

Sitenin tamamını yerelde denemek için ana projede `npm run build` çalıştırıp `node games/apps/belediye/tools/serve.mjs 8766 dist` ile açın, sonra `/games/belediye` adresine gidin.

## Yapı

| Yol | İçerik |
|---|---|
| `src/cards.js` | 32 karakter, 16 başkan adayı: ad, lakap, kısa biyografi (`BASKANLAR`), ~150 evrak, kriz kartları, 10 son |
| `src/engine.js` | DOM'suz oyun motoru. Denge ayarları `TUNE` nesnesinde |
| `src/ui.js` | Sürükleme, mühür, göstergeler, WebAudio sesleri, Fikret'in tavsiyeleri, gazete, koridor duvarı |
| `src/style.css`, `src/index.html` | Makam masası |
| `web-src/` | Yerel fontlar (SIL OFL), ikonlar, vesikalıklar, interact.js (MIT) |
| `web-src/portraits/` | Vesikalıklar: her kişi için `<anahtar>.webp` (anahtar `cards.js`'teki `PEOPLE`), başkanlık vesikalıkları için `baskan-*.webp` (anahtar `BASKANLAR`) |
| `tools/portrait.js` | Vesikalıkların ilk tarifleri ve SVG çizeri; oyuna girmez. Şimdiki resimler bunlardan SDXL img2img ile üretildi (bkz. NOTES) |
| `build.mjs` | Derleyici: CSS/JS'yi tek sayfaya gömer; manifest ve service worker üretir |
| `tools/` | Sunucu, simülasyon ve tarayıcı testleri |
| `NOTES.md` | Geliştirme günlüğü: kararlar, denge ölçümleri, geri bildirimler |

## Teknik notlar

- **Adres:** Sayfa `/games/belediye/` altında göreli yollarla çalışır. Eğik çizgisiz gelinirse baştaki küçük betik adresi eğik çizgiye çevirir.
- **Service worker:** Kapsamı yalnız `/games/belediye/`, sitenin geri kalanına dokunmaz. Önbellek adı içerikten türetilir; her derlemede eskisi silinir. Sayfanın kendisi önce ağdan alınır, yani güncelleme bir yenilemeyle gelir.
- **Ölçek:** Bütün ölçüler `rem`. Kök yazı boyu ekran yüksekliğiyle, dar ekranda genişlikle orantılı: telefonda ~13px, 1080p'de ~19px, 1440p'de ~25px.
- **Vesikalıklar:** Hazır resim dosyalarıdır; oyun onları çalışırken çizmez. Web sürümü `portraits/` klasöründen yükler, service worker hepsini önbelleğe alır; tek dosyalık kopyalar (`oyna.html`, önizleme) resimleri sayfaya gömer. Bir kişinin resmini değiştirmek için aynı adla yenisini koyup derlemek yeter (kare, 384px ve üstü). Başkanlık vesikalıkları `cards.js`'teki `BASKANLAR` listesinden gelir: oyuncu başlıkta birini seçer, ad kutusunu boş bırakırsa vesikalığın adı kullanılır, kendi adını yazarsa o kalır. Seçim isimlikte ve eski başkanlar duvarında görünür. Resmi olmayan kişi ya da listeye bağlı olmayan resim varsa test uyarır.
- **Sürükleme:** Evrak sürükleme interact.js ile yapılır. Yön kilidi vardır, dikey hareket karar sayılmaz. Karar ya kartın ~%26'sı kadar sürüklemekle ya da kısa, hızlı bir fiskeyle verilir. Evrakın içinde `touch-action: none` şarttır: metin kutusu kaydırılabilir olunca tarayıcı sürüklemeyi yarıda kesiyordu.
- **Denge:** `pnpm sim` son ölçümü: rastgele oyuncu ~3 yıl dayanır. Okları okuyarak oynayan ilk dönemi %90 bitirir, seçimlerin ~%80'ini kazanır, dörtte biri 20 yılı doldurup emekli olur. En sık düşüren kasadır.
