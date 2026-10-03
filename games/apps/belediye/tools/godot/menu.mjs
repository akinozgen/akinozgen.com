// Ana menü ve alt ekranların Godot görselleri (derlenmiş dist/'ten, @2x, şeffaf zemin):
//   assets/ui/menu/bardak.png, bardak-buhar.png   logodaki çay bardağı, gölgesiyle; ikisi aynı kutuda (üst üste oturur)
//   assets/ui/menu/ilan-pano.png + .9.json        ilan panosu kâğıdı, metinsiz ve düz (webde 1,4° eğik; Godot döndürür)
//   assets/ui/menu/raptiye.png                    panonun raptiyesi, ayrı (9-slice'ta gerilmesin)
//   assets/ui/duvar/cerceve.png + .9.json         eski başkanlar duvarındaki yaldızlı çerçeve, resim yeri boş
//   assets/ui/duvar/zemin.png                     duvarın zemini (1440×900 ekran)
//   assets/ui/genelge.png + .9.json               "Nasıl oynanır" genelgesinin kâğıdı, metinsiz
//   data/_menu.json                               meydan ışıkları, buhar ve yıldızların yeri; canlandırma değerleri; saat paleti; sürüm
// node tools/godot/menu.mjs <godot proje klasörü>   (önce pnpm build)
import { execFileSync, spawn } from "node:child_process";
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { sunucu, CHROME_YOLU, DIST } from "../lib/sayfa.mjs";

const PROJE = process.argv[2];
if (!PROJE) throw new Error("Godot proje klasörünü ver");
const D = { ui: join(PROJE, "assets/ui"), menu: join(PROJE, "assets/ui/menu"), duvar: join(PROJE, "assets/ui/duvar") };
for (const d of Object.values(D)) mkdirSync(d, { recursive: true });

const srv = await sunucu();
const PORT = 9390;
const PROFIL = fileURLToPath(new URL("../../.cache/godot-menu/", import.meta.url));
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
const stil = (ad, css) =>
  ev(`(() => { document.getElementById(${JSON.stringify(ad)})?.remove(); const st = document.createElement("style"); st.id = ${JSON.stringify(ad)};
    st.textContent = ${JSON.stringify(css)}; document.head.append(st); })()`);
// yalnız seçilen öğe çizilsin; ici=false ise içindekiler gizli (kutu boyu korunur)
const yalniz = (sec, ici = true) =>
  stil(
    "godot-yalniz",
    `body * { visibility: hidden !important; } ${sec}${ici ? `, ${sec} *` : ""} { visibility: visible !important; }`,
  );
const kutu = async sec =>
  JSON.parse(
    await ev(
      `JSON.stringify((() => { const b = document.querySelector(${JSON.stringify(sec)}).getBoundingClientRect(); return { x: b.x, y: b.y, w: b.width, h: b.height }; })())`,
    ),
  );
// p: [sol, üst, sağ, alt] gölge payı (CSS px)
async function cek(r, dosya, p = [0, 0, 0, 0]) {
  await sleep(150);
  const clip = { x: r.x - p[0], y: r.y - p[1], width: r.w + p[0] + p[2], height: r.h + p[1] + p[3], scale: 1 };
  const { data } = await send("Page.captureScreenshot", { format: "png", clip });
  writeFileSync(dosya, Buffer.from(data, "base64"));
  return clip;
}
// 9-slice kenarları PNG pikseliyle (@2x): gölge payı + köşe/çerçeve kalınlığı
const dokuz = (dosya, p, ic, ek = {}) =>
  writeFileSync(
    dosya,
    JSON.stringify(
      {
        l: 2 * (p[0] + ic[0]),
        t: 2 * (p[1] + ic[1]),
        r: 2 * (p[2] + ic[2]),
        b: 2 * (p[3] + ic[3]),
        olcek: 2,
        pay_css: p,
        ...ek,
      },
      null,
      1,
    ),
  );

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
  // hareket kapalı: buhar ve pano duruk çizilsin
  await send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] });
  await send("Emulation.setDefaultBackgroundColorOverride", { color: { r: 0, g: 0, b: 0, a: 0 } });
  await send("Emulation.setDeviceMetricsOverride", { width: 1440, height: 900, deviceScaleFactor: 2, mobile: false });
  await send("Page.navigate", { url: srv.url });
  await sleep(1200);
  const kayit = {
    gid: "g1",
    name: "Örnek Başkan",
    avatar: "baskan-03",
    months: 40,
    key: "sandik",
    term: 1,
    headline: "",
    at: 1,
  };
  await ev(
    `localStorage.clear(); localStorage.setItem("cb.introSeen","true"); localStorage.setItem("cb.hall", ${JSON.stringify(JSON.stringify([kayit]))}); location.reload()`,
  );
  await sleep(2500);
  await stil(
    "godot-duruk",
    "*, *::before, *::after { animation: none !important; transition: none !important; } html, body { background: transparent !important; }",
  );

  // ── 1. bardak: buhar viewBox'un içinde (y −30'dan başlar); iki kare aynı kutudan
  const gp = [14, 10, 14, 22]; // drop-shadow 0 4px 8px
  const bk = await kutu(".mn-glass");
  await yalniz(".mn-glass");
  await stil("godot-buhar", ".mn-glass .steam path { opacity: 1 !important; transform: none !important; }");
  await cek(bk, join(D.menu, "bardak-buhar.png"), gp);
  await stil("godot-buhar", ".mn-glass .steam { display: none !important; }");
  await cek(bk, join(D.menu, "bardak.png"), gp);

  // ── 2. ilan panosu: düz, raptiyesiz kâğıt; raptiye ayrı
  await stil(
    "godot-pano",
    ".mn-board { transform: none !important; opacity: 1 !important; } .mn-board::before { display: none !important; }",
  );
  await yalniz(".mn-board", false);
  const pk = await kutu(".mn-board"),
    pp = [30, 20, 30, 44]; // gölge 0 12px 28px
  await cek(pk, join(D.menu, "ilan-pano.png"), pp);
  dokuz(join(D.menu, "ilan-pano.9.json"), pp, [6, 6, 6, 6], {
    boyut_css: [Math.round(pk.w), Math.round(pk.h)],
    ic_bosluk_css: [18, 16, 18, 16],
    not: "Webde genişlik 280, sağ üstten 40/36 içeride, 1,4° saat yönünde döner; giriş: 0,6 sn (0,35 sn gecikme) 4°'den ve 16 px yukarıdan gelir. Raptiye üst kenarın ortasında, merkezi kâğıdın üst kenarından 1 px aşağıda.",
  });
  await stil(
    "godot-pano",
    ".mn-board { transform: none !important; opacity: 1 !important; background: none !important; box-shadow: none !important; }",
  );
  await yalniz(".mn-board", false);
  await cek({ x: pk.x + pk.w / 2 - 8, y: pk.y - 7, w: 16, h: 16 }, join(D.menu, "raptiye.png"), [3, 2, 3, 6]);

  // ── 3. genelge: "Nasıl oynanır"
  await stil("godot-yalniz", "");
  await ev(`document.querySelector("#btn-help").click()`);
  await sleep(700);
  // geniş ekranda genelge ekranı doldurur; 9-slice için kenarlar yeter, küçük çek (pay ekranın dışına taşmasın)
  await stil(
    "godot-genelge",
    "#scr-help .genelge { max-width: 660px !important; max-height: 420px; overflow: hidden; }",
  );
  await yalniz("#scr-help .genelge", false);
  const gk = await kutu("#scr-help .genelge"),
    ggp = [46, 26, 46, 68]; // gölge 0 20px 44px
  await cek(gk, join(D.ui, "genelge.png"), ggp);
  dokuz(join(D.ui, "genelge.9.json"), ggp, [4, 4, 4, 4], {
    boyut_css: [Math.round(gk.w), Math.round(gk.h)],
    ic_bosluk_css: [22, 20, 22, 18],
    not: "Webde dar ekranda en çok 660 genişlik, geniş ekranda (yatay) ekran genişliğinde; köşe 3 px. Kâğıt rengi --paper, metin --ink, font --f-type 16,5 px / 1,55.",
  });

  // ── 4. eski başkanlar duvarı: çerçeve (resim yeri boş) ve zemin
  await stil("godot-yalniz", "");
  await ev(`document.querySelector("#btn-help-back").click()`);
  await sleep(500);
  await ev(`document.querySelector("#btn-wall").click()`);
  await sleep(900);
  await stil(
    "godot-yalniz",
    "body * { visibility: hidden !important; } .frame:first-child .gilt, .frame:first-child .mat { visibility: visible !important; } .frame .gilt::after { display: none !important; } .frame:first-child .mat { background: none !important; border: 8px solid #f2efe6; padding: 0 !important; } .frame:first-child .pic { visibility: hidden !important; }",
  );
  const ck = await kutu(".frame:first-child .gilt"),
    cp = [20, 12, 20, 32]; // gölge 0 10px 18px
  await cek(ck, join(D.duvar, "cerceve.png"), cp);
  // yaldız paspartunun arkasında da boyalı: resim yerini saydam del (yaldız 9 + paspartu 8 içeride)
  execFileSync("python3", [
    "-c",
    `import sys; from PIL import Image, ImageDraw
im = Image.open(sys.argv[1]).convert("RGBA"); l, t, r, b = map(int, sys.argv[2:])
ImageDraw.Draw(im).rectangle((l, t, im.width - r - 1, im.height - b - 1), fill=(0, 0, 0, 0)); im.save(sys.argv[1])`,
    join(D.duvar, "cerceve.png"),
    ...cp.map((v, i) => String(2 * (v + 17) - (i > 1 ? 3 : 0))), // sağ/alt: kesirli genişlikten kalan yaldız sızıntısı
  ]);
  dokuz(join(D.duvar, "cerceve.9.json"), cp, [17, 17, 17, 17], {
    boyut_css: [Math.round(ck.w), Math.round(ck.h)],
    yaldiz_css: 9,
    paspartu_css: 8,
    not: "Resim yeri saydam (PNG'de delik). Yaldız 135° gradyan (#8a6a26, #ecd592 %30, #a8852f %55, #e7cf86 %80, #8a6a26): 9-slice gerince köşegen bozulur, boyu webdeki gibi (en çok 170 genişlik) tutmak en iyisi. Paspartu #f2efe6. Resim yeri 3:4, #cfc6b0; vesikalık sepia(.55) contrast(1.05) saturate(.85).",
  });
  await stil("godot-yalniz", "#scr-wall * { visibility: hidden !important; }");
  await sleep(200);
  {
    const { data } = await send("Page.captureScreenshot", { format: "png" });
    writeFileSync(join(D.duvar, "zemin.png"), Buffer.from(data, "base64"));
  }
} catch (e) {
  console.log("HATA:", e.message);
} finally {
  ws?.close();
  chrome.kill();
  srv.kapat?.();
}

// ── 5. data/_menu.json: kaynaktan
const ui = readFileSync(new URL("../../src/ui.ts", import.meta.url), "utf8");
const nesne = ad => new Function(`return ${ui.match(new RegExp(`const ${ad}[^=]*= (\\{[\\s\\S]*?\\n\\});`))[1]}`)();
const surum = (() => {
  for (const f of readdirSync(join(DIST, "assets"))) {
    const m = readFileSync(join(DIST, "assets", f), "utf8").match(/\d{4}\.\d\d\.\d\d · [0-9a-f]{7}/);
    if (m) return m[0];
  }
  return null;
})();
writeFileSync(
  join(PROJE, "data/_menu.json"),
  JSON.stringify(
    {
      v: 1,
      meydan: {
        resim: "assets/ui/meydan/meydan-<palet>.webp",
        boyut: [1536, 1024],
        not: "Noktalar resim pikseliyle (1536×1024). mk: makam penceresi (menüden oyuna geçişte sahne buraya yaklaşır), l1-l3 sokak lambaları, stm semaver buharının çıktığı yer. Üç resimde bina biraz farklı durduğu için noktalar palete göre.",
        nokta: nesne("MD_NOKTA"),
        yildiz: nesne("MD_YILDIZ"),
      },
      palet: {
        not: "Yerel saate göre (h 0-23): 21-5 gece, 6-16 gün, 17-20 akşam.",
        gece: [21, 5],
        gun: [6, 16],
        aksam: [17, 20],
      },
      canlandirma: {
        lamba: {
          not: "l1-l3: çap resim genişliğinin l1 %4, l2 %4, l3 %6'sı; radyal: merkez rgba(255,240,170,.5), %42 rgba(255,222,140,.16), %70 saydam. Gündüz gizli.",
          gecikme_sn: { l1: 0, l2: -1.7, l3: -3.1 },
          sure_sn: 5,
        },
        makam: {
          not: "mk: çap %5; radyal merkez rgba(255,214,140,.42), %45 rgba(255,190,110,.12), %70 saydam.",
          sure_sn: 6.5,
        },
        nefes:
          "Lamba ve makam ışığı: ease-in-out, sonsuz. 0 ve %100: opaklık .75, ölçek g; %50: opaklık 1, ölçek g·1.08. g gece 1.35, diğerlerinde 1.",
        buhar: {
          not: "Semaver: 3 bulut, kutu genişliği resmin %1,6'sı, en/boy 1:2, noktanın üstünde (alt kenarı noktada). Bulut: kutunun %40'ı genişlikte, 1:3, radyal rgba(255,255,255,.55) → saydam. Sol konumlar %30, %10, %50.",
          sure_sn: 3.6,
          gecikme_sn: [0, -1.2, -2.4],
          egri: "ease-out",
          kare: [
            { an: 0, opaklik: 0, y: 0, x: 0, olcek: 0.7 },
            { an: 0.3, opaklik: 0.9 },
            { an: 1, opaklik: 0, y: -1.2, x: 0.2, olcek: 1.3 },
          ],
          kare_not: "x/y bulutun kendi boyuna oranla (translateY(-120%) translateX(20%)).",
        },
        yildiz: {
          not: "Yalnız gece. Nokta: çap resmin %0,3'ü, beyaz, 0 0 5,6px rgba(255,255,255,.8) parıltı. %50'de opaklık .25; sırayla 0,7 sn kaydırılmış (i. yıldız −0,7·i sn).",
          sure_sn: 3.4,
          egri: "ease-in-out",
        },
        bardak_buhari: {
          not: "Logodaki bardak: bardak-buhar.png'deki üç çizgi ayrı ayrı canlanır webde; Godot'ta tek kare olarak bardak.png üstüne opaklıkla bindirilebilir. Çizgi: rgba(243,242,236,.5), 3 px.",
          sure_sn: 4.5,
          gecikme_sn: [0, -1.5, -3],
          kare: [
            { an: 0, opaklik: 0, y_css: 14 },
            { an: 0.3, opaklik: 0.9 },
            { an: 1, opaklik: 0, y_css: -26 },
          ],
        },
      },
      surum: {
        deger: surum,
        not: "Derleme günü (YYYY.AA.GG) ve src/ altındaki dosyaların sha1 özetinin ilk 7 hanesi; vite.config.js'te hesaplanır. Menü altında 'Sürüm <değer>', künyede yalnız değer.",
      },
    },
    null,
    1,
  ),
);
console.log("menü görselleri ve _menu.json yazıldı; sürüm", surum);
setTimeout(() => process.exit(0), 300);
