/* offline cache for the web build — bump VERSION on every release */
const VERSION = 'v2.3.1';
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
  "js/layouts.js",
  "js/parser.js",
  "js/platform.js",
  "manifest.webmanifest",
  "tpl/H1-removal.jpg",
  "tpl/H1-report.jpg",
  "tpl/H1-stop.jpg",
  "tpl/H2-removal.jpg",
  "tpl/H2-report.jpg",
  "tpl/H2-stop.jpg",
  "tpl/H3-removal.jpg",
  "tpl/H3-report.jpg",
  "tpl/H3-stop.jpg",
  "tpl/S1-removal.jpg",
  "tpl/S1-report.jpg",
  "tpl/S1-stop.jpg",
  "tpl/S2-removal.jpg",
  "tpl/S2-report.jpg",
  "tpl/S2-stop.jpg",
  "tpl/S3-removal.jpg",
  "tpl/S3-report.jpg",
  "tpl/S3-stop.jpg",
  "vendor/capacitor.js",
  "vendor/pdf-lib.min.js",
  "tpl/H1.pdf",
  "tpl/H2.pdf",
  "tpl/H3.pdf",
  "tpl/S1.pdf",
  "tpl/S2.pdf",
  "tpl/S3.pdf"
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
