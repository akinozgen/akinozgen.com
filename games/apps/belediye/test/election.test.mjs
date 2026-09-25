// Çok adaylı seçim: aday listesi, oy sayımı, seçmen grubu dökümü, sonuç kartları
import { test } from "vitest";
import assert from "node:assert/strict";
import { yukle } from "./yukle.mjs";

const load = () => yukle("cards", "engine");
const rng = seed => () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
const E = await load();
const Z = () => [0, 0, 0, 0];
const randomState = r => {
  const s = E.newGame();
  for (const k of ["h", "k", "e", "a"]) s.m[k] = 10 + Math.floor(r() * 81);
  for (const w of Object.keys(E.ADAYLAR)) if (w !== "tekir" && r() < 0.4) s.rel[w] = Math.floor(r() * 7) - 3;
  if (r() < 0.2) s.cnt.tekir = 3;
  return s;
};

test("oy sayımı: 2-5 aday, toplam %100, kazanan en çok oyu alan", async () => {
  const counts = new Set();
  for (let g = 0; g < 3000; g++) {
    const r = rng(g), s = randomState(r), t = E.tally(s, r);
    counts.add(t.cands.length);
    assert.ok(t.cands.length >= 2 && t.cands.length <= 5, `aday sayısı ${t.cands.length}`);
    const sum = Math.round(t.cands.reduce((a, c) => a + c.pct, 0) * 10) / 10;
    assert.equal(sum, 100, `toplam ${sum}`);
    assert.equal(t.winner, t.cands[0].id);
    assert.ok(t.cands.every(c => c.pct <= t.cands[0].pct));
    assert.equal(t.win, t.winner === "you");
    assert.equal(new Set(t.cands.map(c => c.id)).size, t.cands.length, "aynı aday iki kez");
  }
  assert.deepEqual([...counts].sort(), [2, 3, 4, 5], "her aday sayısı görülmeli");
});

test("dost olan aday olmaz; ana rakip her zaman vardır", async () => {
  for (let g = 0; g < 1500; g++) {
    const r = rng(g + 9000), s = randomState(r), f = E.drawField(s, r);
    for (const id of [f.main, ...f.extras]) assert.ok((s.rel[id] || 0) < 2, `${id} dost ama aday oldu`);
    assert.ok(E.ADAYLAR[f.main].ana, "ana rakip ana adaylardan olmalı");
  }
});

test("çoğunluk: yüzde ellinin altında da kazanılır, üstünde de kaybedilebilir", async () => {
  let underWin = 0, overLoss = 0;
  for (let g = 0; g < 4000; g++) {
    const r = rng(g + 20000), s = randomState(r), t = E.tally(s, r);
    if (t.win && t.you < 50) underWin++;
    if (!t.win && t.cands.length === 2 && t.you > 50) overLoss++;
  }
  assert.ok(underWin > 50, `%50 altı kazanma: ${underWin}`);
  assert.equal(overLoss, 0, "iki adaylı yarışta %50 üstü kaybedilmez");
});

test("Tekir nadiren aday olur, mama verilmişse daha sık", async () => {
  const rate = fed => { let n = 0; for (let g = 0; g < 4000; g++) { const r = rng(g + (fed ? 50000 : 40000)), s = E.newGame(); if (fed) s.cnt.tekir = 3; const f = E.drawField(s, r); if (f.extras.includes("tekir")) n++; } return n / 4000; };
  const a = rate(false), b = rate(true);
  assert.ok(a > 0.01 && a < 0.1, `mamasız ${a}`);
  assert.ok(b > a * 2, `mamalı ${b} mamasız ${a}`);
});

test("seçmen grubu dökümü: her grup %100 eder, ağırlıklı toplam adayların oyunu tutturur", async () => {
  for (let g = 0; g < 500; g++) {
    const r = rng(g + 60000), s = randomState(r), t = E.tally(s, r);
    for (const b of t.blocs) assert.ok(Math.abs(b.pay.reduce((a, v) => a + v, 0) - 100) < 0.6, `${b.ad} toplamı`);
    t.cands.forEach((c, i) => {
      const agg = t.blocs.reduce((a, b) => a + b.w * b.pay[i], 0);
      assert.ok(Math.abs(agg - c.pct) < 1.2, `${c.id}: döküm ${agg.toFixed(1)} ≠ oy ${c.pct}`);
    });
  }
});

test("seçim ve aday kartlarının metni evraka sığar (en kalabalık hâlde de)", async () => {
  let worst = 0;
  for (let g = 0; g < 2000; g++) {
    const r = rng(g + 70000), s = randomState(r);
    s.rel.muhtar = 3; s.rel.bekir = -3; s.rel.nermin = -3; s.cnt.tekir = 4;
    worst = Math.max(worst, E.fieldCard(s, r).text.length, E.electionCard(s, r).text.length);
  }
  assert.ok(worst <= 240, `en uzun metin ${worst}`);
});

test("sonuç kartları: Tekir kazanırsa özel son, kaybedince kazananın adı, %50 altı zafer", async () => {
  const s = E.newGame();
  const res = (cands, win) => ({ cands, blocs: [], winner: cands[0].id, win, you: cands.find(c => c.id === "you").pct, margin: cands[0].pct - cands[1].pct });
  const r1 = res([{ id: "tekir", pct: 41 }, { id: "you", pct: 35 }, { id: "nermin", pct: 24 }], false);
  assert.equal(E.special({ type: "sonuc", oy: "35", win: false, res: r1 }, s).key, "tekir");
  const r2 = res([{ id: "bekir", pct: 44 }, { id: "you", pct: 38 }, { id: "nermin", pct: 18 }], false);
  assert.match(E.special({ type: "sonuc", oy: "38", win: false, res: r2 }, s).text, /Hacı Bekir %44 ile birinci/);
  const r3 = res([{ id: "you", pct: 43 }, { id: "nermin", pct: 40 }, { id: "burak", pct: 17 }], true);
  const c3 = E.special({ type: "sonuc", oy: "43", win: true, res: r3 }, s);
  assert.equal(c3.kind, "sonuc"); assert.match(c3.text, /3 adaylı/); assert.match(c3.text, /birinci birincidir/);
  // eski kayıt: sonuç ayrıntısı yok
  assert.equal(E.special({ type: "sonuc", oy: "47", win: false }, s).key, "sandik");
});

test("akış: her dönem seçimden önce adaylar ilan edilir, seçimde aynı liste yarışır", async () => {
  for (let g = 0; g < 60; g++) {
    const r = rng(g + 80000), s = E.newGame();
    let announced = null, checked = 0;
    for (let i = 0; i < 400 && !s.over; i++) {
      const c = E.draw(s, r);
      if (c.kind === "adaylar") { announced = { term: s.term, field: JSON.stringify(s.field) }; assert.ok(s.month % E.TERM >= E.TERM - 10); }
      if (c.kind === "secim") {
        assert.ok(announced && announced.term === s.term, "seçimden önce ilan yok");
        assert.equal(JSON.stringify(s.field), announced.field, "liste değişmiş");
        checked++;
      }
      // hayatta kalsın diye göstergeleri ortada tut
      E.choose(s, r() < 0.5 ? "L" : "R", r);
      for (const k of ["h", "k", "e", "a"]) s.m[k] = 50;
    }
    assert.ok(checked >= 1);
  }
});

test("erken seçim: esnaf tavan yapınca oyun bitmez, Hacı Bekir'li erken seçim gelir, döngüye girmez", async () => {
  const X = await load(), r = rng(99), s = X.newGame();
  s.month = 20; s.m.e = 98;
  s.cur = { id: "t", kind: "normal", who: "bekir", konu: "t", L: { t: "a", e: [0, 0, 5, 0], rel: {} }, R: { t: "b", e: Z(), rel: {} } };
  X.choose(s, "L", r);
  assert.equal(s.over, null); assert.equal(s.pending?.type, "erken");
  const c = X.draw(s, r);
  assert.equal(c.kind, "secim"); assert.ok(c.early); assert.match(c.text, /erken seçim/);
  assert.ok([s.earlyField.main, ...s.earlyField.extras].includes("bekir"), "Hacı Bekir aday değil");
  const term = s.term, eTerm = s.electionTerm;
  X.choose(s, "L", r);
  assert.equal(s.pending?.type, "sonuc", "esnaf hâlâ 100'de diye yeniden erken seçime dönmemeli");
  assert.ok(s.pending.early);
  assert.equal(s.electionTerm, eTerm, "erken seçim normal seçimi yerinden oynatmamalı");
  assert.equal(s.term, term);
});

test("erken seçim sonucu: kazanınca esnaf iner ve dönem sürer; Bekir'e kaybedince okey masası sonu", async () => {
  const X = await load(), s = X.newGame(); s.m.e = 100;
  const res = (cands, win) => ({ cands, blocs: [], winner: cands[0].id, win, you: cands.find(c => c.id === "you").pct, margin: cands[0].pct - cands[1].pct, early: true });
  const won = X.special({ type: "sonuc", oy: "41", win: true, early: true, res: res([{ id: "you", pct: 41 }, { id: "bekir", pct: 35 }, { id: "nermin", pct: 24 }], true) }, s);
  assert.equal(won.kind, "erkensonuc");
  s.cur = { ...won, L: { ...won.L, rel: {} }, R: { ...won.R, rel: {} } };
  const term = s.term; X.choose(s, "L", rng(3));
  assert.ok(s.m.e <= 70, `esnaf ${s.m.e}`); assert.equal(s.term, term); assert.equal(s.over, null);
  const lostB = X.special({ type: "sonuc", oy: "30", win: false, early: true, res: res([{ id: "bekir", pct: 40 }, { id: "you", pct: 30 }, { id: "nermin", pct: 30 }], false) }, s);
  assert.equal(lostB.key, "e100");
  const lostN = X.special({ type: "sonuc", oy: "30", win: false, early: true, res: res([{ id: "nermin", pct: 40 }, { id: "you", pct: 30 }, { id: "bekir", pct: 30 }], false) }, s);
  assert.equal(lostN.key, "sandik");
});

test("erken seçimde Hacı Bekir güçlüdür", async () => {
  const X = await load(); let sum = 0, n = 0;
  for (let g = 0; g < 300; g++) {
    const r = rng(g + 90000), s = X.newGame(); s.m.e = 100; s.pending = { type: "erken" };
    X.draw(s, r); const t = X.tally(s, r, true);
    sum += t.cands.find(c => c.id === "bekir").pct; n++;
  }
  assert.ok(sum / n > 20, `Bekir ortalaması %${(sum / n).toFixed(1)}`);
});
