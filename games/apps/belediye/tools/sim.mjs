// Denge simülasyonu: motoru binlerce kez farklı oyuncu tipleriyle oynatır.
// node tools/sim.mjs [oyunSayısı] [ayar=değer ...]
import { readFileSync } from "node:fs";
import { lintContent } from "./lint.mjs";

const src = ["cards.js", "engine.js"].map(f => readFileSync(new URL("../src/" + f, import.meta.url), "utf8")).join("\n");
const E = new Function(src + "\nreturn { CARDS, CARD, CRISES, ENDINGS, INTRO, PEOPLE, SYN, newGame, draw, choose, METERS, pollOf, TERM, TUNE, edgeRisk };")();
// node sim.mjs 2000 damp=0.9 scale=1.1 → ayar düğmelerini geçici değiştir
for (const a of process.argv.slice(3)) { const [k, v] = a.split("="); if (k in E.TUNE) E.TUNE[k] = Number(v); }
console.log("TUNE", JSON.stringify(E.TUNE));

function mulberry(seed) {
  return () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}

// ── Tutarlılık kontrolleri (tools/lint.mjs; test/content.test.mjs de aynısını çalıştırır)
const lint = lintContent(E);
for (const m of lint.errors) console.log("HATA:", m);
for (const m of lint.warnings) console.log("uyarı:", m);

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
const medians = {}, sideTally = {};
for (const [name, pol] of Object.entries(policies)) {
  const months = [], ends = {}, seen = {}, tally = (sideTally[name] = {});
  const field = {}; let earlyE = 0, earlyW = 0, under50 = 0, tekirRan = 0, tekirWon = 0, rivalWins = {};
  let term1 = 0, elections = 0, wins = 0, crises = 0, pols = 0, relHi = 0, relLo = 0, tekirSave = 0, dropped = 0, syn = 0, vaatAtElection = 0;
  for (let g = 0; g < N; g++) {
    const rng = mulberry(g * 7919 + 13);
    const s = E.newGame();
    let guard = 0;
    while (!s.over && guard++ < 3000) {
      const c = E.draw(s, rng);
      seen[c.id] = (seen[c.id] || 0) + 1;
      if (c.kind === "kriz") crises++;
      if (c.kind === "tekir") tekirSave++;
      if (c.kind === "sonuc") wins++;
      if (c.kind === "secim" && c.early) earlyE++;
      else if (c.kind === "secim") { elections++; vaatAtElection += s.cnt.vaat || 0; }
      if (c.kind === "erkensonuc") earlyW++;
      const side = pol(s, rng);
      // kartın yazıldığı taraf (masada yarı yarıya ters çevrilir): baskın seçenek ölçümü için
      if (c.kind === "normal") { const t = (tally[c.id] ||= { L: 0, R: 0 }); t[c.flip ? (side === "L" ? "R" : "L") : side]++; }
      const res = E.choose(s, side, rng);
      if (c.kind === "secim" && s.lastElection) {
        const r = s.lastElection, n = r.cands.length;
        field[n] = (field[n] || 0) + 1;
        if (r.win && r.you < 50) under50++;
        if (r.cands.some(x => x.id === "tekir")) { tekirRan++; if (r.winner === "tekir") tekirWon++; }
        if (!r.win) rivalWins[r.winner] = (rivalWins[r.winner] || 0) + 1;
      }
      for (const ev of res.events || []) { if (ev.syn) syn++; if (/yer açmak/.test(ev.msg)) dropped++; }
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
  console.log(`oyun başına etkileşim: ${(syn / N).toFixed(2)}   yer açmak için kalkan karar: ${(dropped / N).toFixed(2)}   seçimde ortalama vaat: ${elections ? (vaatAtElection / elections).toFixed(1) : "-"}   en çok yürürlükte: ${pols}`);
  const fn = Object.values(field).reduce((a, b) => a + b, 0) || 1;
  console.log(`seçim: aday sayısı ${Object.entries(field).sort().map(([k, v]) => `${k}:%${Math.round(100 * v / fn)}`).join(" ")}   %50 altı zafer: %${wins ? Math.round(100 * under50 / wins) : 0}   Tekir aday: %${(100 * tekirRan / fn).toFixed(1)} (kazandı ${tekirWon})   erken seçim: ${(earlyE / N).toFixed(2)}/oyun (kazanma %${earlyE ? Math.round(100 * earlyW / earlyE) : "-"})   kaybettiren: ${Object.entries(rivalWins).sort((a, b) => b[1] - a[1]).slice(0, 4).map(([k, v]) => k + ":" + v).join(" ")}`);
  medians[name] = q(months, .5);
  if (name === "gorerek") {
    const never = E.CARDS.filter(c => !seen[c.id]).map(c => c.id);
    console.log("hiç çıkmayan:", never.join(", ") || "-");
  }
}

// Beceri önemli mi: usta oyuncu dikkatli oyuncudan belirgin uzun yaşamalı
console.log(`\nusta/insan medyan oranı: ${(medians.usta / medians.insan).toFixed(2)}   usta/gorerek: ${(medians.usta / medians.gorerek).toFixed(2)}`);
// Baskın seçenek: usta oyuncunun hep aynı tarafı seçtiği kartlar (tasarımda bir taraf bariz üstün demek)
const dom = Object.entries(sideTally.usta || {}).map(([id, t]) => ({ id, n: t.L + t.R, p: t.L / (t.L + t.R) }))
  .filter(x => x.n >= 40 && (x.p >= 0.9 || x.p <= 0.1)).sort((a, b) => Math.abs(b.p - 0.5) - Math.abs(a.p - 0.5));
console.log(`baskın seçenekli kart (usta ≥%90 aynı taraf, ≥40 kez): ${dom.length}` + (dom.length ? "\n  " + dom.slice(0, 25).map(x => `${x.id}:${x.p >= 0.5 ? "L" : "R"}%${Math.round(100 * Math.max(x.p, 1 - x.p))}`).join("  ") : ""));
