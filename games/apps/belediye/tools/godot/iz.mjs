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
const durum = s => structuredClone({
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
