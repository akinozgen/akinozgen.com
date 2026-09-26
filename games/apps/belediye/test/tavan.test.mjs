// Tavan hâlleri: çok sevilmek ve çok para oyunu bitirmez. Esnaf ve Ankara doyar; 85'i geçen göstergede hâl başlar
// (şeritte görünür, her ay bedel), talepler gelir; esnafta üç kez boyun eğen başkana kıyak dosyası açılır.
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
const evrak = (X, s, L, R = Z()) => {
  s.cur = {
    id: "t",
    kind: "normal",
    who: "bekir",
    konu: "t",
    L: { t: "a", e: L, rel: {} },
    R: { t: "b", e: R, rel: {} },
  };
};

test("tavan oyunu bitirmez: kasa, esnaf, Ankara 100'de oyun sürer; dip bitirir", async () => {
  const X = await load(),
    r = rng(1);
  for (const [i, k] of [
    [1, "k"],
    [2, "e"],
    [3, "a"],
  ]) {
    const s = X.newGame();
    s.m[k] = 99;
    const e = Z();
    e[i] = 20;
    evrak(X, s, e);
    X.choose(s, "L", r);
    assert.equal(s.pending, null, `${k} tavanda oyun bitmemeli`);
    assert.equal(s.over, null);
  }
  const s = X.newGame();
  s.m.k = 3;
  evrak(X, s, [0, -8, 0, 0]);
  X.choose(s, "L", r);
  assert.deepEqual(s.pending, { type: "ending", key: "k0" });
  // eski kayıtlardaki erken seçim ya da oda teklifi beklemesi düşer
  for (const type of ["erken", "oda"]) {
    const t = X.newGame();
    t.pending = { type };
    assert.notEqual(X.draw(t, r).kind, "davet");
  }
});

test("doygunluk: esnaf ve Ankara 80'in üstünde yarım artar, 85 ve üstünde sert düşer; halk ve kasa doymaz", async () => {
  const X = await load();
  const m = { h: 90, k: 90, e: 90, a: 78 };
  assert.deepEqual(
    X.etkin(m, [4, 4, 4, 8]),
    [4, 4, 2, 5],
    "halk, kasa tam; esnaf yarım; Ankara 80'e kadar tam, üstü yarım",
  );
  assert.deepEqual(X.etkin(m, [0, 0, -10, 0]), [0, 0, -13, 0], "yüksekten düşüş");
  assert.deepEqual(X.etkin({ h: 50, k: 50, e: 50, a: 50 }, [5, -5, 5, -5]), [5, -5, 5, -5], "ortada değişmez");
});

test("hâl: 85'i geçince yürürlüğe girer, haberi çıkar, yer sınırına sayılmaz; 75'in altında kalkar", async () => {
  const X = await load(),
    r = rng(2);
  const s = X.newGame();
  for (let i = 0; i < X.MAX_ONGOING; i++) X.addPol(s, { id: "p" + i, ad: "Karar " + i, e: Z() });
  s.m.e = 84;
  evrak(X, s, [0, 0, 6, 0]);
  const out = X.choose(s, "L", r);
  assert.ok(s.m.e >= 85, `esnaf ${s.m.e}`);
  assert.ok(
    s.ongoing.some(o => o.id === "sulta_e" && o.hal),
    "çarşı sultası yürürlükte",
  );
  assert.equal(s.ongoing.filter(o => !o.hal).length, X.MAX_ONGOING, "hâl başka kararı kaldırmadı");
  assert.ok(out.events.some(e => e.ad === "Çarşı sultası"));
  const h0 = s.m.h;
  evrak(X, s, Z());
  X.choose(s, "L", r);
  assert.equal(s.m.h, h0 - 1, "sultada halk her ay küser");
  s.m.e = 70;
  evrak(X, s, Z());
  const out2 = X.choose(s, "L", r);
  assert.ok(!s.ongoing.some(o => o.id === "sulta_e"), "sulta bitti");
  assert.ok(out2.events.some(e => e.ad === "Çarşı sultası"));
});

test("talep: yalnız hâldeyken, bekleme süresiyle ve her biri bir kez gelir", async () => {
  const X = await load();
  const s = X.newGame();
  assert.equal(
    X.talepCard(s, () => 0),
    null,
    "hâl yokken talep yok",
  );
  s.m.e = 90;
  X.tavanHal(s, []);
  const c = X.talepCard(s, () => 0);
  assert.ok(X.TALEP.e.some(t => t.id === c.id));
  assert.equal(
    X.talepCard(s, () => 0),
    null,
    "bekleme süresi",
  );
  s.month += X.TUNE.talepCd;
  s.used[c.id] = true;
  const d = X.talepCard(s, () => 0);
  assert.ok(d && d.id !== c.id, "kullanılan talep yeniden gelmez");
  // çekilişte de gelir
  let n = 0;
  for (let i = 0; i < 200; i++) {
    const t = X.newGame();
    t.month = 30;
    t.m.e = 90;
    X.tavanHal(t, []);
    const c = X.draw(t, rng(i));
    if (X.TALEP.e.some(x => x.id === c.id)) n++;
  }
  assert.ok(n > 40 && n < 120, `200 çekilişte ${n} talep`);
});

test("kıyak dosyası: üç kez boyun eğince açılır; sahip çıkmak kazanılmış son, kapatmak kurtarır", async () => {
  const X = await load(),
    r = rng(4);
  const s = X.newGame();
  s.m.e = 90;
  for (const c of X.TALEP.e.slice(0, 3)) {
    s.cur = X.materialize(c, s, () => 0.9);
    const side = s.cur.L.inc === "boyun_e" ? "L" : "R";
    X.choose(s, side, r);
  }
  assert.equal(s.cnt.boyun_e, 3);
  s.month += 3;
  const k1 = X.due(s);
  assert.equal(k1?.id, "kayirma_1", "üçüncü boyun eğişten sonra dosya gelir");
  // kapatmak: son yok; sıradaki öbür dosya kayıtları da düşer (dosya bir kez gelir)
  const t = structuredClone(s);
  t.cur = X.materialize(k1, t, () => 0.9);
  X.choose(t, "L", r);
  assert.ok(t.flags.kayirma_kapandi);
  assert.equal(t.pending, null);
  assert.ok(
    !t.queue.some(q => q.id === "kayirma_1" && t.month >= q.at) || X.due(t)?.id !== "kayirma_1",
    "dosya bir kez gelir",
  );
  // sahip çıkmak: müfettiş raporu, orada da sahip çıkmak ceza sonu
  s.cur = X.materialize(k1, s, () => 0.9);
  X.choose(s, "R", r);
  s.month += 5;
  const k2 = X.due(s);
  assert.equal(k2?.id, "kayirma_2");
  s.cur = X.materialize(k2, s, () => 0.9);
  X.choose(s, "R", r);
  assert.deepEqual(s.pending, { type: "ending", key: "kayirma" });
  assert.equal(X.ENDINGS.kayirma.tur, "ceza");
});

test("dip krizi: gösterge 10'un altındaysa kurtarıcı evrak kesin gelir, bekleme yarım", async () => {
  const X = await load();
  for (let i = 0; i < 30; i++) {
    const s = X.newGame();
    s.month = 30;
    s.m.k = 8;
    s.last.kriz_k0 = 30 - X.TUNE.crisisCd / 2;
    assert.equal(X.draw(s, rng(i)).id, "kriz_k0");
  }
});

test("içerik: talepler sığar, eski tavan sonları yalnız duvar için", async () => {
  const X = await load();
  for (const havuz of Object.values(X.TALEP))
    for (const c of havuz) {
      assert.ok(c.text.length <= 240, `${c.id} metni uzun`);
      for (const o of [c.L, c.R]) assert.ok(o.t.length <= 26, `${c.id}: ${o.t}`);
    }
  for (const k of ["k100", "e100"]) assert.ok(X.ENDINGS[k].legacy, `${k} eski son olmalı`);
  assert.ok(!X.CRISES.e100 && !X.CRISES.a100 && !X.CRISES.k100, "tavan krizi kalmadı");
});
