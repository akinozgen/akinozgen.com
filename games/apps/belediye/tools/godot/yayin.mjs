// Seçim gecesi yayını (broadcast.ts + ui.ts electionNight) Godot için:
//   data/_yayin.json            metin havuzları, mahalleler, aday renkleri, döviz kutusu, sayım zamanlaması
//   tests/vectors/yayin.jsonl   aynı tohumla kj / ticker / fx / winnerQuote / whyLines çıktıları (port doğrulaması)
// Havuz satırlarının koşulları JS fonksiyonu: JSON'da {kosul, metin, agirlik} olarak, kosul kaynak metniyle durur.
// Aynı koşul metni birçok satırda geçer; "kosullar" listesi hepsini bir kez sayar (GDScript'te sözlükle eşlenebilir).
// node --experimental-strip-types tools/godot/yayin.mjs <godot proje klasörü>
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import * as B from "../../src/broadcast.ts";
import * as E from "../../src/engine.ts";

const PROJE = process.argv[2];
if (!PROJE) throw new Error("Godot proje klasörünü ver");
mkdirSync(join(PROJE, "tests/vectors"), { recursive: true });

const kosullar = new Map();
const kos = f => {
  const k = f.toString();
  kosullar.set(k, (kosullar.get(k) || 0) + 1);
  return k;
};
const veri = x => {
  if (typeof x === "function") return { kosul: kos(x) };
  if (Array.isArray(x)) {
    if (typeof x[0] === "function")
      return { kosul: kos(x[0]), metin: x[1], ...(x[2] != null ? { agirlik: x[2] } : {}) };
    return x.map(veri);
  }
  if (x && typeof x === "object") return Object.fromEntries(Object.entries(x).map(([k, v]) => [k, veri(v)]));
  return x;
};
const ui = readFileSync(new URL("../../src/ui.ts", import.meta.url), "utf8");
const sabit = ad =>
  new Function(`return ${ui.match(new RegExp(`const ${ad}[^=]*= ([\\[{][\\s\\S]*?\\n[\\]}]);`))[1]}`)();

const havuz = {};
for (const ad of [
  "KANAL",
  "TV_MAX",
  "TV_W",
  "TV_SAYI",
  "TV_EK1",
  "TV_EK10",
  "TV_KISA",
  "TV_MAH",
  "TV_ONDE",
  "TV_SOZ",
  "TV_KJ",
  "TV_TICK",
  "TV_GRUP",
  "TV_FX",
  "TV_CALDI",
])
  havuz[ad] = veri(B[ad]);

writeFileSync(
  join(PROJE, "data/_yayin.json"),
  JSON.stringify(
    {
      v: 1,
      kaynak:
        "src/broadcast.ts (saf fonksiyonlar: tvView, tvPool, tvDraw, kj, tickerTagged, fx, winnerQuote, whyLines) ve src/ui.ts electionNight. Mantık için kaynağı oku; burada veri var.",
      not: "Havuz satırı: düz metin (ağırlık 1) ya da {kosul, metin, agirlik?}; ağırlık yoksa koşullu satır TV_W (2,5). Koşul tvView(ctx, evre) çıktısını (v) alır. Yer tutucular broadcast.ts başındaki açıklamada.",
      ...havuz,
      kosullar: [...kosullar].map(([kaynak, kac]) => ({ kaynak, kac })),
      EC_RENK: sabit("EC_RENK"),
      MAHALLE: {
        not: "[ad, blok karışımı [halk, esnaf, parti tabanı, kararsız], sandık sayısı, sandık büyüklüğü çarpanı (yoksa 1)]. Açılış sırası bu sıra; Yukarıkavak'ın tek küçük sandığı en son.",
        liste: sabit("MAHALLE"),
        sandik:
          "ballotBoxes(res, rng): mahalle sırasıyla her sandık için boy = (380 + floor(rng()·320))·çarpan; aday i oyu = boy · max(.002, Σ_b karışım[b]·res.blocs[b].pay[i]/100) · (0.8 + rng()·0.4). Sonra her adayın sütun toplamı kesin sonuca (pct/100 · toplam) ölçeklenir. rng = rngOf(res.month·131 + res.term·7 + 3).",
      },
      zamanlama: {
        not: "ms; hiz = 0,6 yayın daha önce izlendiyse (ecSeen), yoksa 1. 'azaltilmis' hareket azaltma açıkken.",
        ilk_sandik: { normal: 2400, azaltilmis: 600, hiz_carpar: true },
        sandik_arasi: "520 + 760·(açılan/(N−1))^1.6, hız çarpanıyla; hızlı başlar, sona doğru yavaşlar",
        azaltilmis_adimlar: "üç adımda: N·.3, N·.7, N−1 sandığa kadar topluca; adımlar arası 1600",
        son_sandik:
          "açılan ≥ N−1: KJ 'son' hemen, spiker 'lights', duvar 'Son sandık yolda'; sonuç 3400·hız sonra (azaltılmış 1200)",
        kj_tutma: 2600,
        kj_tutma_not:
          "her KJ en az kj_tutma·hız kalır; bekleyenlerden önceliklisi (son 3 > lider 2 > sayım/mahalle 1), eşitse en yenisi",
        spiker_konusma: "say(min(4200, 900 + (başlık + alt yazı uzunluğu)·30))",
        lider_degisimi:
          "3. sandıktan sonra lider değişirse: KJ 'lider' (öncelik 2), spiker şok + 'lean', duvar '<kısa ad> öne geçti', 2600 sonra sakinleşir (fark < %2 ise heyecanlı)",
        esikler: "%25, %50, %75 geçilince: KJ 'sayim', spiker 'point', duvar 'Sandıkların %X'i açıldı'",
        mahalle: "yeni mahallenin ilk sandığında: KJ 'mahalle', spiker 'papers', duvar '<mahalle> sandıkları'",
        tekir: "Tekir adaysa N/2. sandıkta spiker 'cat' tepkisi",
        sayac_kayma:
          "oy sayaçları 120 ms zaman sabitiyle üstel yaklaşır (1 − e^(−t/120)); sıra değişimi 480 ms cubic-bezier(.3,1.25,.5,1)",
        doviz: "fx kutusu 4200'de bir sıradaki kalem",
        kayan_yazi: "hız ~95 px/sn, en az 30 sn tur; ticker() her açılışta ve sonuçta yeniden",
        sonuc:
          "mahalleler üçer üçer 5000'de bir döner; KJ 'sonuc' 6500, 13000, 19500'de yeniden; döküm paneli ve Devam düğmesi 3800·hız sonra (azaltılmış 800)",
      },
    },
    null,
    1,
  ),
);

// ── doğrulama izleri
const mulberry32 = seed => () => {
  seed |= 0;
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
const satir = [];
const MAH = sabit("MAHALLE").map(m => m[0]);
for (let tohum = 1; tohum <= 24; tohum++) {
  // bir seçim sonucu: yeni oyun, seçim ayına sar, sayımı motor yapsın
  const g = mulberry32(tohum * 97);
  const s = E.newGame({ acilis: ["zafer", "ezici", "kilpayi"][tohum % 3], rng: g });
  s.month = s.term * E.TERM - 1;
  Object.assign(s.m, {
    h: 20 + Math.floor(g() * 70),
    k: 30 + Math.floor(g() * 50),
    e: 30 + Math.floor(g() * 50),
    a: 30 + Math.floor(g() * 50),
  });
  // aday alanı: çoğunda motorun kurası, bazılarında elle (çok adaylı, Tekir'li, ilk seçim)
  const ek = [[], ["cengiz"], ["kaan", "bekir"], ["tekir"], ["muhtar", "tekir", "burak"], ["vekil"]][tohum % 6];
  if (tohum > 6) s.field = { term: s.term, main: "nermin", extras: ek };
  const res = E.tally(s, g);
  // Tekir'in kazandığı gece motorda çok nadir: bir izde sonucu elle çevir (yayın yalnız sonucu okur)
  if (tohum === 21) {
    const ti = res.cands.findIndex(c => c.id === "tekir");
    [res.cands[0].pct, res.cands[ti].pct] = [res.cands[ti].pct, res.cands[0].pct];
    res.cands.sort((a, b) => b.pct - a.pct);
    Object.assign(res, { winner: "tekir", win: false, margin: +(res.cands[0].pct - res.cands[1].pct).toFixed(1) });
    res.you = res.cands.find(c => c.id === "you").pct;
  }
  let n = 0;
  const r0 = mulberry32(tohum),
    rng = () => (n++, r0());
  const seen = new Set(),
    ad = tohum % 4 ? "Ayşe Yılmaz" : "",
    ids = res.cands.map(c => c.id),
    fin = Object.fromEntries(res.cands.map(c => [c.id, c.pct]));
  const kay = (cagri, girdi, cikti) => satir.push({ tohum, cagri, girdi, cikti, rng_cagri_sayisi: n });
  // sayım ortası yüzdeleri: kesin sonuca göre kaydırılmış, sırası değişebilir
  const ara = k => Object.fromEntries(ids.map((id, i) => [id, Math.max(0.5, fin[id] + (i % 2 ? 1 : -1) * k)]));
  const ctx = (o = {}) => ({ res, playerName: ad, flags: s.flags, seen, ...o });
  const dis = c => ({ ...c, res: undefined, seen: undefined, flags: undefined });
  satir.push({ tohum, res, oyuncu: ad, flags: s.flags });
  const adimlar = [
    ["acilis", { opened: 0, mahalle: MAH[0] }],
    ["mahalle", { opened: 0.12, mahalle: MAH[1], pct: ara(3), leader: null }],
    ["sayim", { opened: 0.25, mahalle: MAH[2], pct: ara(2) }],
    ["lider", { opened: 0.5, mahalle: MAH[4], pct: ara(1), prev: ids[1], lead: ids[0] }],
    ["son", { opened: 0.993, mahalle: MAH[7], pct: ara(0.2) }],
    ["sonuc", { opened: 1, mahalle: MAH[7] }],
  ];
  for (const [evre, o] of adimlar) {
    const c = ctx(o);
    if (c.pct && !c.leader) c.leader = Object.entries(c.pct).sort((a, b) => b[1] - a[1])[0][0];
    kay("kj", { evre, ctx: dis(c) }, B.kj(evre, c, rng));
    kay("tickerTagged", { ctx: dis(c) }, B.tickerTagged(c, rng));
  }
  for (let i = 0; i < 4; i++) kay("fx", { i }, B.fx(i, rng));
  kay("winnerQuote", { id: res.winner }, B.winnerQuote(res.winner, ctx({ opened: 1 }), rng));
  kay("whyLines", { oyuncu: ad }, B.whyLines(res, ad));
}
writeFileSync(join(PROJE, "tests/vectors/yayin.jsonl"), satir.map(x => JSON.stringify(x)).join("\n") + "\n");
console.log("yayın:", Object.keys(havuz).length, "sabit,", kosullar.size, "ayrı koşul,", satir.length, "iz satırı");
