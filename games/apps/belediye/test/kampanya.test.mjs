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

test("başlangıç: ezici > rahat > eski oyun > sessiz > kıl payı; mühürler, danışma, gölge ve itiraz", async () => {
  const E = await load();
  const ort = s => (s.m.h + s.m.k + s.m.e + s.m.a) / 4;
  const d = E.newGame(),
    se = E.newGame({ acilis: "sessiz" }),
    ez = E.newGame({ acilis: "ezici" }),
    z = E.newGame({ acilis: "zafer" }),
    k = E.newGame({ acilis: "kilpayi" });
  assert.deepEqual(d.m, { h: 50, k: 50, e: 50, a: 50 });
  assert.equal(d.pending, null, "açılışsız oyunda açılış evrakı yok");
  assert.ok(ort(ez) > ort(z) && ort(z) > ort(d) && ort(d) > ort(se) && ort(se) > ort(k));
  assert.ok(ez.m.h > z.m.h && z.m.h > se.m.h && se.m.h > k.m.h, "halk sırası");
  assert.equal(z.danis, 4, "zafer bir danışma hakkı fazla");
  assert.equal(k.rel.nermin, -1, "kıl payında Nermin kırgın");
  assert.deepEqual(
    [se, ez, z, k].map(s => s.cnt.muhur || 0),
    ["sessiz", "ezici", "zafer", "kilpayi"].map(a => E.ACILIS[a].muhur || 0),
    "mühürler",
  );
  assert.ok(ez.cnt.muhur > z.cnt.muhur && z.cnt.muhur > se.cnt.muhur && !k.cnt.muhur, "mühür sırası");
  for (const s of [se, ez, z])
    assert.equal(s.ongoing.find(o => o.id === "muhur")?.left, E.MUHUR.ay, "mühür hakkı süreli");
  assert.ok(
    k.ongoing.some(o => o.id === "golge") && k.queue.some(q => q.id === "itiraz_1"),
    "kıl payı: gölge ve itiraz",
  );
  assert.ok(
    se.defter.some(x => x.ad === E.TEMIZ),
    "sessiz: temiz sicil",
  );
  const h0 = E.ACILIS.zafer.m.h;
  z.m.h = 1;
  assert.equal(E.ACILIS.zafer.m.h, h0, "ayar nesnesi paylaşılmaz");
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

test("kazanma şansı: taban artı vaatlerin gücü, tavanlı; sandık anket oranında kazandırır, ezicisi de ayarda", async () => {
  const E = await load(),
    V = E.VAATLER.map(v => v.id);
  assert.equal(E.kampanyaSans([]), E.SANS.taban);
  assert.equal(E.kampanyaSans(V.slice(0, 1)), E.SANS.taban + E.VAAT[V[0]].guc);
  assert.ok(E.kampanyaSans(V) <= E.SANS.tavan);
  const vz = V.slice(0, 2),
    r = rng(11);
  for (const oy of [30, 55, 85]) {
    const say = { ezici: 0, zafer: 0, kilpayi: 0 },
      N = 3000;
    for (let i = 0; i < N; i++) {
      const { acilis, res } = E.acilisSecimi(vz, r, oy);
      say[acilis]++;
      assert.equal(res.winner, "you");
      assert.equal(res.cands[0].id, "you", "birinci siz");
      assert.equal(Math.round(res.cands.reduce((a, c) => a + c.pct, 0) * 10), 1000, "toplam yüzde yüz");
      assert.ok(
        res.cands.some(c => c.id === "nermin"),
        "rakip Nermin Hanım",
      );
      assert.ok(res.cands.length >= 2 && res.cands.length <= 5);
      const m = res.margin;
      assert.ok(
        acilis === "ezici"
          ? m >= E.SANDIK.ezici - 0.2
          : acilis === "zafer"
            ? m >= 2.8 && m < E.SANDIK.ezici + 0.2
            : m > 0 && m < 1,
        `fark ${m} (${acilis})`,
      );
      assert.ok(res.ilk && res.sans === oy && res.vaatler.length === vz.length);
      assert.equal(res.blocs.length, E.BLOKLAR.length);
    }
    const pz = (100 * (say.ezici + say.zafer)) / N,
      pe = (100 * say.ezici) / N,
      bekE = Math.max(0, oy - (E.SANDIK.ezici - 3) / E.SANDIK.egim);
    assert.ok(Math.abs(pz - oy) < 3, `anket %${oy}: zafer oranı %${pz.toFixed(1)}`);
    assert.ok(Math.abs(pe - bekE) < 3, `anket %${oy}: ezici %${pe.toFixed(1)}, beklenen %${bekE}`);
  }
  // anket verilmezse vaatlerden hesaplanır
  assert.equal(E.acilisSecimi(vz, r).res.sans, E.kampanyaSans(vz));
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
    for (const a of ["ezici", "zafer", "kilpayi"]) {
      const { res } = E.acilisSecimi(vz, r);
      res.margin = a === "kilpayi" ? 0.4 : 19.9;
      const s = E.newGame({ acilis: a, vaatler: vz, secim: res });
      const c = E.draw(s, r);
      assert.ok(c.text.length <= 240, `${a} ${vz}: ${c.text.length} harf`);
      assert.match(c.text, a === "kilpayi" ? /0,4 puan/ : /19,9 puan/);
      for (const o of [c.L, c.R]) assert.ok(o.t.length <= 26);
    }
});

test("hesap evrakı sözü kapatır: tutulsa da tutulmasa da açık söz sayacı bir düşer, sonuç defterde adıyla", async () => {
  const E = await load();
  for (const side of ["L", "R"]) {
    const v = E.VAATLER[0],
      s = E.newGame({ acilis: "zafer", vaatler: [v.id], rng: rng(1) });
    assert.equal(s.cnt.vaat, 1);
    const c = E.CARD[v.kart];
    s.cur = { ...c, kind: "normal", L: { ...c.L }, R: { ...c.R } };
    E.choose(s, side, rng(1));
    assert.equal(s.cnt.vaat, 0, `${side}: söz kapanmadı`);
    const k = c[side].anket;
    if (k)
      assert.ok(
        s.defter.some(x => x.ad === k.ad),
        `${side}: defterde "${k.ad}" yok`,
      );
  }
});

test("kampanya turu: dört aşama, ay geçmez; anket kesin ya da zarla oynar; sonra sandık, açılış ve sözler", async () => {
  const E = await load();
  for (let seed = 1; seed <= 40; seed++) {
    const r = rng(seed),
      vz = E.VAATLER.slice(seed % 5, (seed % 5) + (seed % 4)).map(v => v.id);
    const s = E.newGame({ kampanya: true, vaatler: vz, intro: true, rng: r });
    assert.equal(s.kampanya.oy, E.kampanyaSans(vz));
    assert.equal(s.acilis, undefined, "açılış tur bitmeden yok");
    const asama = [];
    let son;
    for (let i = 0; i < 4; i++) {
      const c = E.draw(s, r);
      assert.equal(c.kind, "kampanya");
      asama.push(E.KAMPANYA_KART[c.id].asama);
      const side = r() < 0.5 ? "L" : "R",
        o = c[side],
        oy0 = s.kampanya.oy;
      son = E.choose(s, side, r);
      assert.equal(s.month, 0, "kampanya ay geçirmez");
      const bek = (o.oy || 0) + (o.zar ? (son.zar.iyi ? o.zar.iyi.oy : o.zar.kotu.oy) : 0);
      assert.equal(son.oy, bek);
      assert.equal(s.kampanya.oy, Math.min(E.SANS.ust, Math.max(E.SANS.alt, oy0 + bek)));
      assert.equal(!!son.kampanyaBitti, i === 3);
    }
    assert.deepEqual(asama, [0, 1, 2, 3], "her aşamadan bir evrak, sırayla");
    const oy = s.kampanya.oy,
      { acilis, res } = E.kampanyaBitir(s, r);
    assert.equal(s.kampanya, undefined);
    assert.equal(res.sans, Math.round(oy));
    assert.equal(s.acilis, acilis);
    assert.equal(s.acilisSecim, res);
    assert.equal(s.cnt.muhur || 0, E.ACILIS[acilis].muhur || 0);
    assert.equal(s.cnt.vaat || 0, vz.slice(0, 3).length, "sözler deftere girdi");
    assert.equal(E.draw(s, r).kind, "acilis", "sandıktan sonra açılış evrakı");
    E.choose(s, "L", r);
    assert.equal(E.draw(s, r).kind, "intro", "sonra giriş evrakları");
  }
});

test("zar: oran tutar; iyi ve kötü uç kendi etkisini, haberini ve bayrağını getirir", async () => {
  const E = await load(),
    r = rng(7);
  const c = E.KAMPANYA.find(c => c.R.zar || c.L.zar),
    side = c.R.zar ? "R" : "L",
    z = c[side].zar;
  let iyi = 0;
  const N = 2000;
  for (let i = 0; i < N; i++) {
    const s = E.newGame({ kampanya: true });
    s.cur = { ...c, kind: "kampanya", L: { ...c.L, rel: {} }, R: { ...c.R, rel: {} } };
    const out = E.choose(s, side, r);
    if (out.zar.iyi) iyi++;
    assert.equal(out.zar.msg, out.zar.iyi ? z.iyi.msg : z.kotu.msg);
  }
  assert.ok(Math.abs(iyi / N - z.p) < 0.04, `iyi oranı ${iyi / N}, beklenen ${z.p}`);
  // sıradan evrakta zarın göstergeye etkisi (ölçekli) işler
  const s = E.newGame({ acilis: "kilpayi" }),
    it = E.CARD.itiraz_1;
  s.cur = E.materialize({ ...it, kind: "normal" }, s, r);
  s.cur.flip = false;
  s.cur.L = E.materialize(it, s, () => 0.9).L;
  s.cur.R = E.materialize(it, s, () => 0.9).R;
  const h0 = s.m.h,
    out = E.choose(s, s.cur.R.zar ? "R" : "L", () => 0.01); // zar tutar
  assert.ok(out.zar?.iyi && s.m.h > h0, "tutan zar halkı artırır");
});

test("mühür: en ağır kaybı (tavana kadar) siler, harcanır; kayıp yoksa ya da krizde harcanmaz; süresi dolunca söner", async () => {
  const E = await load(),
    r = rng(3);
  const kart = E.CARDS.find(c => !c.chain && !c.L.zar && !c.R.zar && !c.L.son && !c.R.son && !c.L.next && !c.R.next);
  const kur = (s, L, R, kind = "normal") => {
    s.cur = { ...E.materialize(kart, s, r), kind };
    s.cur.L = { ...s.cur.L, e: L, rel: {}, pol: undefined, anket: undefined };
    s.cur.R = { ...s.cur.R, e: R, rel: {}, pol: undefined, anket: undefined };
  };
  assert.deepEqual(E.muhurEtki([-3, -9, 0, 2]), { e: [-3, 0, 0, 2], i: 1, sil: 9 }, "en ağır kayıp kasa");
  assert.deepEqual(E.muhurEtki([-14, 0, 0, 0]).e, [-14 + E.MUHUR.tavan, 0, 0, 0], "tavan");
  assert.equal(E.muhurEtki([-5, -5, 0, 0]).i, 0, "eşitlikte halk");
  const s = E.newGame({ acilis: "ezici" }),
    k0 = s.m.k;
  kur(s, [-2, -9, 0, 0], [3, 2, 0, 0]);
  assert.ok(E.muhurOK(s));
  const out = E.choose(s, "L", r, { muhur: true });
  assert.deepEqual(out.muhur, { k: "k", v: 9 });
  assert.equal(out.d[1], 0, "kasa kaybı silindi");
  assert.equal(s.cnt.muhur, E.ACILIS.ezici.muhur - 1, "bir mühür harcandı");
  assert.ok(s.m.k >= k0 - 1 + out.td[1], "kasa korundu (ayın işleyeni hariç)");
  // kaybı olmayan seçenek: mühür harcanmaz
  const n = s.cnt.muhur;
  kur(s, [-2, -9, 0, 0], [3, 2, 0, 0]);
  assert.equal(E.choose(s, "R", r, { muhur: true }).muhur, undefined);
  assert.equal(s.cnt.muhur, n);
  // kriz evrakında basılmaz
  kur(s, [-8, 0, 0, 0], [0, -8, 0, 0], "kriz");
  assert.ok(!E.muhurOK(s));
  assert.equal(E.choose(s, "L", r, { muhur: true }).muhur, undefined);
  assert.equal(s.cnt.muhur, n);
  // son mühür harcanınca hak da yürürlükten kalkar
  s.cnt.muhur = 1;
  kur(s, [-8, 0, 0, 0], [0, 0, 0, 0]);
  E.choose(s, "L", r, { muhur: true });
  assert.equal(s.cnt.muhur, 0);
  assert.ok(!s.ongoing.some(o => o.id === "muhur"));
  // süre dolunca kalan mühürler söner
  const t = E.newGame({ acilis: "zafer" });
  for (let i = 0; i < E.MUHUR.ay; i++) E.tick(t, r);
  assert.equal(t.cnt.muhur, undefined, "mühürler söndü");
});

test("sessiz: temiz sicil ilk lekeyle gider; kıl payı: iki itiraz kapanınca gölge kalkar, iki mühür gelir", async () => {
  const E = await load(),
    r = rng(9);
  const s = E.newGame({ acilis: "sessiz" });
  const leke = E.CARDS.find(c => c.L.anket?.puan < 0 && !c.L.zar);
  s.cur = { ...leke, kind: "normal", L: { ...leke.L, rel: {} }, R: { ...leke.R, rel: {} } };
  const out = E.choose(s, "L", r);
  assert.ok(!s.defter.some(x => x.ad === E.TEMIZ), "temiz sicil gitti");
  assert.ok(
    out.events.some(e => e.ad === E.TEMIZ),
    "haberi çıktı",
  );
  for (const side of ["L", "R"]) {
    const k = E.newGame({ acilis: "kilpayi" });
    for (const id of ["itiraz_1", "itiraz_2"]) {
      const c = E.CARD[id];
      k.cur = { ...c, kind: "normal", L: { ...c.L, rel: {} }, R: { ...c.R, rel: {} } };
      E.choose(k, side, r);
    }
    assert.ok(!k.ongoing.some(o => o.id === "golge"), `${side}: gölge kalktı`);
    assert.equal(k.cnt.muhur, 2, `${side}: iki mühür`);
    assert.ok(k.flags.mazbata_tescil);
    assert.ok(
      k.queue.some(q => q.id === "itiraz_2"),
      "birinci dilekçe ikinciyi çağırır",
    );
  }
});
