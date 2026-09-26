# Çaylar Belediyeden

**akinozgen.com/games/belediye/**

Kurgusal Karakavak ilçesinin belediye başkanı sizsiniz. Her ay masanıza bir evrak gelir; siz onu sağa ya da sola kaydırırsınız. Halkı, kasayı, esnafı ve Ankara'yı dengede tutmanız gerekir. Kasa dibe vurursa da tavan yaparsa da makam gider. Esnaf ile Ankara dibe vurursa makam gider; esnaf tavan yaparsa esnaf odası sizi başkanlığa, Ankara tavan yaparsa sizi yukarı çağırır. Halk ise yalnız dibe vurursa tehlikelidir; sevgisi fazla gelmez, sandıkta işe yarar. Seçim beş yılda bir yapılır.

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
| `pnpm build:site` | Oyunu Vite ile `../../../public/games/belediye/` klasörüne derler; klasörü önce boşaltır |
| `pnpm build` | Aynı derleme `dist/` klasörüne (tarayıcı testleri bunu sunar) |
| `pnpm dev` | Vite geliştirme sunucusu, http://localhost:8765 (derlemeden, anında yenilenir; service worker kapalı) |
| `pnpm preview` | `dist/`'i http://localhost:8765 adresinde sunar |
| `pnpm test` | İçerik grafı, motor, mekanik, seçim, yayın, ad ve sahne testleri (vitest). Her test `test/yukle.mjs` ile taze modül yükler. İçerik denetimi `tools/lint.mjs`'te |
| `pnpm typecheck` · `pnpm lint` · `pnpm format` | TypeScript denetimi (`tsc --noEmit`, `strict`), ESLint (JS ve typescript-eslint önerilenleri), Prettier (120 sütun; `pnpm format:check` yalnız denetler). Ad havuzları `prettier-ignore` ile satır satır paketli durur. typescript-eslint TS 7'yi henüz desteklemiyor: `typescript` paketi TS 6 API'sine (`@typescript/typescript6`) yönlenir, `tsc` 7 `@typescript/native`'den gelir |
| `pnpm sim` | Motoru yedi oyuncu tipiyle (Ankara'yı hep yukarı iten ve davetleri reddeden "ankaracı" dahil) 2000'er kez oynatır; denge, ölüm sebepleri, etkileşim, vaat, beceri oranı ve baskın seçenek raporu verir. `node tools/sim.mjs 3000 fatigue=6` gibi ayarlar denenebilir |
| `pnpm smoke` · `pnpm gesture` · `pnpm fit` | Headless Chrome testleri: uçtan uca oyun, dokunma ve fiske, telefonlarda sığma. Önce `pnpm build`: testler `dist/`'i kendi açtıkları yerel sunucudan (`tools/lib/sayfa.mjs`) oynar. Sessizdir; Chrome yolu farklıysa `CHROME` ortam değişkeniyle verilir. Çıktılar `.cache/` klasörüne yazılır |
| `pnpm icons` | Uygulama ikonlarını yeniden çizer |
| `pnpm election` | Headless Chrome'da seçim gecesi testi: 5 adaylı yarış kurar; sayım ortasında kartların oya göre dizildiğini, oyuncu kartını, KJ'yi, stüdyoyu ve kayan yazıyı, sonuçta yüzdeleri motorla karşılaştırır. Hareket azaltma, "Kaldığım yerden", esnaf teklifi ve reddi, "a" kısayolunu da dener |
| `pnpm menu` | Headless Chrome'da ana menü testi: beş ekran boyunda yerleşim ve meydan resmi, ↑/↓ gezinme, bilgi kartı, ayarların kaydı, iki adımlı silme, künye, aday kaydı, ad zarı ve oyuna giriş |
| `pnpm kampanya` | Headless Chrome'da seçim beyannamesi testi. Telefonda ve masaüstünde altı söz, üç söz sınırı, motorla aynı kampanya anketi ve Geri/Escape denenir. Sandık yolu iki tur oynanır. Her turda dört kampanya evrakı (aşama sırası, geri sayım, düğmedeki oranlar), aday etiketli seçim gecesi, açılış evrakı, başlangıç göstergeleri (sözlerin hemen etkisiyle), mühür sayısı, sözler ve takvim doğrulanır. Mühürlü evrakta mühürün harcanması da sınanır. Sessiz kampanya da denenir |
| `node tools/meydan-render.mjs` | Menü meydanının hareketsiz karelerini `tools/meydan.js`'ten çizer (`.cache/meydan-render/`): yapay zekâyla yeniden çizime verilecek referans. `node tools/meydan-demo.mjs` vektör sahneyi canlı gösterir |
| `node tools/tv-mock.mjs` · `node tools/anchor-demo.mjs` | Seçim gecesi yayın ekranının ve spikerin oyundan bağımsız provaları; görüntüler `.cache/tv/` ve `.cache/anchor/` altına |
| `pnpm portraits` | Eksik vesikalıkları tariften düz çizim olarak üretir; var olan resme dokunmaz. `--force` ya da ad vermek (`node tools/portraits.mjs hans`) mevcut 3D resmin üstüne düz çizim yazar |

Sitenin tamamını yerelde denemek için ana projede `npm run build` çalıştırıp `node games/apps/belediye/tools/serve.mjs 8766 dist` ile açın, sonra `/games/belediye` adresine gidin.

## Yapı

| Yol | İçerik |
|---|---|
| `src/types.ts` | Ortak tipler: sayaçlar, evrak şeması (`CardDef`), oyun durumu (`State`), seçim sonucu (`Tally`) |
| `src/cards.ts` | 32 karakter, 24 başkan adayı (12 kadın, 12 erkek): ad, lakap, kısa biyografi (`BASKANLAR`), 341 evrak (birbirine bağlı yaylar ve yan etkiler dahil), etkileşim tablosu (`SYN`), seçim adayları (`ADAYLAR`) ve seçmen grupları, kriz kartları, 20 son (7'si yay sonu), gazetenin miras cümleleri (`MIRAS`). Kart şeması dosyanın başında |
| `src/adlar.ts` | Aday kaydındaki ad zarı: 299 kadın, 313 erkek adı (16'sı ortak), 488 soyadı (beşte biri çarşı esnafı), gerçek kişi yasak listeleri (`YASAK_SOYAD`, `YASAK_TAM`, `YASAK_AD`) ve `rastgeleAd(cins, rng, son)`. Cins `BASKANLAR`'dan gelir; `test/adlar.test.mjs` sınar |
| `src/engine.ts` | DOM'suz oyun motoru: ortak koşul dili (`condOK`), sayaçlar, koşullu ve aralıklı zincirler, etiket etkileşimleri, vaat defteri. Denge ayarları `TUNE` nesnesinde |
| `src/ui.ts` | Sürükleme, mühür, göstergeler, WebAudio sesleri, Fikret'in tavsiyeleri, gazete, koridor duvarı, seçim gecesi akışı, ana menü, aday kaydı, ayarlar |
| `src/broadcast.ts` | KARAKAVAK TV'nin yazıları: duruma göre KJ (alt bant), kayan yazı (ilçe, ülke, dünya), kur kutusu, "Neden?" satırları. DOM'suz, `test/broadcast.test.mjs` sınar |
| `src/secim.ts`, `src/secim.css` | Seçim gecesi parçası: `broadcast.ts` ve `anchor.ts`'i TV ekranının stiliyle birlikte dışa verir. Derlemede ayrı dosyadır; seçim yaklaşınca (son 10 ay, erken seçim evrakı) arkadan, en geç yayın açılırken iner |
| `src/anchor.ts` | Seçim gecesi stüdyosu: bıyıklı spiker, masa, video duvarı, Tekir. Tek SVG; `studio()` konuşma, ruh hâli ve tepkileri denetler |
| `index.html`, `src/main.ts` | Sayfa ve giriş: `main.ts` yazı karakterlerini, stili ve `ui.ts`'i yükler |
| `src/style.css`, `src/fonts.css`, `src/fonts/` | Makam masası; yerel fontlar (SIL OFL), derlemede özetli adlarla |
| `public/` | Derlemeye olduğu gibi kopyalananlar: ikonlar, manifest, font lisansı, vesikalıklar, meydan resimleri |
| `public/portraits/` | Vesikalıklar: her kişi için `<anahtar>.webp` (anahtar `cards.ts`'teki `PEOPLE`), başkanlık vesikalıkları için `baskan-*.webp` (anahtar `BASKANLAR`) |
| `public/meydan/` | Ana menünün arka planı, üç saat için (`meydan-aksam/gece/gun.webp`, 1536×1024). `tools/meydan.js`'in vektör karesi ChatGPT ile parlak plastik oyuncak diyoramaya çevrildi. Lamba, pencere, buhar ve yıldız ışıklarının yeri `ui.ts`'teki `MD_NOKTA`'da |
| `tools/portrait.js` | Vesikalıkların ilk tarifleri ve SVG çizeri; oyuna girmez. Şimdiki resimler bunlardan SDXL img2img ile üretildi (bkz. NOTES). Başkanlık vesikalıkları tohumdan (`mayorFace`) ya da elle yazılmış tariften (`MAYOR_RECIPES`: lakaba uyan aksesuar) çizilir |
| `vite.config.js` | Derleme: açılışta üç JS parçası (oyun, `kutuphane` = interact.js, `icerik` = cards.ts) ve bir CSS; seçim gecesi ve ad havuzu (`adlar.ts`, aday kaydı açılınca) ayrı parça. Göreli yollar, menüdeki sürüm (`__SURUM__`), derlemenin bütün dosyalarını önbelleğe alan service worker eklentisi |
| `tools/` | Sunucu, simülasyon, içerik denetimi (`lint.mjs`), içerik denemesi (`ek-dene.mjs`: bir ek dosyasını oyuna takıp denetim ve kısa simülasyon çalıştırır, kaynağa dokunmaz) ve tarayıcı testleri; ortak yardımcılar `tools/lib/sayfa.mjs`'te |
| `NOTES.md` | Geliştirme günlüğü: kararlar, denge ölçümleri, geri bildirimler |

## Teknik notlar

- **Adres:** Sayfa `/games/belediye/` altında göreli yollarla çalışır. Eğik çizgisiz gelinirse baştaki küçük betik adresi eğik çizgiye çevirir.
- **Service worker:** Kapsamı yalnız `/games/belediye/`, sitenin geri kalanına dokunmaz. Önbellek adı içerikten türetilir; her derlemede eskisi silinir. Sayfanın kendisi önce ağdan alınır, yani güncelleme bir yenilemeyle gelir.
- **Ölçek:** Bütün ölçüler `rem`. Kök yazı boyu ekran yüksekliğiyle, dar ekranda genişlikle orantılı: telefonda ~13px, 1080p'de ~19px, 1440p'de ~25px.
- **Vesikalıklar:** Hazır resim dosyalarıdır; oyun onları çalışırken çizmez. Oyun `portraits/` klasöründen yükler, service worker hepsini önbelleğe alır. Bir kişinin resmini değiştirmek için aynı adla yenisini koyup derlemek yeter (kare, 384px ve üstü). Başkanlık vesikalıkları `cards.ts`'teki `BASKANLAR` listesinden gelir: oyuncu aday kaydında birini seçer, ad kutusunu boş bırakırsa vesikalığın adı kullanılır, kendi adını yazarsa o kalır. Seçim isimlikte ve eski başkanlar duvarında görünür. Resmi olmayan kişi ya da listeye bağlı olmayan resim varsa test uyarır.
- **Sürükleme:** Evrak sürükleme interact.js (npm paketi, derlemede pakete girer) ile yapılır. Yön kilidi vardır, dikey hareket karar sayılmaz. Karar ya kartın ~%26'sı kadar sürüklemekle ya da kısa, hızlı bir fiskeyle verilir. Evrakın içinde `touch-action: none` şarttır: metin kutusu kaydırılabilir olunca tarayıcı sürüklemeyi yarıda kesiyordu.
- **Denge:** `pnpm sim` son ölçümü (2000 oyun): rastgele oyuncu ~3,5 yıl dayanır. Okları okuyup arada canının istediğini seçen "insan" oyuncu ilk dönemi %91 bitirir, seçimlerin %75'ini kazanır, %17'si 20 yılı doldurup emekli olur; medyanı 119 ay. Kesin sayıları hesaplayan "usta" 1,5 kat uzun yaşar. Oyunlar çoğunlukla sandıkta (%48) ya da kasada (%26) biter, %5'i bir yay sonuyla. Simülasyonda oyuncular oyunu bitiren seçeneği %30 merakla seçer; yoksa sıfır etkili son seçeneğini "en güvenli" sanıp hep seçerlerdi.
- **Seçim:** Tek tur, en çok oyu alan kazanır. Adaylar seçimden 9 ay önce ilan edilir: ana rakip (çoğunlukla Nermin Hanım) ve duruma göre katılanlar (esnaf dipteyse Hacı Bekir, Ankara soğuksa Suat Bey, küs olunan muhtar ya da gazeteci...). Dost olan aday olmaz. Tekir nadiren, mama verildiyse daha sık aday olur; kazanırsa ayrı bir son gelir. Anket sizin teke tek oyunuzdur. Her ek aday kendi oyunun bir kısmını sizden, kalanını ana rakipten çalar; bu yüzden kalabalık yarışta %40 da kazandırabilir. Sonuç, KARAKAVAK TV'nin canlı seçim yayınında sandık sandık açılır: aday kartları oy geldikçe yer değiştirir, sizin kartınız altın çerçevelidir, üstte mahalle kutuları, ortada konuşan spiker, altta KJ ve ilçeden dünyaya absürt kayan yazı vardır. Sandıklar mahallelerin seçmen karışımından üretilir ve toplamları kesin sonuca eşitlenir, yani ekran sonucu değiştirmez, yalnız sırasını dramatize eder. Ardından seçmen grubu dökümü ve "Neden?" satırları gelir.
- **Esnaftan teklif:** Esnaf tavan yaparsa oyun bitmez, esnaf odası sizi başkanlığa çağırır (`ODA`). Ankara'daki davetin çarşıdaki eşidir. Teklif her retle büyür: önce oda başkanlığı, sonra Kavun Ovası Esnaf Birliği, sonra hep Kavun Borsası. Kabul ederseniz belediyeyi bırakıp çarşıya geçersiniz; bu yenilgi sayılmaz. Ret halkı sevindirir, esnafı sert düşürür (−30, −34, −40) ve peşine bir küslük evrakı getirir. Seçim evrakında esnaf tavanı sandığı bekletmez, teklif seçimden sonra gelir. Eskiden burada erken seçim vardı; gerçekte karşılığı olmadığı için kaldırıldı. Eski kayıtlar teklife döner, eski son (`e100`) duvardaki oyunlar için durur.
- **Göreve başlayış:** Aday kaydından sonra seçim beyannamesi gelir. Her oyunda 20 vaatlik havuzdan (`VAATLER`) altısı çıkar, en çok üçü seçilir. Her söz tutulana kadar ankette ödenir ve ilk dönemde hesap evrakıyla geri gelir. Tutulursa defterde artı, geçiştirilirse eksi yazılır; iki durumda da söz kapanır. Ayarlar `engine.ts`'te (`ACILIS`, `SANS`, `SANDIK`, `MUHUR`); beyannamedeki yol özetleri de bu ayarlardan yazılır.
  - **Sessiz kampanya:** seçimsiz ve düşük başlar (halk 44). Bir mühür ve "Temiz sicil" (defterde +3; ilk skandalda gider) verir.
  - **Kampanya turu:** sandığa giden göreve başlamadan dört kampanya evrakı oynar (`KAMPANYA`, 20 evrak, her aşamadan biri: açılış, saha, medya, son hafta). Bir seçenek anketi kesin artırır (`oy`). Öbürü zarlıdır (`zar: {p, iyi, kotu}`): oran düğmede yazar. Üst barda kampanya anketi ve "Sandığa N evrak" görünür, ay geçmez. Bazı seçenekler ilk döneme bayrak bırakır, altı evrak (`kmps_*`) bunların hesabını sorar.
  - **Sandık:** anket, taban %42 artı sözlerin gücüyle başlar (en çok %80). Zar anketin altına düşerse zafer olur, fark = 3 + (anket − zar) × 0,4. Fark 15'i geçerse ezici zafer, geçmezse rahat zafer. Zar anketin üstüne çıkarsa kıl payı (fark 0,3-0,9).
  - **Başlangıçlar:** Ezici zafer halk 66, kasa 62 (zafer ödeneği), beş mühür, bir fazla danışma, defterde +5 başlatır. Rahat zafer halk 60, üç mühür, +3 başlatır. Kıl payı halk 38 başlatır, mühür vermez. Kıl payında Nermin kırgındır ve bir yıl gölgeli mazbata sürer (halkın kızgınlığı 1,3 kat, `HAVA`). Nermin'in iki itiraz dilekçesi gelir (`itiraz_1/2`, zarlı "meydana çıkalım" seçenekleriyle); ikisi kapanınca gölge kalkar, iki mühür gelir.
  - **Mühür:** üst bardaki düğmeyle (ya da `M`) basılır; o evrakta seçilen seçeneğin, zarıyla birlikte, en ağır kaybı silinir (en çok 10). Kayıp yoksa mühür harcanmaz. Kriz, seçim ve özel evraka basılmaz. Mühürler 18 ayda söner, "Yürürlükte" şeridinde süresi görünür.
  - `pnpm sim` varsayılan olarak oyunların yarısını sessiz, yarısını rastgele sözlerle kampanya turundan başlatır. `acilis=sessiz|ezici|zafer|kilpayi|kumar|eski` tek türü ölçer. `kampanya=cesur|temkinli` turdaki seçimi sabitler, `muhur=6` mühür eşiğidir. `oyuncu=insan,usta` yalnız o oyuncuları oynatır. `ACILIS.ezici.m.h=66` gibi noktalı ayarlar da geçici değiştirilebilir.
- **Ankara'dan davet:** Ankara tavan yaparsa oyun bitmez, sizi yukarı çağırırlar (`DAVET`). Teklif her retle büyür: genel merkez, milletvekilliği, sonra hep bakan yardımcılığı. Kabul terfiyle biten bir finaldir; gazete "MÜJDE" diye çıkar. Ret halkı sevindirir, Ankara'yı sert düşürür ve peşine evrak getirir: manşet, genel merkezin kırgınlığı, geciken ödenek, Suat Bey'in vefa borcu, "rutin" denetim. Ankara'nın ödül evrakı ve seçim gecesinin kayan yazısı reddi hatırlar.
- **Birbirine bağlı içerik:** Kararlar aylar sonra geri döner. Devam kartının koşulu teslim anında yeniden sınanır, borcu erken kapatan bedelden kurtulur. İki etiketli karar aynı anda yürürlükteyse `SYN` tablosu her ay ek etki yazar, ilk karşılaşmada bir kart ya da haber düşer. Tutulmayan vaatler (`vaat` sayacı) sandıkta anketten düşer. Yeni içerik `pnpm test`'teki denetimden geçmeli: bağlantısı kopuk kart, ulaşılamayan zincir, yazılmadan okunan bayrak/sayaç/etiket hata sayılır. Bir olayı (dev kavun heykeli, Towers, e-Belediye, sondaj kulesi...) "olmuş" sayan metin, o olay yaşanmadan gelebiliyorsa da hata sayılır; olaylar `tools/lint.mjs`'teki `FACTS` listesinde durur.
- **Yay sonları, yan etkiler, sandık defteri, miras:**
  - **Yay sonu (`son`):** bir seçenek oyunu kendi sonuyla bitirebilir; oyuncu düğmede "oyun biter" notunu görür. Sonların türü var: gönüllü (istifa, terfi), komik, ceza. Ceza sonu yalnız bir yayın sonundaki zincir evrakında olabilir, bunu denetim zorlar.
  - **Yan etki (`pol.yan`):** yürürlükteki bir karar her ay küçük bir olasılıkla olay evrakı doğurabilir. İlk 3 ayda doğmaz, her biri bir kez gelir, ilçede 3 ayda en çok biri; evrakın bir seçeneği kararı kaldırır.
  - **Sandık defteri (`anket`):** skandallar ve akılda kalan işler adıyla ankete yazılır (net etki -8..+6, her dönem yarıya iner). Seçim gecesinin "Neden?" satırı en ağır iki kalemi adıyla okur, gazete de en çok konuşulan dosyayı anar.
  - **Miras (`MIRAS`):** oyun sonu gazetesine başkanın neyle anılacağını yazan koşullu cümleler ekler.
  - **Hafıza notu (`not`):** kaydırınca "bunu unutmayacak" türünden bir not düşer.
  - **Sonlar defteri:** eski başkanlar duvarında bu tarayıcıda görülen sonlar durur.
