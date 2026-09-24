// Seçim gecesi stüdyosu: SVG sözleşmesi (boyut, harici kaynak yok, sınıf öneki)
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const src = readFileSync(new URL("../src/anchor.js", import.meta.url), "utf8");
const load = () => new Function(src + "\nreturn { studioSVG, studio };")();
const LIMIT = 30 * 1024;

test("studioSVG: 1600×900, harici kaynak yok, bütün sınıflar st- önekli, 30 KB altı", () => {
  const { studioSVG, studio } = load();
  assert.equal(typeof studio, "function");
  const svg = studioSVG();
  assert.equal(typeof svg, "string");
  assert.match(svg, /^<svg[^>]*viewBox="0 0 1600 900"/);
  assert.doesNotMatch(svg, /<image/i);
  assert.doesNotMatch(svg, /href="http/i);
  assert.doesNotMatch(svg, /url\(\s*['"]?http/i);
  const names = [...svg.matchAll(/class="([^"]*)"/g)].flatMap(m => m[1].split(/\s+/).filter(Boolean));
  assert.ok(names.length > 20);
  assert.deepEqual(names.filter(n => !n.startsWith("st-")), []);
  // <style> içindeki seçiciler ve animasyon adları da sayfaya sızmasın
  const css = svg.match(/<style>([\s\S]*?)<\/style>/)[1];
  assert.deepEqual([...css.matchAll(/(?<![\d\w])\.(-?[a-zA-Z][\w-]*)/g)].map(m => m[1]).filter(n => !n.startsWith("st-")), []);
  assert.deepEqual([...css.matchAll(/@keyframes\s+([\w-]+)/g)].map(m => m[1]).filter(n => !n.startsWith("st-")), []);
  assert.match(svg, /KARAKAVAK <tspan[^>]*>SEÇİM <tspan id="st-year">2034<\/tspan>/);
  assert.ok(Buffer.byteLength(svg) < LIMIT, `SVG ${Buffer.byteLength(svg)} bayt`);
  assert.ok(Buffer.byteLength(src) < LIMIT, `anchor.js ${Buffer.byteLength(src)} bayt`);
});

test("iki kopya aynı sayfada: gradyan kimlikleri çakışmaz", () => {
  const { studioSVG } = load();
  const ids = s => [...s.matchAll(/id="([^"]+)"/g)].map(m => m[1]).filter(i => i !== "st-year");
  const a = ids(studioSVG()), b = ids(studioSVG());
  assert.ok(a.length > 5);
  assert.deepEqual(a.filter(i => b.includes(i)), []);
});
