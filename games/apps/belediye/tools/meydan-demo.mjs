// Ana menü meydanı gösterisi: tools/meydan.js'i tam ekran kurar, üstüne sahte menü katmanı koyar (yatayda sol %36,
// dikeyde alt %55 koyu geçiş), başsız Chrome ile her boy × her palet için ekran görüntüsü ve enter() kareleri alır.
// Çıktı: .cache/meydan/demo.html + *.png · node tools/meydan-demo.mjs [çıktı klasörü]
import { spawn } from "node:child_process";
import { readFileSync, writeFileSync, mkdirSync, rmSync, readdirSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { FONTS } from "./lib/sayfa.mjs";
const OUT = process.argv[2] || fileURLToPath(new URL("../.cache/meydan/", import.meta.url));
mkdirSync(OUT, { recursive: true });
for (const f of readdirSync(OUT)) if (f.endsWith(".png")) rmSync(OUT + "/" + f);
const SRC = readFileSync(new URL("./meydan.js", import.meta.url), "utf8");
const html = `<!doctype html><html lang="tr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Meydan gösterisi</title>
<style>${FONTS}
html, body { margin: 0; height: 100%; overflow: hidden; background: #0e1f18; }
#m { position: fixed; inset: 0; overflow: hidden; }
#menu { position: fixed; inset: 0; pointer-events: none; color: #ecd592; font-family: "Barlow Condensed", sans-serif; }
.pan { position: absolute; left: 0; top: 0; bottom: 0; width: 36%; box-sizing: border-box; padding: 9vh 3vw;
  background: linear-gradient(90deg, rgba(6,14,11,.94) 0%, rgba(6,14,11,.86) 64%, rgba(6,14,11,0) 100%); }
.logo { font: 400 clamp(26px, 3.6vw, 90px)/.92 "Alfa Slab One", serif; color: #f3f2ec; text-shadow: 0 2px 10px rgba(0,0,0,.45); }
.logo span { display: block; color: #c9a54c; font-size: .62em; margin-top: .12em; }
.items { margin-top: 7vh; display: grid; gap: 1.8vh; justify-items: start; font: 700 clamp(15px, 1.5vw, 34px)/1 "Barlow Condensed", sans-serif; letter-spacing: .14em; text-transform: uppercase; }
.items div { padding: .6em .9em; border: 1px solid rgba(236,213,146,.5); border-radius: 4px; }
.items div:first-child { color: #2a1d08; background: linear-gradient(180deg, #efd894, #c9a54c 48%, #a8852f); border-color: #6d531d; }
@media (orientation: portrait) {
  .pan { width: auto; right: 0; top: auto; height: 55%; padding: 17vh 8vw 5vh;
    background: linear-gradient(0deg, rgba(6,14,11,.96) 0%, rgba(6,14,11,.9) 62%, rgba(6,14,11,0) 100%); }
  .logo { position: fixed; top: 4.5vh; left: 0; right: 0; text-align: center; font-size: 10.5vw; }
  .items { margin: 0; justify-items: stretch; text-align: center; font-size: 4.6vw; }
}
</style></head><body>
<div id="m"></div>
<div id="menu"><div class="pan"><div class="logo">Çaylar<span>Belediyeden</span></div>
<div class="items"><div>Göreve başla</div><div>Onur listesi</div><div>Eski başkanlar</div><div>Ayarlar</div></div></div></div>
<script>${SRC}
document.getElementById("m").innerHTML = meydanSVG();
window.M = meydan(document.getElementById("m"), { hour: 18 });
</script></body></html>`;
writeFileSync(OUT + "/demo.html", html);

const CHROME = process.env.CHROME || "C:/Program Files/Google/Chrome/Application/chrome.exe", PORT = 9363;
const chrome = spawn(CHROME, ["--headless=new", "--mute-audio", "--hide-scrollbars", `--remote-debugging-port=${PORT}`, `--user-data-dir=${OUT}/profile`, "--no-first-run", "--allow-file-access-from-files", "about:blank"], { stdio: "ignore" });
const sleep = ms => new Promise(r => setTimeout(r, ms));
let ws, id = 0; const pend = new Map(), errors = [];
const send = (m, p = {}) => new Promise((res, rej) => { const i = ++id; pend.set(i, { res, rej }); ws.send(JSON.stringify({ id: i, method: m, params: p })); });
const ev = async e => { const r = await send("Runtime.evaluate", { expression: e, returnByValue: true, awaitPromise: true }); if (r.exceptionDetails) errors.push("İFADE: " + e + " → " + (r.exceptionDetails.exception?.description || r.exceptionDetails.text)); return r.result?.value; };
const shot = async (name, clip) => {
  const { data } = await send("Page.captureScreenshot", { format: "png", ...(clip ? { clip: { ...clip, scale: clip.scale || 1 } } : {}) });
  writeFileSync(`${OUT}/${name}.png`, Buffer.from(data, "base64")); console.log("görüntü:", name);
};
// 1920×1080'de CSS pikseli = viewBox birimi: yakın plan kutuları doğrudan sahne koordinatı
const CLIPS = { bina: { x: 700, y: 120, width: 530, height: 400, scale: 2 }, makam: { x: 900, y: 240, width: 120, height: 130, scale: 5 }, tekir: { x: 920, y: 400, width: 100, height: 80, scale: 5 },
  amcalar: { x: 1420, y: 600, width: 320, height: 220, scale: 3 }, ocak: { x: 1200, y: 350, width: 230, height: 190, scale: 3 }, anit: { x: 740, y: 660, width: 440, height: 300, scale: 2 }, sag: { x: 1400, y: 160, width: 520, height: 400, scale: 2 } };
const view = (width, height, dpr = 1, mobile = false) => send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: dpr, mobile });
const SIZES = [[1920, 1080, 1], [1280, 800, 1], [2560, 1080, 1], [390, 844, 2, true], [360, 640, 2, true]];
const HOURS = { aksam: 18, gece: 23, gun: 11 };
try {
  let url; for (let t = 0; t < 50 && !url; t++) { try { url = (await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json()).find(x => x.type === "page")?.webSocketDebuggerUrl; } catch { } if (!url) await sleep(200); }
  ws = new WebSocket(url); await new Promise(r => ws.addEventListener("open", r));
  ws.addEventListener("message", m => {
    const d = JSON.parse(m.data);
    if (d.id && pend.has(d.id)) { const p = pend.get(d.id); pend.delete(d.id); d.error ? p.rej(new Error(d.error.message)) : p.res(d.result); }
    if (d.method === "Runtime.exceptionThrown") errors.push("İSTİSNA: " + (d.params.exceptionDetails.exception?.description || d.params.exceptionDetails.text));
    if (d.method === "Runtime.consoleAPICalled" && d.params.type === "error") errors.push("KONSOL: " + d.params.args.map(a => a.value ?? a.description).join(" "));
  });
  await send("Runtime.enable"); await send("Page.enable");
  await view(1920, 1080);
  await send("Page.navigate", { url: pathToFileURL(OUT + "/demo.html").href }); await sleep(900);
  await ev(`document.fonts.ready.then(() => document.fonts.size)`);
  const info = await ev(`(() => { const s = document.querySelector("svg.md-root"), t = s.querySelector(".md-f1");
    return { nodes: s.querySelectorAll("*").length, anims: document.getAnimations().length, sign: Math.round(t.getComputedTextLength()), bytes: s.outerHTML.length }; })()`);
  console.log("SVG düğüm:", info.nodes, "· CSS animasyonu:", info.anims, "· tabela:", info.sign, "birim (bant 464) · SVG", (info.bytes / 1024).toFixed(1), "KB · meydan.js", (Buffer.byteLength(SRC) / 1024).toFixed(1), "KB");
  if (info.sign > 450) errors.push(`TEST: tabela yazısı bandı taşıyor (${info.sign})`);
  if (info.nodes >= 900) errors.push(`TEST: düğüm sayısı ${info.nodes} ≥ 900`);

  for (const [w, h, dpr, mob] of SIZES) {
    await view(w, h, dpr, !!mob); await sleep(250);
    for (const [pal, hr] of Object.entries(HOURS)) {
      await ev(`M.setHour(${hr})`); await sleep(350);
      await shot(`${w}x${h}-${pal}`);
    }
  }
  // Menü katmanı olmadan (kompozisyon kontrolü)
  await view(1920, 1080); await ev(`document.getElementById("menu").hidden = true; M.setHour(18)`); await sleep(300); await shot("bos-1920x1080-aksam");
  await ev(`M.setHour(23)`); await sleep(300); await shot("bos-1920x1080-gece");
  await ev(`M.setHour(11)`); await sleep(300); await shot("bos-1920x1080-gun");
  // Yakın planlar (boşta, menüsüz)
  for (const pal of ["aksam", "gece", "gun"]) {
    await ev(`M.setHour(${HOURS[pal]})`); await sleep(150);
    for (const [k, c] of Object.entries(CLIPS)) await shot(`yakin-${k}-${pal}`, c);
  }
  await ev(`M.setHour(18)`);

  // Canlı durumlar: güvercinler havalanır, amca zar atar, traktör yolda (sınıf elle verilir, kare sabitlenir)
  await ev(`(() => { const s = document.querySelector("svg.md-root"); s.querySelector(".md-pgs").classList.add("md-fly"); s.classList.add("md-ta", "md-trkgo", "md-blink"); })()`);
  await sleep(60); await ev(`document.getAnimations().forEach(a => { const n = a.animationName; a.pause(); a.currentTime = n === "md-trk" ? 7000 : n === "md-fly1" || n === "md-fly2" || n === "md-fly3" ? 1100 : n === "md-flap" ? 60 : n === "md-shake" || n === "md-dice" ? 820 : a.currentTime; }), 1`);
  await shot("canli-1920x1080"); await shot("canli-amcalar", CLIPS.amcalar);
  // play()/pause() CSS animation-play-state'i geçersiz kılar: testlere temiz sayfayla devam
  await send("Page.reload"); await sleep(900); await ev(`document.fonts.ready.then(() => 1)`);

  // Parallaks: imleç sağ alt köşede
  await send("Input.dispatchMouseEvent", { type: "mouseMoved", x: 1900, y: 1060 }); await sleep(1400);
  const tr = await ev(`[0,1,2,3].map(i => document.querySelector(".md-l" + i).getAttribute("transform"))`);
  console.log("parallaks:", tr.join(" | "));
  if (!tr[3] || !/translate\(-1[5-8]/.test(tr[3])) errors.push("TEST: parallaks en yakın katmanda ~18 px değil: " + tr[3]);
  await send("Input.dispatchMouseEvent", { type: "mouseMoved", x: 960, y: 540 }); await sleep(1400);

  // Boşta CPU (kaba ölçü): 3 sn içinde ana iş parçacığında geçen görev süresi, çalışırken ve duraklatılmışken
  await send("Performance.enable");
  const metrics = async () => Object.fromEntries((await send("Performance.getMetrics")).metrics.map(m => [m.name, m.value]));
  const cpu = async () => { const a = await metrics(); await sleep(3000); const b = await metrics(); return Math.round((b.TaskDuration - a.TaskDuration) / (b.Timestamp - a.Timestamp) * 1000) / 10; };
  const busy = await cpu(); await ev(`M.pause()`); const idle = await cpu(); await ev(`M.resume()`);
  console.log("ana iş parçacığı:", busy, "% çalışırken ·", idle, "% duraklatılmışken");
  if (idle > 2) errors.push(`TEST: duraklatılmış sahne ana iş parçacığının %${idle}'ini kullanıyor`);

  // enter(): dört kare (animasyon zamanı sabitlenerek; menü gerçek arayüzde bu sırada kaybolur)
  await ev(`document.getElementById("menu").hidden = true; window.P = M.enter(), 1`); await sleep(30);
  for (const [i, t] of [[1, 200], [2, 450], [3, 650], [4, 850]]) {
    await ev(`document.getAnimations().forEach(a => { if (/^md-(push|fl|mkg|mkb)$/.test(a.animationName)) { a.pause(); a.currentTime = ${t}; } }), 1`);
    await sleep(80); await shot(`enter-${i}`);
  }
  await ev(`document.getAnimations().forEach(a => { if (/^md-(push|fl|mkg|mkb)$/.test(a.animationName)) a.finish(); }), 1`); await ev(`document.getElementById("menu").hidden = false`);
  const t0 = Date.now(); await ev(`P`); console.log("enter() çözüldü:", Date.now() - t0, "ms sonra (kare çekiminden sonra)");
  const running = await ev(`document.getAnimations().filter(a => a.playState === "running").length`);
  if (running) errors.push(`TEST: enter() bitince ${running} animasyon hâlâ çalışıyor`);
  await ev(`M.resume()`); await sleep(300);
  const back = await ev(`getComputedStyle(document.querySelector(".md-cam")).transform`);
  if (back !== "none") errors.push("TEST: resume() kamerayı geri almadı: " + back);

  // pause(): hiçbir animasyon ve zamanlayıcı çalışmaz
  await ev(`M.pause()`); await sleep(100);
  const p1 = await ev(`document.getAnimations().filter(a => a.playState === "running").length`);
  if (p1) errors.push(`TEST: pause() sonrası ${p1} animasyon çalışıyor`);
  await ev(`M.resume()`); await sleep(100);
  const p2 = await ev(`document.getAnimations().filter(a => a.playState === "running").length`);
  if (!p2) errors.push("TEST: resume() sonrası animasyon yok");
  console.log("çalışan animasyon: pause →", p1, "· resume →", p2);

  // Hareket azaltma: animasyon yok, enter() kısa solmayla ≤ 250 ms
  await send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] });
  await send("Page.reload"); await sleep(900); await ev(`document.fonts.ready.then(() => 1)`);
  const anims = await ev(`document.getAnimations().length`);
  if (anims) errors.push(`TEST: hareket azaltmada ${anims} animasyon var`);
  await shot("azaltma-1920x1080");
  const dt = await ev(`(() => { const t = performance.now(); return M.enter().then(() => Math.round(performance.now() - t)); })()`);
  console.log("hareket azaltmada enter():", dt, "ms");
  if (dt > 250) errors.push(`TEST: hareket azaltmada enter() ${dt} ms`);
  await ev(`M.stop()`);
} catch (e) { errors.push("TEST: " + e.message); }
finally { console.log(errors.length ? errors.join("\n") : "hata yok"); try { ws?.close(); } catch { } chrome.kill(); setTimeout(() => process.exit(errors.length ? 1 : 0), 300); }
