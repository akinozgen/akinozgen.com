# Çaylar Belediyeden

**akinozgen.com/games/belediye/**

Kurgusal Karakavak ilçesinin belediye başkanı sizsiniz. Her ay masanıza bir evrak gelir; siz onu sağa ya da sola kaydırırsınız. Halkı, kasayı, esnafı ve Ankara'yı dengede tutmanız gerekir. Kasa dibe vurursa da tavan yaparsa da makam gider. Esnaf ile Ankara dibe vurursa makam gider; esnaf tavan yaparsa erken seçim olur, Ankara tavan yaparsa sizi yukarı çağırır. Halk ise yalnız dibe vurursa tehlikelidir; sevgisi fazla gelmez, sandıkta işe yarar. Seçim beş yılda bir yapılır.

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
| `pnpm test` | İçerik grafı, motor ve mekanik testleri (`node --test`). İçerik denetimi `tools/lint.mjs`'te |
| `pnpm sim` | Motoru yedi oyuncu tipiyle (Ankara'yı hep yukarı iten ve davetleri reddeden "ankaracı" dahil) 2000'er kez oynatır; denge, ölüm sebepleri, etkileşim, vaat, beceri oranı ve baskın seçenek raporu verir. `node tools/sim.mjs 3000 fatigue=6` gibi ayarlar denenebilir |
| `pnpm smoke` · `pnpm gesture` · `pnpm fit` | Headless Chrome testleri: uçtan uca oyun, dokunma ve fiske, telefonlarda sığma. Sessizdir; Chrome yolu farklıysa `CHROME` ortam değişkeniyle verilir. Çıktılar `.cache/` klasörüne yazılır |
| `pnpm icons` | Uygulama ikonlarını yeniden çizer |
| `pnpm election` | Headless Chrome'da seçim gecesi testi: 5 adaylı yarış kurar; sayım ortasında kartların oya göre dizildiğini, oyuncu kartını, KJ'yi, stüdyoyu ve kayan yazıyı, sonuçta yüzdeleri motorla karşılaştırır. Hareket azaltma, "Kaldığım yerden", erken seçim ve prova kodunu da dener |
| `node tools/tv-mock.mjs` · `node tools/anchor-demo.mjs` | Seçim gecesi yayın ekranının ve spikerin oyundan bağımsız provaları; görüntüler `.cache/tv/` ve `.cache/anchor/` altına |
| `pnpm portraits` | Eksik vesikalıkları tariften düz çizim olarak üretir; var olan resme dokunmaz. `--force` ya da ad vermek (`node tools/portraits.mjs hans`) mevcut 3D resmin üstüne düz çizim yazar |

Sitenin tamamını yerelde denemek için ana projede `npm run build` çalıştırıp `node games/apps/belediye/tools/serve.mjs 8766 dist` ile açın, sonra `/games/belediye` adresine gidin.

## Yapı

| Yol | İçerik |
|---|---|
| `src/cards.js` | 32 karakter, 16 başkan adayı: ad, lakap, kısa biyografi (`BASKANLAR`), ~210 evrak (birbirine bağlı yaylar dahil), etkileşim tablosu (`SYN`), seçim adayları (`ADAYLAR`) ve seçmen grupları, kriz kartları, 11 son. Kart şeması dosyanın başında |
| `src/engine.js` | DOM'suz oyun motoru: ortak koşul dili (`condOK`), sayaçlar, koşullu ve aralıklı zincirler, etiket etkileşimleri, vaat defteri. Denge ayarları `TUNE` nesnesinde |
| `src/ui.js` | Sürükleme, mühür, göstergeler, WebAudio sesleri, Fikret'in tavsiyeleri, gazete, koridor duvarı, seçim gecesi akışı |
| `src/broadcast.js` | KARAKAVAK TV'nin yazıları: duruma göre KJ (alt bant), kayan yazı (ilçe, ülke, dünya), kur kutusu, "Neden?" satırları. DOM'suz, `test/broadcast.test.mjs` sınar |
| `src/anchor.js` | Seçim gecesi stüdyosu: bıyıklı spiker, masa, video duvarı, Tekir. Tek SVG; `studio()` konuşma, ruh hâli ve tepkileri denetler |
| `src/style.css`, `src/index.html` | Makam masası |
| `web-src/` | Yerel fontlar (SIL OFL), ikonlar, vesikalıklar, interact.js (MIT) |
| `web-src/portraits/` | Vesikalıklar: her kişi için `<anahtar>.webp` (anahtar `cards.js`'teki `PEOPLE`), başkanlık vesikalıkları için `baskan-*.webp` (anahtar `BASKANLAR`) |
| `tools/portrait.js` | Vesikalıkların ilk tarifleri ve SVG çizeri; oyuna girmez. Şimdiki resimler bunlardan SDXL img2img ile üretildi (bkz. NOTES) |
| `build.mjs` | Derleyici: CSS/JS'yi tek sayfaya gömer; manifest ve service worker üretir |
| `tools/` | Sunucu, simülasyon, içerik denetimi (`lint.mjs`) ve tarayıcı testleri |
| `NOTES.md` | Geliştirme günlüğü: kararlar, denge ölçümleri, geri bildirimler |

## Teknik notlar

- **Adres:** Sayfa `/games/belediye/` altında göreli yollarla çalışır. Eğik çizgisiz gelinirse baştaki küçük betik adresi eğik çizgiye çevirir.
- **Service worker:** Kapsamı yalnız `/games/belediye/`, sitenin geri kalanına dokunmaz. Önbellek adı içerikten türetilir; her derlemede eskisi silinir. Sayfanın kendisi önce ağdan alınır, yani güncelleme bir yenilemeyle gelir.
- **Ölçek:** Bütün ölçüler `rem`. Kök yazı boyu ekran yüksekliğiyle, dar ekranda genişlikle orantılı: telefonda ~13px, 1080p'de ~19px, 1440p'de ~25px.
- **Vesikalıklar:** Hazır resim dosyalarıdır; oyun onları çalışırken çizmez. Web sürümü `portraits/` klasöründen yükler, service worker hepsini önbelleğe alır; tek dosyalık kopyalar (`oyna.html`, önizleme) resimleri sayfaya gömer. Bir kişinin resmini değiştirmek için aynı adla yenisini koyup derlemek yeter (kare, 384px ve üstü). Başkanlık vesikalıkları `cards.js`'teki `BASKANLAR` listesinden gelir: oyuncu başlıkta birini seçer, ad kutusunu boş bırakırsa vesikalığın adı kullanılır, kendi adını yazarsa o kalır. Seçim isimlikte ve eski başkanlar duvarında görünür. Resmi olmayan kişi ya da listeye bağlı olmayan resim varsa test uyarır.
- **Sürükleme:** Evrak sürükleme interact.js ile yapılır. Yön kilidi vardır, dikey hareket karar sayılmaz. Karar ya kartın ~%26'sı kadar sürüklemekle ya da kısa, hızlı bir fiskeyle verilir. Evrakın içinde `touch-action: none` şarttır: metin kutusu kaydırılabilir olunca tarayıcı sürüklemeyi yarıda kesiyordu.
- **Denge:** `pnpm sim` son ölçümü (2000 oyun): rastgele oyuncu ~3 yıl dayanır. Okları okuyup arada canının istediğini seçen "insan" oyuncu ilk dönemi %88 bitirir, seçimlerin %78'ini kazanır, %16'sı 20 yılı doldurup emekli olur; medyanı 119 ay. Kesin sayıları hesaplayan "usta" 1,5 kat uzun yaşar. Ölümler sandık (%38) ve kasa (%32) arasında bölünür.
- **Seçim:** Tek tur, en çok oyu alan kazanır. Adaylar seçimden 9 ay önce ilan edilir: ana rakip (çoğunlukla Nermin Hanım) ve duruma göre katılanlar (esnaf dipteyse Hacı Bekir, Ankara soğuksa Suat Bey, küs olunan muhtar ya da gazeteci...). Dost olan aday olmaz. Tekir nadiren, mama verildiyse daha sık aday olur; kazanırsa ayrı bir son gelir. Anket sizin teke tek oyunuzdur. Her ek aday kendi oyunun bir kısmını sizden, kalanını ana rakipten çalar; bu yüzden kalabalık yarışta %40 da kazandırabilir. Sonuç, KARAKAVAK TV'nin canlı seçim yayınında sandık sandık açılır: aday kartları oy geldikçe yer değiştirir, sizin kartınız altın çerçevelidir, üstte mahalle kutuları, ortada konuşan spiker, altta KJ ve ilçeden dünyaya absürt kayan yazı vardır. Sandıklar mahallelerin seçmen karışımından üretilir ve toplamları kesin sonuca eşitlenir, yani ekran sonucu değiştirmez, yalnız sırasını dramatize eder. Ardından seçmen grubu dökümü ve "Neden?" satırları gelir.
- **Erken seçim:** Esnaf tavan yaparsa oyun bitmez. Esnaf odası belediyeyi ele geçirir ve meclis erken seçim kararı alır; Hacı Bekir esnafın adayı olarak güçlü girer. Kazanırsanız esnaf 70'e iner, dönem ve normal seçim takvimi yerinde kalır. Bekir kazanırsa okey masası sonu, başkası kazanırsa sandık sonu gelir.
- **Ankara'dan davet:** Ankara tavan yaparsa oyun bitmez, sizi yukarı çağırırlar (`DAVET`). Teklif her retle büyür: genel merkez, milletvekilliği, sonra hep bakan yardımcılığı. Kabul terfiyle biten bir finaldir; gazete "MÜJDE" diye çıkar. Ret halkı sevindirir, Ankara'yı sert düşürür ve peşine evrak getirir: manşet, genel merkezin kırgınlığı, geciken ödenek, Suat Bey'in vefa borcu, "rutin" denetim. Ankara'nın ödül evrakı ve seçim gecesinin kayan yazısı reddi hatırlar.
- **Birbirine bağlı içerik:** Kararlar aylar sonra geri döner. Devam kartının koşulu teslim anında yeniden sınanır, borcu erken kapatan bedelden kurtulur. İki etiketli karar aynı anda yürürlükteyse `SYN` tablosu her ay ek etki yazar, ilk karşılaşmada bir kart ya da haber düşer. Tutulmayan vaatler (`vaat` sayacı) sandıkta anketten düşer. Yeni içerik `pnpm test`'teki denetimden geçmeli: bağlantısı kopuk kart, ulaşılamayan zincir, yazılmadan okunan bayrak/sayaç/etiket hata sayılır. Bir olayı (dev kavun heykeli, Towers, e-Belediye, sondaj kulesi...) "olmuş" sayan metin, o olay yaşanmadan gelebiliyorsa da hata sayılır; olaylar `tools/lint.mjs`'teki `FACTS` listesinde durur.
