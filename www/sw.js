/* offline cache for the web build — bump VERSION on every release */
const VERSION = 'v1.1.0';
const FILES = [
  "./",
  "css/app.css",
  "fonts/amiri-ar-700.woff2",
  "fonts/cairo-ar-400.woff2",
  "fonts/cairo-ar-700.woff2",
  "fonts/cairo-la-400.woff2",
  "fonts/cairo-la-700.woff2",
  "fonts/naskh-ar-700.woff2",
  "fonts/naskh-la-700.woff2",
  "fonts/nsans-ar-700.woff2",
  "fonts/plex-ar-700.woff2",
  "fonts/plex-la-700.woff2",
  "fonts/tajawal-ar-700.woff2",
  "icons/icon-192.png",
  "icons/icon-512.png",
  "icons/maskable-512.png",
  "index.html",
  "js/app.js",
  "js/parser.js",
  "js/platform.js",
  "manifest.webmanifest",
  "tpl/removal.jpg",
  "tpl/report.jpg",
  "tpl/stop.jpg",
  "vendor/capacitor.js",
  "vendor/jspdf.umd.min.js",
];
self.addEventListener('install', e => { e.waitUntil(caches.open(VERSION).then(c => c.addAll(FILES)).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== VERSION).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  e.respondWith(caches.match(e.request, { ignoreSearch: true }).then(r => r || fetch(e.request).then(res => {
    if (res.ok && new URL(e.request.url).origin === location.origin) { const cp = res.clone(); caches.open(VERSION).then(c => c.put(e.request, cp)); }
    return res;
  }).catch(() => caches.match('./index.html'))));
});
