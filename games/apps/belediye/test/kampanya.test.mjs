// Göreve başlayış: seçim beyannamesi (vaatler), sessiz kampanya ya da açılış seçimi, başlangıç göstergeleri
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

test("başlangıç: sessiz düşük, zafer yüksek, kıl payı sessizden de düşük; eski oyun (acilis yok) 50'de başlar", async () => {
  const E = await load();
  const ort = s => (s.m.h + s.m.k + s.m.e + s.m.a) / 4;
  const d = E.newGame(),
    se = E.newGame({ acilis: "sessiz" }),
    z = E.newGame({ acilis: "zafer" }),
    k = E.newGame({ acilis: "kilpayi" });
  assert.deepEqual(d.m, { h: 50, k: 50, e: 50, a: 50 });
  assert.equal(d.pending, null, "açılışsız oyunda açılış evrakı yok");
  assert.ok(ort(z) > ort(d) && ort(d) > ort(se) && ort(se) > ort(k));
  assert.ok(z.m.h > se.m.h && se.m.h > k.m.h, "halk sırası");
  assert.equal(z.danis, 4, "zafer bir danışma hakkı fazla");
  assert.equal(k.rel.nermin, -1, "kıl payında Nermin kırgın");
  z.m.h = 1;
  assert.equal(E.ACILIS.zafer.m.h, 62, "ayar nesnesi paylaşılmaz");
});

test("açılış evrakı önce gelir, ay geçirmez; ardından giriş evrakları", async () => {
  const E = await load(),
    r = rng(5),
    s = E.newGame({ acilis: "sessiz", intro: true });
  const c = E.draw(s, r);
  assert.equal(c.kind, "acilis");
  assert.ok(c.text.length <= 240);
  E.choose(s, "L", r);
  assert.equal(s.month, 0, "açılış evrakı ay geçirmez");
  assert.equal(s.signed, 0, "günlüğe girmez");
  assert.equal(E.draw(s, r).kind, "intro");
});

test("vaatler: sandığa gidenin sözleri sayaca, bayrağa ve takvime girer; sessiz kampanyada söz yok", async () => {
  const E = await load(),
    ids = E.VAATLER.slice(0, 2).map(v => v.id);
  const s = E.newGame({ acilis: "zafer", vaatler: ids, rng: rng(3) });
  assert.deepEqual(s.vaatler, ids);
  assert.equal(s.cnt.vaat, ids.length);
  for (const id of ids) {
    const v = E.VAAT[id],
      q = s.queue.find(q => q.id === v.kart);
    assert.ok(s.flags["vaat_" + id]);
    if (v.set) assert.ok(s.flags[v.set], `${id}: ${v.set} bayrağı konmadı`);
    assert.ok(q && q.at >= v.ay[0] && q.at <= v.ay[1], `${id}: hesap evrakı ${v.ay} arasında değil (${q?.at})`);
  }
  const p0 = E.pollOf(E.newGame({ acilis: "zafer" }));
  assert.ok(E.pollOf(s) < p0, "tutulmamış söz anketi düşürür");
  const se = E.newGame({ acilis: "sessiz", vaatler: ids });
  assert.equal(se.vaatler, undefined);
  assert.equal(se.queue.length, 0);
  const cok = E.newGame({ acilis: "zafer", vaatler: [...E.VAATLER.map(v => v.id), "yok_boyle"] });
  assert.ok(cok.vaatler.length <= E.VAAT_MAX, "en çok üç söz");
  assert.ok(
    cok.vaatler.every(id => E.VAAT[id]),
    "bilinmeyen söz alınmaz",
  );
});

test("kazanma şansı: taban artı vaatlerin gücü, tavanlı; açılış seçimi bu oranla rahat zafer ya da kıl payı verir", async () => {
  const E = await load(),
    V = E.VAATLER.map(v => v.id);
  assert.equal(E.kampanyaSans([]), E.KAMPANYA.taban);
  assert.equal(E.kampanyaSans(V.slice(0, 1)), E.KAMPANYA.taban + E.VAAT[V[0]].guc);
  assert.ok(E.kampanyaSans(V) <= E.KAMPANYA.tavan);
  const vz = V.slice(0, 2),
    sans = E.kampanyaSans(vz),
    r = rng(11);
  let zafer = 0;
  const N = 3000;
  for (let i = 0; i < N; i++) {
    const { acilis, res } = E.acilisSecimi(vz, r);
    if (acilis === "zafer") zafer++;
    assert.equal(res.winner, "you");
    assert.equal(res.cands[0].id, "you", "birinci siz");
    assert.equal(Math.round(res.cands.reduce((a, c) => a + c.pct, 0) * 10), 1000, "toplam yüzde yüz");
    assert.ok(
      res.cands.some(c => c.id === "nermin"),
      "rakip Nermin Hanım",
    );
    assert.ok(res.cands.length >= 2 && res.cands.length <= 5);
    assert.ok(
      acilis === "zafer" ? res.margin >= 7.5 : res.margin > 0 && res.margin < 1,
      `fark ${res.margin} (${acilis})`,
    );
    assert.ok(res.ilk && res.sans === sans && res.vaatler.length === vz.length);
    assert.equal(res.blocs.length, E.BLOKLAR.length);
  }
  assert.ok(
    Math.abs((100 * zafer) / N - sans) < 3,
    `zafer oranı %${((100 * zafer) / N).toFixed(1)}, beklenen %${sans}`,
  );
});

test("açılış evrakının metni her söz birleşiminde sığar ve farkı anar", async () => {
  const E = await load(),
    V = E.VAATLER.map(v => v.id),
    r = rng(2);
  const set = [[]];
  for (let i = 0; i < V.length; i++) {
    set.push([V[i]]);
    for (let j = i + 1; j < V.length; j++) {
      set.push([V[i], V[j]]);
      for (let k = j + 1; k < V.length; k++) set.push([V[i], V[j], V[k]]);
    }
  }
  for (const vz of set)
    for (const a of ["zafer", "kilpayi"]) {
      const { res } = E.acilisSecimi(vz, r);
      res.margin = a === "zafer" ? 19.9 : 0.4;
      const s = E.newGame({ acilis: a, vaatler: vz, secim: res });
      const c = E.draw(s, r);
      assert.ok(c.text.length <= 240, `${a} ${vz}: ${c.text.length} harf`);
      assert.match(c.text, a === "zafer" ? /19,9 puan/ : /0,4 puan/);
      for (const o of [c.L, c.R]) assert.ok(o.t.length <= 26);
    }
});
