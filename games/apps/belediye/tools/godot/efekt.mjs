// (gorsel.mjs'den alınan düzenek): tarayıcıda (derlenmiş dist/) çizilen arayüzden
//   assets/icon/*.svg   gösterge simgeleri, mühür, ataç, araç düğmeleri, imzalar (renkler SVG'ye gömülü)
//   assets/ui/*.png     @2x, şeffaf zemin: evrak kâğıdı (9-slice, kenarlar .9.json), damga çerçeveleri, MÜHÜRLÜ rozeti
//   assets/ui/meydan/   menü sahnesi resimleri, assets/ui/portre/ vesikalıklar (dosyalar aynen)
//   data/_stil.json     StyleBoxFlat için: CSS değişkenleri ve bileşenlerin hesaplanmış stilleri
//   ref/*.png           1280 genişlikte ekran görüntüleri (düzen referansı)
// node tools/godot/gorsel.mjs <godot proje klasörü>   (önce pnpm build)
import { spawn } from "node:child_process";
import { cpSync, mkdirSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { motor, sunucu, CHROME_YOLU } from "../lib/sayfa.mjs";

const PROJE = process.argv[2];
if (!PROJE) throw new Error("Godot proje klasörünü ver");
const D = {
  icon: join(PROJE, "assets/icon"),
  ui: join(PROJE, "assets/ui"),
  ref: join(PROJE, "ref"),
  data: join(PROJE, "data"),
};
for (const d of Object.values(D)) mkdirSync(d, { recursive: true });
const APP = fileURLToPath(new URL("../../", import.meta.url));

const E = await motor();
const srv = await sunucu();
const PORT = 9388;
const PROFIL = fileURLToPath(new URL("../../.cache/godot-gorsel/", import.meta.url));
mkdirSync(PROFIL, { recursive: true });
const chrome = spawn(
  CHROME_YOLU,
  [
    "--headless=new",
    "--mute-audio",
    "--disable-gpu",
    "--hide-scrollbars",
    `--remote-debugging-port=${PORT}`,
    `--user-data-dir=${PROFIL}`,
    "--no-first-run",
    "about:blank",
  ],
  { stdio: "ignore" },
);
const sleep = ms => new Promise(r => setTimeout(r, ms));
let ws,
  id = 0;
const pend = new Map();
const send = (m, p = {}) =>
  new Promise((res, rej) => {
    const i = ++id;
    pend.set(i, { res, rej });
    ws.send(JSON.stringify({ id: i, method: m, params: p }));
  });
const ev = async e =>
  (await send("Runtime.evaluate", { expression: e, returnByValue: true, awaitPromise: true })).result?.value;
const boyut = (w, h, dpr = 1, mobil = false) =>
  send("Emulation.setDeviceMetricsOverride", { width: w, height: h, deviceScaleFactor: dpr, mobile: mobil });
// seçicideki öğenin görüntüsü (şeffaf zemin, @2x)
async function kirp(secici, dosya, pay = 0) {
  const r = JSON.parse(
    await ev(
      `JSON.stringify((() => { const b = document.querySelector(${JSON.stringify(secici)}).getBoundingClientRect(); return { x: b.x, y: b.y, w: b.width, h: b.height }; })())`,
    ),
  );
  const { data } = await send("Page.captureScreenshot", {
    format: "png",
    captureBeyondViewport: true,
    clip: { x: r.x - pay, y: r.y - pay, width: r.w + 2 * pay, height: r.h + 2 * pay, scale: 1 },
  });
  writeFileSync(dosya, Buffer.from(data, "base64"));
  return r;
}
// yalnız seçilen öğe çizilsin (atalarının zemini de çizilmez): visibility mirası; ici=false ise öğenin içi gizli
const YALNIZ = "godot-yalniz";
async function yalniz(sec, ici = true) {
  const css =
    "html, body { background: transparent !important; } body * { visibility: hidden !important; } " +
    `${sec}${ici ? `, ${sec} *` : ""} { visibility: visible !important; }`;
  await ev(`(() => { document.getElementById("${YALNIZ}")?.remove(); const st = document.createElement("style"); st.id = "${YALNIZ}";
    st.textContent = ${JSON.stringify(css)}; document.head.append(st); })()`);
  await sleep(150);
}
async function ekran(ad) {
  const { data } = await send("Page.captureScreenshot", { format: "png" });
  writeFileSync(join(D.ref, ad + ".png"), Buffer.from(data, "base64"));
}
// SVG'yi hesaplanmış renkleriyle tek başına kullanılır hâle getir
const SVG_CIKAR = `(sec) => { const kaynak = document.querySelector(sec); if (!kaynak) return null;
  const k = kaynak.cloneNode(true), a = [kaynak, ...kaynak.querySelectorAll("*")], b = [k, ...k.querySelectorAll("*")];
  a.forEach((x, i) => { const cs = getComputedStyle(x), y = b[i];
    for (const p of ["fill", "stroke", "stroke-width", "opacity", "fill-opacity", "stroke-opacity", "stroke-linecap", "stroke-linejoin"]) {
      const v = cs.getPropertyValue(p); if (v && v !== "none" || p === "fill") y.setAttribute(p, v.replace(/^rgb\\((\\d+), (\\d+), (\\d+)\\)$/, (m, r, g, bb) => "#" + [r, g, bb].map(n => (+n).toString(16).padStart(2, "0")).join("")));
    }
    y.removeAttribute("class"); y.removeAttribute("clip-path"); });
  k.setAttribute("xmlns", "http://www.w3.org/2000/svg"); k.removeAttribute("aria-hidden"); k.removeAttribute("class");
  if (!k.getAttribute("width")) { const r = kaynak.getBoundingClientRect(); k.setAttribute("width", Math.round(r.width)); k.setAttribute("height", Math.round(r.height)); }
  return k.outerHTML; }`;
const svgYaz = async (sec, ad) => {
  const s = await ev(`(${SVG_CIKAR})(${JSON.stringify(sec)})`);
  if (!s) return console.log("SVG yok:", sec);
  writeFileSync(join(D.icon, ad + ".svg"), s);
};
// kayıtla masayı aç
async function masa(s, w = 1280, h = 800) {
  await boyut(w, h);
  await send("Page.navigate", { url: srv.url });
  await sleep(900);
  await ev(
    `localStorage.clear(); localStorage.setItem("cb.introSeen","true"); localStorage.setItem("cb.avatar",'"baskan-03"'); localStorage.setItem("cb.save", ${JSON.stringify(JSON.stringify(s))}); location.reload()`,
  );
  await sleep(1400);
  await ev(`document.querySelector("#btn-resume").click()`);
  await sleep(2600);
}

// Efekt seslerini WAV'a basar: tarayıcıda src/sesler.ts'in tanımları OfflineAudioContext'te çalışır.
// Gürültülü efektlerden (damga, kâğıt) 3 çeşit: oyunda her seferinde biraz farklı duyulsunlar diye.
const SURE = { tick: 0.2, stamp: 0.45, paper: 0.5, clink: 0.9, hicaz: 4.2, win: 2.6 };
const CESIT = { stamp: 3, paper: 3 };
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
    if (d.id && pend.has(d.id)) {
      const p = pend.get(d.id);
      pend.delete(d.id);
      d.error ? p.rej(new Error(d.error.message)) : p.res(d.result);
    }
  });
  await send("Runtime.enable");
  await send("Page.navigate", { url: srv.url + "?efekt-dok" });
  await sleep(1500);
  const sfx = join(PROJE, "assets/sfx");
  mkdirSync(sfx, { recursive: true });
  const liste = [];
  for (const [ad, sure] of Object.entries(SURE))
    for (let i = 1; i <= (CESIT[ad] || 1); i++) {
      const b64 = await ev(`(async () => {
        const sr = 44100, c = new OfflineAudioContext(1, Math.ceil(sr * ${sure}), sr), g = c.createGain();
        g.connect(c.destination); window.__EFEKT[${JSON.stringify(ad)}](c, g, 0);
        const d = (await c.startRendering()).getChannelData(0), n = d.length, buf = new ArrayBuffer(44 + n * 2), v = new DataView(buf);
        const yaz = (o, s) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
        yaz(0, "RIFF"); v.setUint32(4, 36 + n * 2, true); yaz(8, "WAVEfmt "); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
        v.setUint32(24, sr, true); v.setUint32(28, sr * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true); yaz(36, "data"); v.setUint32(40, n * 2, true);
        for (let i = 0; i < n; i++) v.setInt16(44 + i * 2, Math.max(-1, Math.min(1, d[i])) * 32767, true);
        let s = ""; const u = new Uint8Array(buf); for (let i = 0; i < u.length; i += 32768) s += String.fromCharCode(...u.subarray(i, i + 32768)); return btoa(s); })()`);
      const dosya = `${ad}${CESIT[ad] ? "-" + i : ""}.wav`;
      writeFileSync(join(sfx, dosya), Buffer.from(b64, "base64"));
      liste.push(dosya);
    }
  writeFileSync(
    join(sfx, "README.md"),
    `# Efekt sesleri (WAV, 44,1 kHz, mono, 16 bit)
Web sürümünde WebAudio ile sentezleniyor (src/sesler.ts); bunlar aynı tanımların çevrimdışı basılmış hâli. Oyunda ana ses düzeyi varsayılan %50.
| Dosya | Ne zaman çalar |
|---|---|
| tick.wav | menüde madde değişince, ayar ve onay tıkları |
| stamp-1..3.wav | karar damgası basılınca (her seferinde rastgele biri) |
| paper-1..3.wav | yeni evrak gelince |
| clink.wav | çay molası, zar tutunca, Fikret'e danışınca |
| hicaz.wav | oyun bitince (yenilgi) |
| win.wav | seçim kazanılınca, terfi |
`,
  );
  console.log(liste.length, "efekt:", liste.join(" "));
} catch (e) {
  console.log("HATA:", e.message);
} finally {
  ws?.close();
  chrome.kill();
  srv.kapat();
  setTimeout(() => process.exit(0), 300);
}
