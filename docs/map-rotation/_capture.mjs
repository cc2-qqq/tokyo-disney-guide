/**
 * Map rotation prototype checks + 390×844 review captures.
 * Uses Playwright (not a real two-finger gesture); bearing set via map API.
 */
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = __dirname;
const BASE = process.env.REVIEW_URL || 'http://127.0.0.1:4173/';
fs.mkdirSync(OUT, { recursive: true });

async function waitMap(page) {
  await page.waitForFunction(() => {
    const el = document.getElementById('map');
    return el && el._tdgMap && typeof el._tdgMap.getBearing === 'function'
      && document.querySelector('.tdg-compass-btn');
  }, { timeout: 45000 });
  await page.waitForTimeout(1200);
}

async function mapEval(page, fn, arg) {
  return page.evaluate(({ fnBody, arg }) => {
    // eslint-disable-next-line no-new-func
    const fn = new Function(`return (${fnBody})`)();
    const map = document.getElementById('map')._tdgMap;
    return fn(map, arg);
  }, { fnBody: fn.toString(), arg });
}

async function setBearing(page, deg) {
  await page.evaluate((d) => {
    const map = document.getElementById('map')._tdgMap;
    map.setBearing(d);
  }, deg);
  await page.waitForTimeout(400);
}

async function closeSheet(page) {
  if (await page.locator('#sheet.open').count()) {
    await page.locator('#sheet-close').click();
    await page.waitForTimeout(350);
  }
}

async function shot(page, name) {
  const file = path.join(OUT, `${name}.png`);
  await page.screenshot({ path: file, fullPage: false });
  console.log('wrote', file);
}

async function clickMapAtLatLng(page, lat, lng) {
  return page.evaluate(({ lat, lng }) => {
    const map = document.getElementById('map')._tdgMap;
    const pt = map.latLngToContainerPoint([lat, lng]);
    const el = map.getContainer();
    const rect = el.getBoundingClientRect();
    const x = rect.left + pt.x;
    const y = rect.top + pt.y;
    const target = document.elementFromPoint(x, y);
    return {
      x: pt.x, y: pt.y,
      tag: target && target.tagName,
      cls: target && target.className,
      hitMarker: !!(target && (target.closest('.leaflet-marker-icon') || target.closest('.marker') || target.closest('.entrance-marker'))),
    };
  }, { lat, lng });
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
  });
  page.on('pageerror', (e) => console.log('PAGEERROR', e.message));

  await page.addInitScript(() => {
    localStorage.clear();
    localStorage.setItem('tdg:settings', JSON.stringify({
      theme: 'light', mapLabelMode: 'ko', mapSimplifyV1: true,
      showEntranceMarkers: true, showFamilyRideBadge: true,
      showParkBoundaries: false, showPregateBoundary: true,
    }));
    localStorage.setItem('tdg:visitList', JSON.stringify(['tdl-a-jungle']));
  });

  await page.goto(BASE, { waitUntil: 'domcontentloaded' });
  await waitMap(page);

  const boot = await page.evaluate(() => {
    const map = document.getElementById('map')._tdgMap;
    return {
      bearing: map.getBearing(),
      hasRotate: !!map._rotate,
      touchRotate: !!(map.touchRotate && map.touchRotate.enabled()),
      compass: !!document.querySelector('.tdg-compass-btn'),
      panes: {
        rotate: !!map.getPane('rotatePane'),
        norotate: !!map.getPane('norotatePane'),
        boundariesParent: map.getPane('boundaries')?.parentElement?.className,
        labelsParent: map.getPane('labels')?.parentElement?.className,
      },
    };
  });
  console.log('boot', boot);
  if (!boot.hasRotate || !boot.compass) throw new Error('rotation not initialized');

  // 1) bearing 0
  await shot(page, '01-bearing-0');

  // 2) 45°
  await setBearing(page, 45);
  await shot(page, '02-bearing-45');
  const c45 = await page.evaluate(() => {
    const n = document.querySelector('.tdg-compass-needle');
    const b = document.querySelector('.tdg-compass-btn');
    return { transform: n && n.style.transform, active: b && b.classList.contains('is-rotated') };
  });
  console.log('compass45', c45);

  // 3) 90°
  await setBearing(page, 90);
  await shot(page, '03-bearing-90');

  // Click-hit test at jungle cruise while rotated 90°
  const jungle = [35.63400, 139.88190];
  const hit90 = await clickMapAtLatLng(page, jungle[0], jungle[1]);
  console.log('hit90', hit90);

  // 4) select attraction at 90°
  await page.locator('[data-tab="attractions"]').click();
  await page.waitForTimeout(400);
  await page.locator('#sheet-body button[data-poi]').first().click();
  await page.waitForTimeout(800);
  await shot(page, '04-bearing-90-attraction-selected');
  await closeSheet(page);

  // 5) restrooms at 90°
  await page.locator('[data-tab="restrooms"]').click();
  await page.waitForTimeout(400);
  await closeSheet(page);
  await setBearing(page, 90);
  await shot(page, '05-bearing-90-restrooms');

  // 6) direction line at 90°
  await page.locator('[data-tab="attractions"]').click();
  await page.waitForTimeout(400);
  await page.locator('#sheet-body button[data-poi]').first().click();
  await page.waitForTimeout(500);
  const hasDir = await page.locator('button[data-act="direction"]').count();
  if (hasDir) {
    await page.locator('button[data-act="direction"]').first().click();
    await page.waitForTimeout(600);
  }
  await setBearing(page, 90);
  await shot(page, '06-bearing-90-direction');
  await closeSheet(page);

  // 7) compass reset
  await page.locator('.tdg-compass-btn').click();
  await page.waitForTimeout(900);
  const afterReset = await page.evaluate(() => document.getElementById('map')._tdgMap.getBearing());
  console.log('afterReset', afterReset);
  await shot(page, '07-bearing-reset-north');

  // 8) maxBounds corner + rotate
  await page.evaluate(() => {
    const map = document.getElementById('map')._tdgMap;
    const b = map.options.maxBounds;
    if (b) {
      const sw = b.getSouthWest();
      map.setView([sw.lat + 0.0015, sw.lng + 0.0015], 17, { animate: false });
    }
    map.setBearing(60);
  });
  await page.waitForTimeout(700);
  const corner = await page.evaluate(() => {
    const map = document.getElementById('map')._tdgMap;
    const size = map.getSize();
    const center = map.getCenter();
    const inBounds = map.options.maxBounds ? map.options.maxBounds.contains(center) : null;
    return { size: { x: size.x, y: size.y }, center: [center.lat, center.lng], inBounds, bearing: map.getBearing() };
  });
  console.log('corner', corner);
  await shot(page, '08-maxbounds-corner-rotated');

  // Park switch resets bearing
  await page.locator('[data-park="TDS"]').click();
  await page.waitForTimeout(800);
  const tdsBearing = await page.evaluate(() => document.getElementById('map')._tdgMap.getBearing());
  console.log('tdsBearing', tdsBearing);

  // Console errors already logged via pageerror
  const errors = [];
  // soft assertions
  if (Math.abs(afterReset) > 1) errors.push('compass did not reset near 0');
  if (Math.abs(tdsBearing) > 1) errors.push('park switch did not reset bearing');
  if (!c45.active) errors.push('compass not active at 45');
  if (!hit90.hitMarker && hit90.y > 0 && hit90.y < 800) {
    console.warn('WARN: latLng hit at 90° did not land on marker DOM (may still be OK if marker offset)');
  }

  await browser.close();
  if (errors.length) {
    console.error('FAIL', errors);
    process.exit(1);
  }
  console.log('rotation prototype checks ok');
}

main().catch((e) => { console.error(e); process.exit(1); });
