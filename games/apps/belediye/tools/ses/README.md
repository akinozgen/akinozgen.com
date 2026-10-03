# Seslendirme hattı

Evraklar, gönderen karakterin sesiyle okunur. Sesler bir kez yerelde üretilir ve Cloudflare R2'ye yüklenir (`assets.akinozgen.com/belediye/`). Depoda yalnız bu betikler, ses kadrosu ve harita (`public/ses.json`) durur. Ses dosyaları, kaynak kayıtlar ve R2 anahtarı depoya girmez.

- **Model:** [Chatterbox Multilingual](https://github.com/resemble-ai/chatterbox) (MIT), Türkçe, 5-10 sn'lik örnekten ses klonlar.
- **Kaynak sesler:** [Google FLEURS](https://huggingface.co/datasets/google/fleurs) (CC-BY 4.0): Türkçe, aksanlı karakterler için Almanca (Hans Bey) ve Norveççe (Ingrid Hanım).
- **Çalışma klasörü:** depo dışında, `~/tts/belediye-ses/` (Python 3.11 sanal ortamı, FLEURS, çıktılar, `r2.env`).

| Adım | Betik | Ne yapar |
|---|---|---|
| 1 | `analiz.py` | FLEURS kliplerinin süresi, perdesi (F0), hızı ve gürültüsü → `klipler.json` |
| 2 | `yas.py` | Kliplere yaş ve cinsiyet tahmini (audeering wav2vec2) |
| 3 | `secim.py`, `sayfa.py` | Her karaktere (`kadro.json`) yaşa, perdeye ve yavaş okumaya göre 3 aday; adaylar karakterin kendi evrağını okur; seçme sayfası `ses-secimi.json` indirir (bugünkü seçim: `secim.json`) |
| 4 | `metinler.mjs` | Seslendirilecek sabit metinleri dışa verir |
| 5 | `uretim.py` | Seçilen seslerle üretim: sayılar okunuşa çevrilir (`metin.py`), cümle cümle okunur, noktalama araları eklenir (nokta 0,42 sn), `cfg_weight` 0,3, %8 yavaşlatılır, −16 LUFS (`duzey.py`), Opus 24 kbps. Dosya adı metnin ve sesin özetini taşır; yalnız değişen evrak yeniden üretilir |
| 6 | `r2.py yukle` | Yeni dosyaları R2'ye yükler (bir yıl `immutable` önbellek); sonra `cikti/ses.json` → `public/ses.json` |

Oyunda değişen metinler seslendirilmez: seçim sonucu, aday ilanı, açılış evrağı ve `{oy}` gibi yer tutucu taşıyan sonlar. Tekir miyavlar, konuşmaz.
