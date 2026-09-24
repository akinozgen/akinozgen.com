// Ankara'dan davet: Ankara tavan yapınca oyun bitmez; teklif gelir, reddedilebilir, her retle büyür, kabul terfiyle biter
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const src = ["cards.js", "engine.js"].map(f => readFileSync(new URL("../src/" + f, import.meta.url), "utf8")).join("\n");
const load = () => new Function(src + "\nreturn { DAVET, ENDINGS, CARD, newGame, draw, choose, electionCard, materialize };")();
const rng = seed => () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
const Z = () => [0, 0, 0, 0];
// Ankara'yı tavana iten sıradan bir evrak
const push = (X, s, r) => {
  s.m.a = 97;
  s.cur = { id: "t", kind: "normal", who: "vekil", konu: "t", L: { t: "a", e: [0, 0, 0, 8], rel: {} }, R: { t: "b", e: Z(), rel: {} } };
  return X.choose(s, "L", r);
};

test("Ankara tavan yapınca oyun bitmez, genel merkez daveti gelir; taraflar çevrilmez", () => {
  const X = load(), r = rng(1), s = X.newGame(); s.month = 20;
  push(X, s, r);
  assert.equal(s.over, null); assert.deepEqual(s.pending, { type: "davet" });
  for (let i = 0; i < 20; i++) {
    const t = X.newGame(); t.pending = { type: "davet" };
    const c = X.draw(t, rng(i));
    assert.equal(c.kind, "davet"); assert.equal(c.id, "davet_gm"); assert.equal(c.flip, false);
    assert.ok(c.R.son && !c.L.son, "kabul sağda, ret solda");
  }
});

test("ret: Ankara iner, makam sürer, manşet evrakı gelir; teklif her retle büyür", () => {
  const X = load(), r = rng(2), s = X.newGame(); s.month = 20;
  const seen = [];
  for (let k = 0; k < 4; k++) {
    push(X, s, r);
    const c = X.draw(s, r);
    seen.push(c.id);
    const a0 = s.m.a;
    X.choose(s, "L", r);
    assert.equal(s.over, null);
    assert.ok(s.m.a <= a0 - 25, `ret Ankara'yı indirmeli (${a0} → ${s.m.a})`);
    assert.equal(s.cnt.ankara_ret, k + 1); assert.ok(s.flags.ankara_ret);
    const want = ["ret_manset", "ret_suat", "ret_denetim", "ret_denetim"][k];
    assert.ok(s.queue.some(q => q.id === want), `${k + 1}. retten sonra ${want} sıraya girmeli`);
    if (k === 3) assert.match(c.text, /santral/, "dördüncü davet hatırlama metniyle gelir");
    s.queue = []; s.pending = null;
  }
  assert.deepEqual(seen, ["davet_gm", "davet_mv", "davet_bakan", "davet_bakan"]);
});

test("ikinci reddi Suat Bey sever (sıra ona kalır)", () => {
  const X = load(), r = rng(3), s = X.newGame(); s.month = 20; s.cnt.ankara_ret = 1;
  push(X, s, r); X.draw(s, r);
  const before = s.rel.vekil || 0;
  X.choose(s, "L", r);
  assert.equal(s.rel.vekil, before + 2);
});

test("kabul: terfi finali gelir, yenilgi gibi değil; oyun terfiyle biter", () => {
  for (const [ret, key] of [[0, "a100_gm"], [1, "a100_mv"], [2, "a100"], [5, "a100"]]) {
    const X = load(), r = rng(4 + ret), s = X.newGame(); s.month = 30; s.cnt.ankara_ret = ret;
    push(X, s, r); X.draw(s, r);
    X.choose(s, "R", r);
    assert.equal(s.over, null); assert.deepEqual(s.pending, { type: "ending", key });
    const e = X.draw(s, r);
    assert.equal(e.kind, "ending"); assert.equal(e.key, key);
    assert.ok(X.ENDINGS[key].win, `${key} terfi sayılmalı`);
    assert.equal(e.L.t, "Hayırlı olsun"); assert.equal(e.R.t, "Karakavak'a selam");
    X.choose(s, "L", r);
    assert.equal(s.over.key, key);
  }
});

test("seçim evrakında Ankara tavanı sandığı bekletmez; davet seçimden sonra gelir", () => {
  const X = load(), r = rng(9), s = X.newGame();
  s.month = 59; s.m.a = 100;
  s.cur = X.materialize(X.electionCard(s, r), s, r);
  X.choose(s, "R", r);
  assert.equal(s.pending?.type, "sonuc", "önce sandık");
});

test("davet ve ret evrakları içerik kurallarına uyar", () => {
  const X = load();
  for (const c of X.DAVET) {
    assert.ok(c.text.length <= 240, `${c.id} metni uzun`);
    assert.ok(X.ENDINGS[c.R.son]?.win, `${c.id}: kabulün sonu terfi değil`);
    assert.ok(!c.L.son, `${c.id}: ret oyunu bitirmemeli`);
  }
  for (const id of ["ret_manset", "ret_kus", "ret_odenek", "ret_suat", "ret_denetim", "ret_kavun"]) assert.ok(X.CARD[id]?.chain, `${id} yok ya da zincir değil`);
});
