// Derleme: `vite build` → dist/ (bağımsız web uygulaması), `vite build --mode site` → sitenin public/games/belediye/ klasörü
// (package.json'daki build:site). Yollar göreli ("./"): aynı çıktı hem kökte hem /games/belediye/ altında çalışır.
// public/ olduğu gibi kopyalanır (vesikalıklar, meydan resimleri, ikonlar, manifest). Kod ve stil parça parça, özetli adlarla.
import { createHash } from "node:crypto";
import { readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { defineConfig } from "vite";

const here = resolve(import.meta.dirname);
const walk = d => readdirSync(d).flatMap(f => { const p = join(d, f); return statSync(p).isDirectory() ? walk(p) : [p]; });

// menüdeki sürüm: derleme günü ve kaynağın kısa özeti ("2026.09.25 · 3f9c2a1")
const srcHash = createHash("sha1");
for (const f of walk(join(here, "src")).sort()) srcHash.update(readFileSync(f));
const SURUM = `${new Date().toISOString().slice(0, 10).replaceAll("-", ".")} · ${srcHash.digest("hex").slice(0, 7)}`;

// Service worker: derlemenin bütün dosyalarını önbelleğe alır. Önbellek adı dosyaların içeriğinden türer,
// yeni derleme eskisini siler. Sayfa önce ağdan istenir (güncelleme bir yenilemeyle gelsin), gerisi önce önbellekten.
function serviceWorker() {
  let outDir = "";
  return {
    name: "belediye-sw",
    apply: "build",
    configResolved(c) { outDir = resolve(c.root, c.build.outDir); },
    closeBundle() {
      const files = walk(outDir).filter(f => !/[\\/]sw\.js$|\.map$/.test(f)).sort();
      const h = createHash("sha1");
      for (const f of files) h.update(readFileSync(f));
      const assets = ["./", ...files.map(f => relative(outDir, f).replaceAll("\\", "/"))];
      writeFileSync(join(outDir, "sw.js"), `// Çaylar Belediyeden: çevrimdışı önbellek (derlemede üretilir)
const CACHE = "caylar-${h.digest("hex").slice(0, 10)}";
const ASSETS = ${JSON.stringify(assets)};
self.addEventListener("install", e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting())); });
self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k.startsWith("caylar-") && k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", e => {
  const req = e.request;
  if (req.method !== "GET" || new URL(req.url).origin !== location.origin) return;
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
      console.log(`sw.js · ${assets.length} dosya önbellekte`);
    },
  };
}

export default defineConfig({
  base: "./",
  define: { __SURUM__: JSON.stringify(SURUM) },
  plugins: [serviceWorker()],
  build: { target: "es2022" },
  server: { host: true, port: 8765 },
  preview: { host: true, port: 8765 },
  test: { include: ["test/**/*.test.mjs"] }, // .cache/ altındaki tarayıcı profilleri taranmasın
});
