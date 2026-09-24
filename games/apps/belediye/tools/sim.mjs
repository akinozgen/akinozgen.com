// Denge simülasyonu: motoru binlerce kez farklı oyuncu tipleriyle oynatır.
// node tools/sim.mjs [oyunSayısı] [ayar=değer ...]
import { readFileSync } from "node:fs";

const src = ["cards.js", "engine.js"].map(f => readFileSync(new URL("../src/" + f, import.meta.url), "utf8")).join("\n");
const E = new Function(src + "\nreturn { CARDS, CARD, CRISES, ENDINGS, PEOPLE, newGame, draw, choose, METERS, pollOf, TERM, TUNE, edgeRisk };")();
// node sim.mjs 2000 damp=0.9 scale=1.1 → ayar düğmelerini geçici değiştir
for (const a of process.argv.slice(3)) { const [k, v] = a.split("="); if (k in E.TUNE) E.TUNE[k] = Number(v); }
console.log("TUNE", JSON.stringify(E.TUNE));

function mulberry(seed) {
  return () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}

// ── Tutarlılık kontrolleri
const ids = new Set(E.CARDS.map(c => c.id));
const polIds = new Set();
for (const c of [...E.CARDS, ...Object.values(E.CRISES)]) {
  if (c.who && !E.PEOPLE[c.who]) console.log("YOK kişi:", c.id, c.who);
  for (const side of ["L", "R"]) {
    const o = c[side];
    if (!o || !o.t || !Array.isArray(o.e) || o.e.length !== 4) console.log("HATALI seçenek:", c.id, side);
    if (o.next && !ids.has(o.next[0])) console.log("YOK zincir:", c.id, "→", o.next[0]);
    if (o.pol?.doneCard && !ids.has(o.pol.doneCard)) console.log("YOK doneCard:", c.id, o.pol.doneCard);
    if (o.pol) polIds.add(o.pol.id);
    for (const w of Object.keys(o.rel || {})) if (!E.PEOPLE[w]) console.log("YOK rel kişi:", c.id, w);
    if (o.t.length > 26) console.log("UZUN etiket:", c.id, side, o.t.length, o.t);
  }
  if (c.text.length > 240) console.log("UZUN metin:", c.id, c.text.length);
}
for (const c of E.CARDS) if (c.reqPol && !polIds.has(c.reqPol)) console.log("YOK reqPol:", c.id, c.reqPol);
const chained = new Set(E.CARDS.flatMap(c => ["L", "R"].flatMap(s => [c[s].next?.[0], c[s].pol?.doneCard]).filter(Boolean)));
for (const c of E.CARDS) if (c.chain && !chained.has(c.id)) console.log("Yetim zincir kartı:", c.id);

// ── Oyuncu tipleri
const bucket = v => (v === 0 ? 0 : Math.sign(v) * (Math.abs(v) >= 15 ? 17 : Math.abs(v) >= 8 ? 11 : 5));
const riskOf = (s, e) => {
  let r = 0;
  E.METERS.forEach((k, i) => { r = Math.max(r, E.edgeRisk(k, s.m[k] + e[i])); });
  return r;
};
const policies = {
  rastgele: (s, rng) => (rng() < 0.5 ? "L" : "R"),
  hepSag: () => "R",
  hepSol: () => "L",
  // Ekranda gördüğünü kullanan oyuncu: yön + kaba büyüklük (1-3 ok), bazen canı ne isterse
  gorerek: (s, rng) => {
    if (rng() < 0.2) return rng() < 0.5 ? "L" : "R";
    const est = side => s.cur[side].e.map(bucket);
    const mt = s.month % 60;
    const score = side => {
      const e = est(side);
      let r = riskOf(s, e);
      if (mt >= 45) r -= e[0] * 0.5; // seçim yaklaşınca halkı kolla
      return r;
    };
    const a = score("L"), b = score("R");
    return a === b ? (rng() < 0.5 ? "L" : "R") : a < b ? "L" : "R";
  },
  // Daha dalgın, hikâyeye göre seçen oyuncu
  insan: (s, rng) => (rng() < 0.3 ? (rng() < 0.5 ? "L" : "R") : policies.gorerek(s, () => 1)),
  // Kesin sayıları bilen, seçimi de düşünen oyuncu
  usta: (s, rng) => {
    const mt = s.month % 60;
    const score = side => { const e = s.cur[side].e; let r = riskOf(s, e); if (mt >= 45) r -= e[0] * 0.6; return r; };
    const a = score("L"), b = score("R");
    return a === b ? (rng() < 0.5 ? "L" : "R") : a < b ? "L" : "R";
  },
};

const N = Number(process.argv[2] || 3000);
const q = (arr, p) => arr[Math.floor(p * (arr.length - 1))];
for (const [name, pol] of Object.entries(policies)) {
  const months = [], ends = {}, seen = {};
  let term1 = 0, elections = 0, wins = 0, crises = 0, pols = 0, relHi = 0, relLo = 0, tekirSave = 0;
  for (let g = 0; g < N; g++) {
    const rng = mulberry(g * 7919 + 13);
    const s = E.newGame();
    let guard = 0, wasElection = false;
    while (!s.over && guard++ < 3000) {
      const c = E.draw(s, rng);
      seen[c.id] = (seen[c.id] || 0) + 1;
      if (c.kind === "kriz") crises++;
      if (c.kind === "tekir") tekirSave++;
      if (c.kind === "sonuc") wins++;
      if (c.kind === "secim") elections++;
      E.choose(s, pol(s, rng), rng);
      pols = Math.max(pols, s.ongoing.length);
    }
    if (s.over.months >= 59) term1++;
    months.push(s.over.months);
    ends[s.over.key] = (ends[s.over.key] || 0) + 1;
    relHi += Object.values(s.rel).filter(v => v >= 2).length;
    relLo += Object.values(s.rel).filter(v => v <= -2).length;
  }
  months.sort((a, b) => a - b);
  console.log(`\n## ${name}`);
  console.log(`ay p10/medyan/p90: ${q(months, .1)} / ${q(months, .5)} / ${q(months, .9)}   1. dönemi bitiren: %${(100 * term1 / N).toFixed(0)}   seçim kazanma: %${elections ? (100 * wins / elections).toFixed(0) : "-"}`);
  console.log(`oyun başına kriz kartı: ${(crises / N).toFixed(2)}   Tekir kurtarışı: ${(tekirSave / N).toFixed(2)}   dost(≥2): ${(relHi / N).toFixed(1)}   dargın(≤-2): ${(relLo / N).toFixed(1)}`);
  console.log("sonlar:", Object.entries(ends).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k}:${(100 * v / N).toFixed(0)}%`).join("  "));
  if (name === "gorerek") {
    const never = E.CARDS.filter(c => !seen[c.id]).map(c => c.id);
    console.log("hiç çıkmayan:", never.join(", ") || "-");
  }
}
