// Motor izi: Godot'daki GDScript motoru aynı tohumla aynı izi üretmeli. node tools/godot/iz.mjs <çıkış klasörü>
// Motor rastgeleliği mulberry32(tohum) — her çağrı sayılır. Oyuncunun seçimi ayrı bir mulberry32(tohum + 1) akışından
// gelir ve "girdi" olarak yazılır; Godot tarafı seçimi kendisi üretmez, izden okur. JSONL: her satır bir adım.
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { motor } from "../lib/sayfa.mjs";
const OUT = process.argv[2];
mkdirSync(OUT, { recursive: true });
const E = await motor();
const mulberry32 = seed => () => {
  seed |= 0;
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
const durum = s =>
  structuredClone({
    month: s.month,
    term: s.term,
    m: s.m,
    flags: s.flags,
    cnt: s.cnt,
    rel: s.rel,
    used: Object.keys(s.used).length,
    queue: s.queue,
    ongoing: s.ongoing.map(o => ({ id: o.id, left: o.left, age: o.age })),
    pending: s.pending,
    defter: s.defter || [],
    danis: s.danis,
    signed: s.signed,
    cay: s.cay,
    over: s.over,
    kampanya: s.kampanya || null,
    electionTerm: s.electionTerm,
    acilis: s.acilis || null,
    lastYan: s.lastYan ?? null,
  });
function oyna(ad, tohum, kur, enCok = 400) {
  let n = 0;
  const r0 = mulberry32(tohum),
    rng = () => (n++, r0()),
    sec = mulberry32(tohum + 1);
  const s = kur(rng),
    satir = [{ adim: 0, girdi: { kurulum: ad, tohum }, rng_cagri_sayisi: n, durum: durum(s) }];
  for (let adim = 1; adim <= enCok && !s.over; adim++) {
    const c = E.draw(s, rng);
    const side = sec() < 0.5 ? "L" : "R",
      muhur = E.muhurOK(s) && Math.min(...c[side].e) <= -6;
    const out = E.choose(s, side, rng, { muhur });
    let bitir = null;
    if (out.kampanyaBitti) bitir = E.kampanyaBitir(s, rng).acilis;
    satir.push({
      adim,
      girdi: { side, muhur },
      kart: { id: c.id, kind: c.kind, flip: c.flip, text: c.text.slice(0, 40) },
      sonuc: {
        d: out.d,
        td: out.td,
        muhur: out.muhur || null,
        zar: out.zar || null,
        oy: out.oy ?? null,
        dead: out.dead || null,
        kampanyaBitir: bitir,
      },
      rng_cagri_sayisi: n,
      durum: durum(s),
    });
  }
  writeFileSync(join(OUT, ad + ".jsonl"), satir.map(x => JSON.stringify(x)).join("\n") + "\n");
  console.log(ad, satir.length - 1, "adım", s.over ? "son: " + s.over.key : "sürüyor", "rng", n);
}
oyna("eski-1", 1001, () => E.newGame());
oyna("kampanya-1", 2002, rng => E.newGame({ kampanya: true, vaatler: ["metro", "cay"], rng }));
oyna("kilpayi-1", 3003, rng => E.newGame({ acilis: "kilpayi", vaatler: ["cukur"], rng }));
oyna("ezici-1", 4004, rng => E.newGame({ acilis: "ezici", rng }));

// ── Geniş izler (tests/vectors/genis/): nadir dalları da geçmek için ikinci seçici. Göstergeleri 50'ye
// yaklaştıran tarafı %80 seçer (önizleme rng harcamaz; seçim yine ayrı akıştan). durum her 10 adımda bir ve
// son adımda yazılır; rng_cagri_sayisi ve sonuc her satırda. _kapsam.json: hangi daldan kaç kez geçildi.
const GENIS = join(OUT, "genis");
mkdirSync(GENIS, { recursive: true });
const yanKart = new Set(),
  gorulen = new Set();
(function topla(x) {
  if (!x || typeof x !== "object" || gorulen.has(x)) return;
  gorulen.add(x);
  if (Array.isArray(x.yan)) for (const y of x.yan) if (y?.card) yanKart.add(y.card);
  for (const v of Object.values(x)) topla(v);
})(Object.fromEntries(Object.entries(E).filter(([, v]) => typeof v === "object")));
const talepKart = new Set(Object.values(E.TALEP).flatMap(a => a.map(c => c.id)));
const tavanPol = Object.fromEntries(Object.entries(E.TAVAN).map(([k, t]) => [t.pol.id, k]));
const kapsam = { oyun: 0, adim: 0, kind: {}, son: {}, en_cok_donem: {}, dal: {}, secici: {} };
const say = (o, k, n = 1) => (o[k] = (o[k] || 0) + n);
const uzak = m => Object.values(m).reduce((t, v) => t + Math.abs(Math.max(0, Math.min(100, v)) - 50), 0);
// due() ile aynı yürüyüş, kuyruğun kopyası üzerinde: kart zincirden gelirse hangi dal
function zincirDal(s) {
  const q = [...s.queue];
  for (;;) {
    const i = q.findIndex(x => x.at <= s.month);
    if (i < 0) return null;
    const x = q.splice(i, 1)[0],
      ok = !x.if || E.condOK(s, x.if),
      id = ok ? x.id : x.else;
    if (id && E.CARD[id]) return { id, dal: x.if ? (ok ? "zincir_if" : "zincir_else") : null };
  }
}
// Seçiciler: oyuncunun yerine karar verir, motor rng'sine dokunmaz. ileri: seçimi durumun kopyasında
// atılık bir rng ile dener (sonraki hâle göre puanlamak için); asıl akış etkilenmez.
const ileri = (s, side) => {
  const k = structuredClone(s);
  E.choose(k, side, mulberry32(7), {});
  return k;
};
const denge = (s, c) =>
  ["L", "R"]
    .map(k => {
      const p = E.onizle(s, c[k]);
      return {
        k,
        puan:
          (p.olum ? 1e6 : 0) + uzak(Object.fromEntries(Object.entries(s.m).map(([m, v], i) => [m, v + (p.d[i] || 0)]))),
      };
    })
    .sort((a, b) => a.puan - b.puan)[0].k;
const hedefli =
  (puan, olumOK = false) =>
  (s, c) => {
    const [a, b] = ["L", "R"].map(k => {
      const p = E.onizle(s, c[k]);
      if (p.olum && !olumOK) return -1e6;
      const n = ileri(s, k);
      return puan(n) - uzak(n.m) / 10;
    });
    return a === b ? denge(s, c) : a > b ? "L" : "R";
  };
const SECICI = {
  denge80: [denge, 0.8],
  uzun: [denge, 0.95],
  ankara: [hedefli(n => n.m.a + 25 * (n.cnt.boyun_a || 0) + (n.davetTerm === n.term ? 500 : 0)), 0.9],
  // Tekir sayacı 3'e varınca ölümü arar: kurtarış dalı için
  tekir: [
    hedefli(
      n =>
        60 * Math.min(3, n.cnt.tekir || 0) +
        10 * (n.rel.tekir || 0) +
        (n.pending?.type === "tekir" ? 1e5 : 0) -
        (n.over ? 1e5 : 0),
      true,
    ),
    0.9,
  ],
  // seçim kazanmak için halkı yüksek tutar: 3-4. dönem
  halk: [hedefli(n => 4 * E.pollOf(n) - 40 * Object.values(n.m).filter(v => v < 20 || v > 85).length), 0.95],
  kalabalik: [hedefli(n => 15 * n.ongoing.length), 0.9],
};
function genis(ad, tohum, kur, secAd, enCok = 600) {
  const [secici, oran] = SECICI[secAd];
  let n = 0;
  const r0 = mulberry32(tohum),
    rng = () => (n++, r0()),
    sec = mulberry32(tohum + 1);
  const s = kur(rng),
    satir = [{ adim: 0, girdi: { kurulum: ad, tohum, secici: secAd, oran }, rng_cagri_sayisi: n, durum: durum(s) }];
  let adim = 0;
  for (adim = 1; adim <= enCok && !s.over; adim++) {
    const zd = zincirDal(s),
      once = {
        term: s.term,
        cnt: { ...s.cnt },
        defter: (s.defter || []).length,
        hal: s.ongoing.filter(o => o.hal).map(o => o.id),
      };
    const c = E.draw(s, rng);
    say(kapsam.kind, c.kind || "kart");
    if (zd?.dal && zd.id === c.id) say(kapsam.dal, zd.dal);
    if (talepKart.has(c.id)) say(kapsam.dal, "talep");
    if (yanKart.has(c.id)) say(kapsam.dal, "yan_etki");
    const iyi = secici(s, c);
    const side = sec() < oran ? iyi : iyi === "L" ? "R" : "L",
      muhur = E.muhurOK(s) && Math.min(...c[side].e) <= -6;
    const out = E.choose(s, side, rng, { muhur });
    let bitir = null;
    if (out.kampanyaBitti) bitir = E.kampanyaBitir(s, rng).acilis;
    if (out.muhur) say(kapsam.dal, "muhur");
    if (out.zar) say(kapsam.dal, out.zar.iyi ? "zar_iyi" : "zar_kotu");
    if (c.kind === "tekir") say(kapsam.dal, "tekir_kurtarisi");
    if (c.kind === "davet") say(kapsam.dal, side === "L" ? "davet_L" : "davet_R");
    if (s.term > once.term) {
      say(kapsam.dal, "secim_kazanildi");
      if (once.cnt.vaat > 1 || once.cnt.skandal > 1 || once.defter) say(kapsam.dal, "sonuc_yarilama");
    }
    for (const ev of out.events || []) {
      if (ev.syn) say(kapsam.dal, "syn");
      if (ev.msg.startsWith("Yeni karara yer açmak")) say(kapsam.dal, "max_ongoing_tasma");
    }
    const hal = s.ongoing.filter(o => o.hal).map(o => o.id);
    for (const id of hal) if (!once.hal.includes(id)) say(kapsam.dal, "tavan_gir_" + tavanPol[id]);
    for (const id of once.hal) if (!hal.includes(id)) say(kapsam.dal, "tavan_cik_" + tavanPol[id]);
    const yaz = adim % 10 === 0 || s.over;
    satir.push({
      adim,
      girdi: { side, muhur },
      kart: { id: c.id, kind: c.kind, flip: c.flip, text: c.text.slice(0, 40) },
      sonuc: {
        d: out.d,
        td: out.td,
        muhur: out.muhur || null,
        zar: out.zar || null,
        oy: out.oy ?? null,
        dead: out.dead || null,
        kampanyaBitir: bitir,
      },
      rng_cagri_sayisi: n,
      ...(yaz ? { durum: durum(s) } : {}),
    });
  }
  kapsam.oyun++;
  kapsam.adim += adim - 1;
  say(kapsam.son, s.over ? s.over.key : "surdu");
  say((kapsam.secici[secAd] ||= {}), s.over ? s.over.key : "surdu");
  say(kapsam.en_cok_donem, String(s.term));
  writeFileSync(join(GENIS, ad + ".jsonl"), satir.map(x => JSON.stringify(x)).join("\n") + "\n");
}
const KUR = {
  eski: () => E.newGame(),
  kampanya: rng => E.newGame({ kampanya: true, vaatler: ["metro", "cay"], rng }),
  kilpayi: rng => E.newGame({ acilis: "kilpayi", vaatler: ["cukur"], rng }),
  ezici: rng => E.newGame({ acilis: "ezici", rng }),
};
// her kurulum: denge80 ile 50 tohum, diğer seçicilerle 10'ar tohum
Object.entries(KUR).forEach(([ad, kur], j) =>
  Object.keys(SECICI).forEach((sc, k) => {
    for (let i = 1; i <= (sc === "denge80" ? 50 : 10); i++)
      genis(`${ad}-${sc}-${String(i).padStart(2, "0")}`, 10000 * (j + 1) + 1000 * k + i, kur, sc);
  }),
);
writeFileSync(join(GENIS, "_kapsam.json"), JSON.stringify(kapsam, null, 1));
console.log("geniş:", kapsam.oyun, "oyun", kapsam.adim, "adım");
