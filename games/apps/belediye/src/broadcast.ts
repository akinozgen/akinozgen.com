// ─── Seçim gecesi yayını: KARAKAVAK TV ────────────────────────────────────
// Alt bant (KJ), son dakika bandı, döviz kutusu, kazanan sözleri ve "Neden?" satırları.
// DOM'suz, saf fonksiyonlar. Bütün rastlantı dışarıdan verilen rng'den gelir: aynı tohum, aynı yayın.
// Okuduğu globaller: PEOPLE, ADAYLAR, dateLabel. Gerçek kişi, parti, kurum ya da marka adı yok.
//
// ctx: { res, playerName, pct, leader, prev, opened, mahalle, early, flags, seen }
//   res       tally() sonucu
//   pct       o ana kadar açılan sandıklara göre yüzdeler {id: yüzde}; leader o anki birinci
//   prev      (isteğe bağlı) bir önceki lider; "lider" evresinde liderliği kaptıranı anmak için
//   opened    açılan sandık oranı (0..1). Sonuç yalnız "sonuc" evresinde ya da opened = 1'de ele verilir;
//             pct/leader verilmezse ara evreler kesin sonucu kullanmaz, lidere bağlı satırlar atlanır.
//   mahalle   o an açılan mahalle (MAHALLE adları)
//   flags     (isteğe bağlı) s.flags: Karaca, itfaiye, Towers, dev kavun gibi şakalar yalnız o olay yaşandıysa gelir
//   seen      (isteğe bağlı) bir Set; aynı yayında kullanılan satırları tutar, verilirse satırlar tekrar etmez
//
// Satırlar: düz metin ya da [koşul(v), metin, ağırlık?]. Koşullu satırlar duruma özgü olduğundan daha sık seçilir.
// Yer tutucular: {you} {lider} {ikinci} {kazanan} {prev} {a} {b} {n} {nY} (yazıyla) {nY1} (bir fazlası) {fark} {oran} {oranEk} {youf} {kpct}
// {sira} {tarih} {mah} {mahs} (sandık önünde: Lojman) {mahde}; ek almak için {lider:in} (in, i, e, de, den). Değeri olmayan yer tutucu
// satırı eler; başlıkta tam ad sığmazsa kısa ad (tvShort) denenir.
import { PEOPLE } from "./cards.ts";
import { ACILIS, dateLabel, joinTR } from "./engine.ts";
import type { Rng, Tally } from "./types.ts";

/** Yayının o anki durumu (ui.ts seçim gecesi akışı doldurur) */
export interface TvCtx {
  res?: Partial<Tally>;
  playerName?: string;
  pct?: Record<string, number>;
  leader?: string | null;
  prev?: string | null;
  opened?: number;
  mahalle?: string | null;
  early?: boolean;
  flags?: Record<string, boolean>;
  seen?: Set<string>;
}
/** Satırların koşullarına verilen görünüm (tvView) */
export type TvView = ReturnType<typeof tvView>;
type Pred = (v: TvView) => unknown;
/** Havuz satırı: düz metin ya da [koşul, metin, ağırlık?] */
export type Line = string | [Pred, string] | [Pred, string, number];
type Mode = "title" | "sub" | "tick" | "raw";
type Vars = Record<string, string | number | null | undefined>;

export const KANAL = { ad: "KARAKAVAK TV", kisa: "KTV" };
export const TV_MAX = { title: 34, sub: 90, tick: 110, quote: 70 };
export const TV_W = 2.5; // duruma özgü satırın ağırlığı (genel satır 1)

// ── Yardımcılar
export const tvUp = (s: unknown) => String(s).toLocaleUpperCase("tr");
export const tvCap = (s: string) => (s ? s[0].toLocaleUpperCase("tr") + s.slice(1) : s);
export function tvNum(v: number, d = 1) {
  const [i, f] = Math.abs(v).toFixed(d).split(".");
  return (v < 0 ? "−" : "") + i.replace(/\B(?=(\d{3})+(?!\d))/g, ".") + (f ? "," + f : "");
}
export const tvDec = (v: number) => tvNum(v, 1).replace(/,0$/, ""); // 41,0 → 41
export const TV_SAYI = ["sıfır", "bir", "iki", "üç", "dört", "beş", "altı", "yedi"];
// Sayıya iyelik eki: %37'si, %40'ı, %99,8'i, %100'ü (son okunan sözcüğe göre)
export const TV_EK1 = ["", "i", "si", "ü", "ü", "i", "sı", "si", "i", "u"]; // bir iki üç dört beş altı yedi sekiz dokuz
export const TV_EK10 = ["", "u", "si", "u", "ı", "si", "ı", "i", "i", "ı"]; // on yirmi otuz kırk elli altmış yetmiş seksen doksan
export function tvNumEk(s: string | number) {
  const d = String(s).replace(/\D/g, "");
  if (!/[1-9]/.test(d)) return "'ı";
  const t = d.replace(/0+$/, ""),
    z = d.length - t.length,
    last = +t[t.length - 1];
  return "'" + (z === 0 ? TV_EK1[last] : z === 1 ? TV_EK10[last] : z === 2 ? "ü" : z < 6 ? "i" : "u");
}
// Özel ada ek (ünlü uyumu, kaynaştırma, sertleşme): Nermin Hanım'ın, Rıza'ya, Burak'ta
export function tvEk(w: string | number, k: string) {
  const s = String(w).trim(),
    low = s.toLocaleLowerCase("tr");
  const vs = low.match(/[aıoueiöü]/g),
    last = vs ? vs[vs.length - 1] : "e";
  const endV = /[aıoueiöü]$/.test(low),
    hard = "çfhkpsşt".includes(low.slice(-1));
  const back = "aıou".includes(last),
    round = "ouöü".includes(last);
  const i4 = back ? (round ? "u" : "ı") : round ? "ü" : "i",
    a2 = back ? "a" : "e";
  const ek = (
    {
      in: (endV ? "n" : "") + i4 + "n",
      i: (endV ? "y" : "") + i4,
      e: (endV ? "y" : "") + a2,
      de: (hard ? "t" : "d") + a2,
      den: (hard ? "t" : "d") + a2 + "n",
    } as Record<string, string>
  )[k];
  return ek == null ? s : s + "'" + ek;
}
export function tvFill(t: string, vars: Vars, short: boolean) {
  return t.replace(/\{(\w+)(?::(\w+))?\}/g, (m, k: string, ek: string | undefined) => {
    const x = short && vars["_" + k] != null ? vars["_" + k] : vars[k];
    if (x == null || x === "") return m; // eksik değer: satır elenir
    return ek ? tvEk(x, ek) : String(x);
  });
}
export const tvOk = (s: string, max: number) => !!s && s.length <= max && !/[{}]|undefined|null|NaN/.test(s);
export const tvYes = () => true;
// Havuzdan ağırlıklı seçim. mode: "title" (büyük harf, sığmazsa kısa ad), "sub" (cümle başı büyük), "tick", "raw"
export function tvPool(list: Line[], v: TvView, max: number, mode: Mode) {
  const pool: { s: string; w: number }[] = [];
  for (const e of list) {
    const [p, t, w]: [Pred | null, string, number?] = typeof e === "string" ? [null, e] : e;
    if (p && !p(v)) continue;
    let s = tvFill(t, v.vars, false);
    if (mode === "title") {
      s = tvUp(s);
      if (s.length > max) s = tvUp(tvFill(t, v.vars, true));
    } else if (mode === "sub" || mode === "tick") {
      if (s.length > max) s = tvFill(t, v.vars, true);
      if (mode === "sub") s = tvCap(s);
    }
    if (tvOk(s, max)) pool.push({ s, w: w ?? (p ? TV_W : 1) });
  }
  return pool;
}
export function tvDraw(pool: { s: string; w: number }[], rng: Rng, seen?: Set<string>) {
  const fresh = seen ? pool.filter(x => !seen.has(x.s)) : pool,
    from = fresh.length ? fresh : pool;
  if (!from.length) return null;
  let r = rng() * from.reduce((a, x) => a + x.w, 0),
    pick = from[from.length - 1];
  for (const x of from)
    if ((r -= x.w) < 0) {
      pick = x;
      break;
    }
  seen?.add?.(pick.s);
  return pick.s;
}
export const tvChoose = (list: Line[], v: TvView, rng: Rng, max: number, mode: Mode, fallback: string): string =>
  tvDraw(tvPool(list, v, max, mode), rng, v.seen) ?? fallback;

// ── Adlar
// Mahalle şeridi için kısa ad. Bey'ler adıyla anılır (S. BEY ile N. BEY karışmasın).
export const TV_KISA: Record<string, string> = {
  vekil: "SUAT BEY",
  cengiz: "CENGİZ BEY",
  kaan: "KAAN BEY",
  albay: "NURİ BEY",
  burak: "BURAK",
  tekir: "TEKİR",
  tuncay: "TUNCAY",
};
export function tvName(id: string, playerName?: string) {
  if (id === "you") return String(playerName || "").trim() || "Başkan";
  return PEOPLE[id]?.ad || String(id);
}
export function tvShort(id: string, playerName?: string) {
  if (TV_KISA[id]) return TV_KISA[id];
  const w = tvName(id, playerName).split(/\s+/).filter(Boolean);
  if (w.length <= 1) return tvUp(w[0] || "BAŞKAN").slice(0, 16);
  const s = tvUp(w[0][0] + ". " + w[w.length - 1]); // Nermin Hanım → N. HANIM
  return s.length <= 16 ? s : tvUp(w[w.length - 1]).slice(0, 16);
}

// ── Mahalleler: ek almış hâlleri ve kendi satırları
export const TV_MAH: Record<string, { s?: string; de?: string; sub: Line[] }> = {
  "Kavun Ovası": {
    de: "Kavun Ovası'nda",
    sub: [
      "Köylerden ilk tutanaklar geldi; kavun kasasında taşındı, hâlâ kavun kokuyor",
      "Ovada katılım yüksek; seçmen hasat molasında sandığa uğramış",
      "Bir tutanak kavunlarla karışmış; kurul ayıklıyor, kavunlar sayılmayacak",
      "Dursun Ağa: 'Kim kazanırsa kazansın, kavunun fiyatı yine bize sorulur'",
    ],
  },
  Çarşı: {
    de: "Çarşı'da",
    sub: [
      [v => v.has("bekir"), "Hacı Bekir'in kalesi açılıyor; kepenkler kapalı, herkes ekran başında"],
      [v => v.has("bekir"), "Çarşı sandığından 'bereketli olsun' yazılı iki pusula çıktı; geçersiz"],
      "Esnaf sandık başında nöbette; kapıda 'veresiye oy yok' yazıyor",
      "Kahveci Rahmi sayım boyunca kırk çay dağıttı, otuz sekizi veresiye",
      "Çarşı sandığından pusulayla birlikte bir fiyat etiketi çıktı; üç kez değişmiş",
    ],
  },
  Sanayi: {
    de: "Sanayi'de",
    sub: [
      "Sanayi sandığında itiraz: zarftan bakkal fişi çıktı. İtiraz reddedildi, çay kabul",
      "Ferhat Usta tutanağı yağlı elle imzaladı; parmak izi mühürden net çıktı",
      "Sanayi sandığı akü takviyesiyle açıldı; tutanak el feneriyle okundu",
      "Sanayide sayım molasında bir müşahidin arabası da tamir edildi",
    ],
  },
  Lojmanlar: {
    de: "Lojmanlar'da",
    s: "Lojman",
    sub: [
      [v => v.has("vekil"), "Lojmanlar Suat Bey'e yakın; kendisi 'talimat gelmedi' diyerek yorum yapmıyor"],
      "Memurlar sandığa mesai saatinde gitmiş; öğle arası üç saat sürmüş",
      "Lojman sandığından pusulalar dilekçe gibi katlanmış çıktı, üç nüsha",
      "Lojmanlarda sayım evrak kayıt sırasıyla yapılıyor; sıra 4.182'de",
    ],
  },
  Merkez: {
    de: "Merkez'de",
    sub: [
      "Merkez açılıyor; uzmanımız: 'Kesin konuşmak için erken, yine de konuşacağım'",
      "Merkezde balkonlardan tencere değil çaydanlık sesi geliyor",
      "Merkez sandığından bir dilek notu çıktı: 'Yollar düzelsin, gerisi kolay'",
      [v => v.has("nermin"), "Nermin Hanım'ın müşahitleri merkezde her pusulayı ışığa tutuyor"],
      [v => v.has("cengiz"), "Cengiz Bey'in merkezdeki afişleri iskeleye asılmış; iskele de kiralık"],
    ],
  },
  Kavaklı: {
    de: "Kavaklı'da",
    sub: [
      [v => v.has("muhtar"), "Muhtar Rıza oyları kendisi sayıyor; üç kez saydı, üçü de başka çıktı"],
      [v => !v.has("muhtar"), "Muhtar Rıza tutanakları tek tek imzaladı; birine kaşe yerine tespih bastı"],
      "Kavaklı'da kahvehane sandığın yanına taşındı; okey sayımla aynı hızda",
      "Kavaklı'nın yaşlıları sandığa bayramlıklarıyla gitmiş; kurul ayağa kalktı",
    ],
  },
  "Öğrenci yurdu": {
    de: "Öğrenci yurdunda",
    sub: [
      [v => v.has("burak"), "Yurtta Burak canlı yayın açtı: 'KAZANDIK'. İzleyici 12, biri kendisi"],
      "Yurt sandığından oy pusulası yerine ders notu çıktı; kurul geçersiz saydı",
      "Yurtta katılım yüksek; sandık, Wi-Fi'ın çektiği tek köşeye kurulmuş",
      "Gençler pusulanın fotoğrafını çekmek istedi; kurul 'hikâye yok' dedi",
    ],
  },
  Yukarıkavak: {
    de: "Yukarıkavak'ta",
    sub: [
      "Yukarıkavak sandığı nihayet geldi; traktör alkışlarla karşılandı",
      "Son sandık masada; mühür çamurlu, tutanak sağlam",
      "Muhtar sandığı omzunda getirdi; kurul 'önce çay, sonra sayım' dedi",
    ],
  },
};

// ── Öndeki adaya özgü satırlar (sayım ve liderlik evrelerinde)
export const TV_ONDE: Record<string, string[]> = {
  you: [
    "{you} önde; makam odasında semaver ikinci kez kaynadı",
    "{you} önde; Fikret yine de 'Yukarıkavak gelmeden konuşmayalım' diyor",
    "{you} önde; kayınvalide Naciye Hanım dolmaları ocağa koydu",
  ],
  nermin: [
    "Nermin Hanım önde; tutanakları kendi defterine de ayrıca yazıyor",
    "Nermin Hanım önde; ekibi şeffaf çay bardaklarını dağıtmaya başladı",
    "Nermin Hanım önde; 'Meclise taşıyacağım' demeden geçen ilk gece",
  ],
  vekil: [
    "Suat Bey önde; Ankara'dan tebrik mesajı hazır, gönder tuşuna basılmadı",
    "Suat Bey önde; kendisi 'talimat gelmeden sevinmiyorum' dedi",
    "Suat Bey önde; makam aracının plakası şimdiden ezberlendi",
  ],
  cengiz: [
    "Cengiz Bey önde; sandık başına şimdiden iskele kuruldu",
    "Cengiz Bey önde; ekibi kutlama için beton mikseri kiraladı",
    "Cengiz Bey önde; kutlama pastası üç blok, havuzlu",
  ],
  kaan: [
    "Kaan Bey önde; 'Karakavak 4.0' sunumunun 38. slaydı açıldı",
    "Kaan Bey önde; sonucu 'win-win' diye yorumladı, iki kez",
    "Kaan Bey önde; İstanbul'daki ortaklar görüntülü aramada, çekmiyor",
  ],
  bekir: [
    "Hacı Bekir önde; çarşıda kepenkler yarıya kadar açıldı",
    "Hacı Bekir önde; kıraathanede 'meclis salonu' tabelası hazırlanıyor",
    "Hacı Bekir önde; tespihin hızı dakikada 90 taneye çıktı",
  ],
  muhtar: [
    "Muhtar Rıza önde; hâlâ parmakla sayıyor, sonuçtan kendisi de emin değil",
    "Muhtar Rıza önde; kahvede 'ben demiştim' on ikinci kez söylendi",
    "Muhtar Rıza önde; Kavaklı'da kutlama başladı, gerisi sonra",
  ],
  tuncay: [
    "Tuncay önde; yarınki manşette kendi fotoğrafını büyüttü",
    "Tuncay önde; Karakavak Postası özel baskıya geçti, tiraj 400",
    "Tuncay önde; haberi kendisi yazıyor, kendisi okuyor",
  ],
  burak: [
    "Burak canlı yayında: 'Kazandık' dedi, izleyici 12",
    "Burak önde; takipçisi üç arttı, ikisi kendi hesabı",
    "Burak önde; zafer videosu için ağır çekim hazırlanıyor",
  ],
  albay: [
    "Nuri Bey önde; destekçileri sayımı hazır olda izliyor",
    "Nuri Bey önde; kutlama marşının on beşinci kıtası yazılıyor",
    "Nuri Bey önde; sandık kuruluna yoklama aldı, eksik yok",
  ],
  tekir: [
    "Tekir önde; kendisi sandığın üstünde uyuyor, yorum yapmadı",
    "Tekir önde; Mırnav Partisi genel merkezinde mama dağıtılıyor",
    "Tekir önde; rakipler 'kediye oy olmaz' dedi, seçmen dinlemedi",
  ],
};

// ── Kazanan sözleri ve yenilgi açıklamaları (≤ 70)
export const TV_SOZ: Record<string, { win: Line[]; lose: Line[] }> = {
  you: {
    win: [
      "Bu zafer Karakavak'ın; çaylar benden.",
      "Oy vermeyenlerin de başkanıyım, çay vermeyenlerin de.",
      "Seçim bitti, evrak bekliyor. Fikret, çay!",
      "İlk iş Yukarıkavak'ın yolu; traktör yoruldu.",
      "Rakiplerime geçmiş olsun; çaylar benden, simitler onlardan.",
      [v => !v.ilk, "Beş yıl daha evrak, beş yıl daha çay. Hayırlı olsun."],
      [v => v.ilk, "Beş yıl evrak, beş yıl çay. Bismillah."],
      [v => v.ilk, "Söz verdik, sözler defterde. Fikret, çay!"],
      [v => v.early, "Erken seçim de seçimdir; kepenkler açılsın, çaylar belediyeden."],
      [v => v.res.you < 50, "Yüzde elli şart değilmiş; birinci birincidir."],
    ],
    lose: [
      "Halkın kararı başımızın üstünde; semaveri yanımda götürüyorum.",
      "Kaybetmedik, beş yıl mola verdik.",
      "Fikret, son çayı demle; iki şekerli olsun.",
      "Yukarıkavak geç kaldı; traktörü affediyorum.",
      "Makamı devrediyorum; Tekir'i devretmiyorum.",
      "Sandık haklıdır. Ben de haklıydım ama sandık daha haklı.",
    ],
  },
  nermin: {
    win: [
      "Şeffaf belediye bugün başlıyor; ilk iş çay bardaklarını sayacağız.",
      "Tutanakları okudum, hepsini. Kazandık.",
      "Meclise taşıdık, sandıktan çıktı.",
      "Kasayı boş bulursak basın toplantısı yarın saat onda.",
      "Beş yıldır tutanağa yazdırıyordum; bu gece sandık yazdı.",
      "İlk icraat: makam odasına cam kapı. Şeffaflık kapıdan başlar.",
      "Muhalefete sesleniyorum: beni benim kadar denetleyemezsiniz.",
      "Çaylar artık fişli; fişi herkes görecek.",
    ],
    lose: [
      "Tutanağa yazdırıyorum: itirazım var.",
      "Meclise taşıyacağım; bu kez sandığı.",
      "Şeffaf kaybettik, alnımız ak.",
    ],
  },
  vekil: {
    win: [
      "Ankara'ya teşekkür ederim; Karakavak'a da. Önce Ankara'ya.",
      "Talimat geldi: kazandık.",
      "Genel merkez duydu; şimdi Karakavak da duysun.",
      "Ankara'yla el ele; elim biraz yoruldu ama.",
    ],
    lose: [
      "Ankara'ya iletirim; Ankara da bana iletir.",
      "Talimat gelmediği için yorum yapmıyorum.",
      "Sonucu yukarıya arz ettim.",
    ],
  },
  cengiz: {
    win: [
      "Beton geleceğimizdir; gelecek yarın sabah dökülüyor.",
      "Her mahalleye bir Towers; ilk temel pazartesi.",
      "Oy verenlere daire, vermeyenlere manzara.",
      "Makam odası dar; iki kat çıkıyoruz.",
    ],
    lose: [
      "Başka ilçeler de var; hepsinde arsa var.",
      "Pişman olacaksınız; projeyi saklıyorum.",
      "Seçimi kaybettim, iskeleyi bırakmam.",
    ],
  },
  kaan: {
    win: [
      "Karakavak 4.0 yüklendi; güncelleme sabah başlıyor.",
      "Bu bir win-win; en çok ben kazandım.",
      "Sinerjiyi sandığa taşıdık, sandık da bize.",
      "Yatırımcılar mutlu; seçmen de sonra mutlu olur.",
    ],
    lose: [
      "Pazar hazır değildi; 5.0'da görüşürüz.",
      "Yatırımcı küstü, ben de küstüm.",
      "Sunumu herkes beğendi, oyu kimse.",
    ],
  },
  bekir: {
    win: [
      "Kepenk değil bereket! Meclis yarın kıraathanede.",
      "Esnaf bunu unutmaz; veresiye defteri kapandı.",
      "Belediye çarşıya taşındı; çaylar benden.",
      "Bereketli olsun; meclis kararları okey masasında.",
    ],
    lose: [
      "Çarşıda konuşulur bu, hem de uzun uzun.",
      "Esnaf da bunu unutmaz.",
      "Kepenkleri açıyoruz; kırgınız ama açıyoruz.",
    ],
  },
  muhtar: {
    win: [
      "Önce Kavaklı, sonra gerisi; gerisini de sonra konuşuruz.",
      "Üç kez saydım, üçünde de kazandım.",
      "Kahvede anlatacağım; bu kez güzel şeyler.",
      "Mühür bende, tespih bende; hayırlı olsun.",
    ],
    lose: ["Kahvede anlatırım bunu.", "Parmak hesabıyla ben kazanmıştım.", "Kırk yıllık hatırı sandık da saymadı."],
  },
  tuncay: {
    win: [
      "Manşet hazır: Tuncay Başkan. İkinci baskı yolda.",
      "Kalemim sizden yanaydı; artık mühür de.",
      "Yarınki gazetede fotoğrafım büyük çıkacak.",
      "Bu haberi ben yazdım, siz de oyladınız.",
    ],
    lose: [
      "Bunu da yazarım, birinci sayfadan.",
      "Arşivime not düştüm.",
      "Manşet hazırdı; boşa gitmesin, başkasına basarım.",
    ],
  },
  burak: {
    win: [
      "Efsane! Hikâyeye atıyorum; belediyeyi de.",
      "Beğen, paylaş, oy ver; oy verdiniz, sağ olun!",
      "Canlı yayındayım, izleyici 14 oldu, rekor!",
      "Makam koltuğunda ilk içerik geliyor, takipte kalın.",
    ],
    lose: ["Takipten çıkıyorum; Karakavak'ı.", "Cringe bir sonuç ama yine de içerik.", "Algoritma bizi sevmedi."],
  },
  albay: {
    win: [
      "Saat tam dokuzda makamdayım; geç kalan olmasın.",
      "Nizam geldi, intizam yolda.",
      "Yaşa! Var ol Karakavak!",
      "İlk icraat: bütün saatler aynı saati gösterecek.",
    ],
    lose: ["Böyle sandık görmedim.", "Rahat! Beş yıl sonra yine hazır ol.", "Geri çekilmiyoruz, mevzi değiştiriyoruz."],
  },
  tekir: {
    win: [
      "Mırr.",
      "Mırrr. (Tercüme: Mama saatleri değişmeyecek.)",
      "Miyav. (Tercüme: Masadaki bardak yere düşecek.)",
      "Tısss. (Tercüme: Muhalefete selamlar.)",
    ],
    lose: ["Tısss!", "Mırr. (Tercüme: Seneye yine buradayım.)", "(Sandığın üstünde uyumaya devam ediyor.)"],
  },
  _: {
    win: ["Hayırlı olsun Karakavak.", "Kazanan Karakavak oldu.", "Çaylar bizden."],
    lose: ["Halkın kararına saygı duyuyoruz.", "Yolumuza devam ediyoruz.", "Hayırlısı olsun."],
  },
};

// ── Alt bant (KJ) satırları
export const TV_KJ: Record<string, { title: Line[]; sub: Line[] }> = {
  acilis: {
    title: [
      "Yayın yasağı kalktı",
      "Yayın yasağı kalktı",
      "Karakavak sandık başında",
      "Seçim gecesi başladı",
      "İlk sandıklar geliyor",
      "KTV seçim özel",
      [v => v.early, "Erken seçim gecesi"],
      [v => v.early, "Esnaf istedi, sandık geldi"],
      [v => v.has("tekir"), "Adaylardan biri kedi"],
    ],
    sub: [
      "İlk sandıklar Kavun Ovası köylerinden geliyor; tutanaklar kavun kasasında",
      "Stüdyoda üç uzman, iki görüş ve bir semaver var; sayım başlıyor",
      "Kahvehanelerde okey masaları ekrana çevrildi; taşlar ters kapatıldı",
      "Fikret stüdyoya ilk çayı getirdi; kameraman da bir tane istedi",
      "Sandık kurulları mühürleri, çayları ve simitleri teslim aldı",
      "{tarih} yerel seçimi: {nY} aday, sekiz mahalle, bir traktör",
      "Karakavak TV'nin tek kamerası hazır; jeneratör hâlâ düşünüyor",
      [v => v.n >= 4, "{nY} adaylı pusula masa örtüsü boyunda; katlamak başlı başına beceri"],
      [v => v.n === 2, "İki aday, tek kuyruk; Karakavak teke tek yarışı izliyor"],
      [v => v.has("tekir"), "Pusulada bir ilk: Mırnav Partisi. Kurul pati izini imza saydı"],
      [v => v.has("bekir") && !v.early, "Çarşı ekran başında; Hacı Bekir kepenkleri yarıya indirdi"],
      [v => v.early, "Esnaf odası belediyeyi okey masasına taşıyınca sandık erken kuruldu"],
      [v => v.early, "Erken seçim kararı kıraathanede alındı; sandıklar okey masasından kalktı"],
      [v => v.has("burak"), "Burak yayını kendi hesabından da veriyor; gecikme 40 saniye"],
      [v => v.has("kaan"), "Kaan Bey sonuçları 'Karakavak 4.0' panelinden izleyecek; panel yükleniyor"],
    ],
  },
  sayim: {
    title: [
      [v => v.mid, "Sandıkların {oranEk} açıldı"],
      [v => v.mid, "Sandıkların {oranEk} açıldı"],
      [v => v.mid, "Açılan sandık oranı {oran}"],
      [v => v.mid && v.leader, "{oran} açıldı, {lider} önde"],
      [v => v.mid, "Sayım sürüyor: {oran}"],
      [v => v.mid && v.early, "Erken seçimde {oran} açıldı"],
      [v => v.opened > 0 && v.opened < 0.15, "İlk sandıklar açıldı"],
      [v => v.opened > 0.8 && v.opened < 1, "Sayımda son viraj"],
      [v => v.youLead, "{you} önde"],
      [v => v.youBehind, "{lider} önde"],
      [v => v.close, "Başa baş yarış"],
      [v => v.gap >= 10, "Fark açılıyor"],
      [v => v.opened >= 1, "Sandıkların tamamı açıldı"],
      [v => v.opened === 0, "Sayım başladı"],
      "Karakavak'ta sayım sürüyor",
    ],
    sub: [
      "Uzman stüdyoda: 'Kesin konuşmak için erken, yine de konuşacağım'",
      "İlk sandıklar yanıltıcı olabilir; ortadakiler de, sondakiler de",
      "Oylar sayılıyor, çay bardakları da; şimdilik çay önde",
      "Müşahitler sandık başında nöbette; Fikret nöbet çayı dağıtıyor",
      "Sandık kurulu simit istedi; sayım simit gelene kadar ağırdan alınacak",
      "Uzmanımız grafiği ters tutuyormuş; düzeltince sonuç değişmedi",
      "Kahvehanelerde okey durdu; taşlar masada, gözler ekranda",
      "Geçersiz oylardan birinde 'hepinizi seviyorum ama' yazıyor; devamı yok",
      "Oylar {nY} adaya bölündü, stüdyodaki uzmanlar {nY1} görüşe",
      "Stüdyo uzmanı 'trend belli' dedi; trendin haberi yok",
      "Kurul üyesi 'mühür nerede' diye soruyor; mühür çay tepsisinin altında",
      "Sandık kurulu oyları iki kez saydı, bir kez de çay molası verdi",
      "Kesin olmayan sonuçlar geliyor; kesinleri Yukarıkavak'la birlikte",
      "Uzman 'bu sandık sürpriz yapar' dedi; hangi sandık olduğunu söylemedi",
      [v => v.youLead, "{you} önde; Fikret 'daha Yukarıkavak gelmedi' diyerek çayı tazeledi"],
      [v => v.youBehind, "{you} geride; Fikret 'daha Yukarıkavak gelmedi' diyor"],
      [v => v.youBehind, "{lider} önde; {you} cephesinden açıklama: 'Erken, çok erken'"],
      [v => v.close, "Fark {fark} puan; iki taraf da zafer konuşmasını cebinde tutuyor"],
      [v => v.close, "Fark bir çay ocağı kuyruğu kadar: {fark} puan"],
      [v => v.gap >= 10, "Fark {fark} puan; öndeki adayın ekibi pastayı şimdiden sipariş etti"],
      [v => v.opened > 0 && v.opened < 0.2, "Daha {oran} açık; iki aday şimdiden balkona çıktı"],
      [v => v.has("tekir"), "Geçersiz oyların bir kısmında pati izi var; kurul 'niyet belli' dedi"],
      [v => v.early, "Erken seçimde sayım hızlı; esnaf 'dükkânı açmamız lazım' diyor"],
    ],
  },
  lider: {
    title: [
      "Liderlik el değiştirdi",
      "Liderlik el değiştirdi",
      [tvYes, "{lider} öne geçti"],
      "Zirvede değişiklik",
      [v => v.youLead, "{you} zirvede"],
      [v => v.prev === "you" && !v.youLead, "{you} liderliği kaptırdı"],
      [v => v.close, "Başa baş: sıra değişti"],
    ],
    sub: [
      "{lider} öne geçti; stüdyodaki uzman gözlüğünü çıkarıp tekrar taktı",
      "Sıralama değişti; uzman grafiği ters çevirdi, yine aynı çıktı",
      "Liderlik el değiştirdi; iki tarafın da basın bildirisi yazıcıda",
      "Liderlik el değiştirdi; kahvede okey taşları bırakıldı, herkes ekranda",
      [v => v.youLead, "{you} öne geçti; Fikret sevinçten çayı tabağa döktü"],
      [v => v.youLead, "{you} öne geçti; makam odasında ikinci semaver yakıldı"],
      [v => v.prev === "you" && !v.youLead, "{you} liderliği kaptırdı; makam odasında çaylar soğuyor"],
      [v => v.prev === "you" && !v.youLead, "{you} geriye düştü; Fikret 'daha Yukarıkavak var' diyor"],
      [
        v => v.prev && v.prev !== "you" && v.prev !== v.leader,
        "{prev} liderliği kaptırdı; ekibi pastayı buzdolabına geri koydu",
      ],
      [v => v.close, "Fark yalnızca {fark} puan; stüdyoda nefesler tutuldu, çaylar soğudu"],
    ],
  },
  mahalle: {
    title: [
      "{mahs} sandıkları açıldı",
      "{mahs} sandıkları açıldı",
      "Gözler {mahde}",
      "Sıra {mahde}",
      [v => v.mah === "Çarşı" && v.has("bekir"), "Hacı Bekir'in kalesi açılıyor"],
      [v => v.mah === "Kavaklı" && v.has("muhtar"), "Kavaklı: muhtarın sahası"],
      [v => v.mah === "Lojmanlar" && v.has("vekil"), "Lojmanlarda Ankara havası"],
      [v => v.mah === "Öğrenci yurdu", "Gençlik sandığı açıldı"],
      [v => v.mah === "Yukarıkavak", "Traktör geldi"],
      [v => v.leader, "{mah}: {lider} önde", 0.7],
    ],
    // genel satırlar düşük ağırlıkta: mahallenin kendi satırları (TV_MAH) öne çıksın
    sub: [
      [tvYes, "{mahs} sandıkları geldi; tutanaklar masada, çaylar yolda", 0.4],
      [tvYes, "{mahde} sayım sürüyor; müşahitler semaverin başında nöbette", 0.4],
      [v => v.has("tekir"), "{mahde} geçersiz oyların yarısına kedi resmi çizilmiş", 0.8],
      [v => v.youLead, "{mahde} sandıklar açılırken {you} önde; Fikret çayları tazeledi", 0.5],
      [v => v.youBehind, "{mahde} sandıklar açılıyor; {you} cephesi hesap makinesine sarıldı", 0.5],
    ],
  },
  son: {
    title: [
      "Son sandık yolda",
      "Gözler Yukarıkavak'ta",
      "Traktör bekleniyor",
      "Son sandık: Yukarıkavak",
      [v => v.opened >= 0.98 && v.opened < 1, "Sandıkların {oranEk} açıldı"],
      [v => v.close, "Her şey traktöre bağlı"],
    ],
    sub: [
      "Yukarıkavak sandığı traktörle yolda; traktör çamura saplandı, muhtar sandığı omzunda getiriyor",
      "Traktör Yukarıkavak'tan çıktı, hızı saatte 12 km; stüdyoda çaylar üçüncü kez tazelendi",
      "Son sandık yolda; traktörün farı yanmıyor, önden bir motosiklet ışık tutuyor",
      "Yukarıkavak'ta bir sandık, bir traktör; karar mazotun elinde",
      "Traktör köprüden geçerken kurul 'yavaş' diye bağırdı; zaten yavaştı",
      "Son sandığı getiren traktörün ardında 14 araçlık konvoy; biri düğün konvoyu",
      [v => v.close, "Fark {fark} puan; kararı Yukarıkavak'tan gelen traktör verecek"],
      [v => v.youLead, "{you} önde ama Yukarıkavak gelmedi; Fikret semaverin başından ayrılmıyor"],
      [v => v.youBehind, "{you} geride; umut Yukarıkavak'ta, traktör de hâlâ yolda"],
      [v => v.has("tekir"), "Yukarıkavak sandığının üstünde Tekir uyuyor; kurul uyandırmaya kıyamadı"],
      [v => v.flags.karaca, "Traktör çamura saplandı; son sandığı eşek Karaca taşıyor, mesai dışı"],
    ],
  },
  sonuc: {
    title: [
      [v => !v.tekirWon, "Karakavak seçimini yaptı"],
      [v => !v.tekirWon, "Karakavak seçimini yaptı"],
      [v => !v.tekirWon, "Sandık konuştu"],
      [v => !v.tekirWon, "Karakavak kararını verdi"],
      [v => v.early, "Erken seçim sonuçlandı"],
      [v => v.early, "Erken seçimde sonuç belli"],
      [v => v.win && !v.ilk, "{you} yeniden başkan"],
      [v => v.win && !v.ilk, "Makam yerinde kaldı"],
      [v => v.win && !v.ilk, "Çaylar yine belediyeden"],
      [v => v.win && v.ilk, "{you} Karakavak'ın yeni başkanı"],
      [v => v.win && v.ilk, "Karakavak yeni başkanını seçti"],
      [v => v.win && v.ilk && v.margin < 1, "Mazbata kıl payı geldi"],
      [v => v.win && v.margin < 1, "Kıl payı zafer"],
      [v => v.win && v.margin < 1, "Foto finiş"],
      [v => v.win && v.margin >= 25, "Sandıktan fark çıktı"],
      [v => v.win && v.res.you < 50, "Birinci birincidir"],
      [v => v.win && v.early && !v.ilk, "Erken seçimde makam korundu"],
      [v => v.lost, "{kazanan} kazandı"],
      [v => v.lost, "Yeni başkan: {kazanan}"],
      [v => v.lost, "Makam el değiştirdi"],
      [v => v.lost, "Karakavak'ta değişim"],
      [v => v.lost && v.early && v.winner === "bekir", "Belediye çarşıya taşındı"],
      [v => v.tekirWon, "Tekir başkan!"],
      [v => v.tekirWon, "Karakavak'ın ilk tüylü başkanı"],
      [v => v.tekirWon, "Mırnav Partisi iktidarda"],
    ],
    sub: [
      [v => v.win && !v.ilk, "{you} {youf} ile yeniden seçildi; {nY} adaylı yarışta fark {fark} puan"],
      [v => v.win && v.ilk, "{you} {youf} ile seçildi; {nY} adaylı yarışta fark {fark} puan"],
      [v => v.win && v.ilk, "Yeni başkan {you}: 'Sözlerim defterde, çaylar benden'"],
      [v => v.win && v.res.you < 50, "Oylar bölündü, {youf} yetti. Fikret: 'Birinci birincidir'"],
      [v => v.win && v.margin < 1, "Fark {fark} puan; Yukarıkavak traktörüne teşekkür plaketi hazırlanıyor"],
      [v => v.lost, "{kazanan} {kpct} ile yeni başkan; {you} {youf} ile {sira}. sırada"],
      [v => v.lost, "{kazanan} kazandı; Fikret makam odasındaki bardakları toplamaya başladı"],
      [v => v.tekirWon, "Tekir mazbatasını dişleriyle aldı; ilk icraatı masadaki bardağı yere itmek"],
      [v => v.tekirWon, "Mazbata töreninde Tekir kurdeleyi kesmedi, kovaladı"],
      [v => v.tekirWon, "Tekir'in ilk genelgesi: 'Mama saatleri değişmeyecek.' Meclis oybirliğiyle kabul etti"],
      [v => v.tekirWon, "Tekir zafer konuşması yerine balkonda güneşlendi; kalabalık yine de alkışladı"],
      [v => v.early && v.win, "Erken seçim bitti; okey masası meclis salonundan çıkarıldı"],
      [v => v.early && v.winner === "bekir", "Meclis yarın kıraathanede; gündem: çay, okey, çay"],
    ],
  },
};

// ── Son dakika bandı. Kategori: secim + yerel (≈%40), ulusal (≈%30), dunya (≈%30)
export const TV_TICK: Record<string, Line[]> = {
  secim: [
    "Yukarıkavak sandığını getiren traktör çamura saplandı; muhtar 'sandık bende, traktör sizde' dedi",
    "Sanayi sandığında itiraz: zarftan bakkal fişi çıktı. Fiş de sayıldı: 3 simit, 1 ayran",
    "Müşahitler sandık başında nöbette; nöbet çayı üçüncü kez tazelendi",
    "Sandık kurulu başkanı mührü bulamadı; mühür Fikret'in çay tepsisinin altından çıktı",
    "Seçim kurulu: 'Sonuçlar kesinleşmeden kutlama yapılmasın.' Davul zurna ekibi beklemeye alındı",
    "Oy verme süresi doldu; kuyruktaki üç emekli 'biz sabahtan beri çay kuyruğundaydık' diye itiraz etti",
    "Kavun Ovası'ndan gelen tutanaklar kavun kasasında taşındı; iki tutanak hâlâ kavun kokuyor",
    "Bir seçmen sandığa kimlik yerine kavun getirdi; kurul 'bu sezon olgun' diyerek iade etti",
    "Geçersiz oylardan birinde 'hepinizi seviyorum ama' yazıyor; devamı yok",
    "Katılım rekor seviyede; kahvehaneler boşaldı, okey taşları masada kaldı",
    "Seçim kurulu açıkladı: kesin sonuç, Yukarıkavak traktörünün hızına bağlı",
    "Karakavakspor'un maçı seçim yüzünden ertelendi; kaleci sandık kurulunda görevli",
    "KARAKAVAK TV: Tek kameramız ısındı; görüntüler bir süre Kahveci Rahmi'nin telefonundan",
    "Sandıkların %3'ü açılmışken iki aday da zafer ilan etti; ikisi de pastayı aynı pastaneden aldı",
    [
      v => v.opened < 0.5 && v.a && v.b,
      "Sandıkların %3'ü açıkken {a} ve {b} ayrı ayrı zafer ilan etti; pastalar aynı pastaneden",
    ],
    [v => v.has("tekir"), "Geçersiz oyların önemli kısmına kedi resmi çizilmiş; Mırnav Partisi 'niyet okunuyor' dedi"],
    [
      v => v.has("tekir"),
      "Tekir sandık kurulunun masasına yattı; tutanaklar bir saat gecikti, uyandırmaya kimse kıyamadı",
    ],
    [v => v.has("tekir"), "Tekir'in afişi ilçede yırtılmayan tek afiş oldu; kimse elini kaldıramadı"],
    [
      v => v.has("burak"),
      "Burak, sandıkların %1'i açılmışken canlı yayında 'KAZANDIK' dedi; izleyici 12, biri kendisi",
    ],
    [v => v.has("bekir"), "Çarşıda kepenkler yarıya indi; esnaf ekran başında, Hacı Bekir tespihi hızlandırdı"],
    [v => v.has("vekil"), "Suat Bey'in ekibi Ankara'ya iki rapor hazırladı: 'Kazandık' ve 'Aslında kazandık'"],
    [
      v => v.has("cengiz"),
      "Cengiz Bey sandık başına şantiye konteyneri kurdurdu: 'Kazanırsak ofis, kaybedersek çay ocağı'",
    ],
    [v => v.has("kaan"), "Kaan Bey sonuçları 'sinerji paneli'nden izliyor; panel şimdiye kadar üç kez yeniden başladı"],
    [v => v.has("muhtar"), "Muhtar Rıza oyları parmak hesabıyla saydı; üç kez saydı, üçü de başka çıktı"],
    [
      v => v.has("tuncay"),
      "Karakavak Postası yarının manşetini iki ayrı baskıyla hazırladı; ikisinde de 'Tarihi Gece' yazıyor",
    ],
    [
      v => v.has("albay"),
      "Nuri Bey sandık kuruluna yoklama aldı; 'burada' diyen müşahit 'mevcut' demediği için uyarıldı",
    ],
    [v => v.has("nermin"), "Nermin Hanım tutanakları kendi defterine de yazıyor; kalem üçüncü kez değişti"],
    [v => v.early, "Erken seçim kararı okey masasında alındığı için sandıklardan biri kıraathaneye kuruldu"],
    [v => v.early, "Esnaf odası sandık başına 'veresiye oy yok' tabelası astı; kurul tabelayı indirtti"],
    [v => v.youLead && v.opened < 1, "{you} cephesinde bayram havası; Fikret semaveri ikinci kez yaktı"],
    [v => v.youBehind && v.opened < 1, "{lider} önde; {you} cephesinden açıklama: 'Yukarıkavak daha gelmedi'"],
    [
      v => v.close && v.opened < 1,
      "Fark daralıyor; Kahveci Rahmi çay siparişlerini 'sonuç belli olunca' diye bekletiyor",
    ],
    [v => v.n >= 4, "Seçim kurulu: {nY} adaylı pusula masa örtüsü boyunda, katlamak için ek personel istendi"],
    [
      v => v.opened >= 1 && v.leader,
      "Kesin olmayan sonuçlara göre {lider} kazandı; kahvede 'ben demiştim' diyenler seçmeni geçti",
    ],
    [v => v.opened >= 1 && v.youBehind, "{you} yenilgiyi kabul etti; Fikret son çayı iki şekerli getirdi"],
    [v => v.opened >= 1 && v.youLead, "{you} balkona çıktı; balkon belediyenin değil, Kahveci Rahmi'nin"],
    [v => v.flags.karaca, "Eşek Karaca'nın sandık taşıma teklifi reddedildi; gerekçe: sendikası yok"],
    [
      v => v.flags.itfaiye_muze,
      "Müzedeki 1974 model itfaiye aracı seçim gecesi için ışıklandırıldı; hâlâ yağ sızdırıyor",
    ],
    [v => v.flags.itfaiye_satildi, "Hurdaya satılan 1974 model itfaiye aracı komşu ilçenin seçim konvoyunda görüldü"],
    [v => v.flags.towers, "Karakavak Towers'ın terasından seçim izleniyor; bina bir tarafa eğildi, kameraman da"],
    [v => v.flags.devkavun, "İlçe girişindeki dev kavun heykeline seçim gecesi için ışıklı zincir takıldı"],
    [v => v.flags.bisiklet, "Makam bisikleti sandık başında görüldü; zinciri çıkmış, pompa aranıyor"],
    [
      v => v.flags.ankara_ret,
      "Ankara'ya hayır diyen başkan için genel merkezde pano açıldı; pano doldu, ikincisi sipariş edildi",
    ],
    [
      v => v.flags.ankara_ret,
      "Genel merkez Karakavak sonuçlarını izliyor; teklif mektubu çekmecede, zarfı hâlâ açılmadı",
    ],
  ],
  yerel: [
    "KAVUN BORSASI: Çekirdekli kavun sabit; çekirdeksizde 'o kavun değil' tartışması yüzünden işlem durdu",
    "Çaycı Hüseyin seçim gecesi için 600 bardak yıkadı; 601. bardağı Tekir masadan itti",
    "Karakavakspor forma sponsoru arıyor; 'kavun kokulu forma' teklifi yönetim kurulunda",
    "Kıraathanede okey masası seçim yüzünden ikiye bölündü; taşlar da",
    "Belediye hoparlöründen anons: 'Duyduk duymadık demeyin, sandık kurulunun semaveri kaybolmuştur'",
    "Tekir, belediyede sabah toplantısına en erken gelen personel seçildi; ödülü mama",
    "Karakavak Postası seçim özel sayısını erken bastı; manşet boş, altında 'buraya kazanan' yazıyor",
    "Hans Bey sonuçları Almanya'daki komşularına canlı çeviriyor: 'Kavun... sehr gut'",
    "Başkanın kayınvalidesi Naciye Hanım 40 kişilik dolma sardı: 'Kim kazanırsa kazansın, soğumasın'",
    "Cumhuriyet İlkokulu'nda sınıf başkanlığı seçimi de bugün; Çocuk Başkan Ayşe 'bizde itiraz yok' dedi",
    "Pati Derneği uyardı: 'Konfeti atmayın, kediler yiyor.' Tekir yorum yapmadı",
    "Ferhat Usta sanayideki dev ekranı aküye bağladı; ekran, Sanayi sandığından önce söndü",
    "Kadın Kooperatifi seçim gecesi için 300 gözleme açtı: 'Kim kazanırsa kazansın, hamur kabarıyor'",
    "Karakavak'ta elektrikler dört saniye gitti; Tekir olay yerinin yakınında görüldü",
    "Hayri Hoca'dan açıklama: 'Hayırlısı neyse o olsun.' Açıklama bütün adaylarca tarafsız bulundu",
    "Kavun Ovası'nın kâhin kavunu iki sandıktan birini seçti; sonra kesilip yendi, sır da gitti",
    "Sevim Hanım seçim gecesinin masrafını çıkardı: 1.200 bardak çay, 40 simit, bir traktör mazotu",
    "Öğrenci yurdunda Wi-Fi yalnız sandığın yanında çekiyor; katılım %100",
    "Emekli Albay Nuri Bey sandık görevlilerine sabah 06.00'da içtima yaptırdı; üç görevli uyuya kaldı",
    "Muhtar Rıza kahvede 'ben demiştim' cümlesini bu akşam şimdiden on iki kez kurdu",
    "Veteriner Selin: 'Tekir seçim döneminde 400 gram aldı; her aday ona mama verdi'",
    "Kahveci Rahmi, sonucu bilene bir hafta bedava çay sözü verdi; herkes bildiğini iddia ediyor",
    "Karakavak'ın tek trafik lambası seçim gecesi sarıda kaldı; sürücüler 'kararsız' diye yorumladı",
    "Kaymakam Selim Bey seçim gecesi için tutanak tuttu; tutanağın da tutanağını tuttu",
  ],
  ulusal: [
    "EKONOMİ: Dolar güne yeni rekorla başladı; uzmanlar 'rekorlar da eskisi gibi değil' diyor",
    "MÜJDE: Bir tarlada çay, bor ve umut rezervi bulundu; rezervin ömrü 'seçime kadar' olarak açıklandı",
    "Bayram tatili dokuz güne tamamlandı; onuncu gün için köprü yetmedi, viyadük kuruluyor",
    "Simidin fiyatı ekmeği geçti; fırıncılar 'simit artık ana yemek' açıklaması yaptı",
    "Asgari ücret komisyonu toplandı; ilk karar olarak toplantı çayının fiyatı güncellendi",
    "Bir ilçede kedi trafoya girdi, üç mahalle karanlıkta kaldı. Karakavak: 'Tekir o saatte makamdaydı'",
    "Trafikte yeni rekor: 12 kilometrelik yol 3 saat 40 dakikada alındı; iki sürücü yolda nişanlandı",
    "Vergi dairesinde sıra numarası B-947'ye geldi; bekleyenlerden biri sırada emekli oldu",
    "e-Devlet'te yoğunluk: sistem 'lütfen daha sonra, tercihen yarın deneyiniz' uyarısı verdi",
    "DİZİ: Başrol 146. bölümde de komadan uyanmadı; senarist 'finalde gözünü kırpacak' dedi",
    "TRANSFER: Yıldızspor 38 yaşındaki golcüye 5 yıllık imza attırdı; oyuncu 'emekliliği bekliyordum' dedi",
    "HAVA: Aynı gün için kar, kavurucu sıcak ve dolu uyarısı yapıldı; vatandaş hırkayla şortu birlikte giydi",
    "Bir markette fiyat etiketinin üstüne yedinci etiket yapıştırıldı; raf ağırlığı taşıyamadı",
    "KİRA: Bir ev sahibi kiracıdan referans mektubu, niyet mektubu ve bir de aşk mektubu istedi",
    "Tasarruf genelgesi: resmî toplantılarda çay bardakları küçültüldü; bardak artık yüksük boyunda",
    "Yerli ve milli arama motoru tanıtıldı; ilk aramada 'aradığınız sonuç şu an meşgul' yanıtı geldi",
    "Bir kripto borsasının kurucusu 'kısa bir tatile' çıktı; müşterilere bakiye yerine kartpostal geldi",
    "IMEI harcı: harcı ödenmeyen yurt dışı telefonlar yalnız hesap makinesi olarak çalışacak",
    "Akaryakıta gece yarısı zam; istasyon kuyruğunda sabahlayanlar bir dernek kurdu",
    "Garantili köprüden bugün de araç geçmedi; işletmeci geçmeyen araçlara teşekkür etti",
    "Tanzim satış çadırında soğan kuyruğu; sıradakiler 'biz aslında patatese gelmiştik' dedi",
    "Maaş promosyonu yarışında bankalar emekliye tost makinesi, çaydanlık ve sevgi teklif etti",
    "Enflasyon rakamları açıklandı; vatandaş 'benim enflasyonum başka' diyerek kendi rakamını açıkladı",
    "Çay tüketiminde rekor: kişi başı günde 14 bardak. Bardaklar küçüldüğü için rekor tartışmalı",
    "'Müjde Verme Müdürlüğü' kuruldu; ilk müjdesini kendi kuruluşu için verdi",
    "Otoyol ücretlerine zam; gişenin önüne yeni bir gişe kuruldu, o da ücretli",
    "Vergi affı müjdesi: borcunu dün ödeyen vatandaş 'beni de affedin' dilekçesi verdi",
    "Doğal gaz sayaçları akıllı oldu; bir abone sayaçla tartıştı, sayaç haklı çıktı",
    "SPOR: Derbi sonrası iki kulüp başkanı hakemi, hakem VAR'ı, VAR da havayı suçladı",
    "Dizi finali 3 saat sürdü; 2 saat 40 dakikası reklamdı, izleyici reklamları daha çok sevdi",
    "Konut kampanyasında kura çekildi; kazananlar anahtar yerine anahtarlık aldı, daire 2041'de",
    "Bir ilçe 'dünyanın en büyük kavun heykeli'ni dikti. Karakavak'tan açıklama: 'Bizde kavunun kendisi var'",
    "'Yüzde yüz meyveli' içeceğin yüzde 3 meyve içerdiği ortaya çıktı; üretici 'kalanı umut' dedi",
  ],
  dunya: [
    "UZAY: Bir milyarder kendi roketiyle Ay'a gitti, park yeri bulamayınca geri döndü",
    "UZAY: İki ülke Ay'da aynı krateri 'bizim' diye işaretledi; krater yorum yapmadı",
    "Bir milyarder Mars'ta ilk kahvehaneyi açacağını duyurdu; okey taşları yer çekimsiz ortamda dağıldı",
    "Bir milyarder kendine bir gezegen satın aldı; tapuda 'hisseli' çıktı",
    "Bir milyarder kendi sosyal ağını kurdu; ilk gün tek kullanıcı vardı, o da kendisi",
    "YAPAY ZEKÂ: Robot garson ilk gün bahşiş istedi, ikinci gün sendika kurdu",
    "YAPAY ZEKÂ: Şirketin başına getirilen yapay zekâ, ilk iş bütün toplantıları e-postaya çevirdi",
    "Bir yapay zekâ ödevi yaparken öğretmene 'ben de yoruldum' notu bıraktı",
    "Yapay zekâ kendi dilini geliştirdi; bilim insanları ilk cümleyi çözdü: 'Şarjım bitiyor'",
    "Bir yapay zekâya en verimli çalışma saati soruldu; cevap 'öğle uykusundan sonra' oldu",
    "REKOR: Dünyanın en uzun baklavası kesildi; son dilimi iki komşu ülke 'bizim' diyerek paylaşamadı",
    "REKOR: Dünyanın en büyük pizzası fırına sığmadı; 'dünyanın en büyük hamuru' olarak tescillendi",
    "Kuzey Fiordistan Krallığı'nda kraliyet düğünü: pasta on iki kat, on ikinci kat saraya sığmadı",
    "Fiordistan'daki kraliyet düğününün menüsünde kavun yoktu; Karakavak'tan 40 kasa yola çıktı",
    "KRİPTO: KavunCoin bir gecede %800 yükseldi, sabah %99 düştü; kurucusu 'kavun sezonu kısadır' dedi",
    "ZİRVE: Dünya liderleri çayın demlik mi poşet mi olacağında uzlaşamadı; ortak bildiri ertelendi",
    "Kıtalararası Şarkı Yarışması'nda komşular yine birbirine 12 puan verdi; şaşıran olmadı",
    "DÜNYA OYUNLARI: 'Tepside çay taşıma' resmî branş oldu; Fikret milli takım kampına çağrıldı",
    "İKLİM: Liderler zirveye 42 özel jetle geldi, bildiriyi imzalamaya bisikletle gitti",
    "İKLİM: Kar yağmayınca bir kayak merkezi 'çamur kızağı' sezonunu açtı",
    "Uzay istasyonunda ilk kez ince belli bardakta çay içildi; çay havada süzüldü, şeker aranıyor",
    "Kuzey Kutbu'nda seradaki ilk kavun hasat edildi: boyu fındık, fiyatı altın. Karakavak: 'Bizde de var'",
    "Bir ülkede seçim sonuçları üç hafta sonra açıklandı; Karakavak'tan açıklama: 'Bizim traktör daha hızlı'",
    "SATRANÇ: Dünya şampiyonası finalinde bir oyuncu hamle yerine 'bir çay alalım' dedi; maç 9 saat sürdü",
    "Bir teknoloji şirketi akıllı çaydanlık tanıttı; çaydanlık demlemeden önce kullanıcı sözleşmesi imzalatıyor",
    "Uluslararası zirvede tercümanlar 'hayırlısı' kelimesini çeviremedi; toplantı üç saat uzadı",
    "Uzaydan gelen gizemli sinyalin kaynağı bulundu: gözlemevinin mutfağındaki mikrodalga fırın",
    "Yeni akıllı telefon tanıtıldı; tek yenilik 0,2 milimetre incelmesi. Mağaza önünde 3 km kuyruk",
    "Sosyal medyada yeni akım: telefonsuz on dakika geçirip bunu telefonla paylaşmak",
    "BORSA: Bir yapay zekâ 'kavun' kelimesini 'kaçın' diye okudu; dünyada tarım hisseleri eridi",
    "Mars'taki keşif robotu fotoğraf yerine mesaj yolladı: 'Burası bizim köye benziyor, yalnız çay yok'",
    "Kutuplardan kopan buzdağı bir ülkenin yüzölçümünü geçti; bağımsızlık ilan etmedi, şimdilik",
  ],
};
export const TV_GRUP: Record<string, string> = {
  secim: "karakavak",
  yerel: "karakavak",
  ulusal: "ulusal",
  dunya: "dunya",
};

// ── Döviz ve fiyat kutusu: [ad, taban, oynaklık, yön (yoksa rastgele), yuvarlama adımı]
// Dolar hep çıkar, sabır hep iner; simit ve çay esnaf fiyatıyla (yuvarlak) yazılır.
export const TV_FX: [string, number, number, ("▲" | "▼" | null)?, number?][] = [
  ["KAVUN/TL", 14.9, 0.12, null, 0.1],
  ["ÇAY/BARDAK", 17.5, 0.06, "▲", 0.5],
  ["DOLAR", 74.35, 0.02, "▲"],
  ["EURO", 81.9, 0.03],
  ["ALTIN/GR", 7412, 0.03],
  ["SİMİT", 45, 0.08, "▲", 2.5],
  ["TEKİR MAMASI/KG", 389.9, 0.06, null, 0.1],
  ["MAZOT/LT", 88.4, 0.04],
  ["SABIR/GÜN", 0.04, 0.5, "▼"],
  ["OKEY TAŞI", 12.75, 0.1, null, 0.25],
  ["MÜJDE/HAFTA", 4, 0.4, "▲", 1],
  ["KİRA/ODA", 18500, 0.05, "▲", 250],
];

// ── Durum görünümü: satırların koşulları ve yer tutucuları buradan beslenir
export function tvView(ctx: TvCtx | null | undefined, phase: string) {
  const c: TvCtx = ctx || {};
  // yarım bağlamda (sayım başı, testler) sonucun bazı alanları olmayabilir; koşullar yalnız anlamlı evrede okur
  const res = (c.res || {}) as Tally,
    cands = Array.isArray(res.cands) ? res.cands : [];
  const ids = cands.map(x => x.id),
    fin: Record<string, number> = Object.fromEntries(cands.map(x => [x.id, x.pct]));
  const opened = Math.max(0, Math.min(1, Number(c.opened) || 0));
  const done = phase === "sonuc" || opened >= 1;
  const given = c.pct && typeof c.pct === "object" && Object.keys(c.pct).length ? c.pct : null;
  const pct = phase === "sonuc" ? fin : given || (done ? fin : null);
  const run = pct ? ids.filter(id => Number.isFinite(pct[id])).sort((x, y) => pct[y] - pct[x]) : [];
  const winner: string | null = res.winner || ids[0] || null;
  const leader: string | null =
    phase === "sonuc" ? winner : c.leader && ids.includes(c.leader) ? c.leader : run[0] || null;
  const second = pct ? run.find(id => id !== leader) || null : null;
  // bilinmeyen fark NaN: "fark 10'dan büyük", "fark 1,5'ten küçük" gibi koşullar yanlış çıkar
  const gap =
    phase === "sonuc" && Number.isFinite(res.margin)
      ? res.margin
      : leader && second && pct
        ? Math.max(0, pct[leader] - pct[second])
        : NaN;
  const nm = (id: string) => tvName(id, c.playerName),
    sh = (id: string) => tvShort(id, c.playerName);
  const oranV =
    opened >= 1 ? 100 : opened * 100 >= 99.5 ? Math.floor(opened * 1000) / 10 : Math.max(1, Math.round(opened * 100));
  const oranS = tvDec(oranV),
    rank = ids.indexOf("you") + 1;
  const vars: Vars = {
    you: nm("you"),
    _you: sh("you"),
    n: ids.length || null,
    nY: TV_SAYI[ids.length],
    nY1: TV_SAYI[ids.length + 1],
  };
  const put = (k: string, id: string | null | undefined) => {
    if (id) {
      vars[k] = nm(id);
      vars["_" + k] = sh(id);
    }
  };
  put("lider", leader);
  put("ikinci", second);
  put("kazanan", done ? winner : null);
  put("prev", c.prev && ids.includes(c.prev) ? c.prev : null);
  if (run.length >= 2) {
    put("a", run[0]);
    put("b", run[1]);
  }
  if (!Number.isNaN(gap)) vars.fark = tvDec(gap);
  if (opened > 0) {
    vars.oran = "%" + oranS;
    vars.oranEk = "%" + oranS + tvNumEk(oranS);
  }
  if (done && Number.isFinite(res.you)) vars.youf = "%" + tvDec(res.you);
  if (done && winner && Number.isFinite(fin[winner])) vars.kpct = "%" + tvDec(fin[winner]);
  if (done && rank) vars.sira = rank;
  if (Number.isFinite(res.month)) vars.tarih = dateLabel(res.month);
  const mah = c.mahalle || null;
  if (mah) {
    vars.mah = mah;
    vars.mahs = TV_MAH[mah]?.s || mah;
    vars.mahde = TV_MAH[mah]?.de || tvEk(mah, "de");
  }
  const early = !!(c.early ?? res.early);
  return {
    // göreve başlamadan önceki seçim: "yeniden seçildi" değil "seçildi"
    ilk: !!res.ilk,
    ctx: c,
    res,
    ids,
    has: (id: string) => ids.includes(id),
    n: ids.length,
    leader,
    second,
    gap,
    opened,
    mah,
    early,
    flags: c.flags || {},
    prev: c.prev || null,
    seen: c.seen,
    youLead: leader === "you",
    youBehind: !!leader && leader !== "you",
    close: gap < 1.5,
    mid: opened > 0 && opened < 1,
    win: done && !!res.win,
    lost: done && !res.win && winner !== "tekir",
    tekirWon: done && winner === "tekir",
    winner,
    margin: Number.isFinite(res.margin) ? res.margin : 0,
    a: vars.a,
    b: vars.b,
    vars,
  };
}

// ── Alt bant
export function kj(phase: string, ctx: TvCtx, rng: Rng) {
  const v = tvView(ctx, phase),
    P = TV_KJ[phase] || TV_KJ.sayim;
  const titles: Line[] = P.title;
  let subs: Line[] = P.sub;
  if (phase === "sayim" || phase === "lider")
    subs = [...subs, ...((v.leader && TV_ONDE[v.leader]) || []).map((t): Line => [tvYes, t])];
  if (phase === "mahalle") subs = [...subs, ...((v.mah && TV_MAH[v.mah]?.sub) || [])];
  if (phase === "sonuc") {
    const q = (id: string) => (TV_SOZ[id] || TV_SOZ._)[id === v.winner ? "win" : "lose"];
    // gerçek yayınlardaki gibi "KAZANAN: '…'" ağır basar; kaybeden oyuncunun açıklaması arada bir gelir
    const said = (who: string, list: Line[], w: number) =>
      list.map((e): Line =>
        typeof e === "string" ? [tvYes, `{${who}}: '${e}'`, w] : [e[0], `{${who}}: '${e[1]}'`, w],
      );
    subs = [...subs, ...said("kazanan", q(v.winner ?? ""), 4), ...(v.win ? [] : said("you", q("you"), 0.8))];
  }
  const title = tvChoose(titles, v, rng, TV_MAX.title, "title", tvUp(KANAL.ad + " SEÇİM GECESİ"));
  const sub = tvChoose(subs, v, rng, TV_MAX.sub, "sub", "Karakavak seçim gecesi sürüyor");
  return { title, sub };
}

// ── Son dakika bandı: [{ t, cat }]; ticker() yalnız metinleri döndürür
export function tickerTagged(ctx: TvCtx, rng: Rng) {
  const v = tvView(ctx, "ticker");
  const n = 8 + Math.floor(rng() * 5);
  const nK = Math.round(n * 0.4),
    nU = Math.round(n * 0.3),
    nD = n - nK - nU;
  const nS = Math.max(2, Math.ceil(nK * 0.6)),
    want: Record<string, number> = { secim: nS, yerel: nK - nS, ulusal: nU, dunya: nD };
  // ağırlıklı, yerine koymadan seçim (Efraimidis-Spirakis): duruma özgü satır öne çıkar
  const take = (cat: string, k: number) =>
    tvPool(TV_TICK[cat], v, TV_MAX.tick, "tick")
      .filter(x => !v.seen?.has?.(x.s))
      .map(x => ({ t: x.s, cat, key: Math.pow(rng(), 1 / x.w) }))
      .sort((a, b) => b.key - a.key)
      .slice(0, k);
  const bag: Record<string, { t: string; cat: string; key: number }[]> = Object.fromEntries(
    Object.keys(want).map(c => [c, take(c, want[c])]),
  );
  // sıralama: ilk haber seçimden; sonra aynı kümeden iki haber art arda gelmesin
  const out: { t: string; cat: string }[] = [];
  let last: string | null = null;
  while (Object.values(bag).some(a => a.length)) {
    const cats = Object.keys(bag).filter(c => bag[c].length);
    let opts: string[] = out.length ? cats.filter(c => TV_GRUP[c] !== last) : cats.filter(c => c === "secim");
    if (!opts.length) opts = cats;
    const most = Math.max(...opts.map(c => bag[c].length)),
      top = opts.filter(c => bag[c].length >= most - 1);
    const c = top[Math.floor(rng() * top.length)],
      item = bag[c].shift()!;
    out.push({ t: item.t, cat: c });
    last = TV_GRUP[c];
    v.seen?.add?.(item.t);
  }
  return out;
}
export const ticker = (ctx: TvCtx, rng: Rng) => tickerTagged(ctx, rng).map(x => x.t);

// ── Döviz kutusu (i ile döner)
export function fx(i: number, rng: Rng) {
  const N = TV_FX.length,
    [ad, base, vol, dir, step] = TV_FX[(((Math.floor(i) || 0) % N) + N) % N];
  let val = base * (1 + (rng() * 2 - 1) * vol);
  if (step) val = Math.round(val / step) * step;
  const yon = dir || (rng() < 0.55 ? "▲" : "▼");
  return { ad, deger: tvNum(Math.max(0.01, val), 2), yon };
}

// ── Kazanan sözü ya da yenilgi açıklaması (≤ 70)
export function winnerQuote(id: string, ctx: TvCtx, rng: Rng) {
  const v = tvView(ctx, "sonuc"),
    q = TV_SOZ[id] || TV_SOZ._;
  const won = !v.res.cands ? true : v.winner === id;
  return tvChoose(won ? q.win : q.lose, v, rng, TV_MAX.quote, "raw", String(won ? TV_SOZ._.win[0] : TV_SOZ._.lose[0]));
}

// ── "Neden?" paneli: TV diliyle sonuç okuması
export const TV_CALDI: Record<string, string> = {
  nermin: "Nermin Hanım sizden {v} puan aldı; muhalefetin oyu bu kez sandığa geldi.",
  vekil: "Suat Bey sizden {v} puan aldı; Ankara'nın selamı sandığa kadar ulaştı.",
  cengiz: "Cengiz Bey sizden {v} puan aldı; beton her mahallede biraz oy döktü.",
  kaan: "Kaan Bey sizden {v} puan aldı; 'Karakavak 4.0' bazı seçmenlere yüklendi.",
  bekir: "Hacı Bekir sizden {v} puan aldı; çarşının oyu çarşıda kaldı.",
  muhtar: "Muhtar Rıza sizden {v} puan aldı; Kavaklı önce kendi muhtarını düşündü.",
  tuncay: "Tuncay sizden {v} puan aldı; manşet bazı oyları çevirdi.",
  burak: "Burak sizden {v} puan aldı; gençler beğenmekle kalmadı, oy da verdi.",
  albay: "Nuri Bey sizden {v} puan aldı; nizam intizam sevenler hazır ola geçti.",
  tekir: "Tekir sizden {v} puan aldı; kediye kızamayan seçmen oyunu ona verdi.",
};
export function whyLines(res: Tally | null | undefined, playerName?: string) {
  if (!res || !Array.isArray(res.cands)) return [];
  const out: string[] = [],
    d = (x: unknown) => tvDec(Number(x) || 0),
    w = res.cands[0];
  if (w && Number.isFinite(w.pct))
    out.push(
      `Kesin sonuç: ${tvName(w.id, playerName)} %${d(w.pct)}${Number.isFinite(res.margin) ? `, fark ${d(res.margin)} puan` : ""}.`,
    );
  const ek = res.cands.length - 2;
  // açılış seçimi: anket yerine kampanyanın kazanma şansı ve beyannamedeki sözler
  if (res.ilk) {
    if (Number.isFinite(res.sans)) out.push(`Kampanya anketi kazanma şansını %${d(res.sans)} gösteriyordu.`);
    const mh = res.acilis ? ACILIS[res.acilis].muhur || 0 : 0;
    if (res.acilis === "ezici")
      out.push(`Ezici zafer: Ankara ödenek yolluyor, masada ${TV_SAYI[mh] || mh} mühür bekliyor.`);
    else if (res.acilis === "zafer") out.push(`Rahat zafer: masada ${TV_SAYI[mh] || mh} mühür bekliyor.`);
    else if (res.acilis === "kilpayi")
      out.push("Kıl payı: Nermin Hanım itiraz edecek, mazbata gölgeli. İtirazı kapatan gölgeyi kaldırır.");
    const vz = res.vaatler || [];
    out.push(
      vz.length
        ? `Beyannamedeki ${vz.length === 1 ? "söz" : TV_SAYI[vz.length] + " söz"} oyları taşıdı: ${joinTR(vz.map(x => `“${x}”`))}. Hesabı da sorulacak.`
        : "Hiç söz vermediniz; seçmen de pek bir şey beklemedi.",
    );
  } else if (Number.isFinite(res.p0))
    out.push(
      ek <= 0
        ? Math.abs(res.p0 - res.you) < 0.5
          ? `Teke tek yarış; sandık ankete birebir uydu: %${d(res.you)}. Anketçi zam istedi.`
          : `Teke tek yarış: anket %${d(res.p0)} diyordu, sandık %${d(res.you)} dedi.`
        : res.p0 >= 50
          ? `Teke tek yarışsaydınız anket %${d(res.p0)} diyordu; ${TV_SAYI[ek] || ek} aday daha girince oylar bölündü.`
          : res.win
            ? `Teke tek ankette %${d(res.p0)} idiniz; oyların bölünmesi işinize yaradı.`
            : `Teke tek ankette %${d(res.p0)} idiniz; yokuş yukarı bir seçimdi.`,
    );
  for (const x of res.steal || [])
    if (x.v >= 1)
      out.push(tvFill(TV_CALDI[x.id] || `${tvName(x.id)} sizden yaklaşık {v} puan aldı.`, { v: d(x.v) }, false));
  if (res.win && res.you < 50) out.push(`Oylar bölündü; %${d(res.you)} ile birinci çıktınız. Birinci birincidir.`);
  if (!res.win && w && w.id !== "you")
    out.push(
      `Siz %${d(res.you)} ile ${res.cands.findIndex(c => c.id === "you") + 1}. sıradasınız; makam el değiştirdi.`,
    );
  if (Number.isFinite(res.margin) && res.margin < 1)
    out.push(`Fark ${d(res.margin)} puan: bir sandık kurulunun çay molası kadar.`);
  else if (res.win && res.margin >= 25)
    out.push(`Fark ${d(res.margin)} puan; rakipler sandığı değil, takvimi suçluyor.`);
  if (res.vaat) out.push(`Tutulmamış vaatler sandıkta ${d(res.vaat)} puan götürdü; seçmen not defteri tutuyormuş.`);
  for (const k of res.kalem || [])
    out.push(
      k.puan < 0
        ? `“${k.ad}” sandıkta ${d(-k.puan)} puan götürdü; kahvede hâlâ konuşuluyor.`
        : `“${k.ad}” +${d(k.puan)} puan getirdi; seçmen kurdeleyi değil işi hatırladı.`,
    );
  if (res.rel >= 1) out.push(`Kanaat önderleri arkanızdaydı: +${d(res.rel)} puan. Kahvede adınız hayırla anıldı.`);
  else if (res.rel <= -1) out.push(`Küs olduğunuz kanaat önderleri kahvede konuştu: −${d(-res.rel)} puan.`);
  if (res.fatigue)
    out.push(`${res.term}. dönem yorgunluğu: −${d(res.fatigue)} puan. Seçmen afişteki yüzünüzü ezberledi.`);
  if (res.early) out.push("Erken seçimdi; esnaf odası sandığa güçlü girdi.");
  return out;
}
