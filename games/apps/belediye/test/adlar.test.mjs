// Ad zarı testleri: havuzlar, yasak listeler, cins, tekrar ve yazım
import { test } from "vitest";
import assert from "node:assert/strict";
import { yukle } from "./yukle.mjs";

const A = await yukle("cards", "adlar");
const rng = seed => () => {
  seed |= 0;
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
const lc = s => s.toLocaleLowerCase("tr");
const dups = a => a.filter((x, i) => a.indexOf(x) !== i);
const ySoy = new Set(A.YASAK_SOYAD.map(lc)),
  yTam = new Set(A.YASAK_TAM.map(lc)),
  yAd = new Set(A.YASAK_AD.map(lc));

test("havuzlar geniş, tekrarsız", () => {
  assert.ok(A.ADLAR.k.length >= 180, `kadın adı az: ${A.ADLAR.k.length}`);
  assert.ok(A.ADLAR.e.length >= 180, `erkek adı az: ${A.ADLAR.e.length}`);
  assert.ok(A.SOYADLAR.length >= 380, `soyadı az: ${A.SOYADLAR.length}`);
  assert.deepEqual(dups(A.ADLAR.k), []);
  assert.deepEqual(dups(A.ADLAR.e), []);
  assert.deepEqual(dups(A.SOYADLAR), []);
  // iki havuzda da olan adlar yalnız ortak (iki cinse konan) adlar
  const both = A.ADLAR.e.filter(a => A.ADLAR.k.includes(a)).sort();
  assert.deepEqual(both, [...A.ADLAR_ORTAK].sort());
  assert.ok(A.ADLAR_ORTAK.length < 25, "ortak ad çok; cinse uygunluk anlamını yitirir");
});

test("yazım: her ad ve soyad Türkçe harflerle, baş harfi büyük (İ/ı doğru)", () => {
  const title = w => w.charAt(0).toLocaleUpperCase("tr") + w.slice(1).toLocaleLowerCase("tr");
  for (const w of [...A.ADLAR.k, ...A.ADLAR.e, ...A.SOYADLAR]) {
    assert.match(w, /^[A-ZÇĞİÖŞÜ][a-zçğıöşü]+$/u, `"${w}" Türkçe alfabe dışı ya da tek kelime değil`);
    assert.equal(title(w), w, `"${w}" baş harf büyük yazılmamış`);
    assert.equal(w, w.normalize("NFC"), `"${w}" birleşik (combining) harf içeriyor`);
    assert.ok(!/[qwx]/i.test(w), `"${w}" Türkçede olmayan harf`);
  }
  // büyük I ve İ yerinde: Işık, Irmak, Ilgın, Ilgaz noktasız; İnci, İpek, İlhan... noktalı
  for (const w of ["Işık", "Irmak", "Ilgın", "Ilgaz", "Işıl"])
    assert.ok([...A.ADLAR.k, ...A.ADLAR.e, ...A.SOYADLAR].includes(w), w);
  for (const w of [...A.ADLAR.k, ...A.ADLAR.e, ...A.SOYADLAR].filter(w => /^[Iİ]/.test(w)))
    assert.ok(w[0] === "I" ? /^I(ş|r|lg|hl)/.test(w) : true, `"${w}" noktasız I ile başlıyor, İ olmalı mı?`);
});

test("gerçek kişi yok: yasak soyad, yasak ad ve rakip adayların adları havuzda değil", () => {
  assert.deepEqual(
    A.SOYADLAR.filter(s => ySoy.has(lc(s))),
    [],
  );
  assert.deepEqual(
    [...A.ADLAR.k, ...A.ADLAR.e].filter(a => yAd.has(lc(a))),
    [],
  );
  for (const s of [
    "Erdoğan",
    "Kılıçdaroğlu",
    "İmamoğlu",
    "Yavaş",
    "Bahçeli",
    "Akşener",
    "Babacan",
    "Davutoğlu",
    "Demirtaş",
    "İnce",
    "Soylu",
    "Özel",
    "Gül",
    "Sezer",
    "Bayar",
    "İnönü",
    "Menderes",
    "Ecevit",
    "Demirel",
    "Özal",
    "Çiller",
    "Erbakan",
    "Türkeş",
    "Baykal",
    "Atatürk",
  ])
    assert.ok(ySoy.has(lc(s)), `${s} yasak listede yok`);
  for (const a of ["Tayyip", "Devlet"]) assert.ok(yAd.has(lc(a)), `${a} yasak adlarda yok`);
  // seçim gecesi karışmasın: rakip çıkabilen oyun kişilerinin adları ve Fikret
  const unvan = new Set(["muhtar", "hacı", "bey", "hanım"]);
  const rakip = [
    ...Object.keys(A.ADAYLAR)
      .flatMap(k => A.PEOPLE[k].ad.split(" "))
      .filter(w => !unvan.has(lc(w))),
    "Fikret",
  ];
  for (const a of rakip) assert.ok(!A.ADLAR.k.includes(a) && !A.ADLAR.e.includes(a), `rakip aday adı havuzda: ${a}`);
  // zar başka bir başkan adayının soyadını vermesin
  for (const b of Object.values(A.BASKANLAR))
    assert.ok(!A.SOYADLAR.includes(b.ad.split(" ").at(-1)), `BASKANLAR soyadı havuzda: ${b.ad}`);
  // yasak tam adların biçimi: "Ad Soyad"
  for (const t of A.YASAK_TAM) assert.match(t, /^\S+ \S+$/u, t);
});

test("20 bin ad: yasak birleşim yok, cins havuzu tutuyor, kutuya sığıyor", () => {
  const r = rng(7);
  for (const cins of ["k", "e"]) {
    let son = [];
    for (let i = 0; i < 10000; i++) {
      const ad = A.rastgeleAd(cins, r, son),
        [a, s, ...rest] = ad.split(" ");
      assert.equal(rest.length, 0, `"${ad}" iki kelime değil`);
      assert.ok(A.ADLAR[cins].includes(a), `${cins} için yanlış havuz: ${ad}`);
      assert.ok(A.SOYADLAR.includes(s), ad);
      assert.ok(!yTam.has(lc(ad)) && !ySoy.has(lc(s)) && !yAd.has(lc(a)), `yasaklı ad üretildi: ${ad}`);
      assert.ok(ad.length <= 24, `"${ad}" isim kutusuna sığmaz`);
      assert.notEqual(a, s, ad);
      son = [...son, ad].slice(-8);
    }
  }
});

test("ünlü tam adlar imkânsız: zar tam o ada düşse bile başka ad gelir", () => {
  let n = 0;
  for (const t of A.YASAK_TAM) {
    const [a, s] = t.split(" ");
    for (const cins of ["k", "e"]) {
      const ia = A.ADLAR[cins].indexOf(a),
        is = A.SOYADLAR.indexOf(s);
      if (ia < 0 || is < 0) continue;
      n++;
      // ilk atış tam yasaklı ada düşsün; sonrası sabit tohumla
      const seq = [(ia + 0.5) / A.ADLAR[cins].length, (is + 0.5) / A.SOYADLAR.length],
        r = rng(n);
      const zar = () => (seq.length ? seq.shift() : r());
      assert.notEqual(A.rastgeleAd(cins, zar, []), t);
    }
  }
  assert.ok(n > 40, `denenen yasak birleşim az: ${n}`);
});

test("tekrar yok: art arda aynı ad gelmez, son 8 atışta ad ve soyad tekrarlamaz", () => {
  for (const cins of ["k", "e"]) {
    const r = rng(cins === "k" ? 11 : 12),
      all = [];
    for (let i = 0; i < 4000; i++) all.push(A.rastgeleAd(cins, r, all.slice(-8)));
    for (let i = 1; i < all.length; i++) {
      assert.notEqual(all[i], all[i - 1], `art arda aynı ad: ${all[i]}`);
      const [a, s] = all[i].split(" "),
        prev = all.slice(Math.max(0, i - 8), i).flatMap(x => x.split(" "));
      assert.ok(
        !prev.includes(a) && !prev.includes(s),
        `son 8 atışta tekrar: ${all[i]} ← ${all.slice(Math.max(0, i - 8), i).join(", ")}`,
      );
    }
  }
  // bozuk zar (hep aynı yüz) bile art arda aynı adı vermez
  const sabit = () => 0;
  let son = [];
  for (let i = 0; i < 20; i++) {
    const ad = A.rastgeleAd("k", sabit, son);
    assert.notEqual(ad, son.at(-1));
    son = [...son, ad].slice(-8);
  }
});

test("başkanlık vesikalıklarının cinsi var, varsayılan adlar kendi havuzunda", () => {
  for (const [id, b] of Object.entries(A.BASKANLAR)) {
    assert.ok(b.cins === "k" || b.cins === "e", `${id}: cins yok`);
    assert.ok(A.ADLAR[b.cins].includes(b.ad.split(" ")[0]), `${id}: "${b.ad}" ${b.cins} havuzunda değil`);
  }
  const say = c => Object.values(A.BASKANLAR).filter(b => b.cins === c).length;
  assert.ok(say("k") > 0 && say("e") > 0);
});
