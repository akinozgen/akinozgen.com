// Esnaftan teklif: esnaf tavan yapınca oyun bitmez; oda sizi başkanlığa çağırır, reddedilebilir, her retle büyür
import { test } from "vitest";
import assert from "node:assert/strict";
import { yukle } from "./yukle.mjs";

const load = () => yukle("cards", "engine");
const rng = seed => () => {
  seed |= 0;
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
const Z = () => [0, 0, 0, 0];
// esnafı tavana iten sıradan bir evrak
const push = (X, s, r) => {
  s.m.e = 97;
  s.cur = {
    id: "t",
    kind: "normal",
    who: "bekir",
    konu: "t",
    L: { t: "a", e: [0, 0, 8, 0], rel: {} },
    R: { t: "b", e: Z(), rel: {} },
  };
  return X.choose(s, "L", r);
};

test("esnaf tavan yapınca oyun bitmez, oda başkanlığı teklifi gelir; taraflar çevrilmez", async () => {
  const X = await load(),
    r = rng(1),
    s = X.newGame();
  s.month = 20;
  push(X, s, r);
  assert.equal(s.over, null);
  assert.deepEqual(s.pending, { type: "oda" });
  for (let i = 0; i < 20; i++) {
    const t = X.newGame();
    t.pending = { type: "oda" };
    const c = X.draw(t, rng(i));
    assert.equal(c.kind, "davet");
    assert.equal(c.id, "oda_baskan");
    assert.equal(c.flip, false);
    assert.ok(c.R.son && !c.L.son, "kabul sağda, ret solda");
  }
  // eski kayıttaki erken seçim de teklife döner
  const eski = X.newGame();
  eski.pending = { type: "erken" };
  assert.equal(X.draw(eski, r).id, "oda_baskan");
});

test("ret: esnaf iner, makam sürer, küslük evrakı gelir; teklif her retle büyür", async () => {
  const X = await load(),
    r = rng(2),
    s = X.newGame();
  s.month = 20;
  const seen = [];
  for (let k = 0; k < 4; k++) {
    push(X, s, r);
    const c = X.draw(s, r);
    seen.push(c.id);
    const e0 = s.m.e;
    X.choose(s, "L", r);
    assert.equal(s.over, null);
    assert.ok(s.m.e <= e0 - 25, `ret esnafı indirmeli (${e0} → ${s.m.e})`);
    assert.equal(s.cnt.oda_ret, k + 1);
    assert.ok(s.flags.oda_ret);
    const want = ["odaret_kepenk", "odaret_koltuk", "odaret_tebesir", "odaret_tebesir"][k];
    assert.ok(
      s.queue.some(q => q.id === want),
      `${k + 1}. retten sonra ${want} sıraya girmeli`,
    );
    if (k === 3) assert.match(c.text, /tişört/, "dördüncü teklif hatırlama metniyle gelir");
    s.queue = [];
    s.pending = null;
  }
  assert.deepEqual(seen, ["oda_baskan", "oda_birlik", "oda_borsa", "oda_borsa"]);
});

test("kabul: çarşıya geçiş finali gelir, yenilgi değil; oyun biter", async () => {
  for (const [ret, key] of [
    [0, "e100_oda"],
    [1, "e100_birlik"],
    [2, "e100_borsa"],
    [5, "e100_borsa"],
  ]) {
    const X = await load(),
      r = rng(4 + ret),
      s = X.newGame();
    s.month = 30;
    s.cnt.oda_ret = ret;
    push(X, s, r);
    X.draw(s, r);
    X.choose(s, "R", r);
    assert.deepEqual(s.pending, { type: "ending", key });
    const e = X.draw(s, r);
    assert.equal(e.kind, "ending");
    assert.ok(X.ENDINGS[key].win, `${key} yenilgi sayılmamalı`);
    assert.equal(e.R.t, "Çarşıya selam");
    X.choose(s, "L", r);
    assert.equal(s.over.key, key);
  }
});

test("seçim evrakında esnaf tavanı sandığı bekletmez; teklif seçimden sonra gelir", async () => {
  const X = await load(),
    r = rng(9),
    s = X.newGame();
  s.month = 59;
  s.m.e = 100;
  s.cur = X.materialize(X.electionCard(s, r), s, r);
  X.choose(s, "R", r);
  assert.equal(s.pending?.type, "sonuc", "önce sandık");
});

test("teklif ve ret evrakları içerik kurallarına uyar; eski erken seçim sonu yalnız kayıtlar için", async () => {
  const X = await load();
  for (const c of X.ODA) {
    assert.ok(c.text.length <= 240, `${c.id} metni uzun`);
    assert.ok(X.ENDINGS[c.R.son]?.win, `${c.id}: kabulün sonu çarşıya geçiş değil`);
    assert.ok(!c.L.son, `${c.id}: ret oyunu bitirmemeli`);
  }
  for (const id of ["odaret_kepenk", "odaret_koltuk", "odaret_tebesir"])
    assert.ok(X.CARD[id]?.chain, `${id} yok ya da zincir değil`);
  assert.ok(X.ENDINGS.e100.legacy);
  assert.ok(!X.special.toString().includes("earlyCard"));
});
