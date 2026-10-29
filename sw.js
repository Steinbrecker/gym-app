// Offline-Cache. Bei jeder neuen Version VERSION hochzählen (gleich wie APP_VERSION in app.js).
const VERSION = 'gym-v17';
const FILES = ['./', 'index.html', 'style.css', 'logic.js', 'seed-week.js', 'app.js', 'manifest.webmanifest', 'icon-180.png', 'icon-192.png', 'icon-512.png'];

self.addEventListener('install', e => {
  // cache: 'reload' umgeht den HTTP-Zwischenspeicher von GitHub, damit keine alten Dateien im neuen Cache landen
  e.waitUntil(caches.open(VERSION)
    .then(c => c.addAll(FILES.map(f => new Request(f, { cache: 'reload' }))))
    .then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
// Netzwerk zuerst (immer aktuell), bei schlechtem Netz nach 2,5 s oder offline aus dem Cache.
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET' || new URL(e.request.url).origin !== location.origin) return;
  e.respondWith(caches.open(VERSION).then(c => {
    const fromCache = () => c.match(e.request, { ignoreSearch: true }).then(r => r || c.match('index.html'));
    const net = fetch(e.request, { cache: 'no-cache' }).then(res => { if (res.ok) c.put(e.request, res.clone()); return res; });
    const timeout = new Promise(res => setTimeout(res, 2500));
    return Promise.race([net.catch(() => null), timeout.then(() => null)]).then(r => r || fromCache().then(h => h || net));
  }));
});
