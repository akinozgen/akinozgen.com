// Seçim gecesi TV ekranı için tasarım provası: oyundan bağımsız bir sayfa kurar, sahte verilerle doldurur,
// headless Chrome ile dört ekran boyunda fotoğraflar ve yerleşimi denetler (taşma, çakışma, küçük yazı).
// Metinler (KJ, kayan yazı, kur, "Neden?") src/broadcast.js'ten gelir; KJ için en uzun satırlar seçilir.
//   node tools/tv-mock.mjs            → .cache/tv/mock.html ve .cache/tv/*.png
//   node tools/tv-mock.mjs --no-shot  → yalnız sayfayı yazar (tarayıcıda elle açmak için)
// Sayfa: fontlar src/fonts.css'ten, stil src/style.css'ten, işaretleme index.html'deki #scr-secim'den.
// Adres sonundaki #count · #result · #upset · #three hangi anın gösterileceğini seçer.
import { spawn } from "node:child_process";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { betik, FONTS } from "./lib/sayfa.mjs";

const root = new URL("../", import.meta.url);
const OUT = new URL(".cache/tv/", root);
mkdirSync(OUT, { recursive: true });
const read = p => readFileSync(new URL(p, root), "utf8");

// <section id="scr-secim"> … eşleşen </section> (iç içe section sayılır)
function sectionOf(src, id) {
  const start = src.indexOf(`<section id="${id}"`);
  if (start < 0) throw new Error(`#${id} bulunamadı`);
  const re = /<\/?section\b/g; re.lastIndex = start;
  let depth = 0, m;
  while ((m = re.exec(src))) {
    depth += m[0] === "<section" ? 1 : -1;
    if (!depth) return src.slice(start, src.indexOf(">", m.index) + 1);
  }
  throw new Error(`#${id} kapanmıyor`);
}
const markup = sectionOf(read("index.html"), "scr-secim").replace(/(<section id="scr-secim"[^>]*?)\s+hidden>/, "$1>");
const fonts = FONTS;
const base = `html { box-sizing: border-box; padding-top: env(safe-area-inset-top, 0px); padding-bottom: env(safe-area-inset-bottom, 0px); -webkit-text-size-adjust: 100%; text-size-adjust: 100%; }
*, *::before, *::after { box-sizing: inherit; }
img, svg { max-width: 100%; }`;

// Oyunun metin motoru (cards.js + engine.js + broadcast.js) sayfaya gömülür: KJ, kayan yazı, kur kutusu ve
// "Neden?" satırları gerçek üreticiden gelir, uzunlukları gerçek olur. Oy sayıları elle.
const ENGINE = betik("cards", "engine", "broadcast");
const ENGINE_JS = `window.TV = (() => {\n${ENGINE}\nreturn { kj, ticker, fx, whyLines, tvName, tvShort, dateLabel, ADAYLAR };\n})();`;

// Sahte veri ve doldurucu: sayfanın içinde çalışır
const MOCK = String.raw`
const { kj, ticker, fx, whyLines, tvName, tvShort, dateLabel, ADAYLAR } = window.TV;
const rngOf = seed => () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
const NAME = "Aslı Kavaklıoğlu";
const PIC = { you: "baskan-01", nermin: "nermin", bekir: "bekir", burak: "burak", tekir: "tekir" };
const RENK = { you: "#e2bd5a", nermin: "#e8715a", bekir: "#5cc08a", burak: "#ef7fb4", tekir: "#f5a94a" };
const label = id => (id === "you" ? "Belediye Başkanı, yeniden aday" : ADAYLAR[id].etiket);
// fxi: kur kutusunun sırası (6: TEKİR MAMASI/KG, 11: KİRA/ODA en uzunlar)
const STATES = {
  count: { phase: "sayim", open: 0.374, mahalle: "Çarşı", fxi: 0, votes: { nermin: 3327, you: 3083, bekir: 1284, tekir: 868, burak: 479 },
    strip: [["Kavun Ovası", 99.7, [["you", 51.2], ["nermin", 30.14]]], ["Çarşı", 62.5, [["bekir", 44.8], ["nermin", 28.31]]], ["Öğrenci yurdu", 12, [["tekir", 47.02], ["burak", 21.77]]]] },
  result: { phase: "sonuc", open: 1, fxi: 6, won: true, info: true, votes: { you: 9912, nermin: 8744, bekir: 2861, tekir: 1573, burak: 928 },
    extra: { p0: 46.2, steal: [{ id: "bekir", v: 3.1 }, { id: "tekir", v: 2.4 }, { id: "burak", v: 1.2 }], vaat: 1.5, rel: -1.4, fatigue: 2 },
    strip: [["Kavun Ovası", 100, [["you", 52.08], ["nermin", 29.9]]], ["Çarşı", 100, [["bekir", 41.12], ["you", 30.05]]], ["Öğrenci yurdu", 100, [["tekir", 44.6], ["burak", 23.18]]]],
    blocs: [["Halk", 55, { you: 47, nermin: 33, bekir: 6, tekir: 9, burak: 5 }], ["Esnaf", 15, { you: 28, nermin: 24, bekir: 41, tekir: 4, burak: 3 }],
      ["Parti tabanı", 15, { you: 44, nermin: 42, bekir: 8, tekir: 4, burak: 2 }], ["Kararsızlar", 15, { you: 29, nermin: 36, bekir: 5, tekir: 17, burak: 13 }]] },
  upset: { phase: "sonuc", open: 1, fxi: 11, won: true, votes: { tekir: 8120, you: 7502, nermin: 5811, bekir: 1760, burak: 825 },
    strip: [["Kavun Ovası", 100, [["you", 44.1], ["tekir", 31.7]]], ["Çarşı", 100, [["tekir", 35.33], ["bekir", 30.12]]], ["Öğrenci yurdu", 100, [["tekir", 71.4], ["burak", 12.05]]]] },
  // üç aday, sayım sürüyor: büyük kartlar ve iki mahalle kutusu
  three: { phase: "lider", open: 0.718, prev: "nermin", fxi: 1, votes: { you: 5210, nermin: 4968, tekir: 1432 },
    strip: [["Merkez", 88.1, [["nermin", 47.93], ["you", 44.02]]], ["Kavaklı", 100, [["you", 61.4], ["nermin", 30.18]]]] },
};
const tr = n => Math.round(n).toLocaleString("tr-TR");
const pct = (v, d = 2) => v.toFixed(d).replace(".", ",");
const $ = s => document.querySelector(s);
const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
const tpl = document.querySelector("#tv-cand-tpl").content.querySelector("li.tv-cand:not(.lead):not(.you)");
const S = STATES[location.hash.slice(1)] || STATES.count;
const ids = Object.keys(S.votes).sort((a, b) => S.votes[b] - S.votes[a]); // ekranda oy sırası
const tot = ids.reduce((a, id) => a + S.votes[id], 0), P = Object.fromEntries(ids.map(id => [id, 100 * S.votes[id] / tot]));
const cands = ids.map(id => ({ id, pct: Math.round(P[id] * 10) / 10 }));
const res = { cands, winner: ids[0], win: ids[0] === "you", you: P.you, margin: Math.round((P[ids[0]] - P[ids[1]]) * 10) / 10, month: 59, term: 2, early: false, ...(S.extra || {}) };
const ctx = { res, playerName: NAME, pct: P, leader: ids[0], prev: S.prev, opened: S.open, mahalle: S.mahalle };
// KJ: 40 çekilişin en uzun başlığı ve alt satırı (en kötü durum)
let T = "", U = "";
for (let k = 1; k <= 40; k++) { const o = kj(S.phase, ctx, rngOf(k)); if (o.title.length > T.length) T = o.title; if (o.sub.length > U.length) U = o.sub; }

$("#tv-diff").textContent = tr(S.votes[ids[0]] - S.votes[ids[1]]);
$("#tv-open").textContent = "%" + pct(S.open * 100, 1);
$("#tv-prog").style.width = S.open * 100 + "%";
$("#tv-date").textContent = dateLabel(res.month) + " · " + ids.length + " aday";
$("#tv-live").textContent = S.won ? "Kesin sonuç" : "Canlı";
$("#tv-cands").replaceChildren(...ids.map((id, i) => {
  const li = tpl.cloneNode(true);
  li.dataset.id = id; li.style.cssText = "--c:" + RENK[id] + ";--p:" + P[id].toFixed(2);
  li.classList.toggle("lead", i === 0); li.classList.toggle("you", id === "you"); li.classList.toggle("won", !!S.won && i === 0);
  li.querySelector("img").src = "../../public/portraits/" + PIC[id] + ".webp";
  li.querySelector(".tv-lbl").textContent = label(id);
  li.querySelector(".tv-name").textContent = tvName(id, NAME);
  li.querySelector(".tv-pct").textContent = "%" + pct(P[id]);
  li.querySelector(".tv-votes").textContent = tr(S.votes[id]);
  return li;
}));
$("#tv-strip").innerHTML = S.strip.map(([ad, open, rows]) => '<div class="tv-box" style="--c:' + RENK[rows[0][0]] + '"><span class="tv-box-ad">' + esc(ad) + '</span><span class="tv-box-open">Açılan %' + pct(open, 1) + "</span>"
  + rows.map(([id, v]) => '<p class="tv-box-row' + (id === "you" ? " you" : "") + '" style="--c:' + RENK[id] + '"><b>' + esc(tvShort(id, NAME)) + "</b><span>" + pct(v) + "</span></p>").join("") + "</div>").join("");
$("#tv-kj-title").textContent = T;
$("#tv-kj-sub").textContent = U;
$("#tv-ticker").innerHTML = ticker(ctx, rngOf(7)).map(t => "<span>" + esc(t) + "</span>").join("");
$("#tv-ticker").style.animationDelay = "-18s"; // fotoğrafta şerit dolu görünsün
const f = fx(S.fxi, rngOf(3));
$("#tv-fx").innerHTML = "<b>" + esc(f.ad) + "</b> " + f.deger + ' <i class="' + (f.yon === "▲" ? "up" : "down") + '">' + f.yon + "</i>";
if (S.info) {
  $("#tv-blocs").innerHTML = S.blocs.map(([ad, w, pay]) => '<div class="tv-bloc"><span class="tv-bloc-ad">' + ad + "<small>seçmenin %" + w + "'i</small></span>"
    + '<div class="tv-stack">' + ids.map(id => '<i style="--c:' + RENK[id] + ";width:" + pay[id] + '%" title="' + esc(tvName(id, NAME)) + " %" + pay[id] + '"><b>' + pay[id] + "</b></i>").join("") + "</div>"
    + "<em>%" + pct(pay.you, 1) + "</em></div>").join("")
    + '<div class="tv-legend">' + ids.map(id => '<span style="--c:' + RENK[id] + '">' + esc(tvName(id, NAME)) + "</span>").join("") + "</div>";
  $("#tv-why").innerHTML = whyLines(res, NAME).map(t => "<li>" + esc(t) + "</li>").join("");
  $("#tv-info").hidden = false;
}
$("#btn-ec-skip").hidden = !!S.won; $("#btn-ec-go").hidden = !S.won;
$("#ec-say").textContent = U;
// Yer tutucu sunucu (yalnız provada; asıl SVG'yi başka bileşen takacak)
$("#tv-stage").innerHTML = '<svg viewBox="0 0 1600 900" preserveAspectRatio="xMidYMax meet" style="position:absolute;inset:0;width:100%;height:100%" aria-hidden="true">'
  + '<defs><linearGradient id="m-desk" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#3a6fd0"/><stop offset=".08" stop-color="#16357e"/><stop offset="1" stop-color="#081a45"/></linearGradient>'
  + '<linearGradient id="m-suit" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2b2f3d"/><stop offset="1" stop-color="#14161e"/></linearGradient></defs>'
  + '<path d="M620 690 C620 560 680 505 800 500 C920 505 980 560 980 690 Z" fill="url(#m-suit)"/>'
  + '<path d="M770 505 L800 600 L830 505 Z" fill="#f2f2f2"/><path d="M792 520 L800 610 L808 520 Z" fill="#b3341f"/>'
  + '<rect x="778" y="440" width="44" height="70" rx="16" fill="#d9a47e"/>'
  + '<ellipse cx="800" cy="385" rx="74" ry="90" fill="#e2b08a"/>'
  + '<path d="M726 380 C716 300 760 282 800 282 C852 282 890 305 876 385 C866 340 836 322 800 324 C764 322 736 340 726 380 Z" fill="#3b2a20"/>'
  + '<ellipse cx="772" cy="392" rx="7" ry="9" fill="#2a1a12"/><ellipse cx="828" cy="392" rx="7" ry="9" fill="#2a1a12"/><path d="M780 440 Q800 452 820 440" stroke="#8a4a36" stroke-width="5" fill="none" stroke-linecap="round"/>'
  + '<path d="M300 660 L1300 660 L1380 900 L220 900 Z" fill="url(#m-desk)"/><rect x="300" y="652" width="1000" height="14" rx="4" fill="#9cc8ff" opacity=".7"/>'
  + '<text x="800" y="790" text-anchor="middle" font-family="Alfa Slab One" font-size="64" fill="#ffffff" opacity=".85">KTV</text></svg>';
document.documentElement.dataset.ready = "1";
`;

const page = `<!doctype html>
<html lang="tr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="color-scheme" content="dark">
<title>Seçim gecesi · TV provası</title>
<style>
${fonts}
${base}
</style>
<style>
${read("src/style.css")}
${read("src/secim.css")}
</style>
</head>
<body>
<div id="app" lang="tr">
${markup}
</div>
<script>${ENGINE_JS}</script>
<script>${MOCK}</script>
</body>
</html>
`;
const PAGE = new URL("mock.html", OUT);
writeFileSync(PAGE, page);
console.log("sayfa:", fileURLToPath(PAGE));
if (process.argv.includes("--no-shot")) process.exit(0);

// ── Fotoğraf ve denetim
const CHROME = process.env.CHROME || "C:/Program Files/Google/Chrome/Application/chrome.exe", PORT = 9357;
const chrome = spawn(CHROME, ["--headless=new", "--mute-audio", "--disable-gpu", "--hide-scrollbars", `--remote-debugging-port=${PORT}`, `--user-data-dir=${fileURLToPath(OUT)}profile`, "--no-first-run", "about:blank"], { stdio: "ignore" });
const sleep = ms => new Promise(r => setTimeout(r, ms));
let ws, id = 0; const pend = new Map(), errors = [], notes = [];
const send = (m, p = {}) => new Promise((res, rej) => { const i = ++id; pend.set(i, { res, rej }); ws.send(JSON.stringify({ id: i, method: m, params: p })); });
const ev = async e => { const r = await send("Runtime.evaluate", { expression: e, returnByValue: true, awaitPromise: true }); if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text); return r.result?.value; };
const shot = async name => { const { data } = await send("Page.captureScreenshot", { format: "png" }); writeFileSync(new URL(name + ".png", OUT), Buffer.from(data, "base64")); console.log("  görüntü:", name + ".png"); };

// Sayfa içinde çalışan denetim: yatay taşma, masaüstünde dikey taşma, blok çakışmaları, kart içi taşma, 11px altı yazı
const AUDIT = String.raw`(() => {
  const W = innerWidth, H = innerHeight, out = [], info = [], desk = matchMedia("(min-width: 860px) and (min-aspect-ratio: 5/4)").matches;
  const scr = document.querySelector("#scr-secim"), R = el => el.getBoundingClientRect(), vis = el => el && el.getClientRects().length && getComputedStyle(el).visibility !== "hidden";
  const nm = el => el.id ? "#" + el.id : "." + [...el.classList].join(".");
  if (document.documentElement.scrollWidth > W) out.push("sayfa yatay taşıyor: " + document.documentElement.scrollWidth + " > " + W);
  if (scr.scrollWidth > scr.clientWidth) out.push("#scr-secim yatay taşıyor: " + scr.scrollWidth + " > " + scr.clientWidth);
  if (desk && scr.scrollHeight > scr.clientHeight + 1) out.push("masaüstünde dikey kaydırma var: " + scr.scrollHeight + " > " + scr.clientHeight);
  const blocks = [".tv", ".tv-act", ".tv-brand", ".tv-sum", ".tv-cand", ".tv-box", ".tv-studio", ".tv-kj", ".tv-tick", ".tv-info"].flatMap(s => [...document.querySelectorAll("#scr-secim " + s)]).filter(vis);
  for (const el of blocks) { const r = R(el); if (r.left < -.5 || r.right > W + .5) out.push(nm(el) + " yatayda ekrandan çıkıyor (" + Math.round(r.left) + "–" + Math.round(r.right) + ")"); }
  if (desk) for (const el of [".tv", ".tv-act"].map(s => document.querySelector(s))) { const r = R(el); if (r.top < -.5 || r.bottom > H + .5) out.push(nm(el) + " dikeyde ekrandan çıkıyor (" + Math.round(r.top) + "–" + Math.round(r.bottom) + ")"); }
  const hit = (a, b) => { const x = R(a), y = R(b); return Math.min(x.right, y.right) - Math.max(x.left, y.left) > 1 && Math.min(x.bottom, y.bottom) - Math.max(x.top, y.top) > 1; };
  const solo = [".tv-brand", ".tv-sum", ".tv-cands", ".tv-strip", ".tv-studio", ".tv-tick"].map(s => document.querySelector(s)).filter(vis);
  for (let i = 0; i < solo.length; i++) for (let j = i + 1; j < solo.length; j++) if (hit(solo[i], solo[j])) out.push("çakışma: " + nm(solo[i]) + " × " + nm(solo[j]));
  const kj = document.querySelector(".tv-kj"); for (const s of [".tv-cands", ".tv-strip", ".tv-tick", ".tv-sum"]) if (hit(kj, document.querySelector(s))) out.push("çakışma: .tv-kj × " + s);
  if (hit(document.querySelector(".tv"), document.querySelector(".tv-act")) && desk) out.push("çakışma: .tv × .tv-act");
  const cards = [...document.querySelectorAll("#tv-cands > li")];
  for (let i = 1; i < cards.length; i++) if (hit(cards[i - 1], cards[i])) out.push("kartlar üst üste: " + cards[i - 1].dataset.id + " × " + cards[i].dataset.id);
  for (const li of cards) {
    const r = R(li);
    for (const s of [".tv-pic", ".tv-lbl", ".tv-nm", ".tv-pct", ".tv-votes"]) { const e = li.querySelector(s), q = R(e); if (q.bottom > r.bottom + .5 || q.right > r.right + .5 || q.top < r.top - .5) out.push(li.dataset.id + " kartında " + s + " taşıyor"); }
    const n = li.querySelector(".tv-name"); if (n.scrollWidth > n.clientWidth + 1) info.push(li.dataset.id + " adı kısaldı (…)");
    for (const s of [".tv-pct", ".tv-votes"]) { const e = li.querySelector(s); if (e.scrollWidth > e.clientWidth + 1) out.push(li.dataset.id + " kartında " + s + " yazısı kutusuna sığmıyor"); }
    const l = li.querySelector(".tv-lbl"); if (l.scrollWidth > l.clientWidth + 1) info.push(li.dataset.id + " etiketi kısaldı (…)");
    const pr = R(li.querySelector(".tv-pct")), vr = R(li.querySelector(".tv-votes")), nr = R(li.querySelector(".tv-nm"));
    if (hit(li.querySelector(".tv-pct"), li.querySelector(".tv-votes"))) out.push(li.dataset.id + " kartında yüzde ile oy sayısı çakışıyor");
    if (hit(li.querySelector(".tv-pct"), li.querySelector(".tv-nm"))) out.push(li.dataset.id + " kartında yüzde ile ad çakışıyor");
  }
  for (const b of document.querySelectorAll(".tv-box-row b, .tv-box-ad")) if (b.scrollWidth > b.clientWidth + 1) info.push("kutuda kısalan: " + b.textContent);
  // döküm paneli: sütun içeriği sütundan taşmasın, masaüstünde KJ'nin altına girmesin; uzun liste kendi içinde kayabilir
  const inf = document.querySelector("#tv-info");
  if (vis(inf)) {
    for (const col of inf.querySelectorAll(".tv-info-col")) {
      const cr = R(col);
      for (const e of col.querySelectorAll(":scope > *")) { const q = R(e); if (q.bottom > cr.bottom + 1 || q.right > cr.right + 1) out.push("döküm panelinde " + nm(e) + " sütundan taşıyor"); }
      if (desk && cr.bottom > R(kj).top + 1) out.push("döküm paneli KJ'nin altına giriyor");
    }
    const why = document.querySelector("#tv-why");
    if (why.scrollHeight > why.clientHeight + 1) info.push("Neden? listesi kendi içinde kayıyor (" + why.children.length + " satır, " + why.scrollHeight + "/" + why.clientHeight + "px)");
  }
  for (const s of ["#tv-kj-title", "#tv-kj-sub"]) { const e = document.querySelector(s); if (e.scrollHeight > e.clientHeight + 1) info.push(s + " iki satıra sığmadı, kesildi"); }
  // en küçük yazı: görünür metin düğümleri ve ::before/::after içerikleri
  let min = 99, small = new Set();
  const walk = document.createTreeWalker(scr, NodeFilter.SHOW_TEXT);
  const check = (el, pseudo) => { const cs = getComputedStyle(el, pseudo); if (pseudo && (cs.content === "none" || cs.content === "normal" || cs.content === '""')) return; if (cs.display === "none") return;
    const f = parseFloat(cs.fontSize); if (f < min) min = f; if (f < 11) small.add(nm(el) + (pseudo || "") + " " + f.toFixed(1) + "px"); };
  while (walk.nextNode()) { const t = walk.currentNode; if (!t.textContent.trim()) continue; const el = t.parentElement; if (el.closest("template") || !vis(el)) continue; check(el); }
  for (const el of scr.querySelectorAll("*")) { if (!vis(el)) continue; check(el, "::before"); check(el, "::after"); }
  if (small.size) out.push("11px altı yazı: " + [...small].slice(0, 8).join(", "));
  const tick = getComputedStyle(document.querySelector("#tv-ticker")).animationName;
  return { out, info, min: +min.toFixed(1), root: parseFloat(getComputedStyle(document.documentElement).fontSize), tick, desk, scrollH: scr.scrollHeight, clientH: scr.clientHeight };
})()`;

const VIEWS = [
  { w: 1280, h: 800, mobile: false, states: ["count", "result", "upset", "three"] },
  { w: 1920, h: 1080, mobile: false, states: ["count", "result"] },
  { w: 390, h: 844, mobile: true, states: ["count", "result", "upset", "three"] },
  { w: 360, h: 640, mobile: true, states: ["count", "result"] },
];
try {
  let url; for (let t = 0; t < 50 && !url; t++) { try { url = (await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json()).find(x => x.type === "page")?.webSocketDebuggerUrl; } catch { } if (!url) await sleep(200); }
  if (!url) throw new Error("Chrome açılmadı");
  ws = new WebSocket(url); await new Promise(r => ws.addEventListener("open", r));
  ws.addEventListener("message", m => {
    const d = JSON.parse(m.data);
    if (d.id && pend.has(d.id)) { const p = pend.get(d.id); pend.delete(d.id); d.error ? p.rej(new Error(d.error.message)) : p.res(d.result); }
    if (d.method === "Runtime.exceptionThrown") errors.push("İSTİSNA: " + (d.params.exceptionDetails.exception?.description || d.params.exceptionDetails.text));
    if (d.method === "Log.entryAdded" && d.params.entry.level === "error") errors.push("LOG: " + d.params.entry.text + " " + (d.params.entry.url || ""));
  });
  await send("Runtime.enable"); await send("Log.enable"); await send("Page.enable");
  for (const v of VIEWS) {
    await send("Emulation.setDeviceMetricsOverride", { width: v.w, height: v.h, deviceScaleFactor: 1, mobile: v.mobile });
    for (const st of v.states) {
      const name = `${v.w}x${v.h}-${st}`;
      await send("Page.navigate", { url: PAGE.href + "#" + st });
      await sleep(300);
      await send("Page.reload", { ignoreCache: true }); // yalnız hash değişince sayfa yeniden kurulmaz
      for (let t = 0; t < 40 && !(await ev(`document.documentElement.dataset.ready === "1"`).catch(() => false)); t++) await sleep(100);
      await ev(`document.fonts.ready.then(() => Promise.all([...document.images].map(i => i.complete ? 0 : new Promise(r => { i.onload = i.onerror = r; })))).then(() => 1)`);
      await sleep(900); // mühür ve panel animasyonları bitsin
      const a = await ev(AUDIT);
      console.log(`${name}  kök ${a.root}px · en küçük yazı ${a.min}px · ${a.desk ? "masaüstü" : "dar"} · yükseklik ${a.scrollH}/${a.clientH}`);
      for (const x of a.out) errors.push(`${name}: ${x}`);
      for (const x of a.info) notes.push(`${name}: ${x}`);
      await shot(name);
      if (v.mobile && a.scrollH > a.clientH) { await ev(`document.querySelector("#scr-secim").scrollTop = 1e6`); await sleep(250); await shot(name + "-end"); }
    }
  }
  // Hareket azaltma: kayan yazı durmalı
  await send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] });
  await send("Emulation.setDeviceMetricsOverride", { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false });
  await send("Page.navigate", { url: PAGE.href + "#count" }); await sleep(300); await send("Page.reload", { ignoreCache: true }); await sleep(900);
  const rm = await ev(AUDIT);
  if (rm.tick !== "none") errors.push("hareket azaltmada kayan yazı hâlâ kayıyor");
  await shot("1280x800-reduced");
  console.log("hareket azaltma: kayan yazı animasyonu", rm.tick);
} catch (e) { errors.push("HATA: " + e.message); }
finally {
  if (notes.length) console.log("notlar:\n  " + notes.join("\n  "));
  console.log(errors.length ? "sorunlar:\n  " + errors.join("\n  ") : "sorun yok");
  try { ws?.close(); } catch { }
  chrome.kill(); setTimeout(() => process.exit(errors.length ? 1 : 0), 300);
}
