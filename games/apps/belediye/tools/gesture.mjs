// Hareket testi: telefonda (dokunmatik) ve masaüstünde (fare) kaydırma, dokunma, fiske ve sürüklemenin
// karar verip vermediğini ölçer. node tools/gesture.mjs [çıktı klasörü] [adres]
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
const OUT = process.argv[2] || fileURLToPath(new URL("../.cache/gesture/", import.meta.url)), PAGE = process.argv[3] || new URL("../dist/oyna.html", import.meta.url).href;
const chrome = spawn(process.env.CHROME || "C:/Program Files/Google/Chrome/Application/chrome.exe", ["--headless=new", "--mute-audio", "--disable-gpu", "--remote-debugging-port=9340", `--user-data-dir=${OUT}/gprof`, "--no-first-run", "about:blank"], { stdio: "ignore" });
const sleep = ms => new Promise(r => setTimeout(r, ms));
let ws, id = 0; const pend = new Map(), errs = [];
const send = (m, p = {}) => new Promise(r => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method: m, params: p })); });
const ev = async e => (await send("Runtime.evaluate", { expression: e, returnByValue: true, awaitPromise: true })).result?.value;
const sayi = () => ev(`document.querySelector("#card .doc-meta span").textContent`);
const center = () => ev(`(() => { const r = document.querySelector("#card").getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; })()`);
// yol: [[x,y,beklemeMs], ...]
async function touchPath(path) {
  await send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: path[0][0], y: path[0][1] }] });
  for (const [x, y, w] of path.slice(1)) { await sleep(w); await send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x, y }] }); }
  await send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
}
async function mousePath(path) {
  await send("Input.dispatchMouseEvent", { type: "mousePressed", x: path[0][0], y: path[0][1], button: "left", buttons: 1, clickCount: 1 });
  for (const [x, y, w] of path.slice(1)) { await sleep(w); await send("Input.dispatchMouseEvent", { type: "mouseMoved", x, y, button: "left", buttons: 1 }); }
  const [x, y] = path[path.length - 1];
  await send("Input.dispatchMouseEvent", { type: "mouseReleased", x, y, button: "left", buttons: 0, clickCount: 1 });
}
const line = (x0, y0, dx, dy, steps, ms) => [[x0, y0, 0], ...Array.from({ length: steps }, (_, i) => [x0 + dx * (i + 1) / steps, y0 + dy * (i + 1) / steps, ms])];
async function trial(name, fn, want) {
  const s0 = await sayi(); await fn(await center()); await sleep(1300);
  const got = (await sayi()) !== s0;
  console.log(`${got === want ? "✓" : "✗"} ${name}: karar ${got ? "verildi" : "verilmedi"} (beklenen: ${want ? "verilsin" : "verilmesin"})`);
}
try {
  let url; for (let t = 0; t < 50 && !url; t++) { try { url = (await (await fetch("http://127.0.0.1:9340/json/list")).json()).find(x => x.type === "page")?.webSocketDebuggerUrl; } catch { } if (!url) await sleep(200); }
  ws = new WebSocket(url); await new Promise(r => ws.addEventListener("open", r));
  ws.addEventListener("message", m => { const d = JSON.parse(m.data); if (d.id && pend.has(d.id)) { pend.get(d.id)(d.result); pend.delete(d.id); } if (d.method === "Runtime.exceptionThrown") errs.push(d.params.exceptionDetails.exception?.description); });
  await send("Page.enable"); await send("Runtime.enable");
  await send("Emulation.setDeviceMetricsOverride", { width: 390, height: 664, deviceScaleFactor: 1, mobile: true });
  await send("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 1 });
  await send("Page.navigate", { url: PAGE }); await sleep(1500);
  await ev(`localStorage.setItem("cb.introSeen","true"); document.querySelector("#btn-start").click()`); await sleep(1200);
  console.log("interact yüklü:", await ev(`!!window.interact`));
  console.log("— telefon (dokunmatik)");
  await trial("dikey hızlı kaydırma", ([x, y]) => touchPath(line(x, y - 100, 20, 220, 6, 16)), false);
  await trial("dokunma", ([x, y]) => touchPath([[x, y, 0], [x + 2, y, 60]]), false);
  await trial("kısa yavaş sürükleme (60px, 600ms, bekle)", ([x, y]) => touchPath([...line(x, y, -60, 3, 10, 60), [x - 60, y + 3, 250]]), false);
  await trial("kısa hızlı fiske sola (60px, ~50ms)", ([x, y]) => touchPath(line(x, y, -60, 4, 4, 0)), true);
  await trial("kısa hızlı fiske sağa (50px)", ([x, y]) => touchPath(line(x, y, 50, -3, 4, 0)), true);
  await trial("uzun yavaş sürükleme (150px)", ([x, y]) => touchPath([...line(x, y, 150, 5, 15, 40), [x + 150, y + 5, 200]]), true);
  await trial("çapraz ama yatayı ağır basan fiske", ([x, y]) => touchPath(line(x, y, -80, 35, 4, 0)), true);
  console.log("— masaüstü (fare)");
  await send("Emulation.setTouchEmulationEnabled", { enabled: false });
  await send("Emulation.setDeviceMetricsOverride", { width: 1600, height: 900, deviceScaleFactor: 1, mobile: false });
  await sleep(600);
  await trial("fare uzun sürükleme", ([x, y]) => mousePath([...line(x, y, -200, 0, 12, 25), [x - 200, y, 150]]), true);
  await trial("fare hızlı fiske", ([x, y]) => mousePath(line(x, y, 70, 0, 4, 0)), true);
  await trial("fare tıklama", ([x, y]) => mousePath([[x, y, 0], [x, y, 50]]), false);
} catch (e) { console.log("HATA", e.message); } finally { console.log(errs.length ? errs.join("\n") : "hata yok"); try { ws.close(); } catch { } chrome.kill(); setTimeout(() => process.exit(0), 300); }
