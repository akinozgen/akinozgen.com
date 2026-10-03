// Seçim gecesi stüdyosu (anchor.ts) katman katman: assets/ui/tv/*.png (@2x, şeffaf) ve data/_tv.json
// (katmanın sahnedeki kutusu ve dönme noktası, 1600×900 sahne birimiyle; canlandırma kuralları). node tools/godot/tv.mjs <proje>
import { execFileSync, spawn } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { CHROME_YOLU } from "../lib/sayfa.mjs";
import { studioSVG, studioCSS, ST_REST } from "../../src/anchor.ts";

const PROJE = process.argv[2];
if (!PROJE) throw new Error("Godot proje klasörünü ver");
const TV = join(PROJE, "assets/ui/tv");
mkdirSync(TV, { recursive: true });
const APP = fileURLToPath(new URL("../../", import.meta.url));
const IS = fileURLToPath(new URL("../../.cache/godot-tv/", import.meta.url));
mkdirSync(IS, { recursive: true });
const font = (aile, w, dosya) =>
  `@font-face{font-family:"${aile}";font-weight:${w};src:url(${pathToFileURL(join(APP, "src/fonts", dosya)).href})}`;
// hareketsiz, nötr sahne: bütün animasyon ve geçişler kapalı
const sayfa = `<!doctype html><meta charset=utf-8><style>
${font("Alfa Slab One", 400, "AlfaSlabOne-400-latin.woff2")}${font("Alfa Slab One", 400, "AlfaSlabOne-400-latin-ext.woff2")}
${font("Barlow Condensed", 700, "BarlowCondensed-700-latin.woff2")}${font("Barlow Condensed", 700, "BarlowCondensed-700-latin-ext.woff2")}
html,body{margin:0;background:transparent}svg.st-root{display:block;width:1600px;height:900px}
${studioCSS()}
.st-root *{animation:none!important;transition:none!important}
.st-catX,.st-fing{transform:none!important}
</style>${studioSVG()}<script>
// SVG'nin üst düzey çocukları boyama sırasıyla: spikerin önünde kalan masa, çay, bant ayrı katman olsun diye etiketle
{
  const dinamik = ".st-cap,#st-year,.st-tick,.st-dim,.st-sd,.st-scan,.st-rec,.st-clk";
  let bolum = "arka-1", n = 1, isik = false;
  const kids = [...document.querySelector(".st-root").children].filter(c => !/^(defs|style)$/i.test(c.tagName));
  const son = kids.at(-1);
  for (const c of kids) {
    // ışıklar arka planla iç içe: her geçişte yeni dilim (arka-1, isik-1, arka-2, ...)
    if (bolum.startsWith("arka") || bolum.startsWith("isik")) {
      const l = c.matches(".st-lit");
      if (l !== isik) { isik = l; if (!l) n++; }
      if (l) { c.dataset.b = "isik-" + n; continue; }
      bolum = "arka-" + n;
    }
    if (c.matches(".st-post.st-arms")) { bolum = "masa-on"; continue; }
    if (c.matches(".st-post")) { bolum = "masa-ust"; continue; }
    if (c.querySelector(".st-catX") || c.matches(".st-pen")) { bolum = "bant"; continue; }
    if (c.matches(dinamik)) { if (c.matches(".st-tick")) bolum = "bant-etiket"; continue; }
    if (c === son) { c.dataset.b = "vinyet"; continue; }
    c.dataset.b = c.querySelector(".st-stm") ? "cay" : bolum;
  }
  document.querySelectorAll(".st-leg").forEach((l, i) => (l.dataset.b = "bacak-" + (i + 1)));
}
</script>`;
writeFileSync(join(IS, "sahne.html"), sayfa);

const KIRP = `import sys, json
from PIL import Image
im = Image.open(sys.argv[1]).convert("RGBA"); b = im.getchannel("A").getbbox() or (0, 0, 2, 2)
x0, y0 = b[0] // 2 * 2, b[1] // 2 * 2; x1, y1 = -(-b[2] // 2) * 2, -(-b[3] // 2) * 2
im.crop((x0, y0, x1, y1)).save(sys.argv[2], optimize=True)
print(json.dumps([x0 // 2, y0 // 2, (x1 - x0) // 2, (y1 - y0) // 2]))`;
const PORT = 9389;
const chrome = spawn(
  CHROME_YOLU,
  [
    "--headless=new",
    "--disable-gpu",
    "--hide-scrollbars",
    "--allow-file-access-from-files",
    `--remote-debugging-port=${PORT}`,
    `--user-data-dir=${join(IS, "profil")}`,
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

// Katmanlar boyama sırasıyla. sec: görünecek öğe(ler); gizle: onun içinde gizlenecekler; ac: varsayılan opaklığı 0 olanları aç.
// Spikerin yüz parçaları ayrı; "bas" yüzün geri kalanı. Gruplar iç içe dönüşür: ebeveyn, _tv.json'da.
const YUZ = ".st-quiff,.st-brows,.st-eyes,.st-mo,.st-stache,.st-chk,.st-fx";
const DINAMIK = ".st-cap,#st-year,.st-tick,.st-stm,.st-clk,.st-scan,.st-rec,.st-dim,.st-sd";
const K = [
  ...[1, 2, 3].flatMap(n => [
    {
      ad: `arka-${n}`,
      sec: `[data-b="arka-${n}"]`,
      gizle: DINAMIK,
      not: "stüdyo, şehir silueti, duvar ekranı (ışık dilimleriyle sırayla)",
    },
    {
      ad: `isik-${n}`,
      sec: `[data-b="isik-${n}"]`,
      not: "ışık konileri/panelleri; st-lights'ta bütün isik-* opaklığı st-flick2 eğrisiyle (0%,50%,100% 1; 8%,20% .15; 12% .9; 42% .3; 62% .5), 1,4 sn",
    },
  ]),
  { ad: "duvar-sinyal-yok", sec: ".st-sd", ac: true, ebeveyn: null, not: "st-lean tepkisinde yanıp söner" },
  { ad: "tarama", sec: ".st-scan", ac: true, not: "duvar ekranında yukarıdan aşağı akan çizgi, 6,5 sn" },
  { ad: "saat-ibre", sec: ".st-clk", not: "60 sn'de bir tur, pivot 900,320" },
  { ad: "kayit", sec: ".st-rec", not: "REC: 1,2 sn yanıp söner" },
  { ad: "govde", sec: ".st-post:not(.st-arms)", gizle: ".st-hd", not: "nefes (st-br) ve duruş (st-post)" },
  { ad: "bas", sec: ".st-hd2", gizle: YUZ, ebeveyn: "govde" },
  { ad: "percem", sec: ".st-quiff", ebeveyn: "bas" },
  {
    ad: "yanak",
    sec: ".st-chk",
    ac: true,
    gorunur: 0.45,
    ebeveyn: "bas",
    not: "PNG tam opak; dinlenik opaklık .45, ruh hâline göre değişir",
  },
  { ad: "kas-sol", sec: ".st-brL", ebeveyn: "bas" },
  { ad: "kas-sag", sec: ".st-brR", ebeveyn: "bas" },
  ...[0, 1].flatMap(i => {
    const y = i ? "sag" : "sol";
    return [
      {
        ad: `goz-${y}-aki`,
        sec: `.st-eyes > g:nth-of-type(${i + 1}) .st-scl`,
        ac: true,
        ebeveyn: "bas",
        not: "şaşkınken görünür",
      },
      { ad: `goz-${y}-bebek`, sec: `.st-eyes > g:nth-of-type(${i + 1}) .st-pup`, gizle: ".st-spk", ebeveyn: "bas" },
      {
        ad: `goz-${y}-parilti`,
        sec: `.st-eyes > g:nth-of-type(${i + 1}) .st-spk`,
        ac: true,
        ebeveyn: `goz-${y}-bebek`,
        not: "coşkuluyken",
      },
      {
        ad: `goz-${y}-mutlu`,
        sec: `.st-eyes > g:nth-of-type(${i + 1}) .st-hap`,
        ac: true,
        ebeveyn: "bas",
        not: "mutluyken bebek yerine yay",
      },
      {
        ad: `goz-${y}-kapak`,
        sec: `.st-eyes > g:nth-of-type(${i + 1}) [class^="st-lid"]`,
        ebeveyn: "bas",
        not: "üzgün/kendinden memnunken iner",
      },
    ];
  }),
  ...[..."nhxsdmaeo"].map(k => ({ ad: `agiz-${k}`, sec: `.st-q${k}`, ac: true, ebeveyn: "bas" })),
  { ad: "biyik", sec: ".st-stache", ebeveyn: "bas", not: "ağız açıldıkça yukarı kalkar" },
  ...["fxx", "fxs", "fxd", "fxm"].map(f => ({
    ad: `yuz-efekt-${f.slice(2)}`,
    sec: `.st-${f}`,
    ac: true,
    ebeveyn: "bas",
  })),
  { ad: "masa-ust", sec: '[data-b="masa-ust"]', not: "masanın üst yüzü: spikerin önünde, kolların arkasında" },
  {
    ad: "kartlar",
    sec: ".st-cards",
    gizle: ".st-armL,.st-armR,.st-c1",
    ebeveyn: null,
    not: "masadaki seçim kâğıtları",
  },
  { ad: "kart-ust", sec: ".st-c1", ebeveyn: "kartlar" },
  { ad: "kol-sol", sec: ".st-armL", ebeveyn: null },
  { ad: "kol-sag", sec: ".st-armR", gizle: ".st-fing", ebeveyn: null },
  {
    ad: "parmak",
    sec: ".st-fing",
    ac: true,
    ebeveyn: "kol-sag",
    not: "dinlenikte scaleX(0) (pivot sol kenar); işaret ederken 0,25 sn gecikmeyle 1'e uzar. PNG tam uzamış hâli.",
  },
  { ad: "masa-on", sec: '[data-b="masa-on"]', not: "masa önü, KTV plakası" },
  { ad: "cay", sec: '[data-b="cay"]', gizle: ".st-stm", not: "çay bardağı; buhar-1/2 bunun üstünde" },
  { ad: "buhar-1", sec: ".st-stm:not(.st-stm2)", ac: true, not: "3,2 sn yükselip kaybolur" },
  { ad: "buhar-2", sec: ".st-stm2", ac: true, not: "buhar-1'den 1,6 sn geride" },
  { ad: "kedi-kuyruk", sec: ".st-tail", ebeveyn: "kedi-govde", not: "cat2'de st-tail .8 sn ×2 sallanır" },
  {
    ad: "kedi-bacak-1",
    sec: '[data-b="bacak-1"]',
    ebeveyn: "kedi-govde",
    not: "gövdenin arkasında; st-lg2: yürürken ters evre",
  },
  { ad: "kedi-bacak-2", sec: '[data-b="bacak-2"]', ebeveyn: "kedi-govde", not: "gövdenin arkasında" },
  { ad: "kedi-govde", sec: ".st-catB", gizle: ".st-cath,.st-tail,.st-leg,.st-paw", ebeveyn: null },
  {
    ad: "kedi-bacak-3",
    sec: '[data-b="bacak-3"]',
    ebeveyn: "kedi-govde",
    not: "gövdenin önünde; st-paw: cat2'de pati savurur (st-swipe .45 sn ×2)",
  },
  {
    ad: "kedi-bacak-4",
    sec: '[data-b="bacak-4"]',
    ebeveyn: "kedi-govde",
    not: "gövdenin önünde; st-lg2: yürürken ters evre",
  },
  { ad: "kedi-bas", sec: ".st-cath", ebeveyn: "kedi-govde" },
  { ad: "kalem", sec: ".st-pen", ebeveyn: null },
  {
    ad: "bant",
    sec: '[data-b="bant"]',
    not: "alt bant zemini; kayan yazı (Godot) bunun üstünde, bant-etiket'in altında",
  },
  { ad: "bant-etiket", sec: '[data-b="bant-etiket"]', not: "KTV HABER kutusu" },
  {
    ad: "isik-karartma",
    sec: ".st-dim",
    ac: true,
    not: "PNG tam opak; st-lights'ta opaklık st-flick eğrisiyle (8% .62, 12% .08, 20% .72, 27% .15, 42% .5, 50% 0, 62% .35, 68% 0), 1,4 sn",
  },
  { ad: "vinyet", sec: '[data-b="vinyet"]', not: "en üstte; isik-karartma'nın altında" },
];

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
  await send("Emulation.setDeviceMetricsOverride", { width: 1600, height: 900, deviceScaleFactor: 2, mobile: false });
  await send("Emulation.setDefaultBackgroundColorOverride", { color: { r: 0, g: 0, b: 0, a: 0 } });
  await send("Page.navigate", { url: pathToFileURL(join(IS, "sahne.html")).href });
  await sleep(1500);
  await ev(`document.fonts.ready.then(() => true)`);
  if (process.env.TV_DEBUG)
    console.log(
      await ev(
        `[...document.querySelector(".st-root").children].map(c => c.tagName + "." + (c.getAttribute("class") || "") + "=" + (c.dataset.b || "-") + (c.querySelector(".st-leg") ? "[kedi]" : "")).join("\\n") + "\\nlegs:" + [...document.querySelectorAll(".st-leg")].map(l => l.dataset.b + ":" + JSON.stringify(l.getBoundingClientRect())).join("\\n")`,
      ),
    );
  // tam sahne: referans
  {
    const { data } = await send("Page.captureScreenshot", { format: "png" });
    writeFileSync(join(TV, "_tam-sahne.png"), Buffer.from(data, "base64"));
  }
  // Godot'un yazacağı metinler: sahne kutuları, taban çizgisi ve metin
  const yazi = await ev(`(() => {
    const o = {};
    for (const [ad, sec] of [["duvar_alt_yazi", ".st-cap"], ["yil", "#st-year"], ["kayan_haber", ".st-tick"]]) {
      const el = document.querySelector(sec), b = el.getBoundingClientRect(), t = el.closest("text"), cs = getComputedStyle(el);
      o[ad] = { kutu: [b.x, b.y, b.width, b.height].map(Math.round), taban_y: +t.getAttribute("y"), x: +(el.getAttribute("x") ?? t.getAttribute("x")), font: cs.fontFamily.split(",")[0].replaceAll('"', ""), boyut: parseFloat(cs.fontSize), renk: cs.fill, harf_araligi: cs.letterSpacing, ornek: el.textContent };
    }
    o.yil.x = o.yil.kutu[0]; // başlığın içindeki tspan: kendi soldan başlangıcı
    return o;
  })()`);
  const katmanlar = [];
  for (const k of K) {
    const r = await ev(`(() => {
      document.getElementById("katman")?.remove();
      const st = document.createElement("style"); st.id = "katman";
      const sec = ${JSON.stringify(k.sec)}, gizle = ${JSON.stringify(k.gizle || "")};
      st.textContent = ".st-root * { visibility: hidden !important; } .st-root defs, .st-root defs * { visibility: visible !important; }" +
        sec.split(",").map(s => s + "," + s + " *").join(",") + "{ visibility: visible !important; }" +
        (gizle ? gizle.split(",").map(g => sec.split(",").map(s => s + " " + g + "," + s + " " + g + " *").join(",")).join(",") + "{ visibility: hidden !important; }" : "") +
        (${!!k.ac} ? sec.split(",").map(s => s + "," + s + " *").join(",") + "{ opacity: 1 !important; }" : "");
      document.head.append(st);
      const els = [...document.querySelectorAll(sec)];
      if (!els.length) return null;
      let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
      for (const el of els) { const b = el.getBoundingClientRect(); if (!b.width && !b.height) continue; x0 = Math.min(x0, b.left); y0 = Math.min(y0, b.top); x1 = Math.max(x1, b.right); y1 = Math.max(y1, b.bottom); }
      const el = els[0], cs = getComputedStyle(el), bb = el.getBBox ? el.getBBox() : null;
      const o = cs.transformOrigin.split(" ").map(parseFloat), kutuTipi = cs.transformBox;
      // dönme noktası: fill-box ise öğenin kendi kutusuna göre, değilse sahne (viewBox) koordinatı
      const yerel = kutuTipi === "fill-box" && bb ? [bb.x + o[0], bb.y + o[1]] : [o[0], o[1]];
      const m = el.parentNode.getScreenCTM?.() || new DOMMatrix(), pt = new DOMPoint(yerel[0], yerel[1]).matrixTransform(m);
      const pivot = [pt.x, pt.y], dinlenik = cs.transform;
      return { x: x0, y: y0, w: x1 - x0, h: y1 - y0, pivot, kutuTipi, origin: cs.transformOrigin, opaklik: cs.opacity, dinlenik };
    })()`);
    if (!r || (r.w <= 0 && r.h <= 0)) {
      console.log("YOK:", k.ad, k.sec);
      continue;
    }
    await sleep(60);
    // SVG kutusu çizgi kalınlığını saymıyor: tam kareyi çek, saydam olmayan piksellere göre kırp (çift piksele hizalı, @2x)
    const { data } = await send("Page.captureScreenshot", { format: "png" });
    const ham = join(IS, k.ad + ".png");
    writeFileSync(ham, Buffer.from(data, "base64"));
    const kutu = JSON.parse(execFileSync("python3", ["-c", KIRP, ham, join(TV, k.ad + ".png")], { encoding: "utf8" }));
    katmanlar.push({
      ad: k.ad,
      dosya: `assets/ui/tv/${k.ad}.png`,
      kutu,
      pivot: r.pivot.map(v => Math.round(v * 10) / 10),
      ebeveyn: k.ebeveyn === undefined ? null : k.ebeveyn,
      varsayilan_gorunur: k.gorunur ?? !k.ac,
      dinlenik_donusum: r.dinlenik === "none" ? undefined : r.dinlenik,
      kaynak: k.sec,
      not: k.not || undefined,
    });
  }
  const tv = {
    v: 1,
    sahne: {
      boyut: [1600, 900],
      olcek_png: 2,
      not: "kutu: [x, y, genişlik, yükseklik] sahne birimiyle (PNG'ler bunun 2 katı). Boyama sırası dizinin sırası. pivot sahne koordinatı. PNG dinlenik dönüşümü içerir (ör. kollar rotate 56,7 / 123,3): tepkilerdeki açılar mutlak, Godot'ta fark olarak uygula. Kedi PNG'si sahne içinde (x 0) çizildi; dinlenikte x+760, sahne dışında.",
    },
    katmanlar,
    yazilar: {
      not: "Görsele gömülmedi, Godot yazar. Hepsi büyük harf (tr). duvar_alt_yazi: x ortadan değil soldan (text-anchor start), en çok 700 birim; sığmazsa yatay sıkıştır. Girişte 0,45 sn y+30 → 0 ve opaklık 0 → 1. yil: 'KARAKAVAK SEÇİM' başlığının devamı, altın renk. kayan_haber: 40 sn'de x 1420 → −2850 (−10 sn ofsetle başlar), sonsuz; bant ile bant-etiket arasında çizilir.",
      ...yazi,
    },
    canlandirma: {
      kaynak: "src/anchor.ts studio() ve studioCSS()",
      ruh_hali_dinlenik_agiz: ST_REST,
      ruh_hali_tablosu: {
        not: "sıra: gövde (st-post), baş (st-hd), kaş sol, kaş sağ, bebek, kapak sol, kapak sağ, perçem, yanak opaklığı, görünenler. Değerler CSS dönüşümü (translateY px, rotate deg, scale).",
        excited: [
          "translateY(-8px) scale(1.02)",
          "rotate(-3deg)",
          "translateY(-12px)",
          "translateY(-12px)",
          "scale(1.12)",
          "",
          "",
          "",
          0.8,
          "parıltı, yuz-efekt-x",
        ],
        shocked: [
          "translateY(-14px)",
          "translateY(-6px)",
          "translateY(-16px) scale(1.05)",
          "translateY(-16px) scale(1.05)",
          "scale(.48)",
          "",
          "",
          "scale(1.03,1.1)",
          0.1,
          "göz akı, yuz-efekt-s",
        ],
        happy: [
          "rotate(-1deg)",
          "rotate(-5deg)",
          "translateY(-6px)",
          "translateY(-6px)",
          "",
          "",
          "",
          "",
          0.85,
          "mutlu göz (bebek gizli)",
        ],
        sad: [
          "translateY(10px)",
          "rotate(5deg) translateY(6px)",
          "translateY(-4px) rotate(-16deg)",
          "translateY(-4px) rotate(16deg)",
          "",
          "translateY(11px) rotate(-14deg)",
          "translateY(11px) rotate(14deg)",
          "",
          0.2,
          "yuz-efekt-d",
        ],
        smug: [
          "rotate(1.5deg)",
          "rotate(4deg) translateY(-3px)",
          "translateY(4px) rotate(5deg)",
          "translateY(-12px) rotate(-7deg)",
          "",
          "translateY(15px)",
          "translateY(15px)",
          "",
          0.5,
          "yuz-efekt-m",
        ],
        neutral: "hepsi dinlenik, yanak 0,45",
        gecis: "gövde 0,55 sn, baş 0,45 sn, kaş/kapak 0,3 sn; eğri cubic-bezier(.3,1.5,.5,1)",
      },
      konusma:
        "Ses dosyasına bağlı DEĞİL, kendi zamanlayıcısı: talk(true) iken hece hece ağız şekli 'aaeeeoo' içinden (aynısı iki kez üst üste gelmez) seçilir, her hece 70-170 ms. %20 olasılıkla ağız kapanır (ruh hâlinin dinlenik ağzı) 80-220 ms (+%15 olasılıkla 320 ms kelime arası). %5 olasılıkla 320 ms kaş kalkar (translateY −8). say(ms): ms boyunca konuşur. Konuşurken baş 2,4 sn'lik sallanma döngüsü (st-bob: 17% rotate 1.4 y−2, 33% rotate −0.6, 52% rotate 0.8 y−3, 70% rotate −1.2 y−1, 86% rotate 0.4). Bıyık ağız şekline göre: a −5, e −3, o −2 ve scaleX .94, s/x −4 px.",
      goz_kirpma:
        "2-6 sn'de bir (rastgele), 120 ms kapanır (göz scaleY .08); %20 olasılıkla 280 ms sonra ikinci kırpma.",
      bakis: "7-14 sn'de bir, meşgul değilse 700-1300 ms kartlara bakar: gözler y+10, baş y+5 rotate −1,5.",
      nefes: "gövde 4,4 sn: %50'de scale(1.01, 1.014), pivot 470,690.",
      tepkiler: {
        point:
          "1,8 sn: sağ kol rotate −38 (dinlenik 123,3), parmak uzar (0,25 sn gecikmeli), gözler 10,−4, baş rotate 2,5 x+4",
        papers: "1 sn: kartlara vurur (kartlar 0,95 sn y−15 ×2, kollar ±9 deg, üst kart karışır), gözler aşağı",
        lean: "2,2 sn: gövde y+30 scale 1,1, kaşlar çatılır, kapaklar iner, duvarda 'sinyal yok' yanıp söner",
        lights: "1,5 sn: ışıklar titrer (karartma katmanı), gözler ve kaşlar yukarı",
        cat: "Tekir: 2,3 sn sahneye yürür (x 760 → 0, bacaklar 0,3 sn ±24 deg), kalemi devirir (kalem 1,3 sn düşer), 1,7 sn sonra döner (ayna) ve 2,4 sn'de çıkar; kalem 0,7 sn'de yerine gelir",
      },
      surekli:
        "duvar ekranı 5 sn'de bir hafif titrer; tarama 6,5 sn; REC 1,2 sn; buhar 3,2 sn; saat 60 sn tur; kayan haber 40 sn",
      css_ham: "data/_tv.css (studioCSS çıktısı, keyframes dahil)",
    },
  };
  writeFileSync(join(PROJE, "data/_tv.json"), JSON.stringify(tv, null, 1));
  writeFileSync(join(PROJE, "data/_tv.css"), studioCSS());
  console.log(katmanlar.length, "katman");
} catch (e) {
  console.log("HATA:", e.message);
} finally {
  ws?.close();
  chrome.kill();
  setTimeout(() => process.exit(0), 300);
}
