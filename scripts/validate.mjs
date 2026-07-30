// Data validation for TDL/TDS POIs. Run: npm run validate
import { PARK_IDS, getPois } from '../js/data/index.js';

const errors = [];
const warnings = [];
const err = (m) => errors.push(m);
const warn = (m) => warnings.push(m);

const LAT_MIN = 35.60, LAT_MAX = 35.66;
const LNG_MIN = 139.86, LNG_MAX = 139.90;
const FACILITY_TYPES = new Set(['restroom', 'firstAid', 'emergencyFacility', 'babyCare']);

const seenIds = new Map();
const coordKeyByType = new Map();

let total = 0;

for (const parkId of PARK_IDS) {
  const pois = getPois(parkId);
  for (const p of pois) {
    total++;
    const tag = `[${parkId}] ${p.id || '(no id)'}`;

    // required fields
    for (const f of ['id', 'park', 'area', 'type', 'coordinateStatus']) {
      if (p[f] == null || p[f] === '') err(`${tag}: 필수 필드 누락 '${f}'`);
    }

    // park consistency
    if (p.park !== parkId) err(`${tag}: 파크 구분 오류 (park='${p.park}', 파일='${parkId}')`);

    // duplicate id
    if (seenIds.has(p.id)) err(`${tag}: ID 중복 (이미 ${seenIds.get(p.id)}에 존재)`);
    else seenIds.set(p.id, parkId);

    // name present
    const hasName = p.name || p.nameKo;
    if (!hasName) err(`${tag}: 이름 누락(name/nameKo)`);

    const status = p.coordinateStatus;
    const coords = p.coordinates;

    if (status === 'unknown') {
      if (coords != null) err(`${tag}: unknown 상태인데 coordinates가 존재`);
      continue; // unknown has no coords by design
    }

    // coordinate format
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

    // verified/approximate conflict (정책상 항상 verified=false, approximate=true)
    if (p.coordinateVerified === true && p.approximate === true) {
      err(`${tag}: coordinateVerified=true 인데 approximate=true (충돌)`);
    }
    if (p.coordinateVerified !== false) {
      warn(`${tag}: coordinateVerified 는 정책상 false 여야 함 (현재 ${p.coordinateVerified})`);
    }

    // high without evidence
    if (status === 'high_estimated' && !p.evidence && p.type !== 'attraction') {
      err(`${tag}: high_estimated 인데 evidence 없음`);
    }

    // paid-area / access conflict for facilities
    if (FACILITY_TYPES.has(p.type)) {
      if (p.insidePaidArea === false && p.generalGuestAccessible === false) {
        warn(`${tag}: insidePaidArea=false & generalGuestAccessible=false (접근성 확인 필요)`);
      }
      // restroom vs emergency type confusion
      if (p.type === 'restroom' && (p.name || '').match(/구호|의무|AED|응급/)) {
        err(`${tag}: restroom 타입인데 이름이 응급시설을 가리킴`);
      }
      if ((p.type === 'firstAid' || p.type === 'emergencyFacility') && p.generalRestroom === true) {
        err(`${tag}: 응급시설 타입인데 generalRestroom=true (유형 혼동)`);
      }
    }

    // duplicate coordinate within same type
    const key = `${p.type}:${lat.toFixed(6)},${lng.toFixed(6)}`;
    if (coordKeyByType.has(key)) {
      err(`${tag}: 같은 좌표/유형 중복 마커 (${coordKeyByType.get(key)})`);
    } else {
      coordKeyByType.set(key, p.id);
    }

    // confidence band vs status sanity
    if (status === 'high_estimated' && p.confidenceScore != null && p.confidenceScore < 70 && p.type !== 'attraction') {
      warn(`${tag}: high_estimated 인데 confidenceScore ${p.confidenceScore} (<70)`);
    }
  }
}

console.log(`검사한 POI 수: ${total}`);
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
