// Denge simülasyonu: motoru binlerce kez farklı oyuncu tipleriyle oynatır.
// node tools/sim.mjs [oyunSayısı] [ayar=değer ...] [acilis=karisik|sessiz|ezici|zafer|kilpayi|kumar|eski] [kampanya=karisik|cesur|temkinli]
// acilis: göreve başlayış. kumar: her oyun rastgele sözlerle sandığa gider, kampanya turunu oynar. karisik (varsayılan):
// yarısı sessiz, yarısı kumar (oyuncular gibi). eski: beyanname öncesinin 50'li başlangıcı.
// kampanya: turdaki seçim. cesur hep zarlı, temkinli hep kesin seçeneği seçer; karisik yarı yarıya.
// Mühür: oyuncu, seçtiği seçenek bir göstergeyi 6 ya da daha çok düşürecekse eldeki mühürü basar (muhur=eşik).
import { motor } from "./lib/sayfa.mjs";
import { lintContent } from "./lint.mjs";

const E = await motor(); // cards.ts + engine.ts modülleri
// node sim.mjs 2000 damp=0.9 scale=1.1 → ayar düğmelerini geçici değiştir
for (const a of process.argv.slice(3)) {
  const [k, v] = a.split("=");
  if (k in E.TUNE) E.TUNE[k] = Number(v);
  // ACILIS.ezici.m.h=66 gibi: motor nesnesinde bir ayarı geçici değiştir
  else if (k.includes(".")) {
    const yol = k.split(".");
    let o = E;
    for (const x of yol.slice(0, -1)) o = o[x];
    o[yol.at(-1)] = Number(v);
  }
}
const OYUNCU = process.argv.find(a => a.startsWith("oyuncu="))?.slice(7);
console.log("TUNE", JSON.stringify(E.TUNE));
const ACILIS = process.argv.find(a => a.startsWith("acilis="))?.slice(7) || "karisik";
const KMP = process.argv.find(a => a.startsWith("kampanya="))?.slice(9) || "karisik";
console.log("açılış:", ACILIS, " kampanya:", KMP);
const sozler = rng =>
  E.shuffle(
    E.VAATLER.map(v => v.id),
    rng,
  ).slice(0, E.VAAT_MAX);
const baslat = rng => {
  if (ACILIS === "eski") return E.newGame();
  const a = ACILIS === "karisik" ? (rng() < 0.5 ? "sessiz" : "kumar") : ACILIS;
  if (a === "sessiz") return E.newGame({ acilis: "sessiz" });
  if (a === "kumar") return E.newGame({ kampanya: true, vaatler: sozler(rng).slice(0, Math.floor(rng() * 4)), rng });
  return E.newGame({ acilis: ACILIS, vaatler: ACILIS === "sessiz" ? [] : sozler(rng), rng });
};

function mulberry(seed) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ── Tutarlılık kontrolleri (tools/lint.mjs; test/content.test.mjs de aynısını çalıştırır)
const lint = lintContent(E);
for (const m of lint.errors) console.log("HATA:", m);
for (const m of lint.warnings) console.log("uyarı:", m);

// ── Oyuncu tipleri
const bucket = v => (v === 0 ? 0 : Math.sign(v) * (Math.abs(v) >= 15 ? 17 : Math.abs(v) >= 8 ? 11 : 5));
const riskOf = (s, e) => {
  let r = 0;
  E.METERS.forEach((k, i) => {
    r = Math.max(r, E.edgeRisk(k, s.m[k] + e[i]));
  });
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
    const a = score("L"),
      b = score("R");
    return a === b ? (rng() < 0.5 ? "L" : "R") : a < b ? "L" : "R";
  },
  // Daha dalgın, hikâyeye göre seçen oyuncu
  insan: (s, rng) => (rng() < 0.3 ? (rng() < 0.5 ? "L" : "R") : policies.gorerek(s, () => 1)),
  // Kesin sayıları bilen, seçimi de düşünen oyuncu
  usta: (s, rng) => {
    const mt = s.month % 60;
    const score = side => {
      const e = s.cur[side].e;
      let r = riskOf(s, e);
      if (mt >= 45) r -= e[0] * 0.6;
      return r;
    };
    const a = score("L"),
      b = score("R");
    return a === b ? (rng() < 0.5 ? "L" : "R") : a < b ? "L" : "R";
  },
  // Herkesi memnun etmeye çalışan oyuncu: halk + esnaf + Ankara toplamını büyütür, yalnız bir gösterge 30'un altına
  // düşecekse korkar; davetleri %90 kabul eder (tavanın "sevilince bitme" yayını sınar)
  sevilen: (s, rng) => {
    if (s.cur.kind === "davet") return rng() < 0.9 ? "R" : "L";
    if (rng() < 0.2) return rng() < 0.5 ? "L" : "R";
    const score = side => {
      const e = s.cur[side].e;
      let low = 0;
      E.METERS.forEach((k, i) => {
        low = Math.max(low, Math.max(0, 30 - (s.m[k] + e[i])));
      });
      return low * 3 - (e[0] + e[2] + e[3]);
    };
    const a = score("L"),
      b = score("R");
    return a === b ? (rng() < 0.5 ? "L" : "R") : a < b ? "L" : "R";
  },
  // Ankara'yı seven ama makamı bırakmayan oyuncu: Ankara'yı hep yukarı iter, davetleri hep reddeder (davet yayını sınar)
  ankaraci: (s, rng) => {
    if (s.cur.kind === "davet") return "L";
    if (rng() < 0.2) return rng() < 0.5 ? "L" : "R";
    const score = side => {
      const e = s.cur[side].e;
      let r = 0;
      E.METERS.forEach((k, i) => {
        if (k !== "a") r = Math.max(r, E.edgeRisk(k, s.m[k] + e[i]));
      });
      return r - e[3] * 0.8;
    };
    const a = score("L"),
      b = score("R");
    return a === b ? (rng() < 0.5 ? "L" : "R") : a < b ? "L" : "R";
  },
};
// kampanya evrakı: zarlı mı kesin mi
const kampanyaSec = (s, rng) => {
  const zarli = s.cur.L.zar ? "L" : "R",
    kesin = zarli === "L" ? "R" : "L";
  const cesur = KMP === "cesur" || (KMP === "karisik" && rng() < 0.5);
  return cesur ? zarli : kesin;
};
const MUHUR_ESIK = Number(process.argv.find(a => a.startsWith("muhur="))?.slice(6) || 6);
const muhurBas = (s, side) => E.muhurOK(s) && Math.min(...s.cur[side].e) <= -MUHUR_ESIK;
const acilisSay = {};
const seenAll = {};
// Oyunu bitiren seçenek (yay sonu): etkisi sıfır göründüğü için risk hesabı onu hep "güvenli" sanırdı.
// Oyuncu "oyun biter" notunu okur; merak edenler (%30) sonu seçer, gerisi öbür tarafa gider.
const SON_MERAK = 0.3;
const sonMu = (s, rng) => {
  const c = s.cur;
  if (c.kind !== "normal" && c.kind !== "kriz") return null;
  const l = !!c.L.son,
    r = !!c.R.son;
  if (l === r) return null;
  const son = l ? "L" : "R";
  return rng() < SON_MERAK ? son : son === "L" ? "R" : "L";
};
// yan etki evrakları (yürürlükteki kararların doğurduğu)
const YAN = new Set(
  E.CARDS.flatMap(c => [c.L, c.R])
    .flatMap(o => o.pol?.yan || [])
    .map(y => y.card),
);

const N = Number(process.argv[2] || 3000);
const q = (arr, p) => arr[Math.floor(p * (arr.length - 1))];
const medians = {},
  sideTally = {};
for (const [name, pol] of Object.entries(policies)) {
  if (OYUNCU && !OYUNCU.split(",").includes(name)) continue;
  const months = [],
    ends = {},
    seen = {},
    tally = (sideTally[name] = {});
  const field = {},
    davet = {};
  let under50 = 0,
    tekirRan = 0,
    tekirWon = 0,
    rivalWins = {};
  let term1 = 0,
    elections = 0,
    wins = 0,
    crises = 0,
    pols = 0,
    relHi = 0,
    relLo = 0,
    tekirSave = 0,
    dropped = 0,
    syn = 0,
    vaatAtElection = 0,
    defterAt = 0,
    yanSeen = 0,
    muhurN = 0;
  const acl = {}; // göreve başlayışa göre: oyun, ilk seçimi kazanan, ay toplamı
  for (let g = 0; g < N; g++) {
    const rng = mulberry(g * 7919 + 13);
    const s = baslat(rng);
    let guard = 0;
    while (!s.over && guard++ < 3000) {
      const c = E.draw(s, rng);
      seen[c.id] = (seen[c.id] || 0) + 1;
      seenAll[c.id] = 1;
      if (c.kind === "davet") davet[c.id] = (davet[c.id] || 0) + 1;
      if (YAN.has(c.id)) yanSeen++;
      if (c.kind === "kriz") crises++;
      if (c.kind === "tekir") tekirSave++;
      if (c.kind === "sonuc") wins++;
      if (c.kind === "secim") {
        elections++;
        vaatAtElection += s.cnt.vaat || 0;
        defterAt += E.defterOf(s);
      }
      const side = c.kind === "kampanya" ? kampanyaSec(s, rng) : sonMu(s, rng) || pol(s, rng);
      // kartın yazıldığı taraf (masada yarı yarıya ters çevrilir): baskın seçenek ölçümü için
      if (c.kind === "normal") {
        const t = (tally[c.id] ||= { L: 0, R: 0 });
        t[c.flip ? (side === "L" ? "R" : "L") : side]++;
      }
      const res = E.choose(s, side, rng, { muhur: muhurBas(s, side) });
      if (res.muhur) muhurN++;
      if (res.kampanyaBitti) E.kampanyaBitir(s, rng);
      if (c.kind === "secim" && s.lastElection) {
        const r = s.lastElection,
          n = r.cands.length;
        field[n] = (field[n] || 0) + 1;
        if (r.win && r.you < 50) under50++;
        if (r.cands.some(x => x.id === "tekir")) {
          tekirRan++;
          if (r.winner === "tekir") tekirWon++;
        }
        if (!r.win) rivalWins[r.winner] = (rivalWins[r.winner] || 0) + 1;
      }
      for (const ev of res.events || []) {
        if (ev.syn) syn++;
        if (/yer açmak/.test(ev.msg)) dropped++;
      }
      pols = Math.max(pols, s.ongoing.length);
    }
    // takılan oyun: son evraklarıyla birlikte haber ver
    if (!s.over) {
      const son = [];
      for (let i = 0; i < 8; i++) {
        const c = E.draw(s, rng);
        son.push(`${c.id}/${c.kind} ay ${s.month}`);
        E.choose(s, "L", rng);
      }
      throw new Error(
        `oyun bitmedi (${name}, oyun ${g}): ${son.join(" · ")} · pending ${JSON.stringify(s.pending)} · dönem ${s.term} seçim dönemi ${s.electionTerm}`,
      );
    }
    if (s.over.months >= 59) term1++;
    const ak = s.acilis || "eski",
      A = (acl[ak] ||= { n: 0, w1: 0, ay: 0 });
    A.n++;
    A.ay += s.over.months;
    if (s.term >= 2 || (s.over.months >= 60 && s.over.key !== "sandik")) A.w1++;
    months.push(s.over.months);
    ends[s.over.key] = (ends[s.over.key] || 0) + 1;
    relHi += Object.values(s.rel).filter(v => v >= 2).length;
    relLo += Object.values(s.rel).filter(v => v <= -2).length;
  }
  months.sort((a, b) => a - b);
  console.log(`\n## ${name}`);
  console.log(
    `ay p10/medyan/p90: ${q(months, 0.1)} / ${q(months, 0.5)} / ${q(months, 0.9)}   1. dönemi bitiren: %${((100 * term1) / N).toFixed(0)}   seçim kazanma: %${elections ? ((100 * wins) / elections).toFixed(0) : "-"}`,
  );
  console.log(
    `oyun başına kriz kartı: ${(crises / N).toFixed(2)}   Tekir kurtarışı: ${(tekirSave / N).toFixed(2)}   dost(≥2): ${(relHi / N).toFixed(1)}   dargın(≤-2): ${(relLo / N).toFixed(1)}`,
  );
  const yay = Object.entries(ends)
    .filter(([k]) => E.ENDINGS[k]?.tur)
    .reduce((a, [, v]) => a + v, 0);
  console.log(
    `yay sonu: %${((100 * yay) / N).toFixed(1)}   yan etki evrakı (oyun başına): ${(yanSeen / N).toFixed(2)}   seçimde ortalama defter: ${elections ? (defterAt / elections).toFixed(2) : "-"}`,
  );
  console.log(
    "sonlar:",
    Object.entries(ends)
      .sort((a, b) => b[1] - a[1])
      .map(([k, v]) => `${k}:${((100 * v) / N).toFixed(0)}%`)
      .join("  "),
  );
  console.log(
    `oyun başına etkileşim: ${(syn / N).toFixed(2)}   yer açmak için kalkan karar: ${(dropped / N).toFixed(2)}   seçimde ortalama vaat: ${elections ? (vaatAtElection / elections).toFixed(1) : "-"}   en çok yürürlükte: ${pols}`,
  );
  const fn = Object.values(field).reduce((a, b) => a + b, 0) || 1;
  console.log(
    `seçim: aday sayısı ${Object.entries(field)
      .sort()
      .map(([k, v]) => `${k}:%${Math.round((100 * v) / fn)}`)
      .join(
        " ",
      )}   %50 altı zafer: %${wins ? Math.round((100 * under50) / wins) : 0}   Tekir aday: %${((100 * tekirRan) / fn).toFixed(1)} (kazandı ${tekirWon})   kaybettiren: ${Object.entries(
      rivalWins,
    )
      .sort((a, b) => b[1] - a[1])
      .slice(0, 4)
      .map(([k, v]) => k + ":" + v)
      .join(" ")}`,
  );
  medians[name] = q(months, 0.5);
  console.log(
    `başlayış (oyun %, ilk seçimi geçen %, ortalama ay): ${Object.entries(acl)
      .sort((a, b) => b[1].n - a[1].n)
      .map(
        ([k, A]) =>
          `${k} %${Math.round((100 * A.n) / N)} → %${Math.round((100 * A.w1) / A.n)}, ${Math.round(A.ay / A.n)} ay`,
      )
      .join("   ")}   mühür/oyun: ${(muhurN / N).toFixed(2)}`,
  );
  for (const [k, A] of Object.entries(acl)) (acilisSay[k] ||= {})[name] = A;
  if (Object.keys(davet).length)
    console.log(
      `teklif (oyun başına): ${Object.entries(davet)
        .map(([k, v]) => `${k}:${(v / N).toFixed(2)}`)
        .join("  ")}`,
    );
  if (name === "gorerek") {
    const never = E.CARDS.filter(c => !seen[c.id]).map(c => c.id);
    console.log("hiç çıkmayan:", never.join(", ") || "-");
  }
}

// Hiçbir oyuncu tipinin görmediği evrak ölü içeriktir
console.log(
  "\nhiçbir oyuncu tipinde çıkmayan:",
  E.CARDS.filter(c => !seenAll[c.id])
    .map(c => c.id)
    .join(", ") || "-",
);
// Beceri önemli mi: usta oyuncu dikkatli oyuncudan belirgin uzun yaşamalı
console.log(
  `\nusta/insan medyan oranı: ${(medians.usta / medians.insan).toFixed(2)}   usta/gorerek: ${(medians.usta / medians.gorerek).toFixed(2)}`,
);
// Baskın seçenek: usta oyuncunun hep aynı tarafı seçtiği kartlar (tasarımda bir taraf bariz üstün demek)
const dom = Object.entries(sideTally.usta || {})
  .map(([id, t]) => ({ id, n: t.L + t.R, p: t.L / (t.L + t.R) }))
  .filter(x => x.n >= 40 && (x.p >= 0.9 || x.p <= 0.1))
  .sort((a, b) => Math.abs(b.p - 0.5) - Math.abs(a.p - 0.5));
console.log(
  `baskın seçenekli kart (usta ≥%90 aynı taraf, ≥40 kez): ${dom.length}` +
    (dom.length
      ? "\n  " +
        dom
          .slice(0, 25)
          .map(x => `${x.id}:${x.p >= 0.5 ? "L" : "R"}%${Math.round(100 * Math.max(x.p, 1 - x.p))}`)
          .join("  ")
      : ""),
);
