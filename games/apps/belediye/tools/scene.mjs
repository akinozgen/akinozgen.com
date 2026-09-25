// Sahne testi: motorla belirli bir oyun durumu kurar, sayfaya kayıt olarak yükler, önizleme ekran görüntüsü alır.
// node tools/scene.mjs [çıktı klasörü] [adres]
import { spawn } from "node:child_process";
import { writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { motor, sunucu } from "./lib/sayfa.mjs";
const srv = process.argv[3] ? null : await sunucu(); // önce `pnpm build`: dist/ sunulur

const OUT = process.argv[2] || fileURLToPath(new URL("../.cache/scene/", import.meta.url));
mkdirSync(OUT, { recursive: true });
const E = await motor();

// Durum: 2. yıl, kasa dipte, Sevim Hanım'la aralar bozuk, üç karar yürürlükte
const S = E.newGame();
Object.assign(S.m, { h: 62, k: 17, e: 71, a: 40 });
S.month = 22; S.signed = 21; S.cay = 2;
S.rel = { sevim: -2, muhtar: 2, bekir: 1 };
E.addPol(S, { id: "kredi", ad: "Kredi taksiti", e: [0, -2, 0, 0], ay: 5 });
E.addPol(S, { id: "tribun", ad: "Tribün inşaatı", e: [0, -1, 0, 0], ay: 2, done: [8, 0, 3, 0] });
E.addPol(S, { id: "kira", ad: "Güncel dükkân kiraları", e: [0, 1, 0, 0] });
let seed = 7; const rng = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
S.cur = E.materialize(E.CARD.maas, S, rng);

const CHROME = process.env.CHROME || "C:/Program Files/Google/Chrome/Application/chrome.exe", PORT = 9334;
const chrome = spawn(CHROME, ["--headless=new", "--mute-audio", "--disable-gpu", "--hide-scrollbars", `--remote-debugging-port=${PORT}`, `--user-data-dir=${OUT}/profile`, "--no-first-run", "about:blank"], { stdio: "ignore" });
const sleep = ms => new Promise(r => setTimeout(r, ms));
let ws, id = 0; const pending = new Map(), errors = [];
const send = (method, params = {}) => new Promise((res, rej) => { const i = ++id; pending.set(i, { res, rej }); ws.send(JSON.stringify({ id: i, method, params })); });
const ev = async expr => (await send("Runtime.evaluate", { expression: expr, returnByValue: true, awaitPromise: true })).result?.value;
const shot = async name => { const { data } = await send("Page.captureScreenshot", { format: "png" }); writeFileSync(`${OUT}/${name}.png`, Buffer.from(data, "base64")); console.log("görüntü:", name); };
try {
  let url; for (let t = 0; t < 50 && !url; t++) { try { url = (await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json()).find(x => x.type === "page")?.webSocketDebuggerUrl; } catch { } if (!url) await sleep(200); }
  ws = new WebSocket(url); await new Promise(r => ws.addEventListener("open", r));
  ws.addEventListener("message", m => { const d = JSON.parse(m.data); if (d.id && pending.has(d.id)) { const p = pending.get(d.id); pending.delete(d.id); d.error ? p.rej(new Error(d.error.message)) : p.res(d.result); } if (d.method === "Runtime.exceptionThrown") errors.push(d.params.exceptionDetails.exception?.description || d.params.exceptionDetails.text); });
  await send("Runtime.enable"); await send("Page.enable");
  await send("Emulation.setDeviceMetricsOverride", { width: 400, height: 820, deviceScaleFactor: 1, mobile: true });
  const page = process.argv[3] || srv.url;
  await send("Page.navigate", { url: page }); await sleep(1200);
  await ev(`localStorage.setItem("cb.save", ${JSON.stringify(JSON.stringify(S))}); localStorage.setItem("cb.introSeen", "true"); location.reload()`);
  await sleep(2000);
  await ev(`new Promise(r => { document.querySelector("#btn-resume").click(); const t0 = Date.now(), k = () => (!document.querySelector("#scr-title").hidden && Date.now() - t0 < 4000 ? setTimeout(k, 50) : setTimeout(r, 300)); k(); })`); // menüden giriş geçişi bitene kadar
  const tr = () => ev(`(() => { const t = document.querySelector(".ongo-track"); return t.className + " " + getComputedStyle(t).transform; })()`);
  console.log("şerit:", await tr()); await sleep(1000); console.log("şerit:", await tr());
  await ev(`document.querySelector("#btn-danis").click()`); await sleep(400);
  await shot("s0-fikret");
  console.log("Fikret:", await ev(`document.querySelector("#note span")?.textContent`));
  await ev(`document.querySelector("#note")?.click()`); await sleep(200);
  const b = await ev(`(() => { const r = document.querySelector("#ch-R").getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; })()`);
  await send("Input.dispatchMouseEvent", { type: "mouseMoved", x: b[0], y: b[1] }); await sleep(400);
  await shot("s1-onizleme");
  await send("Input.dispatchMouseEvent", { type: "mousePressed", x: b[0], y: b[1], button: "left", clickCount: 1 });
  await send("Input.dispatchMouseEvent", { type: "mouseReleased", x: b[0], y: b[1], button: "left", clickCount: 1 });
  await sleep(700);
  await shot("s2-karar");
} catch (e) { errors.push("TEST: " + e.message); }
finally { console.log(errors.length ? errors.join("\n") : "hata yok"); try { ws?.close(); } catch { } chrome.kill(); setTimeout(() => process.exit(0), 300); }
