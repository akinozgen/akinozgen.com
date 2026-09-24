// Uygulama ikonlarını üretir: web-src/icons/{icon.svg, icon-192.png, icon-512.png, maskable-512.png, apple-touch-icon.png}
// node tools/icons.mjs   (headless Chrome ile SVG'den PNG çizer)
import { writeFileSync, mkdirSync, rmSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const DIR = new URL("../web-src/icons/", import.meta.url);
mkdirSync(DIR, { recursive: true });
const CHROME = process.env.CHROME || "C:/Program Files/Google/Chrome/Application/chrome.exe";

const GLASS = `M48 80 A52 9 0 0 1 152 80 C150 112 135 128 135 152 C135 172 149 186 149 203 C149 218 142 229 128 230 L72 230 C58 229 51 218 51 203 C51 186 65 172 65 152 C65 128 50 112 48 80 Z`;
// çayın durduğu iç hat: camın kalınlığı kadar içeride
const INNER = `M52 80 L148 80 C146 112 131 128 131 152 C131 172 145 186 145 203 C145 214 139 221 127 222 L73 222 C61 221 55 214 55 203 C55 186 69 172 69 152 C69 128 54 112 52 80 Z`;
// k: bardağın ölçeği; maskelenebilir ikonda güvenli alan için küçük
const art = (k, rounded) => {
  const w = 184 * k, h = 187 * k, tx = (512 - w) / 2 - 8 * k, ty = (512 - h) / 2 - 71 * k;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
<defs>
  <radialGradient id="bg" cx="50%" cy="40%" r="75%"><stop offset="0" stop-color="#2a5242"/><stop offset=".6" stop-color="#1b3a2e"/><stop offset="1" stop-color="#0e1f18"/></radialGradient>
  <linearGradient id="tea" x1="0" x2="1"><stop offset="0" stop-color="#5a1208"/><stop offset=".3" stop-color="#a0301a"/><stop offset=".52" stop-color="#c9482a"/><stop offset=".78" stop-color="#8e2412"/><stop offset="1" stop-color="#4e0f06"/></linearGradient>
  <radialGradient id="glow"><stop offset="0" stop-color="#ef7a4a" stop-opacity=".8"/><stop offset="1" stop-color="#ef7a4a" stop-opacity="0"/></radialGradient>
  <linearGradient id="porc" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="#fff"/><stop offset="1" stop-color="#d9d6cc"/></linearGradient>
  <clipPath id="g"><path d="${INNER}"/></clipPath>
</defs>
<rect width="512" height="512" rx="${rounded ? 104 : 0}" fill="url(#bg)"/>
${rounded ? `<rect x="22" y="22" width="468" height="468" rx="86" fill="none" stroke="#c9a54c" stroke-opacity=".45" stroke-width="5" stroke-dasharray="14 10"/>` : ""}
<g transform="translate(${tx.toFixed(1)} ${ty.toFixed(1)}) scale(${k})">
  <ellipse cx="100" cy="240" rx="94" ry="18" fill="#08120e" opacity=".5"/>
  <ellipse cx="100" cy="234" rx="92" ry="17" fill="url(#porc)"/>
  <ellipse cx="100" cy="234" rx="92" ry="17" fill="none" stroke="#c9a54c" stroke-width="3"/>
  <ellipse cx="100" cy="232" rx="58" ry="9.5" fill="#e4e1d8"/>
  <path d="${GLASS}" fill="#fff" fill-opacity=".1"/>
  <g clip-path="url(#g)"><rect x="40" y="98" width="120" height="130" fill="url(#tea)"/><ellipse cx="97" cy="196" rx="36" ry="22" fill="url(#glow)" opacity=".6"/><ellipse cx="100" cy="98" rx="46" ry="8" fill="#862210"/><ellipse cx="94" cy="97" rx="24" ry="3.6" fill="#d8643a" opacity=".55"/></g>
  <path d="${GLASS}" fill="none" stroke="#fff" stroke-opacity=".8" stroke-width="3"/>
  <ellipse cx="100" cy="80" rx="52" ry="9" fill="none" stroke="#fff" stroke-opacity=".85" stroke-width="2"/>
  <path d="M138 104 C137 122 126 136 126 154" stroke="#fff" stroke-opacity=".55" stroke-width="6" fill="none" stroke-linecap="round"/>
  <path d="M59 190 C56 204 60 216 68 222" stroke="#fff" stroke-opacity=".45" stroke-width="4" fill="none" stroke-linecap="round"/>
</g>
</svg>`;
};

writeFileSync(new URL("icon.svg", DIR), art(1.7, true));
const jobs = [["icon-192.png", 192, art(1.7, false)], ["icon-512.png", 512, art(1.7, false)], ["maskable-512.png", 512, art(1.3, false)], ["apple-touch-icon.png", 180, art(1.6, false)]];
for (const [name, size, svg] of jobs) {
  const html = new URL(`_${size}_${name}.html`, DIR);
  writeFileSync(html, `<!doctype html><html><body style="margin:0;background:#0e1f18">${svg.replace("<svg ", `<svg width="${size}" height="${size}" style="display:block" `)}</body></html>`);
  execFileSync(CHROME, ["--headless=new", "--mute-audio", "--disable-gpu", "--hide-scrollbars", `--window-size=${size},${size}`, `--screenshot=${fileURLToPath(new URL(name, DIR))}`, html.href], { stdio: "ignore" });
  rmSync(html);
  console.log("ikon:", name);
}
