// Derleme:
//   node build.mjs          → dist/web/ (bağımsız web uygulaması), dist/oyna.html (tek dosya),
//                             dist/caylar-belediyeden.html (claude.ai önizlemesi, Google Fonts bağlantılı)
//   node build.mjs --site   → yalnız web uygulaması, doğrudan sitenin public/games/belediye/ klasörüne
//                             (akinozgen.com/games/belediye/ adresinde yayınlanan kopya budur)
// Vesikalıklar web-src/portraits/ altındadır: web sürümü onları dosya olarak yükler, tek dosyalık kopyalar içine gömer.
import { readFileSync, writeFileSync, mkdirSync, rmSync, readdirSync, copyFileSync } from "node:fs";
import { createHash } from "node:crypto";

const root = new URL("./", import.meta.url);
const SITE = process.argv.includes("--site");
const SITE_URL = "https://akinozgen.com/games/belediye/";
const read = p => readFileSync(new URL(p, root), "utf8");
const SRC = ["cards.js", "engine.js", "anchor.js", "broadcast.js", "ui.js"].map(f => read("src/" + f)).join("\n\n");
new Function(SRC); // sözdizimi kontrolü (çalıştırmaz)
// menüdeki sürüm: derleme günü ve kaynağın kısa özeti ("2026.09.25 · 3f9c2a1")
const SURUM = `${new Date().toISOString().slice(0, 10).replaceAll("-", ".")} · ${createHash("sha1").update(SRC + read("src/style.css")).digest("hex").slice(0, 7)}`;
const js = SRC.replace('"/*SURUM*/"', JSON.stringify(SURUM));

const DESC = "Karakavak'ın belediye başkanı sizsiniz: evrakı sağa sola kaydırın, halkı, kasayı, esnafı ve Ankara'yı dengede tutun.";
const tpl = read("src/index.html");
const bodyOf = t => t.slice(t.indexOf("<style>/*STYLE*/</style>") + "<style>/*STYLE*/</style>".length);
const PHOTOS = readdirSync(new URL("web-src/portraits/", root)).filter(f => f.endsWith(".webp")).sort();
const PHOTOS_INLINE = Object.fromEntries(PHOTOS.map(f => [f.slice(0, -5), "data:image/webp;base64," + readFileSync(new URL("web-src/portraits/" + f, root)).toString("base64")]));
// standalone: web sürümü (service worker) · inline: vesikalıklar sayfaya gömülsün
const script = (standalone, inline) => `<script>(() => {\n"use strict";\n${js.replace("/*STANDALONE*/false", String(standalone))
  .replace("/*PORTRAITS*/null", () => (inline ? JSON.stringify(PHOTOS_INLINE) : "null"))}\n})();</script>`;
const INTERACT = read("web-src/vendor/interact.min.js");
const VENDOR = {
  artifact: `<script src="https://cdnjs.cloudflare.com/ajax/libs/interact.js/1.10.27/interact.min.js"></script>`,
  web: `<script src="vendor/interact.min.js"></script>`,
  single: `<script>${INTERACT}</script>`,
};
const fill = (t, standalone, vendor) => t.replace("<!--VENDOR-->", () => VENDOR[vendor]).replace("<script>/*SCRIPT*/</script>", () => script(standalone, vendor !== "web"));
const css = read("src/style.css");

// ── Artifact sürümü (iskeleti yayın sırasında eklenir)
if (!SITE) {
  mkdirSync(new URL("dist/", root), { recursive: true });
  writeFileSync(new URL("dist/caylar-belediyeden.html", root), fill(tpl.replace("/*STYLE*/", () => css), false, "artifact"));
}

// ── Web sürümü
const W = SITE ? new URL("../../../public/games/belediye/", root) : new URL("dist/web/", root);
if (!/\/games\/belediye\/$|\/dist\/web\/$/.test(W.pathname)) throw new Error("beklenmeyen çıktı klasörü: " + W.pathname);
rmSync(W, { recursive: true, force: true });
mkdirSync(new URL("fonts/", W), { recursive: true });
mkdirSync(new URL("icons/", W), { recursive: true });
mkdirSync(new URL("vendor/", W), { recursive: true });
mkdirSync(new URL("portraits/", W), { recursive: true });
for (const f of readdirSync(new URL("web-src/vendor/", root))) copyFileSync(new URL("web-src/vendor/" + f, root), new URL("vendor/" + f, W));
for (const f of readdirSync(new URL("web-src/fonts/", root))) copyFileSync(new URL("web-src/fonts/" + f, root), new URL("fonts/" + f, W));
for (const f of readdirSync(new URL("web-src/icons/", root))) copyFileSync(new URL("web-src/icons/" + f, root), new URL("icons/" + f, W));
for (const f of PHOTOS) copyFileSync(new URL("web-src/portraits/" + f, root), new URL("portraits/" + f, W));
copyFileSync(new URL("web-src/fonts/OFL.txt", root), new URL("fonts/OFL.txt", W));

const base = `html { box-sizing: border-box; padding-top: env(safe-area-inset-top, 0px); padding-bottom: env(safe-area-inset-bottom, 0px); -webkit-text-size-adjust: 100%; text-size-adjust: 100%; }
*, *::before, *::after { box-sizing: inherit; }
img, svg { max-width: 100%; }`;
const head = `<!doctype html>
<html lang="tr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<script>/* /games/belediye → /games/belediye/ : göreli yollar klasöre göre çözülsün */ if (!/\\/$|\\.html$/.test(location.pathname) && /^https?:$/.test(location.protocol)) location.replace(location.pathname + "/" + location.search + location.hash);</script>
<title>Çaylar Belediyeden</title>
<meta name="description" content="${DESC}">
<meta name="theme-color" content="#2a1a11">
<meta name="color-scheme" content="dark">
<meta name="mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
<meta name="apple-mobile-web-app-title" content="Çaylar">
<meta property="og:type" content="website">
<meta property="og:title" content="Çaylar Belediyeden">
<meta property="og:description" content="${DESC}">
<meta property="og:url" content="${SITE_URL}">
<meta property="og:image" content="${SITE_URL}icons/icon-512.png">
<meta property="og:locale" content="tr_TR">
<meta name="twitter:card" content="summary">
<link rel="icon" href="icons/icon.svg" type="image/svg+xml">
<link rel="icon" href="icons/icon-192.png" type="image/png" sizes="192x192">
<link rel="apple-touch-icon" href="icons/apple-touch-icon.png">
<link rel="manifest" href="manifest.webmanifest">
<style>
${read("web-src/fonts.css")}
${base}
</style>
<style>
${css}
</style>
</head>
<body>
`;
const web = head + fill(bodyOf(tpl), true, "web").trim() + "\n</body>\n</html>\n";
writeFileSync(new URL("index.html", W), web);

writeFileSync(new URL("manifest.webmanifest", W), JSON.stringify({
  name: "Çaylar Belediyeden", short_name: "Çaylar", description: DESC, lang: "tr", dir: "ltr",
  start_url: "./", scope: "./", display: "standalone", orientation: "any",
  background_color: "#0e1f18", theme_color: "#2a1a11", categories: ["games"],
  icons: [
    { src: "icons/icon-192.png", sizes: "192x192", type: "image/png" },
    { src: "icons/icon-512.png", sizes: "512x512", type: "image/png" },
    { src: "icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    { src: "icons/icon.svg", sizes: "any", type: "image/svg+xml" },
  ],
}, null, 2));

// Service worker: önbellek adı içerikten türetilir; her derleme eskiyi temizler
const assets = ["./", "index.html", "manifest.webmanifest", "vendor/interact.min.js",
  ...readdirSync(new URL("fonts/", W)).filter(f => f.endsWith(".woff2")).map(f => "fonts/" + f),
  ...readdirSync(new URL("icons/", W)).map(f => "icons/" + f), ...PHOTOS.map(f => "portraits/" + f)];
const ver = createHash("sha1").update(web).digest("hex").slice(0, 10);
writeFileSync(new URL("sw.js", W), `// Çaylar Belediyeden: çevrimdışı önbellek (derlemede üretilir)
const CACHE = "caylar-${ver}";
const ASSETS = ${JSON.stringify(assets)};
self.addEventListener("install", e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting())); });
self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k.startsWith("caylar-") && k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", e => {
  const req = e.request;
  if (req.method !== "GET" || new URL(req.url).origin !== location.origin) return;
  // Sayfa: önce ağ (güncel sürüm gelsin), yoksa önbellek. Diğerleri: önce önbellek.
  if (req.mode === "navigate") {
    e.respondWith(fetch(req).then(res => { const c = res.clone(); caches.open(CACHE).then(x => x.put("index.html", c)); return res; })
      .catch(() => caches.match("index.html")));
    return;
  }
  e.respondWith(caches.match(req, { ignoreSearch: true }).then(hit => hit || fetch(req).then(res => {
    if (res.ok) { const c = res.clone(); caches.open(CACHE).then(x => x.put(req, c)); }
    return res;
  })));
});
`);

// ── Tek dosyalık kopya: fontlar ve ikon içine gömülü, internet gerekmez
if (!SITE) {
const fontsInline = read("web-src/fonts.css").replace(/url\(fonts\/([^)]+)\)/g, (_, f) => `url(data:font/woff2;base64,${readFileSync(new URL("web-src/fonts/" + f, root)).toString("base64")})`);
const iconInline = "data:image/svg+xml;base64," + readFileSync(new URL("web-src/icons/icon.svg", root)).toString("base64");
const single = head
  .replace(/<link rel="(icon|apple-touch-icon|manifest)"[^\n]*\n/g, "")
  .replace("<style>", `<link rel="icon" href="${iconInline}" type="image/svg+xml">\n<style>`)
  .replace(read("web-src/fonts.css"), () => fontsInline);
writeFileSync(new URL("dist/oyna.html", root), single + fill(bodyOf(tpl), false, "single").trim() + "\n</body>\n</html>\n");
}

const kb = p => (readFileSync(p).length / 1024).toFixed(1) + " KB";
console.log(SITE ? "public/games/belediye/index.html" : "dist/web/index.html", kb(new URL("index.html", W)), "· önbellek", ver, "·", assets.length, "dosya");
if (!SITE) console.log("dist/caylar-belediyeden.html", kb(new URL("dist/caylar-belediyeden.html", root)), "· dist/oyna.html", kb(new URL("dist/oyna.html", root)));
