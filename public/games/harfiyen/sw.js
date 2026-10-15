/*
 * harfiyen's service worker. It does one thing: show the server's notices
 * ("Sıra sende" and the like) while the game is closed, and open the game
 * at the right room when one is tapped. No caching, no offline copy: every
 * request goes to the network as if it weren't here.
 */

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { body: event.data ? event.data.text() : "" };
  }
  event.waitUntil(
    self.registration.showNotification(data.title || "harfiyen", {
      body: data.body || "",
      tag: data.tag || undefined,
      // A newer notice for the same room replaces the older one, and still buzzes.
      renotify: Boolean(data.tag),
      data: { url: data.url || "#/cevrimici" },
      icon: "icons/icon-192.png",
      badge: "icons/badge-96.png",
      lang: "tr",
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = new URL((event.notification.data && event.notification.data.url) || "#/cevrimici", self.registration.scope).href;
  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      const open = windows.find((client) => client.url.startsWith(self.registration.scope));
      if (open) {
        // The page moves itself to the room: only its hash changes, nothing reloads.
        open.postMessage({ t: "open", url: target });
        return open.focus();
      }
      return self.clients.openWindow(target);
    })(),
  );
});
