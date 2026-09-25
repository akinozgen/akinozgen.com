// Motorun zamana yayılan mekanikleri: sayaçlar, koşullu/aralıklı zincir, etiket etkileşimi, yer açma, hatırlama, vaat,
// yay sonu, yan etki, sandık hafızası (skandal/eser), miras
import { test } from "vitest";
import assert from "node:assert/strict";
import { yukle } from "./yukle.mjs";

// her test kendi kopyasını alır: kart eklemek başka testi bozmasın
const load = () => yukle("cards", "engine");
const rng = seed => () => {
  seed |= 0;
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
const Z = [0, 0, 0, 0];
const card = (id, extra = {}, L = {}, R = {}) => ({
  id,
  who: "sevim",
  konu: "Deneme",
  text: "Deneme.",
  L: { t: "Sol", e: Z, ...L },
  R: { t: "Sağ", e: Z, ...R },
  ...extra,
});
// kartı elle masaya koyup seçtirir (çevirme olmadan)
const play = (E, s, c, side, r = rng(1)) => {
  s.cur = { ...c, kind: "normal", L: { ...c.L, e: c.L.e }, R: { ...c.R, e: c.R.e } };
  return E.choose(s, side, r);
};
const withCards = (E, ...cs) => {
  E.CARDS.push(...cs);
  for (const c of cs) E.CARD[c.id] = c;
};

test("sayaç: inc/dec adı ya da miktarıyla işler, sıfırın altına inmez; reqCnt kartı açar", async () => {
  const E = await load(),
    s = E.newGame();
  const kapi = card("t_kapi", { reqCnt: { borc: [3, 5] } });
  assert.equal(E.eligible(kapi, s), false);
  play(E, s, card("a", {}, { inc: { borc: 2 } }), "L");
  play(E, s, card("b", {}, { inc: "borc" }), "L");
  assert.equal(s.cnt.borc, 3);
  assert.equal(E.eligible(kapi, s), true);
  play(E, s, card("c", {}, { inc: { borc: 3 } }), "L");
  assert.equal(E.eligible(kapi, s), false, "üst sınır 5");
  play(E, s, card("d", {}, { dec: { borc: 10 } }), "L");
  assert.equal(s.cnt.borc, 0);
});

test("zincir: gecikme aralığı içinde kalır", async () => {
  const E = await load(),
    seen = new Set();
  for (let g = 0; g < 200; g++) {
    const s = E.newGame();
    E.schedule(s, { id: "asfalt", in: [3, 6] }, rng(g));
    const lag = s.queue[0].at - 1;
    assert.ok(lag >= 3 && lag <= 6, `gecikme ${lag}`);
    seen.add(lag);
  }
  assert.equal(seen.size, 4, "aralığın her ayı görülmeli");
});

test("zincir: koşul teslim anında sınanır; tutmazsa else gelir, else yoksa düşer", async () => {
  const E = await load();
  withCards(E, card("t_bedel", { chain: true }), card("t_affedildi", { chain: true }));
  const r = rng(7);
  // koşul tutuyor → asıl kart
  let s = E.newGame();
  s.flags.borclu = true;
  E.schedule(s, { id: "t_bedel", in: 0, if: { req: "borclu" }, else: "t_affedildi" }, r);
  s.month = 1;
  assert.equal(E.draw(s, r).id, "t_bedel");
  // borç kapatılmış → else
  s = E.newGame();
  E.schedule(s, { id: "t_bedel", in: 0, if: { req: "borclu" }, else: "t_affedildi" }, r);
  s.month = 1;
  assert.equal(E.draw(s, r).id, "t_affedildi");
  // else yok → kuyruk düşer, torbadan normal kart gelir
  s = E.newGame();
  E.schedule(s, { id: "t_bedel", in: 0, if: { req: "borclu" } }, r);
  s.month = 1;
  const c = E.draw(s, r);
  assert.notEqual(c.id, "t_bedel");
  assert.equal(s.queue.length, 0);
});

test("etiket etkileşimi: iki etiket birlikteyken her ay ek etki, ilk değişte bir kez kart ve haber", async () => {
  const E = await load();
  withCards(E, card("t_catisma", { chain: true }));
  E.SYN.push({
    id: "t_syn",
    a: "kemer",
    b: "festival",
    e: [0, 0, 0, -2],
    card: "t_catisma",
    ad: "Tasarruf ve festival",
    msg: "Genelge ile konser aynı aya denk geldi.",
  });
  const s = E.newGame();
  E.addPol(s, { id: "genelge", ad: "Tasarruf genelgesi", e: Z, tags: ["kemer"] });
  let t = E.tick(s);
  assert.deepEqual(t.sum, Z, "tek etiket etkileşmez");
  E.addPol(s, { id: "konser", ad: "Konser serisi", e: [1, 0, 0, 0], tags: ["festival"] });
  t = E.tick(s);
  assert.deepEqual(t.sum, [1, 0, 0, -2]);
  assert.equal(t.events.filter(e => e.syn).length, 1);
  assert.equal(s.queue[0].id, "t_catisma");
  t = E.tick(s);
  assert.deepEqual(t.sum, [1, 0, 0, -2], "etki her ay sürer");
  assert.equal(t.events.filter(e => e.syn).length, 0, "haber bir kez");
  assert.equal(s.queue.filter(q => q.id === "t_catisma").length, 1, "kart bir kez");
});

test("yer açma: dolu listede en eski sıradan karar kalkar, iş/inşaat korunur, oyuncuya haber gider", async () => {
  const E = await load(),
    s = E.newGame();
  E.addPol(s, { id: "insaat", ad: "Köprü inşaatı", e: Z, ay: 12, done: [5, 0, 0, 0] });
  for (let i = 1; i < E.MAX_ONGOING; i++) E.addPol(s, { id: "p" + i, ad: "Karar " + i, e: Z });
  assert.equal(s.ongoing.length, E.MAX_ONGOING);
  E.addPol(s, { id: "yeni", ad: "Yeni karar", e: Z });
  assert.equal(s.ongoing.length, E.MAX_ONGOING);
  assert.ok(
    s.ongoing.some(o => o.id === "insaat"),
    "inşaat kalmalı",
  );
  assert.ok(!s.ongoing.some(o => o.id === "p1"), "en eski sıradan karar gitmeli");
  const t = E.tick(s);
  assert.ok(t.events.some(e => e.ad === "Karar 1" && /yer açmak/.test(e.msg)));
});

test("hatırlama metni: koşulu tutan varyant asıl metnin yerine geçer", async () => {
  const E = await load(),
    s = E.newGame();
  const c = card("t_hatir", {
    alt: [
      { if: { cnt: { garanti: 1 } }, text: "Geçen yıl imzaladığınız garanti yüzünden..." },
      { req: "x", text: "X metni" },
    ],
  });
  assert.equal(E.materialize(c, s, rng(3)).text, "Deneme.");
  s.cnt.garanti = 1;
  assert.match(E.materialize(c, s, rng(3)).text, /imzaladığınız garanti/);
});

test("vaat: tutulmamış vaat anketi düşürür (tavanlı), yeni dönemde yarısı unutulur", async () => {
  const E = await load(),
    s = E.newGame();
  const p0 = E.pollOf(s);
  s.cnt.vaat = 2;
  assert.equal(Math.round((p0 - E.pollOf(s)) * 10) / 10, 2 * E.TUNE.vaat);
  s.cnt.vaat = 50;
  assert.equal(Math.round((p0 - E.pollOf(s)) * 10) / 10, E.TUNE.vaatMax);
  s.cnt.vaat = 5;
  s.cur = { id: "sonuc", kind: "sonuc", L: { t: "a", e: Z }, R: { t: "b", e: Z } };
  E.choose(s, "L", rng(1));
  assert.equal(s.cnt.vaat, 2);
});

test("özgüllük: daha çok şartla açılan kart torbada ağır basar", async () => {
  const E = await load();
  assert.equal(E.specificity(card("x")), 0);
  assert.equal(E.specificity(card("x", { req: ["a", "b"], reqCnt: { k: 1 }, reqTag: "t" })), 4);
});

test("çoklu kesme: cut birden fazla kararı kaldırabilir", async () => {
  const E = await load(),
    s = E.newGame();
  E.addPol(s, { id: "a", ad: "A", e: Z });
  E.addPol(s, { id: "b", ad: "B", e: Z });
  E.addPol(s, { id: "c", ad: "C", e: Z });
  play(E, s, card("t_kes", {}, { cut: ["a", "c"] }), "L");
  assert.deepEqual(
    s.ongoing.map(o => o.id),
    ["b"],
  );
});

test("eski kayıtlar bozulmadan açılır: yeni alanlar yokken motor çalışır", async () => {
  const E = await load(),
    s = E.newGame();
  delete s.dropped;
  delete s.syn;
  s.ongoing.push({ id: "eski", ad: "Eski karar", e: [0, 1, 0, 0], left: null }); // tags alanı yok
  const r = rng(11);
  for (let i = 0; i < 30 && !s.over; i++) {
    E.draw(s, r);
    E.choose(s, r() < 0.5 ? "L" : "R", r);
  }
  assert.ok(s.month > 0);
});

test("yay sonu: seçeneğin son'u oyunu o sonla bitirir, göstergeler yerindeyken bile", async () => {
  const E = await load(),
    s = E.newGame();
  E.ENDINGS.t_son = {
    who: "fikret",
    konu: "Deneme sonu",
    text: "Bitti.",
    manset: "BİTTİ",
    spot: "Bitti.",
    kisa: "Bitti",
    btn: ["Tamam", "Peki"],
  };
  play(E, s, card("t_final", {}, { son: "t_son" }), "L");
  assert.deepEqual(s.pending, { type: "ending", key: "t_son" });
  const c = E.draw(s, rng(2));
  assert.equal(c.kind, "ending");
  assert.equal(c.L.t, "Tamam", "sonun kendi düğmesi");
  E.choose(s, "L", rng(2));
  assert.equal(s.over.key, "t_son");
});

test("yan etki: ilk 3 ayda doğmaz, bir kez doğar, koşul tutmazsa doğmaz, ilçede 3 ayda en çok bir tane", async () => {
  const E = await load(),
    s = E.newGame();
  E.addPol(s, {
    id: "gece",
    ad: "Gece pazarı",
    e: Z,
    yan: [
      { card: "t_kavga", p: 0.2 },
      { card: "t_sel", p: 0.2, min: 1, if: { req: "yagmur" } },
    ],
  });
  const bir = () => 0; // her zar tutar
  E.tick(s, bir);
  E.tick(s, bir);
  assert.equal(s.queue.length, 0, "ilk iki ay: kavga 3. aydan önce yok, sel koşulu tutmuyor");
  E.tick(s, bir);
  assert.deepEqual(
    s.queue.map(q => q.id),
    ["t_kavga"],
  );
  s.flags.yagmur = true;
  s.month++;
  E.tick(s, bir);
  assert.equal(s.queue.length, 1, "3 ay dolmadan ikinci yan etki yok");
  s.month += 3;
  E.tick(s, bir);
  assert.equal(s.queue[0].id, "t_sel");
  s.month += 3;
  E.tick(s, bir);
  assert.equal(s.queue.filter(q => q.id === "t_kavga").length, 1, "yan etki bir kez");
  const t = E.newGame();
  E.addPol(t, { id: "gece", ad: "Gece pazarı", e: Z, yan: [{ card: "t_kavga", p: 0.1 }] });
  for (let i = 0; i < 6; i++) E.tick(t, () => 0.9);
  assert.equal(t.queue.length, 0, "zar tutmazsa doğmaz");
  const u = E.newGame();
  E.addPol(u, { id: "sade", ad: "Sade karar", e: Z });
  let atildi = 0;
  for (let i = 0; i < 5; i++) E.tick(u, () => (atildi++, 0));
  assert.equal(atildi, 0, "yan etkisi olmayan karar zar harcamaz");
});

test("sandık defteri: kalemler adıyla ankete girer (net etki sınırlı), özür düşürür, yeni dönemde yarıya iner; seçim gecesine gider", async () => {
  const E = await load(),
    s = E.newGame();
  const p0 = E.pollOf(s),
    fark = () => Math.round((E.pollOf(s) - p0) * 10) / 10;
  play(E, s, card("t_ihale", {}, { anket: { ad: "Kreş ihalesi", puan: -3 } }), "L");
  assert.equal(s.cnt.skandal, 1, "eksi kalem skandal sayar (kapılar için)");
  assert.equal(fark(), -3);
  play(E, s, card("t_ozur", {}, { anket: { ad: "Kamuoyundan özür", puan: 1 } }), "L");
  assert.equal(fark(), -2);
  for (let i = 0; i < 5; i++) play(E, s, card("t_s" + i, {}, { anket: { ad: "Skandal " + i, puan: -4 } }), "L");
  assert.equal(fark(), E.TUNE.defterMin, "alt sınır");
  const r = E.tally(s, rng(4));
  assert.equal(r.defter, E.TUNE.defterMin);
  assert.deepEqual(
    r.kalem.map(k => k.puan),
    [-4, -4],
    "en ağır iki kalem",
  );
  s.defter = [
    { ad: "Park", puan: 3, m: 0 },
    { ad: "Küçük dedikodu", puan: -0.5, m: 0 },
  ];
  s.cur = { id: "sonuc", kind: "sonuc", L: { t: "a", e: Z }, R: { t: "b", e: Z } };
  E.choose(s, "L", rng(1));
  assert.deepEqual(
    s.defter.map(k => [k.ad, k.puan]),
    [["Park", 1.5]],
    "yarıya iner, küçük kalan silinir",
  );
});

test("miras: koşulu tutan ilk iki cümle, sırasıyla; son'a bağlı satır yalnız o sonda", async () => {
  const E = await load(),
    s = E.newGame();
  E.MIRAS.push(
    { if: { req: "a" }, text: "A." },
    { if: { cnt: { k: 2 } }, text: "K.", son: "k0" },
    { if: { req: "b" }, text: "B." },
  );
  assert.deepEqual(E.mirasOf(s), []);
  s.flags.b = true;
  s.cnt.k = 2;
  assert.deepEqual(E.mirasOf(s), ["B."], "K. yalnız k0 sonunda");
  s.over = { key: "k0", months: 10, term: 1 };
  assert.deepEqual(E.mirasOf(s), ["K.", "B."]);
  s.flags.a = true;
  assert.deepEqual(E.mirasOf(s), ["A.", "K."]);
});

test("hafıza notu ve defter kalemi masadaki seçeneğe taşınır", async () => {
  const E = await load(),
    s = E.newGame();
  const c = card("t_not", {}, { not: "Hacı Bekir bunu unutmayacak.", anket: { ad: "Çarşı", puan: 2 } });
  const cur = E.materialize(c, s, rng(1)),
    side = cur.L.t === "Sol" ? cur.L : cur.R;
  assert.equal(side.not, "Hacı Bekir bunu unutmayacak.");
  assert.deepEqual(side.anket, { ad: "Çarşı", puan: 2 });
});
