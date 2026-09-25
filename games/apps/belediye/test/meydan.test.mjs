// Ana menü meydanı: SVG sözleşmesi (biçim, kimlikler, sınıf öneki, boyut, gerçek ad yok)
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const src = readFileSync(new URL("../tools/meydan.js", import.meta.url), "utf8");
const load = () => new Function(src + "\nreturn { meydanSVG, meydan, MD_HOUR };")();
const LIMIT = 70 * 1024;

test("dışa açılanlar: meydanSVG, meydan, saat → palet", () => {
  const { meydanSVG, meydan, MD_HOUR } = load();
  assert.equal(typeof meydanSVG, "function");
  assert.equal(typeof meydan, "function");
  assert.throws(() => meydan(null), /meydan/);
  const want = h => (h >= 21 || h < 6 ? "gece" : h < 17 ? "gun" : "aksam");
  for (let h = 0; h < 24; h++) assert.equal(MD_HOUR(h), want(h), `saat ${h}`);
});

test("meydanSVG: 1920×1080 slice, kök etiket dengeli, undefined/NaN yok, harici kaynak yok, 70 KB altı", () => {
  const { meydanSVG } = load();
  const svg = meydanSVG();
  assert.match(svg, /^<svg[^>]*viewBox="0 0 1920 1080"/);
  assert.match(svg, /^<svg[^>]*preserveAspectRatio="xMidYMid slice"/);
  assert.match(svg, /^<svg[^>]*width="100%" height="100%"/);
  assert.match(svg, /^<svg[^>]*role="img" aria-label="[^"]*Karakavak[^"]*"/);
  assert.match(svg, /<\/svg>$/);
  assert.equal((svg.match(/<svg\b/g) || []).length, 1);
  assert.equal((svg.match(/<\/svg>/g) || []).length, 1);
  assert.doesNotMatch(svg, /undefined|NaN|Infinity|\[object/);
  assert.doesNotMatch(svg, /<image|<script|<foreignObject/i);
  assert.doesNotMatch(svg, /href="(?!#)/);
  assert.doesNotMatch(svg, /url\(\s*['"]?(?!#)/);
  // açılan ve kapanan etiketler dengede (kendiliğinden kapananlar hariç)
  const body = svg.replace(/<style>[\s\S]*?<\/style>/, "").replace(/<text\b[^>]*>[^<]*(<tspan[^>]*>[^<]*<\/tspan>[^<]*)*<\/text>/g, "");
  const open = {}, close = {};
  for (const m of body.matchAll(/<(\/?)([a-zA-Z]+)\b[^>]*?(\/?)>/g)) { if (m[3]) continue; (m[1] ? close : open)[m[2]] = ((m[1] ? close : open)[m[2]] || 0) + 1; }
  assert.deepEqual(open, close);
  assert.match(svg, />KARAKAVAK BELEDİYESİ</);
  assert.ok(Buffer.byteLength(svg) < LIMIT, `SVG ${Buffer.byteLength(svg)} bayt`);
  assert.ok(Buffer.byteLength(src) < LIMIT, `meydan.js ${Buffer.byteLength(src)} bayt`);
});

test("sınıflar, seçiciler ve animasyon adları md- önekli; animasyonlar yalnız transform ve opacity", () => {
  const { meydanSVG } = load();
  const svg = meydanSVG();
  const names = [...svg.matchAll(/class="([^"]*)"/g)].flatMap(m => m[1].split(/\s+/).filter(Boolean));
  assert.ok(names.length > 50);
  assert.deepEqual(names.filter(n => !n.startsWith("md-")), []);
  const css = svg.match(/<style>([\s\S]*?)<\/style>/)[1];
  assert.deepEqual([...css.matchAll(/(?<![\d\w])\.(-?[a-zA-Z][\w-]*)/g)].map(m => m[1]).filter(n => !n.startsWith("md-")), []);
  assert.deepEqual([...css.matchAll(/@keyframes\s+([\w-]+)/g)].map(m => m[1]).filter(n => !n.startsWith("md-")), []);
  for (const [, b] of css.matchAll(/@keyframes\s+[\w-]+\{((?:[^{}]*\{[^{}]*\})*)\}/g))
    for (const [, decl] of b.matchAll(/\{([^{}]*)\}/g))
      for (const prop of decl.split(";").map(d => d.split(":")[0].trim()).filter(Boolean)) assert.ok(["transform", "opacity"].includes(prop), `keyframes: ${prop}`);
  assert.match(css, /@media \(prefers-reduced-motion:reduce\)\{[^}]*animation:none!important/);
  assert.match(css, /\.md-rm \*\{animation:none!important;transition:none!important\}/);
  for (const t of ["md-t-aksam", "md-t-gece", "md-t-gun"]) assert.ok(css.includes("." + t + "{"), t);
});

test("kimlikler bir kopyada tekil, iki kopyada farklı", () => {
  const { meydanSVG } = load();
  const ids = s => [...s.matchAll(/id="([^"]+)"/g)].map(m => m[1]);
  const a = ids(meydanSVG()), b = ids(meydanSVG());
  assert.ok(a.length > 10);
  assert.equal(new Set(a).size, a.length);
  assert.deepEqual(a.filter(i => b.includes(i)), []);
  // her url(#…) ve href="#…" aynı kopyadaki bir kimliğe gider
  const s = meydanSVG(), own = new Set(ids(s));
  for (const [, r] of [...s.matchAll(/url\(#([^)]+)\)/g), ...s.matchAll(/href="#([^"]+)"/g)]) assert.ok(own.has(r), r);
});

test("gerçek marka, parti ya da kişi adı yok", () => {
  const { meydanSVG } = load();
  const text = (meydanSVG() + src).toLocaleUpperCase("tr-TR");
  const BAN = ["AKP", "CHP", "MHP", "HDP", "DEM PARTİ", "İYİ PARTİ", "SAADET", "ATATÜRK", "ERDOĞAN", "İNÖNÜ", "İMAMOĞLU", "YAVAŞ", "BAHÇELİ",
    "COCA", "PEPSI", "ÇAYKUR", "LİPTON", "DOĞUŞ", "TÜRK TELEKOM", "TURKCELL", "VODAFONE", "ŞOK", "BİM", "MİGROS", "FORD", "MURAT 131", "TÜMOSAN", "ERKUNT", "JOHN DEERE", "MASSEY"];
  for (const w of BAN) assert.ok(!new RegExp(`(^|[^A-ZÇĞİÖŞÜ])${w}([^A-ZÇĞİÖŞÜ]|$)`).test(text), w);
});
