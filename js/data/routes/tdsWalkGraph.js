// Tokyo DisneySea partial walk graph.
// Walkways ring the central lagoon — NO edges across water.
// Fantasy Springs included via American Waterfront / Port Discovery approach.
// Coverage PARTIAL.

import { haversineMeters } from '../../geo.js';

const nodes = [
  n('tds-n-gate', [35.62680, 139.88250], 'mediterranean-harbor', 'entrance', 'TDS 정문·스테이션 방향'),
  n('tds-n-med-plaza', [35.62740, 139.88340], 'mediterranean-harbor', 'plaza', '메디터레이니언 하버 광장'),
  n('tds-n-med-soaring', [35.62790, 139.88300], 'mediterranean-harbor', 'poi', '소어링 인근'),
  n('tds-n-med-fortress', [35.62710, 139.88420], 'mediterranean-harbor', 'poi', '포트리스 익스플로레이션'),

  // American Waterfront (north of harbor)
  n('tds-n-aw-e', [35.62840, 139.88420], 'american-waterfront', 'junction', '아메리칸 워터프런트 입구'),
  n('tds-n-aw-tot', [35.62880, 139.88470], 'american-waterfront', 'poi', '타워 오브 테러'),
  n('tds-n-aw-toy', [35.62930, 139.88440], 'american-waterfront', 'poi', '토이 스토리 마니아'),

  // Port Discovery
  n('tds-n-pd', [35.62860, 139.88620], 'port-discovery', 'junction', '포트 디스커버리'),
  n('tds-n-pd-aquatopia', [35.62870, 139.88600], 'port-discovery', 'poi', '아쿠아토피아'),
  n('tds-n-pd-nemo', [35.62850, 139.88640], 'port-discovery', 'poi', '니모 씨라이더'),

  // Fantasy Springs (east) — guest approach via Port Discovery / AW side
  n('tds-n-fs-e', [35.62900, 139.88780], 'fantasy-springs', 'junction', '판타지 스프링스 입구'),
  n('tds-n-fs-frozen', [35.62950, 139.88820], 'fantasy-springs', 'poi', '프로즌 저니'),
  n('tds-n-fs-peter', [35.62890, 139.88880], 'fantasy-springs', 'poi', '피터팬 네버랜드'),

  // Lost River Delta (southeast)
  n('tds-n-lrd', [35.62705, 139.88735], 'lost-river-delta', 'junction', '로스트 리버 델타'),
  n('tds-n-lrd-indiana', [35.62720, 139.88760], 'lost-river-delta', 'poi', '인디아나 존스'),
  n('tds-n-lrd-raging', [35.62680, 139.88720], 'lost-river-delta', 'poi', '레이징 스피리츠'),

  // Arabian Coast (south)
  n('tds-n-ac', [35.62575, 139.88675], 'arabian-coast', 'junction', '아라비안 코스트'),
  n('tds-n-ac-sindbad', [35.62580, 139.88650], 'arabian-coast', 'poi', '신드바드'),

  // Mermaid Lagoon (southwest)
  n('tds-n-ml', [35.62530, 139.88590], 'mermaid-lagoon', 'junction', '머메이드 라군'),
  n('tds-n-ml-flounder', [35.62520, 139.88600], 'mermaid-lagoon', 'poi', '플런더 코스터'),

  // Mysterious Island (center-south of harbor, shoreline walk — not across water)
  n('tds-n-mi', [35.62670, 139.88550], 'mysterious-island', 'junction', '미스테리어스 아일랜드 입구'),
  n('tds-n-mi-center', [35.62660, 139.88540], 'mysterious-island', 'poi', '센터 오브 디 어스'),
];

// Ring around the lagoon (clockwise from gate) — no water shortcuts.
const edgePairs = [
  ['tds-n-gate', 'tds-n-med-plaza'],
  ['tds-n-med-plaza', 'tds-n-med-soaring'],
  ['tds-n-med-plaza', 'tds-n-med-fortress'],
  ['tds-n-med-plaza', 'tds-n-aw-e'],
  ['tds-n-aw-e', 'tds-n-aw-tot'],
  ['tds-n-aw-tot', 'tds-n-aw-toy'],
  ['tds-n-aw-e', 'tds-n-pd'],
  ['tds-n-pd', 'tds-n-pd-aquatopia'],
  ['tds-n-pd', 'tds-n-pd-nemo'],
  ['tds-n-pd', 'tds-n-fs-e'],
  ['tds-n-fs-e', 'tds-n-fs-frozen'],
  ['tds-n-fs-e', 'tds-n-fs-peter'],
  ['tds-n-pd', 'tds-n-lrd'],
  ['tds-n-lrd', 'tds-n-lrd-indiana'],
  ['tds-n-lrd', 'tds-n-lrd-raging'],
  ['tds-n-lrd', 'tds-n-ac'],
  ['tds-n-ac', 'tds-n-ac-sindbad'],
  ['tds-n-ac', 'tds-n-ml'],
  ['tds-n-ml', 'tds-n-ml-flounder'],
  // Mysterious Island via shoreline from Mediterranean / Arabian approach
  ['tds-n-med-fortress', 'tds-n-mi'],
  ['tds-n-ac', 'tds-n-mi'],
  ['tds-n-mi', 'tds-n-mi-center'],
];

const byId = Object.fromEntries(nodes.map((x) => [x.id, x]));
const edges = edgePairs.map(([from, to]) => {
  const a = byId[from]; const b = byId[to];
  return {
    from, to,
    distance: Math.round(haversineMeters(a.coordinates, b.coordinates)),
    accessible: true, stairs: false, indoor: false,
    oneWay: false, temporarilyClosed: false,
    notes: 'PDF·위성 기반 추정 보행 연결(수로 횡단 없음)',
  };
});

const destinationConnectors = [
  c('tds-a-soaring', 'tds-n-med-soaring'),
  c('tds-a-fortress', 'tds-n-med-fortress'),
  c('tds-a-tot', 'tds-n-aw-tot'),
  c('tds-a-toystory', 'tds-n-aw-toy'),
  c('tds-a-aquatopia', 'tds-n-pd-aquatopia'),
  c('tds-a-searider', 'tds-n-pd-nemo'),
  c('tds-a-frozen', 'tds-n-fs-frozen'),
  c('tds-a-peterpan', 'tds-n-fs-peter'),
  c('tds-a-indiana', 'tds-n-lrd-indiana'),
  c('tds-a-raging', 'tds-n-lrd-raging'),
  c('tds-a-sindbad', 'tds-n-ac-sindbad'),
  c('tds-a-flounder', 'tds-n-ml-flounder'),
  c('tds-a-center', 'tds-n-mi-center'),
];

export const TDS_WALK_GRAPH = {
  park: 'TDS',
  confidence: '부분',
  coverageNote: '하버 링·각 포트 주요 간선 + 판타지 스프링스 입구. 호텔 전용 통로·배후구역·세부 실내 복도는 미포함.',
  coveredAreas: [
    'mediterranean-harbor', 'american-waterfront', 'port-discovery',
    'fantasy-springs', 'lost-river-delta', 'arabian-coast',
    'mermaid-lagoon', 'mysterious-island',
  ],
  incompleteAreas: ['호텔 미라코스타 전용 통로', '배후구역', '머메이드 라군 실내 세부'],
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
