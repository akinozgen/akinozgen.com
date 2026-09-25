// Seçim gecesi stüdyosu: SVG sözleşmesi (boyut, harici kaynak yok, sınıf öneki)
import { test } from "vitest";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { minifySync, transformWithOxc } from "vite";
import { yukle } from "./yukle.mjs";

const load = () => yukle("anchor");
const src = readFileSync(new URL("../src/anchor.ts", import.meta.url), "utf8");
// boyut sınırı derlemeye giren küçültülmüş koda: biçim ve yorum satırları sayılmaz
const kucuk = async () => minifySync("anchor.js", (await transformWithOxc(src, "anchor.ts")).code).code;
const LIMIT = 30 * 1024;

test("studioSVG: 1600×900, harici kaynak yok, bütün sınıflar st- önekli, 30 KB altı", async () => {
  const { studioSVG, studio } = await load();
  assert.equal(typeof studio, "function");
  const svg = studioSVG();
  assert.equal(typeof svg, "string");
  assert.match(svg, /^<svg[^>]*viewBox="0 0 1600 900"/);
  assert.doesNotMatch(svg, /<image/i);
  assert.doesNotMatch(svg, /href="http/i);
  assert.doesNotMatch(svg, /url\(\s*['"]?http/i);
  const names = [...svg.matchAll(/class="([^"]*)"/g)].flatMap(m => m[1].split(/\s+/).filter(Boolean));
  assert.ok(names.length > 20);
  assert.deepEqual(
    names.filter(n => !n.startsWith("st-")),
    [],
  );
  // <style> içindeki seçiciler ve animasyon adları da sayfaya sızmasın
  const css = svg.match(/<style>([\s\S]*?)<\/style>/)[1];
  assert.deepEqual(
    [...css.matchAll(/(?<![\d\w])\.(-?[a-zA-Z][\w-]*)/g)].map(m => m[1]).filter(n => !n.startsWith("st-")),
    [],
  );
  assert.deepEqual(
    [...css.matchAll(/@keyframes\s+([\w-]+)/g)].map(m => m[1]).filter(n => !n.startsWith("st-")),
    [],
  );
  assert.match(svg, /KARAKAVAK <tspan[^>]*>SEÇİM <tspan id="st-year">2034<\/tspan>/);
  assert.ok(Buffer.byteLength(svg) < LIMIT, `SVG ${Buffer.byteLength(svg)} bayt`);
  const kod = await kucuk();
  assert.ok(Buffer.byteLength(kod) < LIMIT, `anchor.ts küçültülmüş ${Buffer.byteLength(kod)} bayt`);
});

test("iki kopya aynı sayfada: gradyan kimlikleri çakışmaz", async () => {
  const { studioSVG } = await load();
  const ids = s => [...s.matchAll(/id="([^"]+)"/g)].map(m => m[1]).filter(i => i !== "st-year");
  const a = ids(studioSVG()),
    b = ids(studioSVG());
  assert.ok(a.length > 5);
  assert.deepEqual(
    a.filter(i => b.includes(i)),
    [],
  );
});
