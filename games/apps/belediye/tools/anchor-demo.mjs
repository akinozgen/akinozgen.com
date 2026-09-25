// Spiker stüdyosu gösterisi: src/anchor.ts'i 960×540 ve 360×203 (telefon) kutularına kurar, senaryoyu oynatır,
// başsız Chrome ile ekran görüntüleri alır. Çıktı: .cache/anchor/demo.html + *.png
// node tools/anchor-demo.mjs [çıktı klasörü]
import { spawn } from "node:child_process";
import { writeFileSync, mkdirSync, rmSync, readdirSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { betik, FONTS } from "./lib/sayfa.mjs";
const OUT = process.argv[2] || fileURLToPath(new URL("../.cache/anchor/", import.meta.url));
mkdirSync(OUT, { recursive: true });
for (const f of readdirSync(OUT)) if (f.endsWith(".png")) rmSync(OUT + "/" + f);
const SRC = betik("anchor");
const html = `<!doctype html><html lang="tr"><head><meta charset="utf-8"><title>KTV stüdyo gösterisi</title>
<style>${FONTS}
body { margin: 0; padding: 20px; background: radial-gradient(120% 80% at 50% 0%, #1d2b3f, #0b111b); font: 14px "Barlow Condensed", sans-serif; color: #ecd592; }
.box { position: relative; border-radius: 10px; overflow: hidden; box-shadow: 0 0 0 3px #8a6a26, 0 12px 30px rgba(0,0,0,.5); }
#big { width: 960px; height: 540px; } #small { width: 360px; height: 203px; margin-top: 22px; }
#log { position: absolute; left: 404px; top: 584px; font-size: 22px; letter-spacing: .08em; }
</style></head><body>
<div class="box" id="big"></div><div class="box" id="small"></div><div id="log"></div>
<script>${SRC}
document.getElementById("big").innerHTML = studioSVG();
document.getElementById("small").innerHTML = studioSVG();
window.A = studio(document.getElementById("big")); window.B = studio(document.getElementById("small"));
window.both = (m, ...a) => { A[m](...a); B[m](...a); document.getElementById("log").textContent = m + " " + a.join(" "); };
</script></body></html>`;
writeFileSync(OUT + "/demo.html", html);

const CHROME = process.env.CHROME || "C:/Program Files/Google/Chrome/Application/chrome.exe", PORT = 9361;
const chrome = spawn(CHROME, ["--headless=new", "--mute-audio", "--disable-gpu", "--hide-scrollbars", `--remote-debugging-port=${PORT}`, `--user-data-dir=${OUT}/profile`, "--no-first-run", "--allow-file-access-from-files", "about:blank"], { stdio: "ignore" });
const sleep = ms => new Promise(r => setTimeout(r, ms));
let ws, id = 0; const pend = new Map(), errors = [];
const send = (m, p = {}) => new Promise((res, rej) => { const i = ++id; pend.set(i, { res, rej }); ws.send(JSON.stringify({ id: i, method: m, params: p })); });
const ev = async e => { const r = await send("Runtime.evaluate", { expression: e, returnByValue: true, awaitPromise: true }); if (r.exceptionDetails) errors.push("İFADE: " + e + " → " + (r.exceptionDetails.exception?.description || r.exceptionDetails.text)); return r.result?.value; };
const shot = async (name, clip) => {
  const { data } = await send("Page.captureScreenshot", { format: "png", ...(clip ? { clip: { ...clip, scale: clip.scale || 1 } } : {}) });
  writeFileSync(`${OUT}/${name}.png`, Buffer.from(data, "base64")); console.log("görüntü:", name);
};
const FACE = { x: 20 + 160, y: 20 + 30, width: 270, height: 270, scale: 2 }; // büyük kutuda spikerin yüzü
const FULL = { x: 0, y: 0, width: 1000, height: 805 };
try {
  let url; for (let t = 0; t < 50 && !url; t++) { try { url = (await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json()).find(x => x.type === "page")?.webSocketDebuggerUrl; } catch { } if (!url) await sleep(200); }
  ws = new WebSocket(url); await new Promise(r => ws.addEventListener("open", r));
  ws.addEventListener("message", m => { const d = JSON.parse(m.data); if (d.id && pend.has(d.id)) { const p = pend.get(d.id); pend.delete(d.id); d.error ? p.rej(new Error(d.error.message)) : p.res(d.result); } if (d.method === "Runtime.exceptionThrown") errors.push("İSTİSNA: " + (d.params.exceptionDetails.exception?.description || d.params.exceptionDetails.text)); });
  await send("Runtime.enable"); await send("Page.enable");
  await send("Emulation.setDeviceMetricsOverride", { width: 1000, height: 805, deviceScaleFactor: 1, mobile: false });
  await send("Page.navigate", { url: pathToFileURL(OUT + "/demo.html").href }); await sleep(900);
  await ev(`document.fonts.ready.then(() => document.fonts.size)`);
  const info = await ev(`(() => { const s = document.querySelector("#big svg"); return { nodes: s.querySelectorAll("*").length, tick: Math.round(s.querySelector(".st-tick").getComputedTextLength()) }; })()`);
  console.log("SVG düğüm:", info.nodes, "· kayan yazı:", info.tick, "· anchor.ts:", (Buffer.byteLength(SRC) / 1024).toFixed(1), "KB");
  if (info.nodes >= 400) errors.push(`TEST: düğüm sayısı ${info.nodes} ≥ 400`);
  await sleep(300);
  await shot("00-bos", FULL); await shot("00-bos-yuz", FACE);
  // boşta davranışların kareleri: göz kırpma ve kartlara bakış (sınıf elle verilir)
  await ev(`document.querySelector("#big svg").classList.add("st-blink")`); await sleep(120); await shot("00-kirpma-yuz", FACE);
  await ev(`document.querySelector("#big svg").classList.replace("st-blink", "st-glance")`); await sleep(450); await shot("00-kartlara-bakis-yuz", FACE);
  await ev(`document.querySelector("#big svg").classList.remove("st-glance")`); await sleep(400);

  // Konuşma: farklı anlarda farklı ağız şekilleri
  await ev(`both("talk", true)`);
  for (let i = 1; i <= 4; i++) { await sleep(130 + i * 37); await shot(`01-konusma-${i}`, FACE); }
  await shot("01-konusma-tam", FULL);
  await ev(`both("talk", false)`); await sleep(300);

  for (const m of ["neutral", "excited", "shocked", "happy", "sad", "smug"]) {
    await ev(`both("mood", "${m}")`); await sleep(750);
    await shot(`02-mod-${m}`, FULL); await shot(`02-mod-${m}-yuz`, FACE);
  }
  await ev(`both("mood", "neutral")`); await sleep(500);

  await ev(`both("react", "point")`); await sleep(750); await shot("03-point", FULL);
  await sleep(1400);
  await ev(`both("react", "papers")`); await sleep(190); await shot("03-papers", FULL);
  await sleep(1100);
  await ev(`both("react", "lean")`); await sleep(700); await shot("03-lean", FULL);
  await sleep(1800);
  await ev(`both("react", "cat")`); await sleep(1300); await shot("03-cat-1-yuruyor", FULL);
  await sleep(1850); await shot("03-cat-2-kalem", FULL);
  await sleep(1500); await shot("03-cat-3-donus", FULL);
  await sleep(3000);
  await ev(`both("react", "lights")`); await sleep(125); await shot("03-lights-1", FULL);
  await sleep(160); await shot("03-lights-2", FULL);
  await sleep(1500);

  await ev(`both("setWall", "Sandıkların %37'si açıldı")`); await sleep(650); await shot("04-duvar", FULL);
  await ev(`both("setWall", "Liderlik el değiştirdi: Hacı Bekir öne geçti, çarşıda kepenkler açıldı")`); await ev(`both("year", 2039)`); await sleep(650); await shot("04-duvar-uzun", FULL);
  await ev(`both("mood", "excited"); both("say", 1500)`); await sleep(420); await shot("05-heyecanli-konusma", FULL);
  await sleep(1400);

  // Telefon boyunda altı ruh hâli yan yana (1x ve 2x piksel yoğunluğu)
  await ev(`(() => { A.stop(); B.stop(); document.body.innerHTML = '<div id="g" style="display:grid;grid-template-columns:repeat(3,360px);gap:12px"></div>';
    for (const m of ["neutral", "excited", "shocked", "happy", "sad", "smug"]) { const d = document.createElement("div"); d.className = "box"; d.style.cssText = "width:360px;height:203px"; d.innerHTML = studioSVG(); document.getElementById("g").append(d); studio(d).mood(m); } })()`);
  await send("Emulation.setDeviceMetricsOverride", { width: 1160, height: 480, deviceScaleFactor: 1, mobile: false });
  await sleep(900);
  await shot("07-modlar-telefon-1x", { x: 0, y: 0, width: 1160, height: 480 });
  await shot("07-modlar-telefon-2x", { x: 20, y: 20, width: 360 * 3 + 24, height: 203 * 2 + 12, scale: 2 });
  await send("Emulation.setDeviceMetricsOverride", { width: 1000, height: 805, deviceScaleFactor: 1, mobile: false });

  // Hareket azaltma: döngü yok, konuşurken ağız açık ve sabit
  await send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] });
  await send("Page.reload"); await sleep(900); await ev(`document.fonts.ready.then(() => 1)`);
  await ev(`both("talk", true)`); await sleep(400);
  const a = await ev(`document.querySelector("#big svg").getAttribute("class")`); await sleep(500);
  const b = await ev(`document.querySelector("#big svg").getAttribute("class")`);
  if (a !== b || !/st-v-e/.test(a) || !/st-rm/.test(a)) errors.push(`TEST: hareket azaltmada ağız sabit değil (${a} → ${b})`);
  await shot("06-azaltma-konusma", FULL);
  await ev(`both("react", "cat")`); await sleep(300); await shot("06-azaltma-kedi", FULL);
  const anims = await ev(`document.getAnimations().length`);
  if (anims) errors.push(`TEST: hareket azaltmada ${anims} animasyon çalışıyor`);
  await ev(`A.stop(); B.stop()`);
} catch (e) { errors.push("TEST: " + e.message); }
finally { console.log(errors.length ? errors.join("\n") : "hata yok"); try { ws?.close(); } catch { } chrome.kill(); setTimeout(() => process.exit(errors.length ? 1 : 0), 300); }
