// Sığma testi: dört telefon boyunda bütün evrak metinleri ve seçenek etiketleri kutusuna sığıyor mu,
// dikey kaydırma kazara karar veriyor mu. node tools/fit.mjs [çıktı klasörü] [adres]
import { fileURLToPath } from "node:url";
import { motor, sunucu } from "./lib/sayfa.mjs";
const srv = process.argv[3] ? null : await sunucu(); // önce `pnpm build`: dist/ sunulur
import { spawn } from "node:child_process";
import { writeFileSync, mkdirSync } from "node:fs";
const OUT = process.argv[2] || fileURLToPath(new URL("../.cache/fit/", import.meta.url)),
  PAGE = process.argv[3] || srv.url;
mkdirSync(OUT, { recursive: true });
const E = await motor();
// hatırlama metinleri (alt) de sığmalı
const texts = [...E.CARDS, ...Object.values(E.CRISES), ...Object.values(E.ENDINGS), ...E.INTRO]
  .map(c => c.text)
  .concat(E.CARDS.flatMap(c => (c.alt || []).map(a => a.text)));
const labels = [...E.CARDS, ...Object.values(E.CRISES)].flatMap(c => [c.L.t, c.R.t]);
const S = E.newGame();
let seed = 9;
const rng = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
S.rel = { bekir: -2 };
S.month = 5;
S.cur = E.materialize(E.CARD.tabela, S, rng); // uzun unvan + ruh hâli satırı: en kötü durum
const chrome = spawn(
  process.env.CHROME || "C:/Program Files/Google/Chrome/Application/chrome.exe",
  [
    "--headless=new",
    "--mute-audio",
    "--disable-gpu",
    "--hide-scrollbars",
    "--remote-debugging-port=9338",
    `--user-data-dir=${OUT}/prof`,
    "--no-first-run",
    "about:blank",
  ],
  { stdio: "ignore" },
);
const sleep = ms => new Promise(r => setTimeout(r, ms));
let ws,
  id = 0;
const pend = new Map(),
  errs = [];
const send = (m, p = {}) =>
  new Promise(r => {
    const i = ++id;
    pend.set(i, r);
    ws.send(JSON.stringify({ id: i, method: m, params: p }));
  });
const ev = async e =>
  (await send("Runtime.evaluate", { expression: e, returnByValue: true, awaitPromise: true })).result?.value;
const shot = async n => {
  const { data } = await send("Page.captureScreenshot", { format: "png" });
  writeFileSync(`${OUT}/${n}.png`, Buffer.from(data, "base64"));
};
try {
  let url;
  for (let t = 0; t < 50 && !url; t++) {
    try {
      url = (await (await fetch("http://127.0.0.1:9338/json/list")).json()).find(
        x => x.type === "page",
      )?.webSocketDebuggerUrl;
    } catch {}
    if (!url) await sleep(200);
  }
  ws = new WebSocket(url);
  await new Promise(r => ws.addEventListener("open", r));
  ws.addEventListener("message", m => {
    const d = JSON.parse(m.data);
    if (d.id && pend.has(d.id)) {
      pend.get(d.id)(d.result);
      pend.delete(d.id);
    }
    if (d.method === "Runtime.exceptionThrown") errs.push(d.params.exceptionDetails.exception?.description);
  });
  await send("Page.enable");
  await send("Runtime.enable");
  for (const [w, h] of [
    [360, 640],
    [390, 664],
    [412, 780],
    [430, 860],
  ]) {
    await send("Emulation.setDeviceMetricsOverride", { width: w, height: h, deviceScaleFactor: 1, mobile: true });
    await send("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 1 });
    await send("Page.navigate", { url: PAGE });
    await sleep(1000);
    await ev(
      `localStorage.setItem("cb.save", ${JSON.stringify(JSON.stringify(S))}); localStorage.setItem("cb.introSeen","true"); location.reload()`,
    );
    await sleep(1400);
    await ev(
      `new Promise(r => { document.querySelector("#btn-resume").click(); const t0 = Date.now(), k = () => (!document.querySelector("#scr-title").hidden && Date.now() - t0 < 4000 ? setTimeout(k, 50) : setTimeout(r, 300)); k(); })`,
    ); // menüden giriş geçişi bitene kadar
    const r = await ev(`(() => {
      const b = document.querySelector("#card .body"), texts = ${JSON.stringify(texts)}, labels = ${JSON.stringify(labels)};
      const orig = b.textContent; let over = [];
      for (const t of texts) { b.textContent = t; if (b.scrollHeight > b.clientHeight + 1) over.push(t.slice(0, 40)); }
      b.textContent = orig;
      const ch = document.querySelector("#ch-L"), tl = ch.querySelector(".t"), nn = ch.querySelector(".n"), o0 = tl.textContent, n0 = nn.textContent;
      nn.textContent = "her ay Kasa −2, 8 ay"; let lab = [];
      for (const t of labels) { tl.textContent = t; if (ch.scrollHeight > ch.clientHeight + 1) lab.push(t); }
      tl.textContent = o0; nn.textContent = n0;
      return { root: getComputedStyle(document.documentElement).fontSize, bodyFont: getComputedStyle(b).fontSize, bodyH: b.clientHeight, taşanMetin: over.length, örnek: over.slice(0, 3), taşanEtiket: lab.length, etiketler: [...new Set(lab)].slice(0, 4) };
    })()`);
    console.log(`${w}x${h}`, JSON.stringify(r));
    await shot(`${w}x${h}`);
  }
} catch (e) {
  console.log("HATA", e.message);
} finally {
  console.log(errs.length ? errs.join("\n") : "hata yok");
  try {
    ws.close();
  } catch {}
  chrome.kill();
  setTimeout(() => process.exit(0), 300);
}
