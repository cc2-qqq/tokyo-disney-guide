// Service worker: offline app shell + data caching. Relative paths keep it working
// on GitHub Pages sub-paths (e.g. /tokyo-disney-guide/).
const VERSION = 'tdg-v1';
const SHELL_CACHE = `${VERSION}-shell`;
const TILE_CACHE = `${VERSION}-tiles`;
const MAX_TILES = 400;

const SHELL = [
  './',
  './index.html',
  './manifest.json',
  './css/styles.css',
  './vendor/leaflet/leaflet.css',
  './vendor/leaflet/leaflet.js',
  './js/app.js',
  './js/map.js',
  './js/store.js',
  './js/geo.js',
  './js/search.js',
  './js/ui.js',
  './js/labels.js',
  './js/data/index.js',
  './js/data/parks.js',
  './js/data/tdl.js',
  './js/data/tds.js',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/maskable-512.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(SHELL_CACHE)
      .then((c) => c.addAll(SHELL))
      .then(() => self.skipWaiting())
      .catch(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(
      keys.filter((k) => !k.startsWith(VERSION)).map((k) => caches.delete(k)),
    )).then(() => self.clients.claim()),
  );
});

function isTile(url) {
  return /tile\.openstreetmap\.org/.test(url);
}

async function trimTiles() {
  const cache = await caches.open(TILE_CACHE);
  const keys = await cache.keys();
  if (keys.length > MAX_TILES) {
    for (let i = 0; i < keys.length - MAX_TILES; i++) await cache.delete(keys[i]);
  }
}

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = req.url;

  // OSM tiles: cache-first, then network (best-effort, no failure surfaced).
  if (isTile(url)) {
    e.respondWith((async () => {
      const cache = await caches.open(TILE_CACHE);
      const hit = await cache.match(req);
      if (hit) return hit;
      try {
        const res = await fetch(req);
        if (res && res.ok) { cache.put(req, res.clone()); trimTiles(); }
        return res;
      } catch {
        return new Response('', { status: 504, statusText: 'offline tile' });
      }
    })());
    return;
  }

  // Same-origin shell/data: stale-while-revalidate.
  if (new URL(url).origin === self.location.origin) {
    e.respondWith((async () => {
      const cache = await caches.open(SHELL_CACHE);
      const hit = await cache.match(req);
      const fetching = fetch(req).then((res) => {
        if (res && res.ok) cache.put(req, res.clone());
        return res;
      }).catch(() => null);
      if (hit) return hit;
      const net = await fetching;
      if (net) return net;
      // navigation fallback
      if (req.mode === 'navigate') {
        const idx = await cache.match('./index.html');
        if (idx) return idx;
      }
      return new Response('오프라인 상태입니다.', { status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
    })());
  }
});
