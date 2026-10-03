// Godot portu için içerik ve ayarları JSON'a döker: node tools/godot/disa-aktar.mjs <çıkış klasörü>
// İçerikteki tek kod parçası seçim adaylarının şartı ve gücü (ADAYLAR.sart/guc); bunlar aşağıda veriye çevrilir:
//   sart: "veya" listesi; her öğe { m: {gösterge: {max|min}} } | { rel: {kişi: {max|min}} } | { bayrak } | { sayac: {ad: {min}} }
//   guc: taban + (gosterge ? max(0, esik − m[gosterge]) × carpan) + (rel ? (rel[kişi] ≤ esik ? ek) ) + (sayac ? cnt[ad])
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { motor } from "../lib/sayfa.mjs";
const OUT = process.argv[2];
if (!OUT) throw new Error("çıkış klasörü ver");
mkdirSync(OUT, { recursive: true });
const E = await motor();
const ADAY_VERI = {
  vekil: { sart: [{ m: { a: { max: 30 } } }, { rel: { vekil: { max: -2 } } }], guc: { taban: 8, gosterge: "a", esik: 40, carpan: 0.5 } },
  cengiz: { sart: [{ rel: { cengiz: { max: -2 } } }, { bayrak: "towers" }], guc: { taban: 7, rel: { kisi: "cengiz", max: -2, ek: 4 } } },
  kaan: { guc: { taban: 6 } },
  bekir: { sart: [{ m: { e: { max: 30 } } }, { rel: { bekir: { max: -2 } } }], guc: { taban: 8, gosterge: "e", esik: 40, carpan: 0.5 } },
  muhtar: { sart: [{ rel: { muhtar: { max: -2 } } }], guc: { taban: 7, rel: { kisi: "muhtar", max: -3, ek: 4 } } },
  tuncay: { sart: [{ rel: { tuncay: { max: -2 } } }], guc: { taban: 6 } },
  burak: { sart: [{ rel: { burak: { max: -2 } } }], guc: { taban: 5 } },
  albay: { guc: { taban: 5 } },
  tekir: { sart: [{ sayac: { tekir: { min: 3 } } }], guc: { taban: 4, sayac: "tekir" } },
};
// koddan veriye çeviri doğru mu: her adayın fonksiyonunu rastgele durumlarda veri yorumuyla karşılaştır
const yorumSart = (x, s) =>
  !x.sart ||
  x.sart.some(k =>
    k.m ? Object.entries(k.m).every(([g, r]) => (r.max == null || s.m[g] <= r.max) && (r.min == null || s.m[g] >= r.min))
    : k.rel ? Object.entries(k.rel).every(([w, r]) => (r.max == null || (s.rel[w] || 0) <= r.max) && (r.min == null || (s.rel[w] || 0) >= r.min))
    : k.bayrak ? !!s.flags[k.bayrak]
    : Object.entries(k.sayac).every(([c, r]) => (s.cnt[c] || 0) >= r.min),
  );
const yorumGuc = (g, s) =>
  g.taban + (g.gosterge ? Math.max(0, g.esik - s.m[g.gosterge]) * g.carpan : 0) +
  (g.rel ? ((s.rel[g.rel.kisi] || 0) <= g.rel.max ? g.rel.ek : 0) : 0) + (g.sayac ? s.cnt[g.sayac] || 0 : 0);
for (let i = 0; i < 3000; i++) {
  const r = () => Math.floor(Math.random() * 101);
  const s = { m: { h: r(), k: r(), e: r(), a: r() }, rel: {}, flags: { towers: Math.random() < 0.5 }, cnt: { tekir: Math.floor(Math.random() * 6) } };
  for (const w of Object.keys(E.PEOPLE)) s.rel[w] = Math.floor(Math.random() * 7) - 3;
  for (const [id, a] of Object.entries(E.ADAYLAR)) {
    const v = ADAY_VERI[id] || {};
    if ((a.sart || a.guc) && !ADAY_VERI[id]) throw new Error("ADAY_VERI eksik: " + id);
    if (a.sart && !!a.sart(s) !== yorumSart(v, s)) throw new Error(`şart uyuşmadı: ${id}`);
    if (a.guc && Math.abs(a.guc(s) - yorumGuc(v.guc, s)) > 1e-9) throw new Error(`güç uyuşmadı: ${id} ${a.guc(s)} ≠ ${yorumGuc(v.guc, s)}`);
  }
}
const ADAYLAR = Object.fromEntries(Object.entries(E.ADAYLAR).map(([id, a]) => {
  const { sart, guc, ...geri } = a; // eslint-disable-line no-unused-vars
  return [id, { ...geri, ...(ADAY_VERI[id] || {}) }];
}));
const icerik = {
  CARDS: E.CARDS, KAMPANYA: E.KAMPANYA, TALEP: E.TALEP, TAVAN: E.TAVAN, DAVET: E.DAVET, ENDINGS: E.ENDINGS,
  CRISES: E.CRISES, INTRO: E.INTRO, MIRAS: E.MIRAS, VAATLER: E.VAATLER, PEOPLE: E.PEOPLE, ADAYLAR, BLOKLAR: E.BLOKLAR,
  SYN: E.SYN, CAY_LINES: E.CAY_LINES, QUOTES: E.QUOTES, REACT: E.REACT, KULIS: E.KULIS, BASKANLAR: E.BASKANLAR,
};
const ayar = {
  TUNE: E.TUNE, ACILIS: E.ACILIS, HAVA: E.HAVA, SANS: E.SANS, SANDIK: E.SANDIK, MUHUR: E.MUHUR, TEMIZ: E.TEMIZ,
  TERM: E.TERM, MAX_TERMS: E.MAX_TERMS, MAX_ONGOING: E.MAX_ONGOING, ADAY_MAX: E.ADAY_MAX, VAAT_MAX: E.VAAT_MAX,
  METERS: E.METERS, METER_AD: E.METER_AD, REL_AD: E.REL_AD, AYLAR: E.AYLAR, INFLUENCE: E.INFLUENCE, NOREL: [...E.NOREL],
};
const adlar = { ADLAR: E.ADLAR, ADLAR_ORTAK: E.ADLAR_ORTAK, SOYADLAR: E.SOYADLAR, YASAK_AD: E.YASAK_AD, YASAK_SOYAD: E.YASAK_SOYAD, YASAK_TAM: E.YASAK_TAM };
const yaz = (ad, v) => {
  const t = JSON.stringify({ v: 1, ...v }, (k, x) => (x instanceof Set ? [...x] : x), 1);
  if (/"__fn|function/.test(t)) throw new Error(ad + " içinde fonksiyon kaldı");
  writeFileSync(join(OUT, ad), t);
  console.log(ad, (t.length / 1024).toFixed(0), "KB");
};
yaz("icerik.json", icerik);
yaz("ayar.json", ayar);
yaz("adlar.json", adlar);
