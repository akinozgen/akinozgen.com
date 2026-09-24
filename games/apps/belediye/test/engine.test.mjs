// Motor ve içerik testleri: node --test test/
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync, readdirSync } from "node:fs";

const src = ["cards.js", "engine.js"].map(f => readFileSync(new URL("../src/" + f, import.meta.url), "utf8")).join("\n");
const E = new Function(src + "\nreturn { CARDS, CARD, CRISES, ENDINGS, INTRO, PEOPLE, BASKANLAR, newGame, draw, choose, METERS, TERM };")();
const rng = seed => () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
const all = [...E.CARDS, ...Object.values(E.CRISES), ...E.INTRO];

test("her evrakın göndereni, iki seçeneği ve dört etkisi var", () => {
  for (const c of all) {
    assert.ok(E.PEOPLE[c.who], `${c.id || c.konu}: bilinmeyen kişi ${c.who}`);
    for (const s of ["L", "R"]) {
      assert.ok(c[s]?.t, `${c.id}: ${s} etiketi yok`);
      assert.equal(c[s].e.length, 4, `${c.id}: ${s} etkisi dört gösterge değil`);
      assert.ok(c[s].t.length <= 26, `${c.id}: "${c[s].t}" düğmeye sığmaz`);
    }
    assert.ok(c.text.length <= 240, `${c.id}: metin evraka sığmaz (${c.text.length})`);
  }
});

test("zincirler, işler ve ilişkiler var olan kartlara ve kişilere bağlı", () => {
  const ids = new Set(E.CARDS.map(c => c.id)), linked = new Set();
  for (const c of E.CARDS) for (const s of ["L", "R"]) {
    const o = c[s];
    if (o.next) { assert.ok(ids.has(o.next[0]), `${c.id} → ${o.next[0]} yok`); linked.add(o.next[0]); }
    if (o.pol?.doneCard) { assert.ok(ids.has(o.pol.doneCard), `${c.id} → ${o.pol.doneCard} yok`); linked.add(o.pol.doneCard); }
    for (const w of Object.keys(o.rel || {})) assert.ok(E.PEOPLE[w], `${c.id}: ilişkide bilinmeyen ${w}`);
  }
  for (const c of E.CARDS) if (c.chain) assert.ok(linked.has(c.id), `${c.id} zincir kartı ama hiçbir yerden gelmiyor`);
});

test("halk tavan yapınca oyun bitmez, diğer göstergeler bitirir", () => {
  const s = E.newGame(); s.m.h = 99;
  s.cur = { kind: "normal", id: "t", who: "fikret", konu: "t", L: { t: "a", e: [5, 0, 0, 0], rel: {} }, R: { t: "b", e: [0, 0, 0, 0], rel: {} } };
  E.choose(s, "L", rng(1));
  assert.equal(s.m.h, 100);
  assert.equal(s.pending, null);
  s.m.k = 99; s.cur = { ...s.cur, L: { t: "a", e: [0, 5, 0, 0], rel: {} } };
  E.choose(s, "L", rng(1));
  assert.deepEqual(s.pending, { type: "ending", key: "k100" });
});

test("rastgele oyunlar biter, takılmaz ve makul sürer", () => {
  const months = [];
  for (let g = 0; g < 400; g++) {
    const r = rng(g * 31 + 7), s = E.newGame();
    let n = 0;
    while (!s.over && n++ < 3000) { E.draw(s, r); E.choose(s, r() < 0.5 ? "L" : "R", r); }
    assert.ok(s.over, `oyun ${g} bitmedi`);
    assert.ok(E.ENDINGS[s.over.key], `oyun ${g}: bilinmeyen son ${s.over.key}`);
    months.push(s.over.months);
  }
  months.sort((a, b) => a - b);
  const med = months[months.length >> 1];
  assert.ok(med >= 15 && med <= 80, `rastgele oyunun medyanı ${med} ay; denge kaymış (beklenen 15-80)`);
});

test("her kişinin ve başkanlık vesikalığının resmi var, başıboş resim yok", () => {
  const dir = new URL("../web-src/portraits/", import.meta.url);
  const ids = [...Object.keys(E.PEOPLE), ...Object.keys(E.BASKANLAR)];
  for (const id of ids) assert.ok(existsSync(new URL(id + ".webp", dir)), `web-src/portraits/${id}.webp yok`);
  assert.ok(Object.keys(E.BASKANLAR).length > 0, "BASKANLAR boş");
  for (const [id, b] of Object.entries(E.BASKANLAR)) {
    assert.ok(b.ad && b.ad.length <= 24, `${id}: ad boş ya da isim kutusuna sığmaz`);
    assert.ok(b.lakap && b.lakap.length <= 34, `${id}: lakap boş ya da uzun`);
    assert.ok(b.bio && b.bio.length <= 200, `${id}: biyografi boş ya da broşüre sığmaz (${b.bio?.length})`);
  }
  for (const f of readdirSync(dir)) assert.ok(ids.includes(f.replace(/\.webp$/, "")), `${f} hiçbir kişiye ya da BASKANLAR'a bağlı değil`);
});
