// Meydan sahnesinin hareketsiz kareleri: menüde canlı SVG yerine resim kullanılır (tarayıcıyı yormasın diye).
// Her palet için üç kare yazar:
//   meydan-<palet>-base.png     1344×752, yazısız ve bayraksız (SDXL girdisi: yazıyı ve bayrağı bozmasın)
//   meydan-<palet>-over@2x.png  2688×1504, yalnız yazılar ve bayrak, saydam zemin (SDXL çıktısının üstüne basılır)
//   meydan-<palet>-full@2x.png  2688×1504, hepsi bir arada (SDXL'siz yedek)
// node tools/meydan-render.mjs [çıktı klasörü]
import { spawn } from "node:child_process";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";

const OUT = process.argv[2] || fileURLToPath(new URL("../.cache/meydan-render/", import.meta.url));
mkdirSync(OUT, { recursive: true });
const SRC = readFileSync(new URL("./meydan.js", import.meta.url), "utf8");
const FONTS = readFileSync(new URL("../web-src/fonts.css", import.meta.url), "utf8")
  .replace(/url\(fonts\//g, `url(${new URL("../web-src/fonts/", import.meta.url).href}`);
export const W = 1344, H = 752; // SDXL'in 16:9'a en yakın kovası (8'in katı); çıktı bunun iki katı
const html = `<!doctype html><html lang="tr"><head><meta charset="utf-8"><style>${FONTS}
html, body { margin: 0; height: 100%; overflow: hidden; background: #000; }
#m { position: fixed; inset: 0; overflow: hidden; }
.base #m :is(text, .md-flg) { visibility: hidden; }
.over, .over body { background: transparent; }
.over #m svg * { visibility: hidden; }
.over #m svg :is(text, .md-flg, .md-flg *) { visibility: visible; }
</style></head><body><div id="m"></div>
<script>${SRC}
window.kur = pal => {
  const m = document.getElementById("m");
  m.innerHTML = meydanSVG();
  const svg = m.querySelector("svg");
  svg.classList.add("md-rm"); // bütün hareketler ilk karede donar
  for (const c of [...svg.classList]) if (c.startsWith("md-t-")) svg.classList.remove(c);
  svg.classList.add("md-t-" + pal);
};
</script></body></html>`;
writeFileSync(OUT + "/render.html", html);

const CHROME = process.env.CHROME || "C:/Program Files/Google/Chrome/Application/chrome.exe", PORT = 9364;
const chrome = spawn(CHROME, ["--headless=new", "--mute-audio", "--hide-scrollbars", `--remote-debugging-port=${PORT}`, `--user-data-dir=${OUT}/profile`, "--no-first-run", "--allow-file-access-from-files", "about:blank"], { stdio: "ignore" });
const sleep = ms => new Promise(r => setTimeout(r, ms));
let ws, id = 0; const pend = new Map(), errors = [];
const send = (m, p = {}) => new Promise((res, rej) => { const i = ++id; pend.set(i, { res, rej }); ws.send(JSON.stringify({ id: i, method: m, params: p })); });
const ev = async e => { const r = await send("Runtime.evaluate", { expression: e, returnByValue: true, awaitPromise: true }); if (r.exceptionDetails) errors.push(e + " → " + r.exceptionDetails.text); return r.result?.value; };
const shot = async name => { const { data } = await send("Page.captureScreenshot", { format: "png" }); writeFileSync(`${OUT}/${name}.png`, Buffer.from(data, "base64")); console.log("kare:", name); };
try {
  let url; for (let t = 0; t < 50 && !url; t++) { try { url = (await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json()).find(x => x.type === "page")?.webSocketDebuggerUrl; } catch { } if (!url) await sleep(200); }
  ws = new WebSocket(url); await new Promise(r => ws.addEventListener("open", r));
  ws.addEventListener("message", m => { const d = JSON.parse(m.data); if (d.id && pend.has(d.id)) { const p = pend.get(d.id); pend.delete(d.id); d.error ? p.rej(new Error(d.error.message)) : p.res(d.result); } if (d.method === "Runtime.exceptionThrown") errors.push(d.params.exceptionDetails.exception?.description || d.params.exceptionDetails.text); });
  await send("Runtime.enable"); await send("Page.enable");
  await send("Page.navigate", { url: new URL("file:///" + OUT.replace(/\\/g, "/") + "/render.html").href }); await sleep(1200);
  await ev(`document.fonts.ready.then(() => 1)`);
  for (const pal of ["aksam", "gece", "gun"]) {
    await ev(`kur(${JSON.stringify(pal)})`); await sleep(300);
    await send("Emulation.setDeviceMetricsOverride", { width: W, height: H, deviceScaleFactor: 1, mobile: false });
    await send("Emulation.setDefaultBackgroundColorOverride", {});
    await ev(`document.documentElement.className = "base"`); await sleep(250); await shot(`meydan-${pal}-base`);
    await send("Emulation.setDeviceMetricsOverride", { width: W, height: H, deviceScaleFactor: 2, mobile: false });
    await ev(`document.documentElement.className = ""`); await sleep(250); await shot(`meydan-${pal}-full@2x`);
    await send("Emulation.setDefaultBackgroundColorOverride", { color: { r: 0, g: 0, b: 0, a: 0 } });
    await ev(`document.documentElement.className = "over"`); await sleep(250); await shot(`meydan-${pal}-over@2x`);
  }
} catch (e) { errors.push(e.message); }
finally { console.log(errors.length ? errors.join("\n") : "hata yok"); try { ws?.close(); } catch { } chrome.kill(); setTimeout(() => process.exit(errors.length ? 1 : 0), 300); }
