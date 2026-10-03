// Godot portu için görseller ve stil: tarayıcıda (derlenmiş dist/) çizilen arayüzden
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
// dosya olarak duran resimler aynen
cpSync(join(APP, "public/meydan"), join(D.ui, "meydan"), { recursive: true });
cpSync(join(APP, "public/portraits"), join(D.ui, "portre"), { recursive: true });

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
    // Godot'nun SVG okuyucusu rgba() tanımıyor: #rrggbb + fill-opacity / stroke-opacity
    for (const p of ["fill", "stroke"]) { const m = (y.getAttribute(p) || "").match(/^rgba\\((\\d+), (\\d+), (\\d+), ([\\d.]+)\\)$/); if (!m) continue;
      y.setAttribute(p, "#" + m.slice(1, 4).map(n => (+n).toString(16).padStart(2, "0")).join(""));
      y.setAttribute(p + "-opacity", String(+(parseFloat(y.getAttribute(p + "-opacity") ?? "1") * +m[4]).toFixed(3))); }
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
const rng = (
  seed => () =>
    ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646
)(11);

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
  await send("Page.enable");
  await send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] });

  // ── 1. ref: ekran görüntüleri, 1280
  await boyut(1280, 800);
  await send("Page.navigate", { url: srv.url });
  await sleep(1500);
  await ev(`localStorage.clear(); localStorage.setItem("cb.introSeen","true"); location.reload()`);
  await sleep(2500);
  await ekran("01-meydan-menu");
  await ev(`document.querySelector("#btn-help").click()`);
  await sleep(500);
  await ekran("02-yardim");
  await ev(`document.querySelector("#btn-help-back").click()`);
  await sleep(400);
  await ev(`document.querySelector("#btn-start").click()`);
  await sleep(900);
  await ekran("03-aday-kaydi");
  await ev(`document.querySelector("#btn-go").click()`);
  await sleep(500);
  await ekran("04-beyanname");
  await ev(`document.querySelector("#btn-sandik").click()`);
  await sleep(1500);
  await ekran("05-kampanya-evragi");
  for (let i = 0; i < 4; i++) {
    await ev(`document.querySelector("#ch-L").click()`);
    await sleep(i === 3 ? 4000 : 4500);
  }
  await sleep(4000);
  await ekran("06-secim-gecesi");
  await sleep(6000);
  await ekran("07-secim-sonuc");
  // tanıtım evrağı
  const t = E.newGame({ intro: true });
  t.cur = E.materialize({ ...E.INTRO[0], kind: "intro" }, t, rng);
  await masa(t);
  await ekran("08-tanitim");
  // masa: yürürlükte kararlar, tehlike, mühür
  const s = E.newGame({ acilis: "ezici", rng });
  s.month = 20;
  s.pending = null;
  Object.assign(s.m, { h: 72, k: 14, e: 88, a: 50 });
  E.tavanHal(s, []);
  s.cur = E.materialize(E.CARD.seyyar, s, () => 0.9);
  await masa(s);
  await ekran("09-masa");
  // oyun sonu gazetesi
  const o = E.newGame({ acilis: "zafer", rng });
  o.month = 30;
  o.pending = null;
  o.m.k = 2;
  o.cur = E.materialize(E.CARD.seyyar, o, () => 0.9);
  o.cur.L = { ...o.cur.L, e: [0, -8, 0, 0] };
  await masa(o);
  await ev(`document.querySelector("#ch-L").click()`);
  await sleep(400);
  await ev(`document.querySelector("#ch-L").click()`); // oyun biter onayı
  await sleep(2500);
  await ev(`document.querySelector("#ch-L")?.click()`); // son evrağı
  await sleep(3500);
  await ekran("10-gazete");
  await ev(`document.querySelector("#btn-wall2")?.click()`);
  await sleep(800);
  await ekran("11-duvar");

  // ── 2. simgeler (SVG)
  await masa(s);
  for (const k of ["h", "k", "e", "a"]) await svgYaz(`#m-${k} .mi svg`, `gosterge-${k}`);
  await svgYaz("#poll .mi svg", "gosterge-anket");
  await svgYaz("#card .seal svg", "muhur-arma");
  await svgYaz("#card .clip", "atac");
  await svgYaz("#btn-danis svg", "arac-danis");
  await svgYaz("#btn-muhur svg", "arac-muhur");
  await svgYaz("#btn-mute svg", "arac-ses");
  await svgYaz("#btn-menu svg", "arac-menu");
  await svgYaz("#btn-log svg", "arac-gunluk");
  // imzalar: evraklar rastgele imza çizer; 12 örnek
  for (let i = 0; i < 12; i++) {
    const u = E.newGame({ acilis: "zafer", rng });
    u.pending = null;
    u.cur = E.materialize(E.CARD.seyyar, u, () => (i * 0.0791 + 0.13) % 1);
    u.cur.seed = 1000 + i * 7919;
    await masa(u);
    await svgYaz("#card .sig", `imza-${String(i + 1).padStart(2, "0")}`);
  }

  // ── 3. @2x şeffaf görseller
  await send("Emulation.setDefaultBackgroundColorOverride", { color: { r: 0, g: 0, b: 0, a: 0 } });
  await masa(s, 1280, 800);
  await boyut(1280, 800, 2);
  await sleep(300);
  // evrak kâğıdı: içi boş evrak; 9-slice kenarları köşe yuvarlaklığı ve gölge payı kadar
  await ev(`document.querySelector(".ses-dugme")?.remove()`);
  await yalniz("#card", false);
  const kr = await kirp("#card", join(D.ui, "kagit.png"), 14);
  writeFileSync(
    join(D.ui, "kagit.9.json"),
    JSON.stringify(
      { l: 40, t: 40, r: 40, b: 40, olcek: 2, pay_css: 14, boyut_css: [Math.round(kr.w), Math.round(kr.h)] },
      null,
      1,
    ),
  );
  // damga çerçeveleri: Godot metni kendisi yazar; çerçeve 9-slice, metin boş
  await ev(
    `(() => { for (const st of document.querySelectorAll("#card .stamp")) { st.style.opacity = "1"; st.style.transform = "none"; st.querySelector("span").textContent = "ÖRNEK DAMGA"; st.querySelector("span").style.color = "transparent"; } })()`,
  );
  await yalniz("#card .stamp.L");
  await kirp("#card .stamp.L", join(D.ui, "damga-sol.png"), 6);
  await yalniz("#card .stamp.R");
  await kirp("#card .stamp.R", join(D.ui, "damga-sag.png"), 6);
  writeFileSync(
    join(D.ui, "damga-sol.9.json"),
    JSON.stringify(
      {
        l: 28,
        t: 28,
        r: 28,
        b: 28,
        olcek: 2,
        not: "sol: kırmızı (--stamp-r), -13°; sağ: mor (--stamp-p), +11°; çarpım karışımı ve gürültü maskesi PNG'de",
      },
      null,
      1,
    ),
  );
  writeFileSync(join(D.ui, "damga-sag.9.json"), JSON.stringify({ l: 28, t: 28, r: 28, b: 28, olcek: 2 }, null, 1));
  // MÜHÜRLÜ rozeti (evrağın ::after'ı): içi gizli evrak + rozet; kâğıdın zemini ve gölgesi kapatılır
  await ev(`(() => { const c = document.querySelector("#card"); c.classList.add("muhurlu"); const r = c.getBoundingClientRect(), b = document.createElement("div"); b.id = "rozet-kutu"; b.style.cssText = "position:fixed;left:" + (r.right - 140) + "px;top:" + (r.bottom - 120) + "px;width:130px;height:80px"; document.body.append(b);
    const st = document.createElement("style"); st.textContent = "#card { background: transparent !important; box-shadow: none !important; border-color: transparent !important; } #card::after { visibility: visible !important; }"; document.head.append(st); })()`);
  await yalniz("#card", false);
  await ev(
    `(() => { const st = document.createElement("style"); st.textContent = "#card { visibility: visible !important; background: transparent !important; box-shadow: none !important; border-color: transparent !important; } #card > * { visibility: hidden !important; }"; document.head.append(st); })()`,
  );
  await sleep(200);
  await kirp("#rozet-kutu", join(D.ui, "muhurlu-rozet.png"));

  // ── 4. stil: CSS değişkenleri ve bileşenlerin hesaplanmış stilleri
  await boyut(1280, 800, 1);
  await masa(s);
  const stil = JSON.parse(
    await ev(`JSON.stringify((() => {
    const kok = getComputedStyle(document.documentElement), degisken = {};
    for (const sh of document.styleSheets) { try { for (const r of sh.cssRules) if (r.selectorText === ":root") for (const p of r.style) if (p.startsWith("--")) degisken[p] = kok.getPropertyValue(p).trim(); } catch {} }
    const P = ["color","background-color","background-image","border-top-width","border-top-style","border-top-color","border-radius","box-shadow","padding-top","padding-right","padding-bottom","padding-left","font-family","font-size","font-weight","letter-spacing","line-height","text-transform","opacity","min-height","min-width","width","height"];
    const S = { hud: ".hud", ust_cubuk_arac: ".tool", arac_mühür: "#btn-muhur", secenek: "#ch-L", secenek_not: "#ch-L .n", secenek_baslik: "#ch-L .t", evrak: "#card", evrak_metin: "#card .body", evrak_konu: "#card .doc-konu", evrak_kisi_ad: "#card .nm", evrak_kisi_unvan: "#card .un", evrak_ust: "#card .org", damga: "#card .stamp", gosterge_sayi: "#m-h .num", gosterge_ad: "#m-h .lbl", yururlukte: ".ongo", yururlukte_karar: ".ongo .pol", gunluk: "#log", masa: "#scr-game", takvim: ".cal" };
    const out = {}; for (const [ad, sec] of Object.entries(S)) { const el = document.querySelector(sec); if (!el) continue; const cs = getComputedStyle(el); out[ad] = { secici: sec }; for (const p of P) out[ad][p] = cs.getPropertyValue(p); }
    return { degisken, bilesen: out };
  })())`),
  );
  // bildirim, fiş, zar damgası: yeri sabit olmayan öğeler, örnek oluşturup ölç
  const ek = JSON.parse(
    await ev(`JSON.stringify((() => {
    const ornek = (html, kap) => { const d = document.createElement("div"); d.innerHTML = html; (document.querySelector(kap) || document.body).append(d.firstElementChild); };
    ornek('<div class="toast warn hi" id="o1"><b>Dikkat</b>Kasa dibe yaklaşıyor<span class="tr n">14</span></div>', "#toasts");
    ornek('<div class="toast ev" id="o2"><b>Not</b>örnek</div>', "#toasts");
    ornek('<span class="chip up" id="o3">+4</span>', "#m-h .fx"); ornek('<span class="chip down" id="o4">−8</span>', "#m-k .fx");
    ornek('<div class="zar-damga iyi" id="o5">Tuttu · anket +6</div>', "#card"); ornek('<div class="zar-damga kotu" id="o6">Tutmadı</div>', "#card");
    ornek('<p class="zar-not" id="o7">örnek sonuç cümlesi</p>', "#card");
    const P = ["color","background-color","border-top-width","border-top-color","border-left-width","border-left-color","border-radius","box-shadow","padding-top","padding-left","font-family","font-size","font-weight","letter-spacing","transform"];
    const out = {}; for (const [ad, id] of [["bildirim_uyari","o1"],["bildirim","o2"],["fis_artis","o3"],["fis_dusus","o4"],["zar_tuttu","o5"],["zar_tutmadi","o6"],["zar_not","o7"]]) { const cs = getComputedStyle(document.getElementById(id)); out[ad] = {}; for (const p of P) out[ad][p] = cs.getPropertyValue(p); }
    return out; })())`),
  );
  Object.assign(stil.bilesen, ek);
  writeFileSync(
    join(D.data, "_stil.json"),
    JSON.stringify(
      {
        v: 1,
        not: "Tarayıcının hesapladığı değerler (px, 1280×800, kök yazı boyu bu ekranda). rem kullanılan yerlerde oran için kok_yazi'ye bölün.",
        kok_yazi: await ev(`getComputedStyle(document.documentElement).fontSize`),
        ...stil,
      },
      null,
      1,
    ),
  );
  console.log(
    "ref:",
    readdirSync(D.ref).length,
    "· simge:",
    readdirSync(D.icon).length,
    "· ui:",
    readdirSync(D.ui).length,
  );
} catch (e) {
  console.log("HATA:", e.message);
} finally {
  ws?.close();
  chrome.kill();
  srv.kapat();
  setTimeout(() => process.exit(0), 300);
}
