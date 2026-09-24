// Çaylar Belediyeden: çevrimdışı önbellek (derlemede üretilir)
const CACHE = "caylar-a0f096cba6";
const ASSETS = ["./","index.html","manifest.webmanifest","vendor/interact.min.js","fonts/AlfaSlabOne-400-latin-ext.woff2","fonts/AlfaSlabOne-400-latin.woff2","fonts/BarlowCondensed-500-latin-ext.woff2","fonts/BarlowCondensed-500-latin.woff2","fonts/BarlowCondensed-600-latin-ext.woff2","fonts/BarlowCondensed-600-latin.woff2","fonts/BarlowCondensed-700-latin-ext.woff2","fonts/BarlowCondensed-700-latin.woff2","fonts/CourierPrime-400-latin-ext.woff2","fonts/CourierPrime-400-latin.woff2","fonts/CourierPrime-400i-latin-ext.woff2","fonts/CourierPrime-400i-latin.woff2","fonts/CourierPrime-700-latin-ext.woff2","fonts/CourierPrime-700-latin.woff2","fonts/OldStandardTT-400-latin-ext.woff2","fonts/OldStandardTT-400-latin.woff2","fonts/OldStandardTT-400i-latin-ext.woff2","fonts/OldStandardTT-400i-latin.woff2","fonts/OldStandardTT-700-latin-ext.woff2","fonts/OldStandardTT-700-latin.woff2","icons/apple-touch-icon.png","icons/icon-192.png","icons/icon-512.png","icons/icon.svg","icons/maskable-512.png"];
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
