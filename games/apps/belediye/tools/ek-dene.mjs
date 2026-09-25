// İçerik denemesi: bir ek dosyasını (yeni evraklar, sonlar, miras, etkileşim, yan etkiler) oyuna takıp
// içerik denetimini ve kısa bir simülasyonu çalıştırır. Oyunun kaynağına dokunmaz.
// node tools/ek-dene.mjs <ek.mjs> [oyun sayısı]
// Ek dosyası şunları dışa verebilir (hepsi isteğe bağlı):
//   CARDS: CardDef[] · SYN: SynRule[] · ENDINGS: {anahtar: Ending} · MIRAS: MirasDef[] · FACTS: lint.mjs'teki biçimde
//   YAN_EK: {karar id: YanDef[]} (mevcut kararlara yan etki) · ALT_EK: {kart id: alt[]} (mevcut kartlara hatırlama metni)
//   FACTS_OK: {olayın adı (FACTS.ad): [kart id]} (mevcut bir olayı kendi zincirinde anan yeni kartlar)
//   VAATLER: VaatDef[] (seçim beyannamesine yeni vaatler). Ek vaat getirirse simülasyondaki her oyun sandığa üç
//   rastgele vaatle gider (açılış seçimi), yoksa oyunlar eskisi gibi 50'de başlar.
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { motor } from "./lib/sayfa.mjs";
import { FACTS, lintContent } from "./lint.mjs";

const file = process.argv[2];
if (!file) throw new Error("kullanım: node tools/ek-dene.mjs <ek.mjs> [oyun sayısı]");
const N = Number(process.argv[3] || 600);
const E = await motor();
const X = await import(pathToFileURL(resolve(file)).href);

// ── eki tak
const yeni = new Set((X.CARDS || []).map(c => c.id));
E.CARDS.push(...(X.CARDS || []));
for (const c of X.CARDS || []) E.CARD[c.id] = c;
E.SYN.push(...(X.SYN || []));
Object.assign(E.ENDINGS, X.ENDINGS || {});
E.MIRAS.push(...(X.MIRAS || []));
E.VAATLER.push(...(X.VAATLER || []));
for (const v of X.VAATLER || []) E.VAAT[v.id] = v;
FACTS.push(...(X.FACTS || []));
for (const [ad, ids] of Object.entries(X.FACTS_OK || {})) {
  const f = FACTS.find(f => f.ad === ad);
  if (!f) console.log("HATA: FACTS_OK'te olmayan olay", ad);
  else f.ok.push(...ids);
}
for (const [id, alt] of Object.entries(X.ALT_EK || {})) {
  const c = E.CARD[id];
  if (!c) console.log("HATA: ALT_EK'te olmayan kart", id);
  else c.alt = [...alt, ...(c.alt || [])];
}
for (const [pid, yan] of Object.entries(X.YAN_EK || {})) {
  const ps = E.CARDS.flatMap(c => [c.L, c.R])
    .map(o => o.pol)
    .filter(p => p?.id === pid);
  if (!ps.length) console.log("HATA: YAN_EK'te olmayan karar", pid);
  for (const p of ps) p.yan = [...(p.yan || []), ...yan];
}

// ── denetim
const lint = lintContent(E);
for (const m of lint.errors) console.log("HATA:", m);
for (const m of lint.warnings) console.log("uyarı:", m);
console.log(`denetim: ${lint.errors.length} hata, ${lint.warnings.length} uyarı\n`);

// ── ekin kendi dengesi: seçenek başına ortalama etki (eskilerle karşılaştırma)
const ort = cs => {
  const t = [0, 0, 0, 0];
  let n = 0;
  for (const c of cs)
    for (const o of [c.L, c.R]) {
      o.e.forEach((v, i) => (t[i] += v));
      n++;
    }
  return t.map(v => (n ? (v / n).toFixed(2) : "-")).join(" / ");
};
const eski = E.CARDS.filter(c => !yeni.has(c.id));
console.log(`seçenek başına ortalama [halk/kasa/esnaf/Ankara]  ek: ${ort(X.CARDS || [])}   eski: ${ort(eski)}`);

// ── kısa simülasyon: dikkatli ama arada canının istediğini seçen oyuncu (sim.mjs'teki "insan")
function mulberry(seed) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const bucket = v => (v === 0 ? 0 : Math.sign(v) * (Math.abs(v) >= 15 ? 17 : Math.abs(v) >= 8 ? 11 : 5));
const riskOf = (s, e) => Math.max(...E.METERS.map((k, i) => E.edgeRisk(k, s.m[k] + e[i])));
const insan = (s, rng) => {
  if (rng() < 0.3) return rng() < 0.5 ? "L" : "R";
  const sc = side => {
    const e = s.cur[side].e.map(bucket);
    return riskOf(s, e) - (s.month % 60 >= 45 ? e[0] * 0.5 : 0);
  };
  const a = sc("L"),
    b = sc("R");
  return a === b ? (rng() < 0.5 ? "L" : "R") : a < b ? "L" : "R";
};
const gor = {},
  taraf = {},
  sonlar = {},
  aylar = [];
let secim = 0,
  kazanc = 0,
  term1 = 0,
  defter = 0;
for (let g = 0; g < N; g++) {
  const rng = mulberry(g * 7919 + 13);
  let s;
  if (X.VAATLER?.length) {
    // her oyun sandığa gider: havuzdan üç rastgele söz (vaat evrakları sınansın)
    const vz = E.shuffle(
      E.VAATLER.map(v => v.id),
      rng,
    ).slice(0, E.VAAT_MAX);
    const { acilis, res } = E.acilisSecimi(vz, rng);
    s = E.newGame({ acilis, vaatler: vz, secim: res, rng });
  } else s = E.newGame();
  for (let guard = 0; !s.over && guard < 3000; guard++) {
    const c = E.draw(s, rng);
    if (yeni.has(c.id)) gor[c.id] = (gor[c.id] || 0) + 1;
    if (c.kind === "secim" && !c.early) {
      secim++;
      defter += E.defterOf(s);
    }
    if (c.kind === "sonuc") kazanc++;
    const c0 = s.cur,
      tek = c0.kind === "normal" && !!c0.L.son !== !!c0.R.son; // yay sonu: %30 merakla seçilir (sim.mjs gibi)
    const side = tek ? (rng() < 0.3 === !!c0.L.son ? "L" : "R") : insan(s, rng);
    if (yeni.has(c.id)) {
      const t = (taraf[c.id] ||= { L: 0, R: 0 });
      t[c.flip ? (side === "L" ? "R" : "L") : side]++;
    }
    E.choose(s, side, rng);
  }
  sonlar[s.over.key] = (sonlar[s.over.key] || 0) + 1;
  aylar.push(s.over.months);
  if (s.over.months >= 59) term1++;
}
aylar.sort((a, b) => a - b);
console.log(
  `\n${N} oyun ("insan"): medyan ${aylar[Math.floor(aylar.length / 2)]} ay · 1. dönem %${Math.round((100 * term1) / N)} · seçim %${secim ? Math.round((100 * kazanc) / secim) : 0} · seçimde ortalama defter ${secim ? (defter / secim).toFixed(2) : "-"}`,
);
console.log(
  "sonlar:",
  Object.entries(sonlar)
    .sort((a, b) => b[1] - a[1])
    .map(([k, v]) => `${k}${X.ENDINGS?.[k] ? "*" : ""}:%${((100 * v) / N).toFixed(1)}`)
    .join("  "),
);
console.log("\nek evrakları (oyun başına görülme · yazıldığı hâliyle sol/sağ seçilme):");
for (const c of X.CARDS || []) {
  const n = gor[c.id] || 0,
    t = taraf[c.id] || { L: 0, R: 0 },
    tt = t.L + t.R || 1;
  console.log(
    `  ${c.id.padEnd(22)} ${(n / N).toFixed(3).padStart(6)}   L %${String(Math.round((100 * t.L) / tt)).padStart(3)}  R %${String(Math.round((100 * t.R) / tt)).padStart(3)}${n ? "" : "   ← hiç çıkmadı"}`,
  );
}
