import { chromium } from 'playwright';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PARK_BOUNDARY_GEOJSON } from '../../../js/data/parkBoundaryGeojson.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(__dirname, 'guest-v2');

const browser = await chromium.launch({ headless: true });
const page = await (await browser.newContext({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 2,
})).newPage();

const url = `http://127.0.0.1:5190/?review=guest-v2-bust&t=${Date.now()}`;
await page.goto(url, { waitUntil: 'domcontentloaded' });
await page.evaluate(async () => {
  if (navigator.serviceWorker) {
    const regs = await navigator.serviceWorker.getRegistrations();
    for (const r of regs) await r.unregister();
  }
  if (window.caches) {
    const keys = await caches.keys();
    for (const k of keys) await caches.delete(k);
  }
});
await page.reload({ waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => document.querySelector('.leaflet-container')?._tdgMap, null, { timeout: 60000 });
await page.waitForTimeout(2500);
await page.click('[data-park="TDS"]');
await page.waitForTimeout(1200);

const info = await page.evaluate(() => {
  const m = document.querySelector('.leaflet-container')._tdgMap;
  const rings = [];
  m.eachLayer((layer) => {
    if (layer instanceof L.Polyline && layer.options?.className === 'park-outline-stroke') {
      const ll = layer.getLatLngs();
      const flat = (Array.isArray(ll[0]) && ll[0].lat == null) ? ll.flat() : ll;
      rings.push(flat.map((p) => [Number(p.lat.toFixed(5)), Number(p.lng.toFixed(5))]));
    }
  });
  return {
    ringCount: rings.length,
    rings: rings.map((r) => ({
      n: r.length,
      north: Math.max(...r.map((x) => x[0])),
      south: Math.min(...r.map((x) => x[0])),
      west: Math.min(...r.map((x) => x[1])),
      east: Math.max(...r.map((x) => x[1])),
    })),
  };
});

const guest = PARK_BOUNDARY_GEOJSON.TDS.guestArea.ring;
const raw = PARK_BOUNDARY_GEOJSON.TDS.rawOsm.ring;
console.log('drawn', JSON.stringify(info, null, 2));
console.log('guest file', {
  n: guest.length,
  north: Math.max(...guest.map((p) => p[0])),
  west: Math.min(...guest.map((p) => p[1])),
});
console.log('raw file', {
  n: raw.length,
  north: Math.max(...raw.map((p) => p[0])),
  west: Math.min(...raw.map((p) => p[1])),
});

await page.evaluate(() => {
  const m = document.querySelector('.leaflet-container')._tdgMap;
  m.setView([35.62920, 139.88860], 18, { animate: false });
});
await page.waitForTimeout(700);
await page.screenshot({ path: path.join(OUT, 'tds-fantasy-springs-z18.png'), type: 'png' });

await page.evaluate(() => {
  const m = document.querySelector('.leaflet-container')._tdgMap;
  m.setView([35.62670, 139.88540], 16, { animate: false });
});
await page.waitForTimeout(700);
await page.screenshot({ path: path.join(OUT, 'tds-z16-guest.png'), type: 'png' });

// TDL entrance
await page.click('[data-park="TDL"]');
await page.waitForTimeout(1000);
await page.evaluate(() => {
  const m = document.querySelector('.leaflet-container')._tdgMap;
  m.setView([35.63535, 139.87970], 18, { animate: false });
});
await page.waitForTimeout(700);
await page.screenshot({ path: path.join(OUT, 'tdl-entrance-z18.png'), type: 'png' });

await browser.close();
console.log('rescaptured key shots without SW cache');
