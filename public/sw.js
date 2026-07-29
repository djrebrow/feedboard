// sw.js — Service-Worker: App-Shell offline verfügbar machen
'use strict';

const CACHE = 'feedboard-v1';
const SHELL = ['/', '/manifest.webmanifest', '/icon.svg'];

// Den Volltext holt die Oberflaeche per POST — gespeichert wird im Cache aber
// nur, was per GET lief. Ohne Netz greifen wir deshalb auf den Vorrat zurueck,
// den „Offline lesen" unter derselben Adresse per GET abgelegt hat.
const VOLLTEXT = /^\/api\/articles\/\d+\/content$/;

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE)
      .then((cache) => cache.addAll(SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return; // externe Ressourcen (Bilder, Fonts) normal laden

  if (req.method === 'POST' && VOLLTEXT.test(url.pathname)) {
    event.respondWith(
      fetch(req).catch(() => caches.match(url.pathname).then((treffer) => treffer || new Response(
        JSON.stringify({ error: 'Offline und nicht im Vorrat.', code: 'offline_missing' }),
        { status: 503, headers: { 'Content-Type': 'application/json' } }
      )))
    );
    return;
  }

  if (req.method !== 'GET') return;

  // API: zuerst Netzwerk, bei Fehler aus dem Cache (letzter Stand)
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy));
          return res;
        })
        .catch(() => caches.match(req))
    );
    return;
  }

  // Navigation: zuerst Netzwerk (frische, versionierte Asset-URLs), sonst Shell aus Cache
  if (req.mode === 'navigate') {
    event.respondWith(fetch(req).catch(() => caches.match('/')));
    return;
  }

  // Statische Assets (app.js?v=…, style.css?v=…, Icon): zuerst Cache, sonst laden und cachen
  event.respondWith(
    caches.match(req).then((cached) =>
      cached ||
      fetch(req).then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(req, copy));
        return res;
      })
    )
  );
});
