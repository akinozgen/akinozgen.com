// Göstergeler Godot için üç katman: gosterge-<k>-bos.svg (soluk siluet), gosterge-<k>-dolu.svg (tam dolu siluet,
// kırpmasız, beyaz: renk modulate ile) ve gosterge-<k>-detay.svg (detay çizgileri; webde dolunun üstünde çizilir). Doluluk Godot'ta kırpılır: üst sınır y = box[0] + (1 − v/100)·(box[1] − box[0]).
// data/_gosterge.json: box ve hâllere göre renkler. Kaynak src/ui.ts GLYPH ve src/style.css. node tools/godot/gosterge.mjs <proje>
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const PROJE = process.argv[2];
if (!PROJE) throw new Error("Godot proje klasörünü ver");
const ui = readFileSync(new URL("../../src/ui.ts", import.meta.url), "utf8"),
  css = readFileSync(new URL("../../src/style.css", import.meta.url), "utf8");
const govde = ui.match(/const GLYPH[^=]*= (\{[\s\S]*?\n\});/)[1];
const GLYPH = new Function(`return ${govde}`)();
const tok = ad => css.match(new RegExp(`--${ad}:\\s*([^;]+);`))[1].trim();
const RENK = {
  ghost: "rgba(243, 242, 236, 0.26)",
  det: tok("wood"),
  fill: {
    normal: tok("paper"),
    artti: tok("good"),
    azaldi: tok("bad"),
    tehlike: "#f4b49e",
    tavan: "#f2dfa0",
    glory: "#f3e2a4",
  },
  sayi: { normal: tok("paper"), anket_uyari: "#ff9c86", tehlike: "#ff7a66", tavan: "#f2c46b", glory: tok("brass-hi") },
};
const svg = ic => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40" width="40" height="40">${ic}</svg>\n`;
const AD = { h: "h", k: "k", e: "e", a: "a", p: "anket" };
for (const [k, g] of Object.entries(GLYPH)) {
  const det = `<g fill="none" stroke="${RENK.det}" stroke-width="1.6" stroke-linecap="round">${g.det}</g>`;
  writeFileSync(
    join(PROJE, "assets/icon", `gosterge-${AD[k]}-bos.svg`),
    svg(`<path d="${g.d}" fill="${RENK.ghost}"/>`),
  );
  writeFileSync(join(PROJE, "assets/icon", `gosterge-${AD[k]}-dolu.svg`), svg(`<path d="${g.d}" fill="#ffffff"/>`));
  if (g.det) writeFileSync(join(PROJE, "assets/icon", `gosterge-${AD[k]}-detay.svg`), svg(det));
}
writeFileSync(
  join(PROJE, "data/_gosterge.json"),
  JSON.stringify(
    {
      v: 1,
      not: "viewBox 40×40. Çizim sırası: bos (soluk siluet), dolu (renk = fill[hâl], modulate ile; SVG beyaz), detay (detay çizgileri, dolunun üstünde). Dolu katman y ≥ kesik olan kısımda görünür: kesik = box[0] + (1 − v/100)·(box[1] − box[0]); değişince 0,7 sn cubic-bezier(.2,.8,.2,1) ile kayar. Dolu rengi 0,5 sn geçişli.",
      box: Object.fromEntries(Object.entries(GLYPH).map(([k, g]) => [AD[k], g.box])),
      renk: RENK,
      haller: {
        tehlike:
          "v ≤ 15 (anket hariç): dolu tehlike rengi, sayı kırmızı + ▼; simge 1,2 sn nabız: %50'de scale 1.1 ve kırmızı parıltı (drop-shadow 0 0 5px rgba(230,90,60,.85)). Azaltılmış harekette nabız yok.",
        tavan: "v ≥ 85, h dışında (k, e, a): dolu tavan rengi, sayı amber + ▲.",
        glory:
          "h ≥ 85: dolu glory rengi, sayı pirinç, simgeye altın parıltı (drop-shadow 0 0 5.6px rgba(236,213,146,.65)).",
        artti_azaldi: "Etki gelince 0,9 sn dolu artti/azaldi renginde kalır, sonra hâlin rengine döner.",
        anket:
          "Anket yalnız normal renkte; seçim yakın ve anket ≤ 50 ise sayı anket_uyari renginde. h'nin detay katmanı yok.",
      },
    },
    null,
    1,
  ),
);
console.log("gösterge:", Object.keys(GLYPH).length);
