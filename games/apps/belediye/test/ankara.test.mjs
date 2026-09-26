// Ankara'nın daveti: gözdeliği kazanan başkana liste zamanında gelir (dönemde bir kez); reddedilebilir,
// her retle büyür; kabul veda evrakını getirir, son orada (vazgeçmek de mümkün)
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
// liste zamanına gelmiş, gözdeliği kazanılmış bir durum
const gozde = (X, term = 1) => {
  const s = X.newGame();
  s.term = term;
  s.month = (term - 1) * X.TERM + X.TERM - 12;
  s.m.a = 88;
  s.cnt.boyun_a = X.TUNE.davetRica;
  return s;
};

test("davet yalnız liste zamanında, gözdeliği kazanana ve dönemde bir kez gelir", async () => {
  const X = await load(),
    r = rng(1);
  const s = gozde(X);
  const c = X.draw(s, r);
  assert.equal(c.kind, "davet");
  assert.equal(c.id, "davet_gm");
  assert.equal(c.flip, false);
  assert.equal(s.davetTerm, s.term);
  assert.notEqual(X.draw(s, r).kind, "davet", "aynı dönemde ikinci davet yok");
  // Ankara 100 olsa da ricası karşılanmamış başkana davet gelmez; tavan oyunu da bitirmez
  const t = gozde(X);
  t.cnt.boyun_a = 0;
  t.m.a = 100;
  assert.notEqual(X.draw(t, r).kind, "davet");
  // liste zamanı dışında gelmez
  const u = gozde(X);
  u.month = 20;
  assert.notEqual(X.draw(u, r).kind, "davet");
});

test("ret: Ankara iner, makam sürer, manşet evrakı gelir; teklif her retle büyür", async () => {
  const X = await load(),
    r = rng(2);
  const seen = [];
  for (let k = 0; k < 4; k++) {
    const s = gozde(X, 1);
    s.cnt.ankara_ret = k;
    const c = X.draw(s, r);
    seen.push(c.id);
    const a0 = s.m.a;
    X.choose(s, "L", r);
    assert.equal(s.over, null);
    assert.ok(s.m.a <= a0 - 25, `ret Ankara'yı indirmeli (${a0} → ${s.m.a})`);
    assert.equal(s.cnt.ankara_ret, k + 1);
    const want = ["ret_manset", "ret_suat", "ret_denetim", "ret_denetim"][k];
    assert.ok(
      s.queue.some(q => q.id === want),
      `${k + 1}. retten sonra ${want} sıraya girmeli`,
    );
    if (k === 3) assert.match(c.text, /santral/, "dördüncü davet hatırlama metniyle gelir");
  }
  assert.deepEqual(seen, ["davet_gm", "davet_mv", "davet_bakan", "davet_bakan"]);
});

test("kabul: veda evrakı gelir; orada gitmek terfi finali, kalmak oyunu sürdürür", async () => {
  for (const [ret, veda, key] of [
    [0, "veda_gm", "a100_gm"],
    [1, "veda_mv", "a100_mv"],
    [2, "veda_bakan", "a100"],
    [5, "veda_bakan", "a100"],
  ]) {
    const X = await load(),
      r = rng(4 + ret),
      s = gozde(X);
    s.cnt.ankara_ret = ret;
    X.draw(s, r);
    X.choose(s, "R", r);
    assert.equal(s.pending, null, "kabul tek başına bitirmez");
    const v = X.draw(s, r);
    assert.equal(v.id, veda);
    const git = v.L.son ? "L" : "R",
      kal = git === "L" ? "R" : "L";
    assert.equal(v[git].son, key);
    // kalmak: oyun sürer, Ankara küser
    const t = structuredClone(s),
      a0 = t.m.a;
    X.choose(t, kal, r);
    assert.equal(t.pending, null);
    assert.ok(t.m.a < a0);
    // gitmek: terfi finali
    X.choose(s, git, r);
    assert.deepEqual(s.pending, { type: "ending", key });
    const e = X.draw(s, r);
    assert.ok(X.ENDINGS[key].win, `${key} terfi sayılmalı`);
    assert.equal(e.R.t, "Karakavak'a selam");
    X.choose(s, "L", r);
    assert.equal(s.over.key, key);
  }
});

test("davet ve veda evrakları içerik kurallarına uyar", async () => {
  const X = await load();
  for (const c of X.DAVET) {
    assert.ok(c.text.length <= 240, `${c.id} metni uzun`);
    assert.ok(!c.L.son && !c.R.son, `${c.id}: davet tek başına bitirmemeli`);
    const v = X.CARD[c.R.next.id];
    assert.ok(v?.chain, `${c.id}: kabulün veda evrakı yok`);
    assert.ok(X.ENDINGS[v.R.son]?.win, `${v.id}: vedanın sonu terfi değil`);
    assert.ok(!v.L.son, `${v.id}: vazgeçme yolu yok`);
  }
  for (const id of ["ret_manset", "ret_kus", "ret_odenek", "ret_suat", "ret_denetim", "ret_kavun"])
    assert.ok(X.CARD[id]?.chain, `${id} yok ya da zincir değil`);
});
