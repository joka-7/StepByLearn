// Minimal offline-shell service worker.
//
// Caches the static app shell on install so the UI loads without a network.
// API responses (under /api) are intentionally NOT cached here: all persistent
// state already lives in the local database, so the app is offline-capable
// without stale-caching dynamic responses.

const CACHE = "stepbylearn-shell-v2";
const SHELL = ["/", "/index.html", "/assets/app.css", "/assets/app.js"];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(SHELL)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
      )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  // Never intercept API traffic — always hit the local server directly.
  if (url.pathname.startsWith("/api")) {
    return;
  }
  // Cache-first for the static shell.
  event.respondWith(
    caches.match(event.request).then((cached) => cached || fetch(event.request))
  );
});
