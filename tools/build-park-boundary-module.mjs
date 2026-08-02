// Convert static OSM GeoJSON extracts → js/data/parkBoundaryGeojson.js
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

function load(parkId, file) {
  const gj = JSON.parse(readFileSync(join(ROOT, 'data', 'boundaries', file), 'utf8'));
  const feat = gj.features[0];
  const ringLngLat = feat.geometry.coordinates[0];
  const ring = [];
  for (let i = 0; i < ringLngLat.length; i++) {
    const [lng, lat] = ringLngLat[i];
    if (i === ringLngLat.length - 1 && ring.length) {
      const [oLat, oLng] = ring[0];
      if (lat === oLat && lng === oLng) break;
    }
    ring.push([lat, lng]);
  }
  return {
    parkId,
    feature: {
      type: 'Feature',
      id: feat.id,
      properties: feat.properties,
      geometry: feat.geometry,
    },
    // Leaflet [lat, lng] ring (open; renderer closes it)
    ring,
  };
}

const TDL = load('TDL', 'tdl-park-boundary.geojson');
const TDS = load('TDS', 'tds-park-boundary.geojson');

const out = `// AUTO-GENERATED from data/boundaries/*.geojson — do not hand-edit rings.
// Source: OpenStreetMap tourism=theme_park ways (ODbL). Not a legal boundary.
// Regenerate: node tools/extract-park-boundaries.mjs && node tools/build-park-boundary-module.mjs

export const PARK_BOUNDARY_GEOJSON = {
  TDL: ${JSON.stringify(TDL, null, 2)},
  TDS: ${JSON.stringify(TDS, null, 2)},
};

export function getOsmParkRing(parkId) {
  return PARK_BOUNDARY_GEOJSON[parkId]?.ring || null;
}

export function getOsmParkFeature(parkId) {
  return PARK_BOUNDARY_GEOJSON[parkId]?.feature || null;
}
`;

const dest = join(ROOT, 'js', 'data', 'parkBoundaryGeojson.js');
writeFileSync(dest, out, 'utf8');
console.log('wrote', dest);
console.log('TDL ring', TDL.ring.length, 'TDS ring', TDS.ring.length);
