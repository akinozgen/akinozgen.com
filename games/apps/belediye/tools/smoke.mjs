// Duman testi: headless Chrome'u CDP ile sürer, hataları toplar, ekran görüntüsü alır.
// node tools/smoke.mjs [çıktı klasörü] [adres]
import { spawn } from "node:child_process";
import { writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";

const OUT = process.argv[2] || fileURLToPath(new URL("../.cache/smoke/", import.meta.url));
mkdirSync(OUT, { recursive: true });
const CHROME = process.env.CHROME || "C:/Program Files/Google/Chrome/Application/chrome.exe";
const PORT = 9333;
const page = process.argv[3] || new URL("../dist/oyna.html", import.meta.url).href;
const chrome = spawn(CHROME, ["--headless=new", "--mute-audio", "--disable-gpu", "--hide-scrollbars", `--remote-debugging-port=${PORT}`, `--user-data-dir=${OUT}/profile`, "--no-first-run", "about:blank"], { stdio: "ignore" });
const sleep = ms => new Promise(r => setTimeout(r, ms));

let ws, id = 0;
const pending = new Map(), errors = [];
const send = (method, params = {}) => new Promise((res, rej) => { const i = ++id; pending.set(i, { res, rej }); ws.send(JSON.stringify({ id: i, method, params })); });
async function connect() {
  for (let t = 0; t < 50; t++) {
    try { const r = await fetch(`http://127.0.0.1:${PORT}/json/list`); const list = await r.json(); const p = list.find(x => x.type === "page"); if (p) return p.webSocketDebuggerUrl; } catch { }
    await sleep(200);
  }
  throw new Error("chrome yok");
}
const shot = async name => { const { data } = await send("Page.captureScreenshot", { format: "png" }); writeFileSync(`${OUT}/${name}.png`, Buffer.from(data, "base64")); console.log("görüntü:", name); };
const ev = async expr => (await send("Runtime.evaluate", { expression: expr, returnByValue: true, awaitPromise: true })).result?.value;
const viewport = (w, h, mobile) => send("Emulation.setDeviceMetricsOverride", { width: w, height: h, deviceScaleFactor: 1, mobile: !!mobile });
const key = k => ev(`document.dispatchEvent(new KeyboardEvent("keydown",{key:${JSON.stringify(k)},bubbles:true})) || window.dispatchEvent(new KeyboardEvent("keydown",{key:${JSON.stringify(k)}}))`);
const mouse = (type, x, y) => send("Input.dispatchMouseEvent", { type, x, y, button: "left", buttons: type === "mouseReleased" ? 0 : 1, clickCount: 1 });

try {
  ws = new WebSocket(await connect());
  await new Promise(r => ws.addEventListener("open", r));
  ws.addEventListener("message", m => {
    const d = JSON.parse(m.data);
    if (d.id && pending.has(d.id)) { const p = pending.get(d.id); pending.delete(d.id); d.error ? p.rej(new Error(d.error.message)) : p.res(d.result); }
    if (d.method === "Runtime.exceptionThrown") errors.push("İSTİSNA: " + (d.params.exceptionDetails.exception?.description || d.params.exceptionDetails.text));
    if (d.method === "Runtime.consoleAPICalled" && ["error", "warning"].includes(d.params.type)) errors.push("KONSOL: " + d.params.args.map(a => a.value ?? a.description).join(" "));
    if (d.method === "Log.entryAdded" && d.params.entry.level === "error") errors.push("LOG: " + d.params.entry.text);
  });
  await send("Runtime.enable"); await send("Log.enable"); await send("Page.enable");

  await viewport(400, 820, true);
  await send("Page.navigate", { url: page }); await sleep(2500);
  await shot("1-baslik-telefon");
  // vesikalık seçimi: üçüncüyü seç, başlıkta resim ve ad değişsin
  await ev(`document.querySelector("#btn-avatar").click()`); await sleep(700);
  await shot("1b-vesikalik-telefon");
  await ev(`document.querySelectorAll("#picks .pick")[2].click()`); await sleep(400);
  const av = JSON.parse(await ev(`JSON.stringify({ ls: localStorage.getItem("cb.avatar"), ph: document.querySelector("#in-name").placeholder, pick: document.querySelectorAll("#picks .pick b")[2].textContent, same: document.querySelector("#avatar-img").src === document.querySelectorAll("#picks .pick img")[2].src, title: !document.querySelector("#scr-title").hidden })`));
  if (av.ls !== '"baskan-03"' || av.ph !== av.pick || !av.same || !av.title) errors.push("TEST: vesikalık seçimi başlığa yansımadı " + JSON.stringify(av));
  console.log("vesikalık:", av.ph);
  await ev(`document.querySelector("#btn-start").click()`); await sleep(900);
  await shot("2-intro-telefon");
  for (let i = 0; i < 3; i++) { await key("ArrowRight"); await sleep(1300); }
  // yarım sürükleme: mühür görünsün
  const r = await ev(`(() => { const b = document.querySelector("#card").getBoundingClientRect(); return [b.x + b.width/2, b.y + b.height/2]; })()`);
  await mouse("mousePressed", r[0], r[1]); await mouse("mouseMoved", r[0] - 40, r[1]); await mouse("mouseMoved", r[0] - 95, r[1] + 4); await sleep(250);
  await shot("3-surukle-telefon");
  await mouse("mouseMoved", r[0] - 180, r[1] + 6); await mouse("mouseReleased", r[0] - 180, r[1] + 6); await sleep(620);
  await shot("3b-karar-ani-telefon"); await sleep(900);
  // oyun bitene kadar hep sağa
  let n = 0;
  while (n++ < 160) {
    const scr = await ev(`["title","game","over","wall","secim"].find(s => !document.querySelector("#scr-" + s).hidden)`);
    // seçime denk gelinirse: sayımı atla, sonuçtan devam et
    if (scr === "secim") { await key("Enter"); await sleep(700); await key("Enter"); await sleep(900); console.log("seçim gecesi geçildi"); continue; }
    if (scr !== "game") break;
    if (n === 14) {
      await shot("4-oyun-telefon");
      // olay günlüğü: dar ekranda çekmece açılır, kayıtlar orada, Escape kapatır
      await ev(`document.querySelector("#btn-log").click()`); await sleep(450);
      await shot("4b-gunluk-telefon");
      const lg = JSON.parse(await ev(`JSON.stringify({ open: document.querySelector("#log").classList.contains("open"), n: document.querySelectorAll("#log-list .lg-e").length })`));
      if (!lg.open || lg.n < 5) errors.push("TEST: olay günlüğü açılmadı ya da boş " + JSON.stringify(lg));
      await key("Escape"); await sleep(350);
      if (await ev(`document.querySelector("#log").classList.contains("open")`)) errors.push("TEST: günlük Escape ile kapanmadı");
    }
    await key(n % 3 ? "ArrowRight" : "ArrowLeft"); await sleep(950);
  }
  console.log("kart sayısı:", n);
  await sleep(900);
  await shot("5-gazete-telefon");
  await ev(`document.querySelector("#btn-wall2").click()`); await sleep(700);
  await shot("6-duvar-telefon");
  const hall = JSON.parse(await ev(`localStorage.getItem("cb.hall")`) || "[]");
  if (!hall.some(r => r.avatar === "baskan-03")) errors.push("TEST: duvara seçilen vesikalık yazılmadı " + JSON.stringify(hall.map(r => r.avatar)));

  await viewport(1280, 820, false);
  await ev(`document.querySelector("#btn-back").click()`); await sleep(400);
  await ev(`document.querySelector("#btn-again").click()`); await sleep(1200);
  await shot("7-oyun-masaustu");
  await ev(`document.querySelector("#btn-menu").click()`); await sleep(600);
  await shot("8-baslik-masaustu");
  await ev(`document.querySelector("#btn-avatar").click()`); await sleep(600);
  await shot("8b-vesikalik-masaustu");
  await key("Escape"); await sleep(300);
  await ev(`document.querySelector("#btn-help").click()`); await sleep(500);
  await shot("9-genelge-masaustu");
  const sw = await ev(`(async () => { const r = await navigator.serviceWorker?.getRegistration(); const k = self.caches ? await caches.keys() : []; const fonts = [...document.fonts].filter(f => f.status === "loaded").map(f => f.family.replace(/"/g, "") + " " + f.weight + (f.style === "italic" ? "i" : "")); return JSON.stringify({ sw: !!r, active: !!r?.active, caches: k, fonts: [...new Set(fonts)] }); })()`);
  console.log("sw/fontlar:", sw);
  const ls = await ev(`JSON.stringify(Object.keys(localStorage))`);
  console.log("localStorage:", ls);
} catch (e) { errors.push("TEST: " + e.message); }
finally {
  console.log(errors.length ? errors.join("\n") : "hata yok");
  try { ws?.close(); } catch { }
  chrome.kill();
  setTimeout(() => process.exit(0), 300);
}
