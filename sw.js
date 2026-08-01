// Service worker: offline app shell + data caching. Relative paths keep it working
// on GitHub Pages sub-paths (e.g. /tokyo-disney-guide/).
const VERSION = 'tdg-v10';
const SHELL_CACHE = `${VERSION}-shell`;

const SHELL = [
  './',
  './index.html',
  './manifest.json',
  './css/styles.css',
  './vendor/leaflet/leaflet.css',
  './vendor/leaflet/leaflet.js',
  './vendor/maplibre/maplibre-gl.css',
  './vendor/maplibre/maplibre-gl.js',
  './vendor/pmtiles/pmtiles.js',
  './vendor/protomaps/basemaps.js',
  './vendor/maplibre-gl-leaflet/leaflet-maplibre-gl.js',
  './js/app.js',
  './js/map.js',
  './js/basemap.js',
  './js/store.js',
  './js/geo.js',
  './js/search.js',
  './js/ui.js',
  './js/labels.js',
  './js/routing.js',
  './js/data/index.js',
  './js/data/parks.js',
  './js/data/tdl.js',
  './js/data/tds.js',
  './js/data/mapLabelTranslations.js',
  './js/data/routes/tdlWalkGraph.js',
  './js/data/routes/tdsWalkGraph.js',
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

function isPmtiles(url) {
  return /\.pmtiles(\?|$)/i.test(url);
}

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = req.url;

  // PMTiles uses HTTP Range requests. Never cache byte ranges in SW —
  // caching a partial Response breaks subsequent random-access reads.
  if (isPmtiles(url) || req.headers.has('Range')) {
    e.respondWith(fetch(req).catch(() => new Response('', {
      status: 504,
      statusText: 'offline pmtiles',
    })));
    return;
  }

  // Same-origin shell/data: NETWORK-FIRST so deploys apply on the next online load,
  // with cache fallback so everything still works offline.
  if (new URL(url).origin === self.location.origin) {
    e.respondWith((async () => {
      const cache = await caches.open(SHELL_CACHE);
      try {
        const res = await fetch(req);
        if (res && res.ok) cache.put(req, res.clone());
        return res;
      } catch {
        const hit = await cache.match(req);
        if (hit) return hit;
        if (req.mode === 'navigate') {
          const idx = await cache.match('./index.html');
          if (idx) return idx;
        }
        return new Response('오프라인 상태입니다.', { status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
      }
    })());
  }
});
