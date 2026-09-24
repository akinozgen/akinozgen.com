// Uygulama ikonlarını üretir: web-src/icons/{icon.svg, icon-192.png, icon-512.png, maskable-512.png, apple-touch-icon.png}
// node tools/icons.mjs   (headless Chrome ile SVG'den PNG çizer)
import { writeFileSync, mkdirSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const DIR = new URL("../web-src/icons/", import.meta.url);
mkdirSync(DIR, { recursive: true });
const CHROME = process.env.CHROME || "C:/Program Files/Google/Chrome/Application/chrome.exe";

const GLASS = `M55 30 L145 30 C146 72 122 98 124 130 C126 160 150 182 140 212 C136 222 128 228 118 230 L82 230 C72 228 64 222 60 212 C50 182 74 160 76 130 C78 98 54 72 55 30 Z`;
// k: bardağın ölçeği; maskelenebilir ikonda güvenli alan için küçük
const art = (k, rounded) => {
  const w = 184 * k, h = 226 * k, tx = (512 - w) / 2 - 8 * k, ty = (512 - h) / 2 - 26 * k + 6;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
<defs>
  <radialGradient id="bg" cx="50%" cy="40%" r="75%"><stop offset="0" stop-color="#2a5242"/><stop offset=".6" stop-color="#1b3a2e"/><stop offset="1" stop-color="#0e1f18"/></radialGradient>
  <linearGradient id="tea" x1="0" x2="1"><stop offset="0" stop-color="#6e1a0a"/><stop offset=".35" stop-color="#b8401c"/><stop offset=".55" stop-color="#d9642a"/><stop offset="1" stop-color="#7a200c"/></linearGradient>
  <linearGradient id="porc" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="#fff"/><stop offset="1" stop-color="#d9d6cc"/></linearGradient>
  <clipPath id="g"><path d="${GLASS}"/></clipPath>
</defs>
<rect width="512" height="512" rx="${rounded ? 104 : 0}" fill="url(#bg)"/>
${rounded ? `<rect x="22" y="22" width="468" height="468" rx="86" fill="none" stroke="#c9a54c" stroke-opacity=".45" stroke-width="5" stroke-dasharray="14 10"/>` : ""}
<g transform="translate(${tx.toFixed(1)} ${ty.toFixed(1)}) scale(${k})">
  <ellipse cx="100" cy="240" rx="94" ry="18" fill="#08120e" opacity=".5"/>
  <ellipse cx="100" cy="234" rx="92" ry="17" fill="url(#porc)"/>
  <ellipse cx="100" cy="234" rx="92" ry="17" fill="none" stroke="#c9a54c" stroke-width="3"/>
  <ellipse cx="100" cy="232" rx="58" ry="9.5" fill="#e4e1d8"/>
  <g clip-path="url(#g)"><rect x="40" y="56" width="120" height="180" fill="url(#tea)"/><ellipse cx="100" cy="57" rx="44" ry="4.5" fill="#e0763a"/><rect x="40" y="0" width="120" height="56" fill="#fff" fill-opacity=".08"/></g>
  <path d="${GLASS}" fill="none" stroke="#fff" stroke-opacity=".8" stroke-width="3"/>
  <path d="M63 40 C64 76 84 100 84 128" stroke="#fff" stroke-opacity=".55" stroke-width="5" fill="none" stroke-linecap="round"/>
  <ellipse cx="100" cy="30" rx="45" ry="3.4" fill="none" stroke="#fff" stroke-opacity=".85" stroke-width="2"/>
</g>
</svg>`;
};

writeFileSync(new URL("icon.svg", DIR), art(1.45, true));
const jobs = [["icon-192.png", 192, art(1.45, false)], ["icon-512.png", 512, art(1.45, false)], ["maskable-512.png", 512, art(1.1, false)], ["apple-touch-icon.png", 180, art(1.35, false)]];
for (const [name, size, svg] of jobs) {
  const html = new URL(`_${size}_${name}.html`, DIR);
  writeFileSync(html, `<!doctype html><html><body style="margin:0;background:#0e1f18">${svg.replace("<svg ", `<svg width="${size}" height="${size}" style="display:block" `)}</body></html>`);
  execFileSync(CHROME, ["--headless=new", "--mute-audio", "--disable-gpu", "--hide-scrollbars", `--window-size=${size},${size}`, `--screenshot=${fileURLToPath(new URL(name, DIR))}`, html.href], { stdio: "ignore" });
  console.log("ikon:", name);
}
