// Data validation for TDL/TDS POIs + walk graphs + park bounds. Run: npm run validate
import { PARK_IDS, PARKS, getPois, getEntrances, getParkBoundaries } from '../js/data/index.js';
import { TDL_WALK_GRAPH } from '../js/data/routes/tdlWalkGraph.js';
import { TDS_WALK_GRAPH } from '../js/data/routes/tdsWalkGraph.js';
import {
  findBrokenEdges, findZeroLengthEdges, connectedComponentCount,
} from '../js/routing.js';

const errors = [];
const warnings = [];
const err = (m) => errors.push(m);
const warn = (m) => warnings.push(m);

const LAT_MIN = 35.60, LAT_MAX = 35.66;
const LNG_MIN = 139.86, LNG_MAX = 139.90;
const FACILITY_TYPES = new Set(['restroom', 'firstAid', 'emergencyFacility', 'babyCare']);
const HEIGHT_OK = new Set(['official', 'no_restriction', 'unverified', 'none']); // none = legacy alias

const seenIds = new Map();
const coordKeyByType = new Map();

let total = 0;

function inBounds(coords, bounds) {
  const [[s, w], [n, e]] = bounds;
  return coords[0] >= s && coords[0] <= n && coords[1] >= w && coords[1] <= e;
}

for (const parkId of PARK_IDS) {
  const pois = getPois(parkId);
  const meta = PARKS[parkId];
  for (const p of pois) {
    total++;
    const tag = `[${parkId}] ${p.id || '(no id)'}`;

    for (const f of ['id', 'park', 'area', 'type', 'coordinateStatus']) {
      if (p[f] == null || p[f] === '') err(`${tag}: 필수 필드 누락 '${f}'`);
    }
    if (p.park !== parkId) err(`${tag}: 파크 구분 오류 (park='${p.park}', 파일='${parkId}')`);
    if (seenIds.has(p.id)) err(`${tag}: ID 중복 (이미 ${seenIds.get(p.id)}에 존재)`);
    else seenIds.set(p.id, parkId);

    const hasName = p.name || p.nameKo;
    if (!hasName) err(`${tag}: 이름 누락(name/nameKo)`);

    const status = p.coordinateStatus;
    const coords = p.coordinates;

    if (status === 'unknown') {
      if (coords != null) err(`${tag}: unknown 상태인데 coordinates가 존재`);
      continue;
    }

    if (!Array.isArray(coords) || coords.length !== 2 ||
        typeof coords[0] !== 'number' || typeof coords[1] !== 'number' ||
        Number.isNaN(coords[0]) || Number.isNaN(coords[1])) {
      err(`${tag}: 좌표 형식 오류 -> ${JSON.stringify(coords)}`);
      continue;
    }
    const [lat, lng] = coords;
    if (lat < LAT_MIN || lat > LAT_MAX || lng < LNG_MIN || lng > LNG_MAX) {
      err(`${tag}: 위도·경도 범위 벗어남 (${lat}, ${lng})`);
    }

    if (p.coordinateVerified === true && p.approximate === true) {
      err(`${tag}: coordinateVerified=true 인데 approximate=true (충돌)`);
    }
    if (p.coordinateVerified !== false) {
      warn(`${tag}: coordinateVerified 는 정책상 false 여야 함 (현재 ${p.coordinateVerified})`);
    }

    if ((status === 'high_estimated' || status === 'medium_estimated') && !p.evidence && p.type !== 'attraction') {
      err(`${tag}: ${status} 인데 evidence 없음`);
    }

    if (FACILITY_TYPES.has(p.type)) {
      if (p.insidePaidArea == null) err(`${tag}: insidePaidArea 값 누락`);
      if (p.generalGuestAccessible == null) err(`${tag}: generalGuestAccessible 값 누락`);
      if (p.insidePaidArea === false && p.generalGuestAccessible === false && !p.hotelOnly) {
        warn(`${tag}: insidePaidArea=false & generalGuestAccessible=false (접근성 확인 필요)`);
      }
      if (p.type === 'restroom' && (p.name || '').match(/구호|의무|AED|응급/)) {
        err(`${tag}: restroom 타입인데 이름이 응급시설을 가리킴`);
      }
      if ((p.type === 'firstAid' || p.type === 'emergencyFacility') && p.generalRestroom === true) {
        err(`${tag}: 응급시설 타입인데 generalRestroom=true (유형 혼동)`);
      }
      if ((p.type === 'firstAid' || p.type === 'emergencyFacility') && p.type === 'restroom') {
        err(`${tag}: 중앙구호실을 restroom으로 분류하면 안 됨`);
      }
      if (p.type === 'babyCare' && p.generalRestroom === true) {
        err(`${tag}: babyCare 인데 generalRestroom=true (화장실 수 중복 합산 위험)`);
      }
      if (parkId === 'TDS' && p.pdfVerified !== true && status !== 'unknown') {
        warn(`${tag}: TDS 시설인데 pdfVerified !== true`);
      }
      // Prefgate toilets must not be treated as default paid-area display.
      if (p.type === 'restroom' && p.insidePaidArea === false && p.generalGuestAccessible === true && p.pregate !== true && !p.hotelOnly) {
        warn(`${tag}: 파크 밖 화장실인데 pregate 플래그 없음`);
      }
    }

    const key = `${p.type}:${lat.toFixed(6)},${lng.toFixed(6)}`;
    if (coordKeyByType.has(key)) {
      err(`${tag}: 같은 좌표/유형 중복 마커 (${coordKeyByType.get(key)})`);
    } else {
      coordKeyByType.set(key, p.id);
    }

    // Attractions — height schema
    if (p.type === 'attraction') {
      const os = p.operatingStatus || 'operating';
      if (!['operating', 'closed_longterm'].includes(os)) err(`${tag}: 알 수 없는 operatingStatus '${os}'`);
      if (os === 'closed_longterm' && !p.closedInfo) warn(`${tag}: closed_longterm 인데 closedInfo 없음`);

      const hs = p.heightStatus === 'none' ? 'no_restriction' : p.heightStatus;
      if (!hs) err(`${tag}: heightStatus 누락`);
      else if (!HEIGHT_OK.has(p.heightStatus)) err(`${tag}: 알 수 없는 heightStatus '${p.heightStatus}'`);

      if (hs === 'official') {
        if (p.heightMin == null && p.heightMax == null) err(`${tag}: official 인데 heightMin/Max 없음`);
        if (!p.heightSourceUrl) err(`${tag}: official 인데 heightSourceUrl 누락`);
        if (!p.heightCheckedAt) err(`${tag}: official 인데 heightCheckedAt 누락`);
      }
      if (hs === 'no_restriction') {
        if (p.heightMin != null || p.heightMax != null) {
          err(`${tag}: no_restriction 인데 heightMin/Max 존재`);
        }
        if (os === 'operating' && !p.heightSourceUrl) warn(`${tag}: no_restriction 인데 heightSourceUrl 없음`);
        if (os === 'operating' && !p.heightCheckedAt) warn(`${tag}: no_restriction 인데 heightCheckedAt 없음`);
      }
      if (p.heightMin != null && p.heightMax != null && p.heightMin > p.heightMax) {
        err(`${tag}: heightMin(${p.heightMin}) > heightMax(${p.heightMax})`);
      }

      if (Array.isArray(p.closures)) {
        for (const cl of p.closures) {
          const df = /^\d{4}-\d{2}-\d{2}$/;
          if (!df.test(cl.startDate || '')) err(`${tag}: closure startDate 형식 오류 (${cl.startDate})`);
          if (cl.endDate != null && !df.test(cl.endDate)) err(`${tag}: closure endDate 형식 오류 (${cl.endDate})`);
          if (cl.endDate != null && cl.startDate > cl.endDate) err(`${tag}: closure 기간 역전 (${cl.startDate} > ${cl.endDate})`);
          if (!cl.sourceUrl) warn(`${tag}: closure sourceUrl 없음 (${cl.startDate})`);
        }
      }
    }

    if (status === 'high_estimated' && p.confidenceScore != null && p.confidenceScore < 70 && p.type !== 'attraction') {
      warn(`${tag}: high_estimated 인데 confidenceScore ${p.confidenceScore} (<70)`);
    }

    // Park maxBounds containment for attractions + high facilities
    if (meta.maxBounds && coords) {
      if (!inBounds(coords, meta.maxBounds)) {
        if (p.type === 'attraction' || status === 'high_estimated') {
          err(`${tag}: park maxBounds 밖 (${coords})`);
        } else {
          warn(`${tag}: park maxBounds 밖 (${coords})`);
        }
      }
    }
  }

  // Park bounds sanity
  if (!meta.maxBounds) err(`[${parkId}] maxBounds 누락`);
  if (!meta.defaultBounds) err(`[${parkId}] defaultBounds 누락`);
  if (!meta.entranceCoordinates) err(`[${parkId}] entranceCoordinates 누락`);
  if (meta.maxBounds && meta.center && !inBounds(meta.center, meta.maxBounds)) {
    err(`[${parkId}] center가 maxBounds 밖`);
  }
  if (meta.maxBounds && meta.entranceCoordinates && !inBounds(meta.entranceCoordinates, meta.maxBounds)) {
    err(`[${parkId}] entranceCoordinates가 maxBounds 밖`);
  }
}

// TDL/TDS maxBounds overlap check (should not be almost identical / fully nested wrongly)
{
  const a = PARKS.TDL.maxBounds; const b = PARKS.TDS.maxBounds;
  if (a && b) {
    const overlapLat = Math.min(a[1][0], b[1][0]) - Math.max(a[0][0], b[0][0]);
    const overlapLng = Math.min(a[1][1], b[1][1]) - Math.max(a[0][1], b[0][1]);
    if (overlapLat > 0.004 && overlapLng > 0.004) {
      warn('TDL/TDS maxBounds가 지나치게 넓게 중첩됩니다 (다른 파크가 크게 들어올 수 있음)');
    }
  }
}

// Walk graphs
function validateGraph(label, graph, parkId) {
  if (!graph) { err(`[graph:${label}] 그래프 없음`); return; }
  if (graph.park !== parkId) err(`[graph:${label}] park 불일치`);
  const broken = findBrokenEdges(graph);
  for (const e of broken) err(`[graph:${label}] 존재하지 않는 노드 참조 ${e.from}->${e.to}`);
  const zero = findZeroLengthEdges(graph);
  for (const e of zero) err(`[graph:${label}] 길이 0 edge ${e.from}->${e.to}`);
  const ids = new Set(graph.nodes.map((n) => n.id));
  for (const c of graph.destinationConnectors || []) {
    if (!ids.has(c.nodeId)) err(`[graph:${label}] connector 노드 없음: ${c.poiId} -> ${c.nodeId}`);
  }
  const meta = PARKS[parkId];
  for (const n of graph.nodes) {
    if (n.park && n.park !== parkId) err(`[graph:${label}] 다른 파크 노드 ${n.id}`);
    if (meta.maxBounds && !inBounds(n.coordinates, meta.maxBounds)) {
      err(`[graph:${label}] 노드 ${n.id}가 maxBounds 밖`);
    }
  }
  const comps = connectedComponentCount(graph);
  if (comps > 1) warn(`[graph:${label}] 연결 요소 ${comps}개 (고립 구간 가능)`);
  if (!graph.nodes.length) err(`[graph:${label}] 노드 없음`);
  if (!graph.edges.length) err(`[graph:${label}] 간선 없음`);
}

validateGraph('TDL', TDL_WALK_GRAPH, 'TDL');
validateGraph('TDS', TDS_WALK_GRAPH, 'TDS');

// Entrances + visual boundaries (guidance data; not cadastral).
const ENTRANCE_KINDS = new Set(['main_entrance', 'pre_gate', 'station_side']);
let entranceTotal = 0;
for (const parkId of PARK_IDS) {
  const ents = getEntrances(parkId);
  if (!ents.some((e) => e.entranceKind === 'main_entrance')) {
    err(`[${parkId}] 메인 입구(main_entrance) 없음`);
  }
  for (const e of ents) {
    entranceTotal++;
    const tag = `[entrance:${parkId}] ${e.id}`;
    for (const f of ['id', 'park', 'nameKo', 'coordinates', 'entranceKind', 'insidePaidArea', 'source', 'checkedAt']) {
      if (e[f] == null || e[f] === '') err(`${tag}: 필수 필드 누락 '${f}'`);
    }
    if (!ENTRANCE_KINDS.has(e.entranceKind)) err(`${tag}: entranceKind 오류`);
    if (!Array.isArray(e.coordinates) || e.coordinates.length !== 2) err(`${tag}: 좌표 형식 오류`);
    else if (PARKS[parkId].maxBounds && !inBounds(e.coordinates, PARKS[parkId].maxBounds)) {
      warn(`${tag}: maxBounds 밖 (안내용일 수 있음)`);
    }
    if (seenIds.has(e.id)) err(`${tag}: ID 중복`);
    else seenIds.set(e.id, parkId);
  }
  const b = getParkBoundaries(parkId);
  if (!b) { err(`[${parkId}] 경계 데이터 없음`); continue; }
  // OSM theme_park outline required; filled entranceZone polygons are not allowed.
  const ring = b.parkOutline && b.parkOutline.ring;
  if (!Array.isArray(ring) || ring.length < 50) {
    err(`[${parkId}] parkOutline 부족 (OSM 추출 다각형, 최소 50점 권장): ${ring ? ring.length : 0}`);
  } else {
    for (const c of ring) {
      if (!Array.isArray(c) || c.length !== 2 || typeof c[0] !== 'number' || typeof c[1] !== 'number') {
        err(`[${parkId}] parkOutline 좌표 형식 오류`);
        break;
      }
    }
  }
  if (!b.parkOutline?.osmId) err(`[${parkId}] parkOutline.osmId 없음 (OSM feature 연결 필요)`);
  if (b.entranceZone) warn(`[${parkId}] entranceZone는 폐기됨 — gateLine/approachArrow를 사용하세요`);
  if (b.parkOutline && b.parkOutline.coordinateCount && b.parkOutline.coordinateCount < 50) {
    warn(`[${parkId}] parkOutline 점 수가 적음 (${b.parkOutline.coordinateCount}) — 수동 hull이 아닌지 확인`);
  }
  const mb = PARKS[parkId].maxBounds;
  if (mb && Array.isArray(ring)) {
    let outside = 0;
    for (const c of ring) {
      if (!inBounds(c, mb)) outside++;
    }
    if (outside > ring.length * 0.15) {
      warn(`[${parkId}] parkOutline 점 ${outside}/${ring.length}개가 maxBounds 밖`);
    }
  }
}

console.log(`검사한 POI 수: ${total}`);
console.log(`검사한 입구 수: ${entranceTotal}`);
console.log(`경고: ${warnings.length}, 오류: ${errors.length}`);
if (warnings.length) {
  console.log('\n--- 경고 ---');
  warnings.forEach((w) => console.log('  ⚠ ' + w));
}
if (errors.length) {
  console.log('\n--- 오류 ---');
  errors.forEach((e) => console.log('  ✗ ' + e));
  process.exit(1);
}
console.log('\n✓ 데이터 검증 통과 (오류 없음)');
