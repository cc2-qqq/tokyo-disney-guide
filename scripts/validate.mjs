// Data validation for TDL/TDS POIs + walk graphs + park bounds. Run: npm run validate
import {
  PARK_IDS, PARKS, getPois, getRestaurants, getEntrances, getParkBoundaries, RESTAURANT_AUDIT,
} from '../js/data/index.js';
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

    if ((status === 'high_estimated' || status === 'high_verified' || status === 'medium_estimated')
      && !p.evidence && p.type !== 'attraction') {
      err(`${tag}: ${status} 인데 evidence 없음`);
    }

    if (p.type === 'restaurant') {
      const FACILITY_TYPE_OK = new Set([
        'restaurant', 'quick_service', 'cafe', 'snack_stand', 'food_wagon', 'popcorn_wagon', 'drink_stand',
      ]);
      const MEAL_OK = new Set(['meal', 'light_meal', 'snack', 'dessert', 'drink', 'popcorn']);
      const COORD_OK = new Set(['high_verified', 'medium_estimated', 'low_estimated', 'unknown']);
      const BOOL_FIELDS = [
        'mobileOrder', 'prioritySeating', 'reservationRequired', 'childrenMenu',
        'specialDietaryMenu', 'plantBasedMenu', 'alcoholAvailable',
      ];
      if (!p.nameKo || !p.nameJa || !p.nameEn) err(`${tag}: 식당명 한·일·영 필드 누락`);
      if (!p.area) err(`${tag}: area 누락`);
      if (!FACILITY_TYPE_OK.has(p.facilityType)) err(`${tag}: facilityType 오류 '${p.facilityType}'`);
      if (!MEAL_OK.has(p.mealType)) err(`${tag}: mealType 오류 '${p.mealType}'`);
      if (!COORD_OK.has(status)) err(`${tag}: coordinateStatus 오류 '${status}'`);
      if (!p.checkedAt) err(`${tag}: checkedAt 누락`);
      if (!Array.isArray(p.representativeMenusKo) || p.representativeMenusKo.length < 1) {
        err(`${tag}: representativeMenusKo 배열 필요`);
      }
      for (const bf of BOOL_FIELDS) {
        if (p[bf] != null && typeof p[bf] !== 'boolean') err(`${tag}: ${bf}는 boolean|null 이어야 함`);
      }
      for (const urlKey of ['officialRestaurantUrl', 'officialMenuUrl']) {
        const u = p[urlKey];
        if (u != null && typeof u === 'string' && u && !/^https:\/\/www\.tokyodisneyresort\.jp\//.test(u)) {
          err(`${tag}: ${urlKey} 공식 도메인 형식 아님`);
        }
      }
      if (status === 'low_estimated' && p._forceDefaultVisible === true) {
        err(`${tag}: low_estimated 인데 기본 강제 표시 플래그`);
      }
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
        if (p.type === 'attraction' || status === 'high_estimated' || status === 'high_verified') {
          err(`${tag}: park maxBounds 밖 (${coords})`);
        } else {
          warn(`${tag}: park maxBounds 밖 (${coords})`);
        }
      }
    }
  }

  // Restaurant audit counts (informational)
  {
    const rests = getRestaurants(parkId);
    const popcorn = rests.filter((r) => r.isPopcornOrWagon).length;
    const lowHidden = rests.filter((r) => r.coordinateStatus === 'low_estimated').length;
    console.log(`[${parkId}] 식당 ${rests.length}곳 (팝콘·왜건 ${popcorn} · low_estimated 기본숨김 ${lowHidden})`);
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
  validateGuestAreaOutline(parkId, b, getPois(parkId), ents);
}

function pointInRing(pt, ring) {
  let x = pt[1]; let y = pt[0]; let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][1]; const yi = ring[i][0];
    const xj = ring[j][1]; const yj = ring[j][0];
    const intersect = ((yi > y) !== (yj > y))
      && (x < ((xj - xi) * (y - yi)) / (yj - yi + 0.0) + xi);
    if (intersect) inside = !inside;
  }
  return inside;
}

function haversineM(a, b) {
  const R = 6371000;
  const toR = (d) => (d * Math.PI) / 180;
  const dLat = toR(b[0] - a[0]);
  const dLng = toR(b[1] - a[1]);
  const la1 = toR(a[0]);
  const la2 = toR(b[0]);
  const h = Math.sin(dLat / 2) ** 2
    + Math.cos(la1) * Math.cos(la2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

function distToRingM(pt, ring) {
  let best = Infinity;
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i];
    const b = ring[(i + 1) % ring.length];
    // approximate: min distance to segment endpoints + mid (good enough for gate checks)
    best = Math.min(best, haversineM(pt, a), haversineM(pt, b));
    const mid = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
    best = Math.min(best, haversineM(pt, mid));
  }
  return best;
}

function segmentsIntersectProper(a, b, c, d) {
  const cross = (p, q, r) => (q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]);
  const d1 = cross(a, b, c);
  const d2 = cross(a, b, d);
  const d3 = cross(c, d, a);
  const d4 = cross(c, d, b);
  return ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0))
    && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0));
}

function ringSelfIntersects(ring) {
  const n = ring.length;
  for (let i = 0; i < n; i++) {
    const a = ring[i];
    const b = ring[(i + 1) % n];
    for (let j = i + 1; j < n; j++) {
      if (Math.abs(i - j) <= 1) continue;
      if (i === 0 && j === n - 1) continue;
      const c = ring[j];
      const d = ring[(j + 1) % n];
      if (segmentsIntersectProper(a, b, c, d)) return true;
    }
  }
  return false;
}

function isIntendedOutsideException(p) {
  if (!p) return false;
  if (p.hotelOnly === true) return true;
  if (p.pregate === true) return true;
  if (p.insidePaidArea === false) return true;
  if (p.area === 'pregate') return true;
  if (typeof p.id === 'string' && (p.id.includes('-pg') || p.id.includes('-hotel-'))) return true;
  return false;
}

function validateGuestAreaOutline(parkId, b, pois, ents) {
  if (b.entranceZone) warn(`[${parkId}] entranceZone는 폐기됨 — gateLine/approachArrow를 사용하세요`);

  const outline = b.guestAreaOutline || b.parkOutline;
  const ring = outline && outline.ring;
  if (!Array.isArray(ring) || ring.length < 20) {
    err(`[${parkId}] guestAreaOutline 부족(closed polygon 최소 20점): ${ring ? ring.length : 0}`);
    return;
  }
  for (const c of ring) {
    if (!Array.isArray(c) || c.length !== 2 || typeof c[0] !== 'number' || typeof c[1] !== 'number') {
      err(`[${parkId}] guestAreaOutline 좌표 형식 오류`);
      return;
    }
  }
  // zero-length / duplicate consecutive
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i];
    const c = ring[(i + 1) % ring.length];
    if (a[0] === c[0] && a[1] === c[1]) {
      err(`[${parkId}] guestAreaOutline 길이 0 세그먼트/중복 연속 좌표 @${i}`);
      break;
    }
  }
  if (ringSelfIntersects(ring)) {
    err(`[${parkId}] guestAreaOutline self-intersection`);
  }

  if (outline.boundaryPurpose && outline.boundaryPurpose !== 'guest_orientation') {
    warn(`[${parkId}] boundaryPurpose='${outline.boundaryPurpose}' (guest_orientation 권장)`);
  }
  if (outline.officialBoundary === true) {
    err(`[${parkId}] officialBoundary=true 이면 안 됨 (안내용 경계)`);
  }
  if (!b.rawOsmBoundary?.osmId && !outline.sourceOsmId) {
    warn(`[${parkId}] raw OSM 출처 id 없음 (감사 추적용)`);
  }

  const mb = PARKS[parkId].maxBounds;
  if (mb) {
    let outside = 0;
    for (const c of ring) {
      if (!inBounds(c, mb)) outside++;
    }
    if (outside > 0) {
      err(`[${parkId}] guestAreaOutline 점 ${outside}/${ring.length}개가 maxBounds 밖 — 경계를 줄이세요(maxBounds 확대 금지)`);
    }
  }

  // Operating attractions must be inside (no silent skip).
  let attrOut = 0;
  for (const p of pois) {
    if (p.type !== 'attraction') continue;
    if ((p.operatingStatus || 'operating') !== 'operating') continue;
    if (!p.coordinates) continue;
    if (!pointInRing(p.coordinates, ring)) {
      attrOut++;
      err(`[${parkId}] 운영 어트랙션이 guestAreaOutline 밖: ${p.id} (${p.nameKo || p.name || ''})`);
    }
  }

  // High/Medium park-interior restrooms must be inside unless intended exception.
  let rrOut = 0;
  for (const p of pois) {
    if (p.type !== 'restroom') continue;
    if (p.coordinateStatus !== 'high_estimated' && p.coordinateStatus !== 'medium_estimated') continue;
    if (!p.coordinates) continue;
    if (isIntendedOutsideException(p)) continue;
    if (p.insidePaidArea !== true) continue;
    if (!pointInRing(p.coordinates, ring)) {
      rrOut++;
      err(`[${parkId}] High/Medium 파크 내부 화장실이 guestAreaOutline 밖: ${p.id}`);
    }
  }

  // TDS Fantasy Springs key facilities
  if (parkId === 'TDS') {
    const fsIds = [
      'tds-a-frozen', 'tds-a-rapunzel', 'tds-a-peterpan', 'tds-a-tinkerbell',
    ];
    for (const id of fsIds) {
      const p = pois.find((x) => x.id === id);
      if (!p?.coordinates) {
        err(`[TDS] 판타지 스프링스 시설 누락: ${id}`);
        continue;
      }
      if (!pointInRing(p.coordinates, ring)) {
        err(`[TDS] 판타지 스프링스 시설이 guestAreaOutline 밖: ${id}`);
      }
    }
  }

  // Main entrance should sit near the outline (not deep inside / far away).
  const main = ents.find((e) => e.entranceKind === 'main_entrance');
  if (main?.coordinates) {
    const d = distToRingM(main.coordinates, ring);
    if (d > 90) {
      err(`[${parkId}] 메인 입구가 guestAreaOutline에서 너무 멂 (${d.toFixed(0)}m)`);
    }
  }

  // Pregate / station markers must not be classified as deep park-interior POIs.
  for (const e of ents) {
    if (e.entranceKind !== 'pre_gate' && e.entranceKind !== 'station_side') continue;
    if (e.insidePaidArea === true) {
      err(`[entrance:${parkId}] ${e.id}: 프리게이트/스테이션이 insidePaidArea=true 로 분류됨`);
    }
    if (e.coordinates && pointInRing(e.coordinates, ring)) {
      const d = distToRingM(e.coordinates, ring);
      if (d > 45) {
        err(`[entrance:${parkId}] ${e.id}: 프리게이트/스테이션이 파크 polygon 깊숙이 들어감 (${d.toFixed(0)}m)`);
      }
    }
  }

  if (attrOut === 0 && rrOut === 0) {
    // keep quiet on success counts; summary printed below
  }
}

if (RESTAURANT_AUDIT) {
  console.log('\n--- 식당 감사 요약 ---');
  console.log(`공식 목록(EN 집계): TDL ${RESTAURANT_AUDIT.officialListCounts?.TDL} · TDS ${RESTAURANT_AUDIT.officialListCounts?.TDS}`);
  console.log(`앱 등록: TDL ${RESTAURANT_AUDIT.tdlRegistered} · TDS ${RESTAURANT_AUDIT.tdsRegistered}`);
  console.log(`팝콘·왜건: TDL ${RESTAURANT_AUDIT.tdlPopcornWagon} · TDS ${RESTAURANT_AUDIT.tdsPopcornWagon}`);
  console.log('좌표 신뢰도', JSON.stringify(RESTAURANT_AUDIT.byCoordinateStatus));
  console.log(`어린이메뉴 ${RESTAURANT_AUDIT.childrenMenuTrue} · 모바일오더 ${RESTAURANT_AUDIT.mobileOrderTrue} · 우선안내 ${RESTAURANT_AUDIT.prioritySeatingTrue}`);
  console.log(`제외 ${RESTAURANT_AUDIT.excluded?.length || 0}건`);
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
