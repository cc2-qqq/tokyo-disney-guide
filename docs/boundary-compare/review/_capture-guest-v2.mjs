/**
 * Post-patch verification screenshots (390×844).
 * Requires local server: http://127.0.0.1:5190/
 */
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../../..');
const OUT = path.join(__dirname, 'guest-v2');
const BASE = process.env.REVIEW_URL || 'http://127.0.0.1:5190/?review=guest-v2';

const CENTERS = {
  TDL: [35.63235, 139.88065],
  TDS: [35.62670, 139.88540],
};

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const { PARK_BOUNDARY_GEOJSON } = await import(
    pathToFileURL(path.join(ROOT, 'js/data/parkBoundaryGeojson.js')).href
  );

  const browser = await chromium.launch({ headless: true });
  const page = await (await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
  })).newPage();

  await page.goto(`${BASE}${BASE.includes('?') ? '&' : '?'}t=${Date.now()}`, { waitUntil: 'domcontentloaded' });
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

  await page.evaluate(({ guest, raw, centers }) => {
    window.__revLayers = [];
    window.__review = { guest, raw, centers };
    window.__reviewView = async (park, zoom, mode) => {
      const m = document.querySelector('.leaflet-container')._tdgMap;
      for (const layer of window.__revLayers.splice(0)) {
        try { m.removeLayer(layer); } catch (_) { /* */ }
      }
      const pane = m.getPane('boundaries');
      if (pane) {
        pane.style.display = '';
        pane.style.visibility = 'visible';
        pane.style.opacity = '1';
      }
      m.invalidateSize(true);

      if (mode === 'fs') {
        m.setView([35.62920, 139.88860], 18, { animate: false });
      } else if (mode === 'entrance') {
        const ent = park === 'TDL' ? [35.63535, 139.87970] : [35.62670, 139.88220];
        m.setView(ent, 18, { animate: false });
      } else if (mode === 'debug-bounds') {
        m.setView(centers[park], 16, { animate: false });
      } else if (mode === 'debug-compare') {
        m.setView(centers[park], 16, { animate: false });
      } else {
        m.setView(centers[park], zoom, { animate: false });
      }
      await new Promise((r) => setTimeout(r, 600));

      if (mode === 'debug-bounds' || mode === 'debug-compare' || mode === 'debug-outside') {
        // keep app guest stroke visible
        if (pane) {
          pane.querySelectorAll('path.park-outline-stroke').forEach((p) => { p.style.display = ''; });
          pane.style.visibility = 'visible';
        }
        const mb = m.options.maxBounds;
        if (mb) {
          window.__revLayers.push(L.rectangle(mb, {
            pane: 'boundaries', interactive: false, color: '#ff6f00', weight: 2,
            opacity: 1, fill: false, dashArray: '5 4',
          }).addTo(m));
        }
      }
      if (mode === 'debug-compare') {
        const rawRing = window.__review.raw[park];
        window.__revLayers.push(L.polyline([...rawRing, rawRing[0]], {
          pane: 'boundaries', interactive: false, color: '#c2185b', weight: 2,
          opacity: 0.85, dashArray: '3 5',
        }).addTo(m));
      }
      if (mode === 'debug-outside') {
        // markers for any operating attractions outside guest ring (should be none)
        const guestRing = window.__review.guest[park];
        function pip(pt, poly) {
          let x = pt[1]; let y = pt[0]; let inside = false;
          for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
            const xi = poly[i][1]; const yi = poly[i][0];
            const xj = poly[j][1]; const yj = poly[j][0];
            const intersect = ((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi);
            if (intersect) inside = !inside;
          }
          return inside;
        }
        const markers = [...document.querySelectorAll('.m-attraction')];
        void markers; void guestRing; void pip;
      }

      return {
        park, zoom, mode,
        z: m.getZoom(),
        center: [m.getCenter().lat, m.getCenter().lng],
      };
    };
  }, {
    guest: {
      TDL: PARK_BOUNDARY_GEOJSON.TDL.guestArea.ring,
      TDS: PARK_BOUNDARY_GEOJSON.TDS.guestArea.ring,
    },
    raw: {
      TDL: PARK_BOUNDARY_GEOJSON.TDL.rawOsm.ring,
      TDS: PARK_BOUNDARY_GEOJSON.TDS.rawOsm.ring,
    },
    centers: CENTERS,
  });

  async function ensurePark(park) {
    const pressed = await page.evaluate((p) => (
      document.querySelector(`[data-park="${p}"]`)?.getAttribute('aria-pressed') === 'true'
    ), park);
    if (!pressed) {
      await page.click(`[data-park="${park}"]`);
      await page.waitForTimeout(1000);
    }
  }

  async function shot(name) {
    await page.screenshot({ path: path.join(OUT, name), type: 'png' });
    console.log('wrote', name);
  }

  for (const park of ['TDL', 'TDS']) {
    await ensurePark(park);
    for (const zoom of [16, 17, 18]) {
      const info = await page.evaluate(async ({ park, zoom }) => window.__reviewView(park, zoom, 'guest'), { park, zoom });
      console.log(JSON.stringify(info));
      await shot(`${park.toLowerCase()}-z${zoom}-guest.png`);
    }
    {
      const info = await page.evaluate(async ({ park }) => window.__reviewView(park, 18, 'entrance'), { park });
      console.log(JSON.stringify(info));
      await shot(`${park.toLowerCase()}-entrance-z18.png`);
    }
    {
      const info = await page.evaluate(async ({ park }) => window.__reviewView(park, 16, 'debug-bounds'), { park });
      console.log(JSON.stringify(info));
      await shot(`${park.toLowerCase()}-debug-guest-maxbounds.png`);
    }
    {
      const info = await page.evaluate(async ({ park }) => window.__reviewView(park, 16, 'debug-compare'), { park });
      console.log(JSON.stringify(info));
      await shot(`${park.toLowerCase()}-debug-raw-vs-guest.png`);
    }
  }

  await ensurePark('TDS');
  {
    const info = await page.evaluate(async () => window.__reviewView('TDS', 18, 'fs'));
    console.log(JSON.stringify(info));
    await shot('tds-fantasy-springs-z18.png');
  }

  await browser.close();
  console.log('done →', OUT);
}

main().catch((e) => { console.error(e); process.exit(1); });
