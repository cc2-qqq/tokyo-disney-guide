// Tokyo Disneyland walk graph.
// Active graph: World Bazaar + Adventureland pilot (geometry-based, verified edges only).
// Legacy sparse 23-node graph kept as TDL_LEGACY_WALK_GRAPH for investigation (routingEnabled:false).

import { haversineMeters } from '../../geo.js';

function lineDistanceMeters(coords) {
  if (!coords || coords.length < 2) return 0;
  let sum = 0;
  for (let i = 1; i < coords.length; i += 1) sum += haversineMeters(coords[i - 1], coords[i]);
  return sum;
}

function n(id, coordinates, area, type, notes, status = 'estimated') {
  return {
    id,
    coordinates,
    area,
    type,
    status,
    verified: status === 'verified',
    source: 'official-map-and-satellite',
    notes,
  };
}

function e(id, from, to, geometry, notes, status = 'estimated') {
  const dist = Math.round(lineDistanceMeters(geometry));
  return {
    id,
    from,
    to,
    geometry,
    distance: dist,
    status,
    verified: status === 'verified',
    source: 'official-map-and-satellite',
    notes,
    accessible: true,
    stairs: false,
    indoor: from.includes('wb') || to.includes('wb'),
    oneWay: false,
    temporarilyClosed: false,
  };
}

function c(poiId, nodeId, maxM = 20) {
  return { poiId, nodeId, maxDistanceM: maxM };
}

// ---------------------------------------------------------------------------
// Pilot: World Bazaar · Central Plaza · Adventureland (Pirates / Jungle)
// Coordinates follow guest walkways (not building footprints / planters / water).
// ---------------------------------------------------------------------------
const nodes = [
  n('tdl-n-gate', [35.63518, 139.88000], 'world-bazaar', 'entrance', '정문 안쪽 월드바자 북단'),
  n('tdl-n-wb-n', [35.63478, 139.88018], 'world-bazaar', 'junction', '월드바자 북부 통로'),
  n('tdl-n-wb-fa', [35.63464, 139.88040], 'world-bazaar', 'poi', '중앙구호실 앞 보행로'),
  n('tdl-n-wb-mid', [35.63420, 139.88032], 'world-bazaar', 'junction', '월드바자 중부'),
  n('tdl-n-wb-s', [35.63355, 139.88052], 'world-bazaar', 'junction', '월드바자 남단 출구'),
  n('tdl-n-hub-n', [35.63322, 139.88082], 'world-bazaar', 'plaza', '중앙광장 북측(바자 출구 보행부)'),
  n('tdl-n-hub', [35.63290, 139.88100], 'world-bazaar', 'plaza', '중앙광장 중앙 보행 광장'),
  n('tdl-n-hub-e', [35.63305, 139.88142], 'adventureland', 'junction', '중앙광장 동측 보행로'),
  n('tdl-n-adv-gate', [35.63330, 139.88162], 'adventureland', 'junction', '어드벤처랜드 입구'),
  n('tdl-n-adv-plaza', [35.63348, 139.88182], 'adventureland', 'plaza', '어드벤처랜드 광장'),
  n('tdl-n-adv-pirates', [35.63320, 139.88165], 'adventureland', 'poi', '카리브의 해적 대기열 입구측 보행로'),
  n('tdl-n-adv-jungle-ap', [35.63375, 139.88190], 'adventureland', 'junction', '정글크루즈 접근 통로'),
  n('tdl-n-adv-jungle', [35.63398, 139.88198], 'adventureland', 'poi', '정글크루즈 탑승구 쪽 보행로'),
];

const edges = [
  e('tdl-e-001', 'tdl-n-gate', 'tdl-n-wb-n', [
    [35.63518, 139.88000],
    [35.63500, 139.88008],
    [35.63478, 139.88018],
  ], '월드바자 북측 중앙 통로'),
  e('tdl-e-002', 'tdl-n-wb-n', 'tdl-n-wb-fa', [
    [35.63478, 139.88018],
    [35.63470, 139.88028],
    [35.63464, 139.88040],
  ], '월드바자·중앙구호실 앞'),
  e('tdl-e-003', 'tdl-n-wb-fa', 'tdl-n-wb-mid', [
    [35.63464, 139.88040],
    [35.63442, 139.88036],
    [35.63420, 139.88032],
  ], '월드바자 중부 통로'),
  e('tdl-e-004', 'tdl-n-wb-mid', 'tdl-n-wb-s', [
    [35.63420, 139.88032],
    [35.63388, 139.88042],
    [35.63355, 139.88052],
  ], '월드바자 남부 통로'),
  e('tdl-e-005', 'tdl-n-wb-s', 'tdl-n-hub-n', [
    [35.63355, 139.88052],
    [35.63340, 139.88062],
    [35.63322, 139.88082],
  ], '바자 출구→중앙광장 북측 보행부'),
  e('tdl-e-006', 'tdl-n-hub-n', 'tdl-n-hub', [
    [35.63322, 139.88082],
    [35.63305, 139.88092],
    [35.63290, 139.88100],
  ], '중앙광장 북→중앙(광장 포장부)'),
  e('tdl-e-007', 'tdl-n-hub', 'tdl-n-hub-e', [
    [35.63290, 139.88100],
    [35.63295, 139.88120],
    [35.63300, 139.88132],
    [35.63305, 139.88142],
  ], '중앙광장 동측 원형 보행로(화단·캐슬 미통과)'),
  e('tdl-e-008', 'tdl-n-hub-e', 'tdl-n-adv-gate', [
    [35.63305, 139.88142],
    [35.63318, 139.88152],
    [35.63330, 139.88162],
  ], '중앙광장→어드벤처랜드 입구'),
  e('tdl-e-009', 'tdl-n-adv-gate', 'tdl-n-adv-plaza', [
    [35.63330, 139.88162],
    [35.63340, 139.88172],
    [35.63348, 139.88182],
  ], '어드벤처랜드 입구→광장'),
  e('tdl-e-010', 'tdl-n-adv-plaza', 'tdl-n-adv-pirates', [
    [35.63348, 139.88182],
    [35.63336, 139.88174],
    [35.63320, 139.88165],
  ], '광장→카리브의 해적 대기열 입구(건물 미진입)'),
  e('tdl-e-011', 'tdl-n-adv-plaza', 'tdl-n-adv-jungle-ap', [
    [35.63348, 139.88182],
    [35.63360, 139.88188],
    [35.63375, 139.88190],
  ], '광장→정글크루즈 방향 보행로'),
  e('tdl-e-012', 'tdl-n-adv-jungle-ap', 'tdl-n-adv-jungle', [
    [35.63375, 139.88190],
    [35.63388, 139.88194],
    [35.63398, 139.88198],
  ], '정글크루즈 탑승구 접근'),
  e('tdl-e-013', 'tdl-n-adv-pirates', 'tdl-n-adv-gate', [
    [35.63320, 139.88165],
    [35.63326, 139.88164],
    [35.63330, 139.88162],
  ], '해적 입구→어드벤처랜드 입구 보행로'),
];

const byId = Object.fromEntries(nodes.map((x) => [x.id, x]));
for (const edge of edges) {
  if (!byId[edge.from] || !byId[edge.to]) {
    throw new Error(`tdl walk edge bad ref ${edge.id}`);
  }
  // Ensure geometry endpoints match node coordinates closely.
  const a = byId[edge.from].coordinates;
  const b = byId[edge.to].coordinates;
  edge.geometry[0] = a;
  edge.geometry[edge.geometry.length - 1] = b;
  edge.distance = Math.round(lineDistanceMeters(edge.geometry));
}

const destinationConnectors = [
  c('tdl-a-pirates', 'tdl-n-adv-pirates', 18),
  c('tdl-a-jungle', 'tdl-n-adv-jungle', 18),
  c('tdl-firstaid-01', 'tdl-n-wb-fa', 15),
];

// Fill connector distances from POI coords when available at runtime; static approx here.
for (const conn of destinationConnectors) {
  const node = byId[conn.nodeId];
  conn.distance = 12;
  conn.nodeCoordinates = node.coordinates;
}

export const TDL_WALK_GRAPH = {
  park: 'TDL',
  // User-facing walk routes stay off until every edge on a path is status:verified.
  // Pilot geometry below is drafted (estimated) for review via ?routeDebug=1.
  routingEnabled: false,
  confidence: '시범 작성·미공개',
  coverageNote: '월드바자·중앙광장·어드벤처랜드 시범 geometry는 작성됐으나 현장 육안 검증 완료 전이라 사용자 경로에 사용하지 않습니다. 방향·직선거리만 안내합니다.',
  routingCoverage: {
    'world-bazaar': 'partial',
    adventureland: 'partial',
    westernland: 'unverified',
    'critter-country': 'unverified',
    fantasyland: 'unverified',
    toontown: 'unverified',
    tomorrowland: 'unverified',
  },
  coveredAreas: [],
  incompleteAreas: ['world-bazaar', 'adventureland', 'westernland', 'critter-country', 'fantasyland', 'toontown', 'tomorrowland', '톰 소여 섬', '백스테이지'],
  nodes,
  edges,
  destinationConnectors,
};

// ---------------------------------------------------------------------------
// Legacy sparse graph (pre-2026-08) — investigation only, never user-facing.
// ---------------------------------------------------------------------------
function legacyN(id, coordinates, area, type, notes) {
  return {
    id, coordinates, area, type,
    status: 'unverified',
    verified: false,
    source: 'legacy-pdf-anchor',
    notes,
  };
}

const legacyNodes = [
  legacyN('tdl-n-gate', [35.63520, 139.87995], 'world-bazaar', 'entrance', '정문·게이트 인근'),
  legacyN('tdl-n-wb-n', [35.63470, 139.88020], 'world-bazaar', 'junction', '월드바자 북단'),
  legacyN('tdl-n-wb-hub', [35.63350, 139.88055], 'world-bazaar', 'plaza', '월드바자 남단·허브 입구'),
  legacyN('tdl-n-hub', [35.63290, 139.88090], 'world-bazaar', 'plaza', '중앙 허브(캐슬 앞 광장)'),
  legacyN('tdl-n-adv-e', [35.63340, 139.88170], 'adventureland', 'junction', '어드벤처랜드 입구'),
  legacyN('tdl-n-adv-pirates', [35.63315, 139.88155], 'adventureland', 'poi', '카리브의 해적 인근'),
  legacyN('tdl-n-adv-jungle', [35.63400, 139.88190], 'adventureland', 'poi', '정글 크루즈 인근'),
  legacyN('tdl-n-west-e', [35.63260, 139.88240], 'westernland', 'junction', '웨스턴랜드 입구'),
  legacyN('tdl-n-west-btm', [35.63250, 139.88325], 'westernland', 'poi', '빅 선더 마운틴 앞'),
  legacyN('tdl-n-west-mark', [35.63180, 139.88295], 'westernland', 'poi', '마크 트웨인호 선착장'),
  legacyN('tdl-n-critter', [35.63040, 139.88345], 'critter-country', 'junction', '크리터 컨트리'),
  legacyN('tdl-n-splash', [35.63030, 139.88350], 'critter-country', 'poi', '스플래시 마운틴'),
  legacyN('tdl-n-fan-e', [35.63160, 139.88090], 'fantasyland', 'junction', '판타지랜드 입구(캐슬 뒤)'),
  legacyN('tdl-n-fan-center', [35.63105, 139.88060], 'fantasyland', 'junction', '판타지랜드 중앙'),
  legacyN('tdl-n-fan-haunted', [35.63125, 139.88180], 'fantasyland', 'poi', '헌티드 맨션'),
  legacyN('tdl-n-fan-pooh', [35.63080, 139.88135], 'fantasyland', 'poi', '푸의 허니 헌트'),
  legacyN('tdl-n-fan-small', [35.63110, 139.88010], 'fantasyland', 'poi', '잇츠 어 스몰 월드'),
  legacyN('tdl-n-toon', [35.63015, 139.87960], 'toontown', 'junction', '툰타운 입구'),
  legacyN('tdl-n-toon-mickey', [35.63030, 139.87940], 'toontown', 'poi', '미키의 집'),
  legacyN('tdl-n-tmr-e', [35.63250, 139.87960], 'tomorrowland', 'junction', '투머로우랜드 입구'),
  legacyN('tdl-n-tmr-center', [35.63205, 139.87895], 'tomorrowland', 'junction', '투머로우랜드 중앙'),
  legacyN('tdl-n-tmr-baymax', [35.63145, 139.87890], 'tomorrowland', 'poi', '베이맥스'),
  legacyN('tdl-n-tmr-monsters', [35.63250, 139.87880], 'tomorrowland', 'poi', '몬스터 주식회사'),
];

const legacyEdgePairs = [
  ['tdl-n-gate', 'tdl-n-wb-n'],
  ['tdl-n-wb-n', 'tdl-n-wb-hub'],
  ['tdl-n-wb-hub', 'tdl-n-hub'],
  ['tdl-n-hub', 'tdl-n-adv-e'],
  ['tdl-n-adv-e', 'tdl-n-adv-pirates'],
  ['tdl-n-adv-e', 'tdl-n-adv-jungle'],
  ['tdl-n-adv-e', 'tdl-n-west-e'],
  ['tdl-n-hub', 'tdl-n-west-e'],
  ['tdl-n-west-e', 'tdl-n-west-btm'],
  ['tdl-n-west-btm', 'tdl-n-west-mark'],
  ['tdl-n-west-mark', 'tdl-n-critter'],
  ['tdl-n-critter', 'tdl-n-splash'],
  ['tdl-n-hub', 'tdl-n-fan-e'],
  ['tdl-n-fan-e', 'tdl-n-fan-center'],
  ['tdl-n-fan-center', 'tdl-n-fan-haunted'],
  ['tdl-n-fan-center', 'tdl-n-fan-pooh'],
  ['tdl-n-fan-center', 'tdl-n-fan-small'],
  ['tdl-n-fan-center', 'tdl-n-toon'],
  ['tdl-n-west-e', 'tdl-n-fan-haunted'],
  ['tdl-n-toon', 'tdl-n-toon-mickey'],
  ['tdl-n-hub', 'tdl-n-tmr-e'],
  ['tdl-n-wb-hub', 'tdl-n-tmr-e'],
  ['tdl-n-tmr-e', 'tdl-n-tmr-center'],
  ['tdl-n-tmr-center', 'tdl-n-tmr-baymax'],
  ['tdl-n-tmr-center', 'tdl-n-tmr-monsters'],
  ['tdl-n-fan-small', 'tdl-n-tmr-baymax'],
];

const legacyById = Object.fromEntries(legacyNodes.map((x) => [x.id, x]));
const legacyEdges = legacyEdgePairs.map(([from, to], i) => {
  const a = legacyById[from]; const b = legacyById[to];
  return {
    id: `tdl-legacy-e-${String(i + 1).padStart(3, '0')}`,
    from,
    to,
    geometry: [a.coordinates, b.coordinates],
    distance: Math.round(haversineMeters(a.coordinates, b.coordinates)),
    status: 'unverified',
    verified: false,
    source: 'legacy-straight-links',
    notes: '구버전 직선 간선 — 건물·화단 통과 가능. 사용자 경로에 사용 금지.',
    oneWay: false,
    temporarilyClosed: false,
  };
});

export const TDL_LEGACY_WALK_GRAPH = {
  park: 'TDL',
  routingEnabled: false,
  confidence: 'legacy-unverified',
  coverageNote: '구버전 23노드/26간선. 조사·디버그 전용.',
  routingCoverage: {
    'world-bazaar': 'unverified',
    adventureland: 'unverified',
    westernland: 'unverified',
    'critter-country': 'unverified',
    fantasyland: 'unverified',
    toontown: 'unverified',
    tomorrowland: 'unverified',
  },
  nodes: legacyNodes,
  edges: legacyEdges,
  destinationConnectors: [
    { poiId: 'tdl-a-pirates', nodeId: 'tdl-n-adv-pirates', distance: 15 },
    { poiId: 'tdl-a-jungle', nodeId: 'tdl-n-adv-jungle', distance: 15 },
    { poiId: 'tdl-a-btm', nodeId: 'tdl-n-west-btm', distance: 15 },
    { poiId: 'tdl-a-marktwain', nodeId: 'tdl-n-west-mark', distance: 15 },
    { poiId: 'tdl-a-splash', nodeId: 'tdl-n-splash', distance: 15 },
    { poiId: 'tdl-a-haunted', nodeId: 'tdl-n-fan-haunted', distance: 15 },
    { poiId: 'tdl-a-pooh', nodeId: 'tdl-n-fan-pooh', distance: 15 },
    { poiId: 'tdl-a-smallworld', nodeId: 'tdl-n-fan-small', distance: 15 },
    { poiId: 'tdl-a-meetmickey', nodeId: 'tdl-n-toon-mickey', distance: 15 },
    { poiId: 'tdl-a-baymax', nodeId: 'tdl-n-tmr-baymax', distance: 15 },
    { poiId: 'tdl-a-monsters', nodeId: 'tdl-n-tmr-monsters', distance: 15 },
    { poiId: 'tdl-r01', nodeId: 'tdl-n-wb-n', distance: 15 },
    { poiId: 'tdl-r07', nodeId: 'tdl-n-west-btm', distance: 15 },
    { poiId: 'tdl-r09', nodeId: 'tdl-n-critter', distance: 15 },
    { poiId: 'tdl-r11', nodeId: 'tdl-n-fan-center', distance: 15 },
    { poiId: 'tdl-r12', nodeId: 'tdl-n-toon', distance: 15 },
    { poiId: 'tdl-r14', nodeId: 'tdl-n-tmr-baymax', distance: 15 },
    { poiId: 'tdl-firstaid-01', nodeId: 'tdl-n-wb-n', distance: 15 },
  ],
};
