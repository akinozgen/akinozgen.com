// Çaylar Belediyeden: çevrimdışı önbellek (derlemede üretilir)
const CACHE = "caylar-e1062518a9";
const ASSETS = ["./","assets/AlfaSlabOne-400-latin-CbTZiZTW.woff2","assets/AlfaSlabOne-400-latin-ext-DZhSYPC8.woff2","assets/BarlowCondensed-500-latin-BgYH2mbd.woff2","assets/BarlowCondensed-500-latin-ext-yA5ONLQ9.woff2","assets/BarlowCondensed-600-latin-DepVgxBB.woff2","assets/BarlowCondensed-600-latin-ext-18ESti3H.woff2","assets/BarlowCondensed-700-latin-ext-CwuXbfVR.woff2","assets/BarlowCondensed-700-latin-v1xN8_Wq.woff2","assets/CourierPrime-400-latin-BbyBr73r.woff2","assets/CourierPrime-400-latin-ext-B-EsvyE4.woff2","assets/CourierPrime-400i-latin-CaR7PCvg.woff2","assets/CourierPrime-400i-latin-ext-BTeyNO-8.woff2","assets/CourierPrime-700-latin-D1YCjmaD.woff2","assets/CourierPrime-700-latin-ext-ByMJlNdM.woff2","assets/OldStandardTT-400-latin-CksAFory.woff2","assets/OldStandardTT-400-latin-ext-CeUx86po.woff2","assets/OldStandardTT-400i-latin-CCwC87fu.woff2","assets/OldStandardTT-400i-latin-ext-DY6MM75a.woff2","assets/OldStandardTT-700-latin-DLkH_MDP.woff2","assets/OldStandardTT-700-latin-ext-Bck9AhJw.woff2","assets/adlar-D4B6WrzL.js","assets/icerik-W2yiac8C.js","assets/index-OsaZeHp8.css","assets/index-mdRgY9C5.js","assets/kutuphane-Clj-Woyo.js","assets/rolldown-runtime-CbXtAM7H.js","assets/secim-CO5V7eRu.js","assets/secim-CexLXglo.css","fonts/OFL.txt","icons/apple-touch-icon.png","icons/icon-192.png","icons/icon-512.png","icons/icon.svg","icons/maskable-512.png","index.html","manifest.webmanifest","meydan/meydan-aksam.webp","meydan/meydan-gece.webp","meydan/meydan-gun.webp","portraits/albay.webp","portraits/ayse.webp","portraits/baskan-01.webp","portraits/baskan-02.webp","portraits/baskan-03.webp","portraits/baskan-04.webp","portraits/baskan-05.webp","portraits/baskan-06.webp","portraits/baskan-07.webp","portraits/baskan-08.webp","portraits/baskan-09.webp","portraits/baskan-10.webp","portraits/baskan-11.webp","portraits/baskan-12.webp","portraits/baskan-13.webp","portraits/baskan-14.webp","portraits/baskan-15.webp","portraits/baskan-16.webp","portraits/baskan-17.webp","portraits/baskan-18.webp","portraits/baskan-19.webp","portraits/baskan-20.webp","portraits/baskan-21.webp","portraits/baskan-22.webp","portraits/baskan-23.webp","portraits/baskan-24.webp","portraits/bekir.webp","portraits/burak.webp","portraits/cengiz.webp","portraits/deniz.webp","portraits/dursun.webp","portraits/elif.webp","portraits/fatma.webp","portraits/ferhat.webp","portraits/fikret.webp","portraits/hans.webp","portraits/hatice.webp","portraits/hayri.webp","portraits/huseyin.webp","portraits/ingrid.webp","portraits/kaan.webp","portraits/kaymakam.webp","portraits/kemal.webp","portraits/levent.webp","portraits/mahir.webp","portraits/muhtar.webp","portraits/naciye.webp","portraits/nermin.webp","portraits/orhan.webp","portraits/rahmi.webp","portraits/recep.webp","portraits/selin.webp","portraits/sevim.webp","portraits/tekir.webp","portraits/tuncay.webp","portraits/vekil.webp"];
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
