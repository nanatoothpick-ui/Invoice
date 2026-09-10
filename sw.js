/**
 * TrioMech Invoicing — service worker
 * ------------------------------------
 * Only exists to make the app installable and let the app shell (the
 * HTML/CSS/JS/logo) load instantly and work offline. It deliberately
 * never touches the Google Sheets API or any third-party script —
 * invoice data must always come from the network, live.
 */

const CACHE_NAME = "triomech-invoicing-v1";
const APP_SHELL = [
  "./",
  "./index.html",
  "./style.css",
  "./app.js",
  "./manifest.json",
  "./assets/logo.png"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(APP_SHELL))
      .catch(() => {}) // don't block install if one asset fails offline-first
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((names) =>
      Promise.all(names.filter((n) => n !== CACHE_NAME).map((n) => caches.delete(n)))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);

  // Only ever handle our own same-origin static files. Everything else
  // (the Apps Script API, Google Fonts, cdnjs libraries) goes straight
  // to the network, untouched, so data is always live.
  if (url.origin !== self.location.origin) return;
  if (event.request.method !== "GET") return;

  event.respondWith(
    caches.match(event.request).then((cached) => {
      const network = fetch(event.request)
        .then((response) => {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
          return response;
        })
        .catch(() => cached);
      return cached || network;
    })
  );
});
