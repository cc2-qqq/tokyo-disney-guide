// Tokyo Disneyland partial walk graph.
// Nodes/edges are approximate, derived from official PDF layout + known attraction anchors.
// Coverage is PARTIAL — uncovered areas fall back to dashed direction.
// verified:false for all nodes (not surveyed GPS). Do NOT invent water/building shortcuts.

import { haversineMeters } from '../../geo.js';

const nodes = [
  // Entrance / World Bazaar
  n('tdl-n-gate', [35.63520, 139.87995], 'world-bazaar', 'entrance', '정문·게이트 인근'),
  n('tdl-n-wb-n', [35.63470, 139.88020], 'world-bazaar', 'junction', '월드바자 북단'),
  n('tdl-n-wb-hub', [35.63350, 139.88055], 'world-bazaar', 'plaza', '월드바자 남단·허브 입구'),
  n('tdl-n-hub', [35.63290, 139.88090], 'world-bazaar', 'plaza', '중앙 허브(캐슬 앞 광장)'),

  // Adventureland
  n('tdl-n-adv-e', [35.63340, 139.88170], 'adventureland', 'junction', '어드벤처랜드 입구'),
  n('tdl-n-adv-pirates', [35.63315, 139.88155], 'adventureland', 'poi', '카리브의 해적 인근'),
  n('tdl-n-adv-jungle', [35.63400, 139.88190], 'adventureland', 'poi', '정글 크루즈 인근'),

  // Westernland
  n('tdl-n-west-e', [35.63260, 139.88240], 'westernland', 'junction', '웨스턴랜드 입구'),
  n('tdl-n-west-btm', [35.63250, 139.88325], 'westernland', 'poi', '빅 선더 마운틴 앞'),
  n('tdl-n-west-mark', [35.63180, 139.88295], 'westernland', 'poi', '마크 트웨인호 선착장'),

  // Critter Country
  n('tdl-n-critter', [35.63040, 139.88345], 'critter-country', 'junction', '크리터 컨트리'),
  n('tdl-n-splash', [35.63030, 139.88350], 'critter-country', 'poi', '스플래시 마운틴'),

  // Fantasyland
  n('tdl-n-fan-e', [35.63160, 139.88090], 'fantasyland', 'junction', '판타지랜드 입구(캐슬 뒤)'),
  n('tdl-n-fan-center', [35.63105, 139.88060], 'fantasyland', 'junction', '판타지랜드 중앙'),
  n('tdl-n-fan-haunted', [35.63125, 139.88180], 'fantasyland', 'poi', '헌티드 맨션'),
  n('tdl-n-fan-pooh', [35.63080, 139.88135], 'fantasyland', 'poi', '푸의 허니 헌트'),
  n('tdl-n-fan-small', [35.63110, 139.88010], 'fantasyland', 'poi', '잇츠 어 스몰 월드'),

  // Toontown
  n('tdl-n-toon', [35.63015, 139.87960], 'toontown', 'junction', '툰타운 입구'),
  n('tdl-n-toon-mickey', [35.63030, 139.87940], 'toontown', 'poi', '미키의 집'),

  // Tomorrowland
  n('tdl-n-tmr-e', [35.63250, 139.87960], 'tomorrowland', 'junction', '투머로우랜드 입구'),
  n('tdl-n-tmr-center', [35.63205, 139.87895], 'tomorrowland', 'junction', '투머로우랜드 중앙'),
  n('tdl-n-tmr-baymax', [35.63145, 139.87890], 'tomorrowland', 'poi', '베이맥스'),
  n('tdl-n-tmr-monsters', [35.63250, 139.87880], 'tomorrowland', 'poi', '몬스터 주식회사'),
];

// Undirected walkway edges (no water/building shortcuts).
const edgePairs = [
  ['tdl-n-gate', 'tdl-n-wb-n'],
  ['tdl-n-wb-n', 'tdl-n-wb-hub'],
  ['tdl-n-wb-hub', 'tdl-n-hub'],
  // Adventureland
  ['tdl-n-hub', 'tdl-n-adv-e'],
  ['tdl-n-adv-e', 'tdl-n-adv-pirates'],
  ['tdl-n-adv-e', 'tdl-n-adv-jungle'],
  ['tdl-n-adv-e', 'tdl-n-west-e'],
  // Westernland / Critter
  ['tdl-n-hub', 'tdl-n-west-e'],
  ['tdl-n-west-e', 'tdl-n-west-btm'],
  ['tdl-n-west-btm', 'tdl-n-west-mark'],
  ['tdl-n-west-mark', 'tdl-n-critter'],
  ['tdl-n-critter', 'tdl-n-splash'],
  // Fantasyland (from hub via castle approach — no cutting through castle building)
  ['tdl-n-hub', 'tdl-n-fan-e'],
  ['tdl-n-fan-e', 'tdl-n-fan-center'],
  ['tdl-n-fan-center', 'tdl-n-fan-haunted'],
  ['tdl-n-fan-center', 'tdl-n-fan-pooh'],
  ['tdl-n-fan-center', 'tdl-n-fan-small'],
  ['tdl-n-fan-center', 'tdl-n-toon'],
  ['tdl-n-west-e', 'tdl-n-fan-haunted'], // westernland ↔ haunted corridor
  // Toontown
  ['tdl-n-toon', 'tdl-n-toon-mickey'],
  // Tomorrowland
  ['tdl-n-hub', 'tdl-n-tmr-e'],
  ['tdl-n-wb-hub', 'tdl-n-tmr-e'],
  ['tdl-n-tmr-e', 'tdl-n-tmr-center'],
  ['tdl-n-tmr-center', 'tdl-n-tmr-baymax'],
  ['tdl-n-tmr-center', 'tdl-n-tmr-monsters'],
  ['tdl-n-fan-small', 'tdl-n-tmr-baymax'], // fantasyland ↔ tomorrowland south edge
];

const byId = Object.fromEntries(nodes.map((x) => [x.id, x]));
const edges = edgePairs.map(([from, to]) => {
  const a = byId[from]; const b = byId[to];
  return {
    from, to,
    distance: Math.round(haversineMeters(a.coordinates, b.coordinates)),
    accessible: true, stairs: false, indoor: from.includes('wb') || to.includes('wb'),
    oneWay: false, temporarilyClosed: false,
    notes: 'PDF·위성 기반 추정 보행 연결',
  };
});

const destinationConnectors = [
  c('tdl-a-pirates', 'tdl-n-adv-pirates'),
  c('tdl-a-jungle', 'tdl-n-adv-jungle'),
  c('tdl-a-btm', 'tdl-n-west-btm'),
  c('tdl-a-marktwain', 'tdl-n-west-mark'),
  c('tdl-a-splash', 'tdl-n-splash'),
  c('tdl-a-haunted', 'tdl-n-fan-haunted'),
  c('tdl-a-pooh', 'tdl-n-fan-pooh'),
  c('tdl-a-smallworld', 'tdl-n-fan-small'),
  c('tdl-a-meetmickey', 'tdl-n-toon-mickey'),
  c('tdl-a-baymax', 'tdl-n-tmr-baymax'),
  c('tdl-a-monsters', 'tdl-n-tmr-monsters'),
  // restrooms near known high anchors
  c('tdl-r01', 'tdl-n-wb-n'),
  c('tdl-r07', 'tdl-n-west-btm'),
  c('tdl-r09', 'tdl-n-critter'),
  c('tdl-r11', 'tdl-n-fan-center'),
  c('tdl-r12', 'tdl-n-toon'),
  c('tdl-r14', 'tdl-n-tmr-baymax'),
  c('tdl-firstaid-01', 'tdl-n-wb-n'),
];

export const TDL_WALK_GRAPH = {
  park: 'TDL',
  confidence: '부분',
  coverageNote: '월드바자·허브·어드벤처/웨스턴/크리터/판타지/툰타운/투머로우 주요 간선만 포함. 섬·배후구역·세부 골목은 미포함.',
  coveredAreas: ['world-bazaar', 'adventureland', 'westernland', 'critter-country', 'fantasyland', 'toontown', 'tomorrowland'],
  incompleteAreas: ['톰 소여 섬 내부', '퍼레이드 우회 세부 통로', '백스테이지'],
  nodes,
  edges,
  destinationConnectors,
};

function n(id, coordinates, area, type, notes) {
  return {
    id, coordinates, area, type,
    verified: false,
    source: 'official_pdf_layout + attraction_anchor',
    notes,
  };
}
function c(poiId, nodeId) {
  return { poiId, nodeId, distance: 15 };
}
