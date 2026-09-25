// Vesikalık resimlerini üretir: public/portraits/<kişi>.webp ve başkanlık vesikalıkları (cards.ts'teki BASKANLAR)
// node tools/portraits.mjs            yalnız eksik resimleri çizer, var olana dokunmaz
// node tools/portraits.mjs --force    hepsini tariften yeniden çizer (DİKKAT: şimdiki 3D resimlerin üstüne düz çizim yazar)
// node tools/portraits.mjs hans ayse  yalnız adı verilenleri yeniden çizer
// Resimler tools/portrait.js'teki tariflerden headless Chrome'da tuvale çizilip WebP olarak kaydedilir.
import { spawn } from "node:child_process";
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

const DIR = new URL("../public/portraits/", import.meta.url);
mkdirSync(DIR, { recursive: true });
const SIZE = 384,
  QUALITY = 0.9;
const read = p => readFileSync(new URL(p, import.meta.url), "utf8");
const { PEOPLE, BASKANLAR } = await import("../src/cards.ts");
const { portrait, mayorFace, RECIPES } = new Function(
  read("./portrait.js") + "\nreturn { portrait, mayorFace, RECIPES };",
)();

const args = process.argv.slice(2),
  force = args.includes("--force"),
  only = args.filter(a => !a.startsWith("--"));
const jobs = [
  ...Object.keys(PEOPLE).map(id => [id, RECIPES[id]]),
  ...Object.keys(BASKANLAR).map((id, i) => [id, mayorFace(i + 1)]),
].filter(([id]) => (only.length ? only.includes(id) : force || !existsSync(new URL(id + ".webp", DIR))));
for (const [id, p] of jobs)
  if (!p) {
    console.error(`tarif yok: ${id} (resmini elle public/portraits/${id}.webp olarak koyun)`);
    process.exitCode = 1;
  }
const todo = jobs.filter(([, p]) => p);
if (!todo.length) {
  console.log("eksik vesikalık yok");
  process.exit();
}

const CHROME = process.env.CHROME || "C:/Program Files/Google/Chrome/Application/chrome.exe",
  PORT = 9339;
const OUT = fileURLToPath(new URL("../.cache/portraits/", import.meta.url));
const chrome = spawn(
  CHROME,
  [
    "--headless=new",
    "--mute-audio",
    "--disable-gpu",
    `--remote-debugging-port=${PORT}`,
    `--user-data-dir=${OUT}profile`,
    "--no-first-run",
    "about:blank",
  ],
  { stdio: "ignore" },
);
const sleep = ms => new Promise(r => setTimeout(r, ms));
let ws,
  id = 0;
const pending = new Map();
const send = (method, params = {}) =>
  new Promise((res, rej) => {
    const i = ++id;
    pending.set(i, { res, rej });
    ws.send(JSON.stringify({ id: i, method, params }));
  });
// SVG'yi tuvale çizip WebP'ye çevirir
const render = async svg => {
  const r = await send("Runtime.evaluate", {
    awaitPromise: true,
    returnByValue: true,
    expression: `new Promise((ok, no) => {
    const im = new Image(); im.onerror = () => no(new Error("svg açılmadı"));
    im.onload = () => { const c = document.createElement("canvas"); c.width = c.height = ${SIZE}; c.getContext("2d").drawImage(im, 0, 0, ${SIZE}, ${SIZE}); ok(c.toDataURL("image/webp", ${QUALITY})); };
    im.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(${JSON.stringify(svg)});
  })`,
  });
  const url = r.result?.value;
  if (!url?.startsWith("data:image/webp;base64,"))
    throw new Error(r.exceptionDetails?.exception?.description || "webp üretilemedi");
  return Buffer.from(url.slice(url.indexOf(",") + 1), "base64");
};
try {
  let url;
  for (let t = 0; t < 50 && !url; t++) {
    try {
      url = (await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json()).find(
        x => x.type === "page",
      )?.webSocketDebuggerUrl;
    } catch {}
    if (!url) await sleep(200);
  }
  ws = new WebSocket(url);
  await new Promise(r => ws.addEventListener("open", r));
  ws.addEventListener("message", m => {
    const d = JSON.parse(m.data);
    if (d.id && pending.has(d.id)) {
      const p = pending.get(d.id);
      pending.delete(d.id);
      d.error ? p.rej(new Error(d.error.message)) : p.res(d.result);
    }
  });
  for (const [name, p] of todo) {
    const buf = await render(portrait(p));
    writeFileSync(new URL(name + ".webp", DIR), buf);
    console.log(`vesikalık: ${name}.webp ${(buf.length / 1024).toFixed(1)} KB`);
  }
} catch (e) {
  console.error(e.message);
  process.exitCode = 1;
} finally {
  try {
    ws?.close();
  } catch {}
  chrome.kill();
  setTimeout(() => process.exit(), 300);
}
