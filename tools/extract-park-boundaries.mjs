// One-shot extractor: OSM theme_park ways → static GeoJSON for the app.
// Not used at runtime. Re-run only when refreshing boundary source data.
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT_DIR = join(ROOT, 'data', 'boundaries', 'raw');

const PARKS = {
  TDL: {
    osmType: 'way',
    osmId: 1282875870,
    name: 'Tokyo Disneyland',
    nameJa: '東京ディズニーランド',
    file: 'tdl-osm-theme-park.geojson',
  },
  TDS: {
    osmType: 'way',
    osmId: 203538370,
    name: 'Tokyo DisneySea',
    nameJa: '東京ディズニーシー',
    file: 'tds-osm-theme-park.geojson',
  },
};

const ENDPOINTS = [
  'https://overpass.kumi.systems/api/interpreter',
  'https://overpass-api.de/api/interpreter',
];

async function overpass(query) {
  let lastErr;
  for (const url of ENDPOINTS) {
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'User-Agent': 'tokyo-disney-guide/1.0 (boundary extract)',
        },
        body: `data=${encodeURIComponent(query)}`,
      });
      const text = await res.text();
      if (!res.ok) throw new Error(`${url} ${res.status}: ${text.slice(0, 200)}`);
      return JSON.parse(text);
    } catch (err) {
      lastErr = err;
    }
  }
  throw lastErr;
}

function ringFromGeometry(geometry) {
  const ring = geometry.map((g) => [g.lon, g.lat]);
  const [fLon, fLat] = ring[0];
  const [lLon, lLat] = ring[ring.length - 1];
  if (fLon !== lLon || fLat !== lLat) ring.push([fLon, fLat]);
  return ring;
}

function leafletLatLngs(ringLngLat) {
  // Leaflet wants [lat, lng]; drop closing duplicate for app ring helpers.
  const out = [];
  for (let i = 0; i < ringLngLat.length; i++) {
    const [lng, lat] = ringLngLat[i];
    if (i === ringLngLat.length - 1 && out.length) {
      const [oLat, oLng] = out[0];
      if (lat === oLat && lng === oLng) break;
    }
    out.push([lat, lng]);
  }
  return out;
}

async function extractOne(parkId, meta) {
  const query = `[out:json][timeout:90];way(${meta.osmId});out geom;`;
  const data = await overpass(query);
  const way = data.elements?.find((e) => e.type === 'way' && e.id === meta.osmId);
  if (!way?.geometry?.length) throw new Error(`No geometry for ${parkId} way/${meta.osmId}`);

  const ring = ringFromGeometry(way.geometry);
  const feature = {
    type: 'Feature',
    id: `way/${meta.osmId}`,
    properties: {
      parkId,
      osmType: meta.osmType,
      osmId: meta.osmId,
      name: meta.name,
      nameJa: meta.nameJa,
      nameKo: parkId === 'TDL' ? '도쿄 디즈니랜드' : '도쿄 디즈니씨',
      tourism: way.tags?.tourism || 'theme_park',
      source: 'OpenStreetMap',
      sourceUrl: `https://www.openstreetmap.org/way/${meta.osmId}`,
      license: 'ODbL',
      extractedAt: new Date().toISOString().slice(0, 10),
      notes: 'Raw OSM tourism=theme_park polygon for audit/provenance only. Not displayed on the map — see *-guest-area.geojson.',
      coordinateCount: ring.length,
      geometryType: 'Polygon',
      multipolygon: false,
    },
    geometry: {
      type: 'Polygon',
      coordinates: [ring],
    },
  };

  const collection = {
    type: 'FeatureCollection',
    features: [feature],
  };

  mkdirSync(OUT_DIR, { recursive: true });
  const outPath = join(OUT_DIR, meta.file);
  writeFileSync(outPath, `${JSON.stringify(collection, null, 2)}\n`, 'utf8');

  return {
    parkId,
    osmId: meta.osmId,
    points: ring.length,
    leafletRingPoints: leafletLatLngs(ring).length,
    outPath,
    tags: way.tags,
  };
}

const results = [];
for (const [parkId, meta] of Object.entries(PARKS)) {
  // eslint-disable-next-line no-await-in-loop
  const r = await extractOne(parkId, meta);
  results.push(r);
  console.log(`${parkId}: way/${r.osmId} points=${r.points} → ${r.outPath}`);
}

writeFileSync(
  join(ROOT, 'data', 'boundaries', '_extract-summary.json'),
  `${JSON.stringify({ extractedAt: new Date().toISOString(), results }, null, 2)}\n`,
  'utf8',
);
console.log('done');
