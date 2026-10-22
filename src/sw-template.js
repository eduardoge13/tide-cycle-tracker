/* Tide service worker — generated at build time from src/sw-template.js.
 *
 * Caches ONLY the app's own static shell (HTML, JS, CSS, icons, manifest).
 * It never sees cycle data: that lives in localStorage, which a service worker
 * cannot read, and the app makes no network requests with it.
 */
const VERSION = '__VERSION__';
const CACHE = `tide-shell-${VERSION}`;
const PRECACHE = __PRECACHE__;

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(PRECACHE))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('tide-shell-') && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // never touch other origins

  // Navigations: try the network for fresh HTML, fall back to the cached shell.
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          if (res.ok) caches.open(CACHE).then((c) => c.put('index.html', copy));
          return res;
        })
        .catch(() => caches.match('index.html', { ignoreSearch: true, ignoreVary: true })),
    );
    return;
  }

  // Static assets: cache first (filenames are content-hashed). ignoreVary is
  // needed because Vite tags assets `crossorigin` and servers often send
  // `Vary: Origin`, which would otherwise make every offline lookup miss.
  event.respondWith(caches.match(req, { ignoreSearch: true, ignoreVary: true }).then((hit) => hit || fetch(req)));
});
