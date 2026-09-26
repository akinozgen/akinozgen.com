// Seçim gecesi yayını (broadcast.ts): alt bant, son dakika bandı, döviz kutusu, kazanan sözleri
import { test } from "vitest";
import assert from "node:assert/strict";
import { yukle } from "./yukle.mjs";

const E = await yukle("cards", "engine", "broadcast");
const rng = seed => () => {
  seed |= 0;
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
const up = s => s.toLocaleUpperCase("tr");
const PHASES = ["acilis", "sayim", "lider", "mahalle", "son", "sonuc"];
const MAHALLE = ["Kavun Ovası", "Çarşı", "Sanayi", "Lojmanlar", "Merkez", "Kavaklı", "Öğrenci yurdu", "Yukarıkavak"];
const NAMES = ["Aslı Kavaklıoğlu", "Mehmet Emin Yurtsever", "Ali", "ışıl iğdeci", "Abdurrahmangazi Çiçekçioğ", ""];
const IDS = ["you", ...Object.keys(E.ADAYLAR)];
const randomState = r => {
  const s = E.newGame();
  for (const k of ["h", "k", "e", "a"]) s.m[k] = 10 + Math.floor(r() * 81);
  for (const w of Object.keys(E.ADAYLAR)) if (w !== "tekir" && r() < 0.4) s.rel[w] = Math.floor(r() * 7) - 3;
  if (r() < 0.3) s.cnt.tekir = 3;
  return s;
};
// Sonuçtan geriye bir "o anki" durum üret: açılan oran arttıkça gürültü azalır, lider el değiştirebilir
function running(res, opened, r) {
  const raw = Object.fromEntries(res.cands.map(c => [c.id, Math.max(0.5, c.pct + (r() * 2 - 1) * 14 * (1 - opened))]));
  const tot = Object.values(raw).reduce((a, v) => a + v, 0);
  const pct = Object.fromEntries(Object.entries(raw).map(([k, v]) => [k, (100 * v) / tot]));
  return { pct, leader: Object.keys(pct).sort((a, b) => pct[b] - pct[a])[0] };
}
const FLAGS = [
  {},
  { karaca: true, towers: true, devkavun: true, bisiklet: true, itfaiye_muze: true },
  { itfaiye_satildi: true },
];
// Gerçek tally() sonuçları + Tekir'in kazandığı elle kurulmuş sonuçlar
const RESULTS = (() => {
  const out = [];
  for (let g = 0; g < 300; g++) {
    const r = rng(g + 500),
      s = randomState(r);
    out.push(E.tally(s, r));
  }
  const base = out[0];
  const mk = cands => ({
    ...base,
    cands,
    winner: cands[0].id,
    win: cands[0].id === "you",
    you: cands.find(c => c.id === "you").pct,
    margin: Math.round((cands[0].pct - cands[1].pct) * 10) / 10,
    order: cands.map(c => c.id).filter(id => id !== "you"),
  });
  out.push(
    mk([
      { id: "tekir", pct: 41 },
      { id: "you", pct: 35 },
      { id: "nermin", pct: 24 },
    ]),
  );
  out.push(
    mk(
      [
        { id: "bekir", pct: 44 },
        { id: "you", pct: 38 },
        { id: "nermin", pct: 18 },
      ],
      true,
    ),
  );
  out.push(
    mk([
      { id: "you", pct: 50.3 },
      { id: "nermin", pct: 49.7 },
    ]),
  );
  out.push(
    mk([
      { id: "burak", pct: 30.1 },
      { id: "you", pct: 29.9 },
      { id: "kaan", pct: 20 },
      { id: "albay", pct: 10 },
      { id: "tuncay", pct: 10 },
    ]),
  );
  out.push(
    mk([
      { id: "you", pct: 71 },
      { id: "vekil", pct: 17 },
      { id: "cengiz", pct: 7 },
      { id: "muhtar", pct: 5 },
    ]),
  );
  return out;
})();
const ctxOf = (res, i, r, extra = {}) => {
  const opened = [0, 0.03, 0.2, 0.37, 0.5, 0.8, 0.95, 0.998, 1][i % 9];
  const run = running(res, opened, r),
    prev = res.cands[(i + 1) % res.cands.length].id;
  return {
    res,
    playerName: NAMES[i % NAMES.length],
    ...run,
    prev,
    opened,
    mahalle: MAHALLE[i % MAHALLE.length],
    flags: FLAGS[i % FLAGS.length],
    ...extra,
  };
};

// Bütün çıktıları bir kez üret; testlerin çoğu bu havuzu tarar
const OUT = { kj: [], tick: [], quote: [], why: [], fx: [] };
RESULTS.forEach((res, i) => {
  for (let k = 0; k < 6; k++) {
    const seed = i * 31 + k,
      r = rng(seed),
      ctx = ctxOf(res, i + k, r);
    for (const ph of PHASES) OUT.kj.push({ ph, ctx, o: E.kj(ph, ctx, r) });
    OUT.tick.push({ ctx, items: E.tickerTagged(ctx, r) });
    for (const id of res.cands.map(c => c.id)) OUT.quote.push({ id, q: E.winnerQuote(id, ctx, r) });
  }
  OUT.why.push(...E.whyLines(res, NAMES[i % NAMES.length]));
});
for (let i = 0; i < 60; i++) OUT.fx.push(E.fx(i, rng(i)));
const ALL = [
  ...OUT.kj.flatMap(x => [x.o.title, x.o.sub]),
  ...OUT.tick.flatMap(x => x.items.map(y => y.t)),
  ...OUT.quote.map(x => x.q),
  ...OUT.why,
  ...OUT.fx.flatMap(f => [f.ad, f.deger]),
  ...IDS.flatMap(id => [E.tvName(id, "Aslı Kavaklıoğlu"), E.tvShort(id, "Aslı Kavaklıoğlu")]),
  E.KANAL.ad,
];
const clean = s => typeof s === "string" && s.length > 0 && !/undefined|null|NaN|[{}]/.test(s);

test("adlar: her adayın adı ve kısa adı var, kısa adlar büyük harf ve birbirinden farklı", () => {
  for (const name of NAMES) {
    const shorts = IDS.map(id => E.tvShort(id, name));
    for (const [i, id] of IDS.entries()) {
      assert.ok(clean(E.tvName(id, name)), `${id} adı`);
      assert.ok(
        clean(shorts[i]) && shorts[i] === up(shorts[i]) && shorts[i].length <= 16,
        `${id} kısa adı: ${shorts[i]}`,
      );
    }
    assert.equal(new Set(shorts).size, shorts.length, `kısa adlar çakışıyor: ${shorts}`);
  }
  assert.equal(E.tvName("you", "Aslı Kavaklıoğlu"), "Aslı Kavaklıoğlu");
  assert.equal(E.tvShort("you", "Aslı Kavaklıoğlu"), "A. KAVAKLIOĞLU");
  assert.equal(E.tvShort("you", "ışıl iğdeci"), "I. İĞDECİ");
  assert.equal(E.tvShort("nermin"), "N. HANIM");
  assert.equal(E.tvShort("bekir"), "H. BEKİR");
  assert.equal(E.tvShort("tekir"), "TEKİR");
  assert.equal(E.KANAL.kisa, "KTV");
});

test("alt bant: başlık büyük harf ve ≤ 34, alt satır cümle düzeninde ve ≤ 90, boş ya da bozuk değer yok", () => {
  for (const { ph, o } of OUT.kj) {
    assert.ok(clean(o.title) && clean(o.sub), `${ph}: ${JSON.stringify(o)}`);
    assert.ok(o.title.length <= 34, `${ph} başlık ${o.title.length}: ${o.title}`);
    assert.equal(o.title, up(o.title), `${ph} başlık büyük harf değil: ${o.title}`);
    assert.ok(o.sub.length <= 90, `${ph} alt satır ${o.sub.length}: ${o.sub}`);
    const first = o.sub.match(/\p{L}/u)[0];
    assert.equal(first, up(first), `${ph} alt satır küçük harfle başlıyor: ${o.sub}`);
    assert.notEqual(o.sub, up(o.sub), `${ph} alt satır tamamen büyük harf: ${o.sub}`);
  }
});

test("alt bant: sayım başlığı açılan oranı Türkçe ekiyle yazar", () => {
  const res = RESULTS[0],
    at = f => {
      const s = new Set();
      for (let g = 0; g < 80; g++) s.add(E.kj("sayim", { res, opened: f, playerName: "Ali" }, rng(g)).title);
      return [...s];
    };
  assert.ok(at(0.37).includes("SANDIKLARIN %37'Sİ AÇILDI"));
  assert.ok(at(0.4).includes("SANDIKLARIN %40'I AÇILDI"));
  assert.ok(at(0.03).includes("SANDIKLARIN %3'Ü AÇILDI"));
  assert.ok(at(0.06).includes("SANDIKLARIN %6'SI AÇILDI"));
  assert.ok(at(0.998).includes("SANDIKLARIN %99,8'İ AÇILDI"));
  assert.ok(at(1).includes("SANDIKLARIN TAMAMI AÇILDI"));
});

test("alt bant: sonuç evresinde kazanma, kaybetme ve Tekir ayrı ayrı anlatılır", () => {
  const titles = (res, extra = {}) => {
    const t = new Set(),
      s = new Set();
    for (let g = 0; g < 60; g++) {
      const o = E.kj("sonuc", { res, playerName: "Aslı Kavaklıoğlu", opened: 1, ...extra }, rng(g));
      t.add(o.title);
      s.add(o.sub);
    }
    return { t: [...t], s: [...s] };
  };
  const win = RESULTS.find(r => r.win && r.cands.length > 2),
    loss = RESULTS.find(r => !r.win && r.winner !== "tekir");
  const tek = RESULTS.find(r => r.winner === "tekir");
  const w = titles(win),
    l = titles(loss),
    k = titles(tek);
  assert.ok(
    w.t.some(t => /YENİDEN BAŞKAN|MAKAM YERİNDE|ÇAYLAR YİNE/.test(t)),
    w.t.join(" | "),
  );
  assert.ok(w.t.includes("KARAKAVAK SEÇİMİNİ YAPTI"));
  assert.ok(
    w.s.some(s => s.startsWith("Aslı Kavaklıoğlu: '")),
    "kazananın sözü yok",
  );
  const wn = E.tvName(loss.winner),
    ws = E.tvShort(loss.winner);
  assert.ok(
    l.t.some(t => t.includes(up(wn)) || t.includes(ws) || /EL DEĞİŞTİRDİ|DEĞİŞİM/.test(t)),
    l.t.join(" | "),
  );
  assert.ok(
    l.s.some(s => s.startsWith(wn + ": '")),
    "rakibin zafer sözü yok",
  );
  assert.ok(
    k.t.every(t => /TEKİR|TÜYLÜ|MIRNAV/.test(t)),
    k.t.join(" | "),
  );
  assert.ok(k.s.some(s => s.startsWith("Tekir: '")));
});

test("alt bant: adaya özgü şakalar ve oyuncunun önde/geride olduğu satırlar gelir", () => {
  const res = RESULTS.find(r => r.cands.some(c => c.id === "burak"));
  const subs = (leader, phase = "sayim", extra = {}) => {
    const s = new Set();
    for (let g = 0; g < 120; g++)
      s.add(E.kj(phase, { res, playerName: "Ali", leader, pct: { [leader]: 40 }, opened: 0.4, ...extra }, rng(g)).sub);
    return [...s];
  };
  assert.ok(subs("burak").includes("Burak canlı yayında: 'Kazandık' dedi, izleyici 12"));
  assert.ok(subs("burak", "lider").some(s => s.startsWith("Burak")));
  assert.ok(subs("you").filter(s => s.startsWith("Ali")).length >= 3, "oyuncu öndeyken satır az");
  const other = res.cands.find(c => c.id !== "you").id;
  assert.ok(
    subs(other).some(s => /^Ali geride|Ali cephesinden/.test(s)),
    "oyuncu geride satırı yok",
  );
  assert.ok(
    subs(other, "lider", { prev: "you" }).some(
      s => s.includes("Ali liderliği kaptırdı") || s.includes("Ali geriye düştü"),
    ),
  );
  // mahalleye özgü satır
  const bek = RESULTS.find(r => r.cands.some(c => c.id === "bekir"));
  const m = new Set();
  for (let g = 0; g < 80; g++) m.add(E.kj("mahalle", { res: bek, mahalle: "Çarşı", playerName: "Ali" }, rng(g)).sub);
  assert.ok(
    [...m].some(s => s.includes("Hacı Bekir")),
    "Çarşı'da Hacı Bekir anılmadı",
  );
});

test("alt bant: ara evreler kesin sonucu ele vermez; lider bilinmiyorsa lidere dair satır gelmez", () => {
  for (const res of RESULTS.slice(0, 80))
    for (let g = 0; g < 5; g++)
      for (const ph of ["acilis", "sayim", "mahalle", "son"]) {
        const o = E.kj(ph, { res, playerName: "Ali", opened: 0.4, mahalle: "Merkez" }, rng(g));
        assert.ok(
          !/(^|\P{L})(önde|öne geçti|geride|zirvede)(\P{L}|$)/iu.test(o.title + " " + o.sub),
          `${ph}: ${o.title} / ${o.sub}`,
        );
      }
});

test("çeşitlilik: 50 tohumda sayım başlıkları ve alt satırları tekrara düşmez; seen verilince tekrar yok", () => {
  const res = RESULTS.find(r => r.cands.length >= 3),
    t = new Set(),
    s = new Set();
  for (let g = 0; g < 50; g++) {
    const r = rng(g * 7 + 1),
      ctx = { res, playerName: "Ali", ...running(res, 0.45, r), opened: 0.45 };
    const o = E.kj("sayim", ctx, r);
    t.add(o.title);
    s.add(o.sub);
  }
  assert.ok(t.size >= 5, `sayım başlığı çeşidi ${t.size}`);
  assert.ok(s.size >= 12, `sayım alt satırı çeşidi ${s.size}`);
  const seen = new Set(),
    r = rng(3),
    got = [];
  for (let i = 0; i < 12; i++)
    got.push(E.kj("sayim", { res, playerName: "Ali", leader: "you", pct: { you: 40 }, opened: 0.5, seen }, r).sub);
  assert.equal(new Set(got).size, got.length, "seen varken alt satır tekrarlandı");
});

test("belirlenimcilik: aynı tohum aynı yayını üretir", () => {
  for (const [i, res] of RESULTS.slice(0, 40).entries()) {
    const run = seed => {
      const r = rng(seed),
        ctx = ctxOf(res, i, rng(seed + 1));
      return JSON.stringify([
        PHASES.map(p => E.kj(p, ctx, r)),
        E.ticker(ctx, r),
        E.fx(i, r),
        E.winnerQuote(res.winner, ctx, r),
      ]);
    };
    assert.equal(run(i), run(i));
  }
});

test("son dakika: 8-12 haber, her biri ≤ 110, ilk haber seçimden, üç küme de her bantta var", () => {
  const cats = new Set();
  for (const { items } of OUT.tick) {
    assert.ok(items.length >= 8 && items.length <= 12, `haber sayısı ${items.length}`);
    for (const x of items) {
      assert.ok(clean(x.t) && x.t.length <= 110, `${x.t.length}: ${x.t}`);
      cats.add(x.cat);
    }
    assert.equal(items[0].cat, "secim");
    const k = items.filter(x => x.cat === "secim" || x.cat === "yerel").length,
      u = items.filter(x => x.cat === "ulusal").length,
      d = items.filter(x => x.cat === "dunya").length;
    assert.ok(k >= 3 && u >= 2 && d >= 2, `karışım K${k} U${u} D${d}`);
    assert.ok(items.filter(x => x.cat === "secim").length >= 2);
    assert.equal(new Set(items.map(x => x.t)).size, items.length, "aynı haber iki kez");
  }
  assert.deepEqual([...cats].sort(), ["dunya", "secim", "ulusal", "yerel"]);
});

test("son dakika: havuzlar geniş, bazı dünya ve ülke haberleri Karakavak'a bağlanıyor", () => {
  const T = E.TV_TICK,
    n = k => T[k].length;
  assert.ok(n("secim") + n("yerel") + n("ulusal") + n("dunya") >= 100, "toplam haber");
  for (const k of ["ulusal", "dunya"]) {
    assert.ok(n(k) >= 25, `${k} ${n(k)}`);
    assert.ok(
      T[k].filter(t => /Karakavak|Fikret|Tekir/.test(t)).length >= 2,
      `${k} haberleri Karakavak'a hiç bağlanmıyor`,
    );
  }
});

test("son dakika: adaylara, bayraklara ve sonuca göre değişir", () => {
  const texts = (pred, ctxFn, N = 60) => {
    const out = [];
    for (let g = 0; g < N; g++) {
      const res = RESULTS.filter(pred)[g % RESULTS.filter(pred).length];
      out.push(...E.ticker(ctxFn(res), rng(g)));
    }
    return out.join("\n");
  };
  const tek = texts(
    r => r.cands.some(c => c.id === "tekir"),
    res => ({ res, opened: 0.3 }),
  );
  assert.match(tek, /kedi resmi|Tekir sandık kurulunun|Tekir'in afişi/);
  const noTek = texts(
    r => !r.cands.some(c => c.id === "tekir"),
    res => ({ res, opened: 0.3 }),
  );
  assert.doesNotMatch(noTek, /Mırnav/);
  assert.doesNotMatch(
    texts(tvAll, res => ({ res })),
    /Karaca|itfaiye|Towers|dev kavun heykeline|bisikleti/,
    "bayrak yokken olay anıldı",
  );
  assert.match(
    texts(tvAll, res => ({ res, flags: FLAGS[1] })),
    /Karaca|Towers|itfaiye|dev kavun|bisikleti/,
  );
  // sonuç ancak bütün sandıklar açılınca haber olur
  assert.doesNotMatch(
    texts(tvAll, res => ({ res, ...running(res, 0.6, rng(1)), opened: 0.6 })),
    /Kesin olmayan sonuçlara göre|yenilgiyi kabul|balkona çıktı/,
  );
  assert.match(
    texts(tvAll, res => ({ res, opened: 1, playerName: "Ali" }), 120),
    /Kesin olmayan sonuçlara göre/,
  );
  assert.match(
    texts(
      r => r.cands.some(c => c.id === "burak"),
      res => ({ res, opened: 0.2 }),
    ),
    /izleyici 12/,
  );
});
function tvAll() {
  return true;
}

test("döviz kutusu: Türkçe sayı biçimi, yön oku, i ile döner", () => {
  const names = new Set();
  for (let i = 0; i < 60; i++) {
    const f = E.fx(i, rng(i * 3));
    assert.ok(clean(f.ad) && f.ad === up(f.ad), f.ad);
    assert.match(f.deger, /^\d{1,3}(\.\d{3})*,\d{2}$/, `${f.ad} ${f.deger}`);
    assert.ok(["▲", "▼"].includes(f.yon));
    assert.equal(E.fx(i, rng(1)).ad, E.fx(i + 12, rng(2)).ad);
    names.add(f.ad);
  }
  for (const n of ["KAVUN/TL", "ÇAY/BARDAK", "DOLAR", "EURO", "ALTIN/GR", "SİMİT", "TEKİR MAMASI/KG"])
    assert.ok(names.has(n), n);
  assert.equal(E.fx(2, rng(5)).yon, "▲", "dolar hep yukarı");
  assert.match(E.fx(4, rng(5)).deger, /^\d\.\d{3},\d{2}$/, "altın binlik ayraçlı");
});

test("kazanan sözleri: her aday ve oyuncu için ≤ 70, en az üç farklı zafer ve üç farklı yenilgi sözü", () => {
  for (const { id, q } of OUT.quote) assert.ok(clean(q) && q.length <= 70, `${id}: ${q}`);
  const base = RESULTS[0];
  for (const id of IDS) {
    const others = IDS.filter(x => x !== id).slice(0, 2);
    const won = {
      ...base,
      winner: id,
      win: id === "you",
      cands: [{ id, pct: 50 }, ...others.map(o => ({ id: o, pct: 25 }))],
    };
    const lost = {
      ...base,
      winner: others[0],
      win: others[0] === "you",
      cands: [
        { id: others[0], pct: 50 },
        { id, pct: 30 },
        { id: others[1], pct: 20 },
      ],
    };
    const w = new Set(),
      l = new Set();
    for (let g = 0; g < 80; g++) {
      w.add(E.winnerQuote(id, { res: won }, rng(g)));
      l.add(E.winnerQuote(id, { res: lost }, rng(g)));
    }
    assert.ok(w.size >= 3, `${id} zafer sözü ${w.size}`);
    assert.ok(l.size >= 3, `${id} yenilgi sözü ${l.size}`);
    for (const x of w) assert.ok(!l.has(x), `${id}: aynı söz hem zaferde hem yenilgide`);
  }
  assert.ok(clean(E.winnerQuote("you", {}, rng(1))));
});

test("Neden? satırları: sayılar Türkçe, oy çalan adaylar adıyla anılır", () => {
  // ondalık ayraç virgül olmalı (binlik nokta ve "Karakavak 4.0" sloganı hariç)
  for (const t of OUT.why)
    assert.ok(clean(t) && t.length <= 120 && !/\d\.\d/.test(t.replace(/\d\.\d{3}|4\.0/g, "")), t);
  const res = RESULTS.find(r => (r.steal || []).some(x => x.v >= 1)),
    lines = E.whyLines(res, "Ali");
  for (const x of res.steal.filter(x => x.v >= 1))
    assert.ok(
      lines.some(l => l.includes(E.tvName(x.id)) && l.includes(String(x.v).replace(".", ","))),
      x.id,
    );
  assert.ok(lines.some(l => l.includes("%" + String(res.p0).replace(".", ","))));
  assert.deepEqual(E.whyLines(null, "Ali"), []);
});

// Gerçek parti, siyasetçi, kurum, kanal ve marka adları hiçbir çıktıda geçmez
const BANNED = [
  // partiler ve ittifaklar
  "akp",
  "ak parti",
  "adalet ve kalkınma",
  "chp",
  "cumhuriyet halk",
  "mhp",
  "milliyetçi hareket",
  "hdp",
  "dem parti",
  "iyi parti",
  "saadet partisi",
  "deva partisi",
  "gelecek partisi",
  "zafer partisi",
  "yeniden refah",
  "refah partisi",
  "bbp",
  "dsp",
  "anap",
  "dyp",
  "cumhur ittifakı",
  "millet ittifakı",
  // siyasetçiler ve dünya liderleri
  "erdoğan",
  "kılıçdaroğlu",
  "imamoğlu",
  "bahçeli",
  "akşener",
  "babacan",
  "davutoğlu",
  "demirtaş",
  "erbakan",
  "türkeş",
  "ecevit",
  "demirel",
  "menderes",
  "özal",
  "çiller",
  "bakırhan",
  "dervişoğlu",
  "karamollaoğlu",
  "özdağ",
  "mansur yavaş",
  "özgür özel",
  "muharrem ince",
  "binali",
  "abdullah gül",
  "trump",
  "biden",
  "putin",
  "musk",
  "bezos",
  "zuckerberg",
  "macron",
  "merkel",
  "obama",
  "zelensky",
  "netanyahu",
  "xi jinping",
  "kim jong",
  // kurumlar
  "ysk",
  "yüksek seçim kurulu",
  "tedaş",
  "tüik",
  "sayıştay",
  "rtük",
  "diyanet",
  "tbmm",
  "meteoroloji genel",
  // kanallar ve gazeteler
  "trt",
  "cnn",
  "ntv",
  "habertürk",
  "show tv",
  "kanal d",
  "atv",
  "a haber",
  "halk tv",
  "sözcü",
  "tele1",
  "fox tv",
  "now tv",
  "star tv",
  "tv8",
  "beyaz tv",
  "kanal 7",
  "tv100",
  "bloomberg",
  "bbc",
  "hürriyet",
  "sabah gazetesi",
  // markalar ve kulüpler
  "coca-cola",
  "pepsi",
  "migros",
  "bim",
  "a101",
  "şok market",
  "turkcell",
  "vodafone",
  "türk telekom",
  "thy",
  "türk hava yolları",
  "trendyol",
  "hepsiburada",
  "yemeksepeti",
  "ülker",
  "arçelik",
  "vestel",
  "tesla",
  "spacex",
  "apple",
  "iphone",
  "google",
  "facebook",
  "instagram",
  "tiktok",
  "twitter",
  "whatsapp",
  "youtube",
  "netflix",
  "amazon",
  "microsoft",
  "openai",
  "chatgpt",
  "samsung",
  "bitcoin",
  "guinness",
  "eurovision",
  "galatasaray",
  "fenerbahçe",
  "beşiktaş",
  "trabzonspor",
  "thodex",
];
const norm = s => s.toLocaleLowerCase("tr").replace(/ı/g, "i");
test("gerçek ad yok: parti, siyasetçi, kurum, kanal ve marka adları çıktıda ya da havuzlarda geçmez", () => {
  const pools = Object.values(E.TV_TICK)
    .flat()
    .map(e => (typeof e === "string" ? e : e[1]));
  const text = norm([...ALL, ...pools].join("\n"));
  for (const w of BANNED) {
    const re = new RegExp(
      `(^|[^\\p{L}\\p{N}])${norm(w).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}($|[^\\p{L}\\p{N}])`,
      "u",
    );
    assert.doesNotMatch(text, re, `yasaklı ad: ${w}`);
  }
});
