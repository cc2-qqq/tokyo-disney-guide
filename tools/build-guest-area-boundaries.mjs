/**
 * Build guest-orientation park outlines from raw OSM theme_park ways.
 *
 * - Preserves raw OSM under data/boundaries/raw/
 * - Writes corrected guest areas to data/boundaries/*-guest-area.geojson
 * - Regenerates js/data/parkBoundaryGeojson.js
 *
 * guestAreaOutline = OSM baseline + physical-boundary edits (not attraction hull).
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const BOUND = join(ROOT, 'data', 'boundaries');
const RAW = join(BOUND, 'raw');

const MAX_BOUNDS = {
  TDL: [[35.62880, 139.87680], [35.63720, 139.88480]],
  TDS: [[35.62320, 139.88100], [35.63060, 139.89020]],
};

function loadOsmRing(file) {
  const gj = JSON.parse(readFileSync(file, 'utf8'));
  const feat = gj.features[0];
  const coords = feat.geometry.coordinates[0];
  const ring = [];
  for (let i = 0; i < coords.length; i++) {
    const [lng, lat] = coords[i];
    if (i === coords.length - 1 && ring.length) {
      const [oLat, oLng] = ring[0];
      if (lat === oLat && lng === oLng) break;
    }
    ring.push([lat, lng]);
  }
  return { feat, ring, gj };
}

function clampToMaxBounds(pt, parkId) {
  const [[s, w], [n, e]] = MAX_BOUNDS[parkId];
  return [
    Math.min(n, Math.max(s, pt[0])),
    Math.min(e, Math.max(w, pt[1])),
  ];
}

function dedupeRing(ring, eps = 1e-9) {
  const out = [];
  for (const p of ring) {
    const prev = out[out.length - 1];
    if (!prev || Math.abs(prev[0] - p[0]) > eps || Math.abs(prev[1] - p[1]) > eps) out.push(p);
  }
  if (out.length > 1) {
    const a = out[0];
    const b = out[out.length - 1];
    if (Math.abs(a[0] - b[0]) <= eps && Math.abs(a[1] - b[1]) <= eps) out.pop();
  }
  return out;
}

function ensureClosedLngLat(ringLatLng) {
  const coords = ringLatLng.map(([lat, lng]) => [lng, lat]);
  const [lng0, lat0] = coords[0];
  const [lngN, latN] = coords[coords.length - 1];
  if (lng0 !== lngN || lat0 !== latN) coords.push([lng0, lat0]);
  return coords;
}

function segmentsIntersect(a, b, c, d) {
  const cross = (p, q, r) => (q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]);
  const onSeg = (p, q, r) =>
    Math.min(p[0], r[0]) <= q[0] && q[0] <= Math.max(p[0], r[0])
    && Math.min(p[1], r[1]) <= q[1] && q[1] <= Math.max(p[1], r[1]);
  const d1 = cross(a, b, c);
  const d2 = cross(a, b, d);
  const d3 = cross(c, d, a);
  const d4 = cross(c, d, b);
  if (((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0))
    && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))) return true;
  if (d1 === 0 && onSeg(a, c, b)) return true;
  if (d2 === 0 && onSeg(a, d, b)) return true;
  if (d3 === 0 && onSeg(c, a, d)) return true;
  if (d4 === 0 && onSeg(c, b, d)) return true;
  return false;
}

function hasSelfIntersection(ring) {
  const n = ring.length;
  for (let i = 0; i < n; i++) {
    const a = ring[i];
    const b = ring[(i + 1) % n];
    for (let j = i + 1; j < n; j++) {
      if (Math.abs(i - j) <= 1) continue;
      if (i === 0 && j === n - 1) continue;
      const c = ring[j];
      const d = ring[(j + 1) % n];
      // skip shared vertices of adjacent-adjacent
      if (a === d || b === c) continue;
      if (segmentsIntersect(a, b, c, d)) {
        // ignore merely touching at endpoints of non-adjacent? treat as intersection if proper
        const shareEnd =
          (a[0] === c[0] && a[1] === c[1]) || (a[0] === d[0] && a[1] === d[1])
          || (b[0] === c[0] && b[1] === c[1]) || (b[0] === d[0] && b[1] === d[1]);
        if (!shareEnd) return { i, j };
      }
    }
  }
  return null;
}

function outsideMaxBoundsCount(ring, parkId) {
  const [[s, w], [n, e]] = MAX_BOUNDS[parkId];
  let c = 0;
  for (const [lat, lng] of ring) {
    if (lat < s || lat > n || lng < w || lng > e) c += 1;
  }
  return c;
}

/**
 * TDL: keep OSM where it follows guest perimeter; cut east backstage, station, Bon Voyage, parking.
 * Rebuild west/north/east with physical-ish edges inside maxBounds.
 */
function buildTdlGuest(osmRing) {
  const notes = [];
  // Keep southern guest arc from OSM (Tomorrowland–Toontown–Critter approach), indices 22–37
  const south = osmRing.slice(22, 38).map((p) => clampToMaxBounds(p, 'TDL'));
  notes.push({
    action: 'keep_osm_segment',
    osmIndexRange: [22, 37],
    reason: '남·남동 게스트 외곽(투머로우랜드~크리터 접근). OSM 굴곡 유지',
  });

  // Replace east backstage (OSM 38–43) with fence-following edge west of service yard
  const eastCut = [
    [35.63040, 139.88390],
    [35.63080, 139.88395],
    [35.63140, 139.88405],
    [35.63200, 139.88415],
    [35.63260, 139.88425],
    [35.63320, 139.88435],
    [35.63380, 139.88440],
    [35.63430, 139.88420],
  ].map((p) => clampToMaxBounds(p, 'TDL'));
  notes.push({
    action: 'replace_segment',
    removedOsmIndexRange: [38, 43],
    reason: '동측 백스테이지·서비스 부지 제거. 수로/담장 쪽 외곽으로 축소',
    removedApprox: 'east of ~139.8845 toward 139.8872',
  });

  // Keep NE Adventureland outer from OSM 44–49 only (avoid overlap with entrance neck)
  const ne = osmRing.slice(44, 50).map((p) => clampToMaxBounds([
    Math.min(p[0], 35.63505),
    Math.min(p[1], 139.88450),
  ], 'TDL'));
  notes.push({
    action: 'keep_osm_segment_clamped',
    osmIndexRange: [44, 49],
    reason: '어드벤처랜드 북동 외곽 유지, maxBounds·서비스 쪽으로 과도한 돌출 클램프',
  });

  // World Bazaar neck — exclude station body & Bon Voyage commercial strip
  const entranceNeck = [
    [35.63495, 139.88310],
    [35.63505, 139.88240],
    [35.63515, 139.88170],
    [35.63522, 139.88110],
    [35.63526, 139.88050],
    [35.63526, 139.88000],
    [35.63522, 139.87955],
    [35.63510, 139.87915],
    [35.63490, 139.87880],
    [35.63460, 139.87850],
    [35.63425, 139.87830],
    [35.63390, 139.87815],
  ].map((p) => clampToMaxBounds(p, 'TDL'));
  notes.push({
    action: 'replace_segment',
    removedOsmIndexRange: [50, 86],
    reason: '월드바자 입구 네크 유지. 모노레일 스테이션 본체·Bon Voyage·외부 상업·북측 주차 제외',
  });

  // West edge along Tomorrowland service fence (inside maxBounds), reconnect to south start
  const west = [
    [35.63350, 139.87800],
    [35.63300, 139.87790],
    [35.63250, 139.87785],
    [35.63200, 139.87790],
    [35.63150, 139.87805],
    [35.63110, 139.87825],
    [35.63080, 139.87855],
    [35.63055, 139.87895],
    [35.63040, 139.87940],
  ].map((p) => clampToMaxBounds(p, 'TDL'));
  notes.push({
    action: 'replace_segment',
    removedOsmIndexRange: [0, 21],
    reason: '서측 OSM이 리조트 공유 노드·maxBounds 밖으로 연장됨 → 투머로우랜드 서측 담장/철도 쪽 게스트 외곽으로 축소',
  });

  const ring = dedupeRing([...south, ...eastCut, ...ne, ...entranceNeck, ...west]);
  return { ring, notes };
}

/**
 * TDS: discard west hotel/bus/road lobe and inadequate north edge;
 * keep SE waterfront OSM where usable; add Fantasy Springs + AW/Port Discovery outer.
 */
function buildTdsGuest(osmRing) {
  const notes = [];

  // Southeast tip from OSM (short), then south guest shoreline westward (no service spit, no long diagonal)
  const se = [
    ...osmRing.slice(0, 5).map((p) => clampToMaxBounds([p[0], Math.min(p[1], 139.89010)], 'TDS')),
    [35.62490, 139.88920],
    [35.62470, 139.88840],
    [35.62450, 139.88740],
    [35.62435, 139.88640],
    [35.62430, 139.88540],
    [35.62435, 139.88440],
  ].map((p) => clampToMaxBounds(p, 'TDS'));
  notes.push({
    action: 'keep_osm_plus_south_shore',
    osmIndexRange: [0, 4],
    reason: '동측 OSM 팁 유지 후 남측은 게스트 해안선을 따라 서진. 남측 서비스 수역·긴 대각선 제거',
  });

  // West guest edge: ticket plaza / harbor — exclude bus terminal, external roads, hotel mass
  const westEntrance = [
    [35.62450, 139.88340],
    [35.62485, 139.88270],
    [35.62540, 139.88235],
    [35.62590, 139.88222],
    [35.62640, 139.88220],
    [35.62680, 139.88225],
    [35.62720, 139.88240],
    [35.62755, 139.88260],
    [35.62790, 139.88295],
  ].map((p) => clampToMaxBounds(p, 'TDS'));
  notes.push({
    action: 'replace_segment',
    removedOsmIndexRange: [24, 142],
    reason: '버스터미널·외부 자동차도로·호텔 매스·리조트 공유 서쪽 로브 제거. 티켓게이트/하버 측 게스트 접근 외곽만 유지',
  });

  // North outer: American Waterfront + Port Discovery + Fantasy Springs (roads/buildings/canals)
  // Extra north margin so FS attraction markers (icon anchors) sit clearly inside at z18.
  const northGuest = [
    [35.62825, 139.88330],
    [35.62880, 139.88375],
    [35.62930, 139.88420],
    [35.62960, 139.88465],
    [35.62980, 139.88515],
    [35.62995, 139.88565],
    [35.63005, 139.88615],
    [35.63010, 139.88665],
    [35.63008, 139.88715],
    [35.63000, 139.88760],
    [35.62995, 139.88805],
    [35.63005, 139.88845],
    [35.63015, 139.88885],
    [35.63020, 139.88920],
    [35.63005, 139.88950],
    [35.62975, 139.88975],
    [35.62940, 139.88990],
    [35.62905, 139.88995],
    [35.62870, 139.88985],
    [35.62835, 139.88955],
  ].map((p) => clampToMaxBounds(p, 'TDS'));
  notes.push({
    action: 'add_guest_perimeter',
    reason: '아메리칸 워터프런트·포트 디스커버리 북측 외곽 및 판타지 스프링스(프로즌/라푼젤/피터팬 연결부)를 도로·수로·건물 외곽을 따라 추가. OSM way가 FS·북측 게스트 구역을 누락',
    includes: ['american-waterfront', 'port-discovery', 'fantasy-springs'],
  });

  // East return: simplified path from FS back toward SE tip (close without crossing)
  const east = [
    [35.62790, 139.88935],
    [35.62745, 139.88955],
    [35.62700, 139.88970],
    [35.62655, 139.88980],
    [35.62620, 139.88965],
    [35.62600, 139.88940],
  ].map((p) => clampToMaxBounds(p, 'TDS'));
  notes.push({
    action: 'replace_segment',
    removedOsmIndexRange: [174, 227],
    reason: '동측 OSM 요철·maxBounds 클램프 중복 세그먼트 대신 게스트 동측 해안/부지 선을 단순·비교차로 재구성',
  });

  const ring = dedupeRing([...se, ...westEntrance, ...northGuest, ...east]);
  return { ring, notes };
}

function toFeature(parkId, ring, notes, osmProps) {
  const coords = ensureClosedLngLat(ring);
  return {
    type: 'FeatureCollection',
    features: [{
      type: 'Feature',
      id: `${parkId.toLowerCase()}-guest-area`,
      properties: {
        parkId,
        boundaryPurpose: 'guest_orientation',
        officialBoundary: false,
        source: 'OSM tourism=theme_park way + official Korean PDF + vector basemap visual alignment',
        sourceOsmType: osmProps.osmType || 'way',
        sourceOsmId: osmProps.osmId,
        sourceOsmUrl: osmProps.sourceUrl,
        license: 'ODbL (OSM baseline) + app orientation edits',
        notes: '일반 게스트 이용구역을 이해하기 위한 안내용 보정 경계입니다. 공식·법적 경계가 아니며 실제 운영구역은 현장 안내를 따라 주세요.',
        checkedAt: '2026-08-02',
        coordinateCount: ring.length,
        geometryType: 'Polygon',
        multipolygon: false,
        edits: notes,
      },
      geometry: {
        type: 'Polygon',
        coordinates: [coords],
      },
    }],
  };
}

function ensureRawCopies() {
  mkdirSync(RAW, { recursive: true });
  for (const name of ['tdl-osm-theme-park.geojson', 'tds-osm-theme-park.geojson']) {
    const dest = join(RAW, name);
    if (!existsSync(dest)) {
      throw new Error(`Missing raw OSM extract: ${dest}. Run tools/extract-park-boundaries.mjs first.`);
    }
  }
}

function buildModule(tdlGuest, tdsGuest, tdlRaw, tdsRaw) {
  const pack = (parkId, guestFeat, rawPack) => {
    const gRing = [];
    const gCoords = guestFeat.features[0].geometry.coordinates[0];
    for (let i = 0; i < gCoords.length; i++) {
      const [lng, lat] = gCoords[i];
      if (i === gCoords.length - 1 && gRing.length) {
        const [oLat, oLng] = gRing[0];
        if (lat === oLat && lng === oLng) break;
      }
      gRing.push([lat, lng]);
    }
    return {
      parkId,
      guestArea: {
        feature: guestFeat.features[0],
        ring: gRing,
      },
      rawOsm: {
        feature: rawPack.feat,
        ring: rawPack.ring,
      },
    };
  };

  const TDL = pack('TDL', tdlGuest, tdlRaw);
  const TDS = pack('TDS', tdsGuest, tdsRaw);

  const out = `// AUTO-GENERATED — do not hand-edit rings.
// rawOsm: data/boundaries/raw/*-osm-theme-park.geojson
// guestArea: data/boundaries/*-guest-area.geojson
// Regenerate: node tools/build-guest-area-boundaries.mjs

export const PARK_BOUNDARY_GEOJSON = {
  TDL: ${JSON.stringify(TDL, null, 2)},
  TDS: ${JSON.stringify(TDS, null, 2)},
};

export function getGuestAreaRing(parkId) {
  return PARK_BOUNDARY_GEOJSON[parkId]?.guestArea?.ring || null;
}

export function getRawOsmRing(parkId) {
  return PARK_BOUNDARY_GEOJSON[parkId]?.rawOsm?.ring || null;
}

/** @deprecated use getGuestAreaRing */
export function getOsmParkRing(parkId) {
  return getGuestAreaRing(parkId);
}

export function getOsmParkFeature(parkId) {
  return PARK_BOUNDARY_GEOJSON[parkId]?.guestArea?.feature || null;
}
`;
  writeFileSync(join(ROOT, 'js', 'data', 'parkBoundaryGeojson.js'), out, 'utf8');
}

function main() {
  ensureRawCopies();
  const tdlRaw = loadOsmRing(join(RAW, 'tdl-osm-theme-park.geojson'));
  const tdsRaw = loadOsmRing(join(RAW, 'tds-osm-theme-park.geojson'));

  const tdlBuilt = buildTdlGuest(tdlRaw.ring);
  const tdsBuilt = buildTdsGuest(tdsRaw.ring);

  for (const [parkId, built] of [['TDL', tdlBuilt], ['TDS', tdsBuilt]]) {
    const hit = hasSelfIntersection(built.ring);
    if (hit) {
      console.warn(parkId, 'self-intersection at', hit);
    }
    const outCount = outsideMaxBoundsCount(built.ring, parkId);
    console.log(parkId, 'points', built.ring.length, 'outsideMaxBounds', outCount, 'selfX', hit);
  }

  const tdlGuest = toFeature('TDL', tdlBuilt.ring, tdlBuilt.notes, tdlRaw.feat.properties || {});
  const tdsGuest = toFeature('TDS', tdsBuilt.ring, tdsBuilt.notes, tdsRaw.feat.properties || {});

  writeFileSync(join(BOUND, 'tdl-guest-area.geojson'), JSON.stringify(tdlGuest, null, 2));
  writeFileSync(join(BOUND, 'tds-guest-area.geojson'), JSON.stringify(tdsGuest, null, 2));
  writeFileSync(join(BOUND, '_guest-area-build-log.json'), JSON.stringify({
    builtAt: new Date().toISOString(),
    TDL: { points: tdlBuilt.ring.length, notes: tdlBuilt.notes },
    TDS: { points: tdsBuilt.ring.length, notes: tdsBuilt.notes },
  }, null, 2));

  buildModule(tdlGuest, tdsGuest, tdlRaw, tdsRaw);
  console.log('wrote guest areas + parkBoundaryGeojson.js');
}

main();
