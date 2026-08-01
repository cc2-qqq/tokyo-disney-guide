// Visual park outlines for guest orientation (NOT legal/cadastral boundaries).
// Rewritten to follow theme-land footprints instead of maxBounds boxes.
//
// Roles:
// - parkOutline: primary “this is the theme park” silhouette
// - paidAreaOutline: optional slight inset (paid guest area); kept subtle
// - entranceZone: tiny pregate/ticket-gate patch only

const META = {
  source: '공식 PDF 배치 + 테마랜드/포트 어트랙션 분포 + 벡터 지도 수변·외곽 육안 조정',
  notes: 'maxBounds용 외곽선이 아니라 실제 파크 윤곽에 가깝게 수동 재작성. 주차장·외부도로 제외.',
  checkedAt: '2026-08-02',
};

export const PARK_BOUNDARIES = {
  TDL: {
    // Clockwise from World Bazaar / main gate, hugging theme lands only.
    // Attractions span ~35.62995–35.63400 / 139.8787–139.8835; gate ~35.6352.
    parkOutline: {
      ring: [
        [35.63505, 139.87945], // N gate west (World Bazaar north)
        [35.63512, 139.88005], // N gate center
        [35.63500, 139.88055], // N World Bazaar east
        [35.63455, 139.88145], // NE toward Adventureland
        [35.63410, 139.88225], // NE Jungle Cruise side
        [35.63345, 139.88295], // E Adventureland–Westernland
        [35.63270, 139.88340], // E Big Thunder side
        [35.63185, 139.88355], // E Westernland east
        [35.63105, 139.88358], // E Critter north
        [35.63040, 139.88340], // SE Splash Mountain
        [35.62995, 139.88255], // SE Fantasyland east
        [35.62978, 139.88140], // S Fantasyland south
        [35.62972, 139.88040], // S toward Toontown
        [35.62978, 139.87955], // S Toontown / Gadget
        [35.63025, 139.87885], // SW Toontown–Tomorrowland
        [35.63110, 139.87850], // SW Tomorrowland south
        [35.63200, 139.87840], // W Space Mountain
        [35.63295, 139.87855], // W Tomorrowland north
        [35.63380, 139.87885], // NW World Bazaar west
        [35.63455, 139.87915], // NW toward gate
      ],
      confidence: 'visually_verified',
      source: META.source,
      notes: 'maxBounds용 외곽선이 아니라 실제 파크 윤곽에 가깝게 수동 재작성. 주차장·모노레일 외부·넓은 공터 제외. 월드바자·어드벤처·웨스턴·크리터·판타지·툰타운·투머로우랜드 중심.',
      checkedAt: META.checkedAt,
    },
    // Slightly inset; rendered as a lighter secondary dashed line only.
    paidAreaOutline: {
      ring: [
        [35.63485, 139.87955],
        [35.63490, 139.88010],
        [35.63478, 139.88050],
        [35.63435, 139.88135],
        [35.63395, 139.88210],
        [35.63330, 139.88275],
        [35.63260, 139.88320],
        [35.63180, 139.88335],
        [35.63105, 139.88335],
        [35.63045, 139.88315],
        [35.63010, 139.88240],
        [35.62995, 139.88135],
        [35.62990, 139.88040],
        [35.62995, 139.87970],
        [35.63040, 139.87905],
        [35.63115, 139.87870],
        [35.63200, 139.87860],
        [35.63290, 139.87875],
        [35.63370, 139.87900],
        [35.63440, 139.87930],
      ],
      confidence: 'estimated',
      source: META.source,
      notes: '유료구역 중심의 약간 안쪽 안내선. parkOutline과 크게 겹치지 않도록 점선·연하게만 표시.',
      checkedAt: META.checkedAt,
    },
    entranceZone: {
      ring: [
        [35.63538, 139.87970],
        [35.63538, 139.88020],
        [35.63508, 139.88020],
        [35.63508, 139.87970],
      ],
      confidence: 'estimated',
      source: META.source,
      notes: '입구존은 프리게이트 소구역만 표시(티켓게이트 전면).',
      checkedAt: META.checkedAt,
    },
    source: META.source,
    notes: META.notes,
    checkedAt: META.checkedAt,
  },
  TDS: {
    // Clockwise from west entrance, hugging ports (excl. bus terminal / outer roads).
    // Attractions span ~35.62505–35.62950 / 139.8830–139.8888; gate ~139.8825.
    parkOutline: {
      ring: [
        [35.62695, 139.88255], // W Main entrance inside
        [35.62745, 139.88270], // W Med Harbor north of gate
        [35.62805, 139.88305], // NW Soaring / Med Harbor
        [35.62865, 139.88370], // NW toward American Waterfront
        [35.62915, 139.88435], // N American Waterfront west
        [35.62942, 139.88510], // N American Waterfront
        [35.62948, 139.88600], // N Port Discovery
        [35.62955, 139.88700], // N toward Fantasy Springs
        [35.62958, 139.88790], // NE Fantasy Springs west
        [35.62940, 139.88865], // NE Frozen Journey
        [35.62895, 139.88895], // E Peter Pan / FS tip
        [35.62835, 139.88890], // E Fantasy Springs–Lost River
        [35.62755, 139.88855], // E Lost River Delta
        [35.62685, 139.88825], // SE Lost River south
        [35.62620, 139.88770], // SE Arabian Coast east
        [35.62565, 139.88715], // S Arabian Coast
        [35.62520, 139.88640], // S Mermaid Lagoon east
        [35.62498, 139.88570], // S Mermaid Theater
        [35.62515, 139.88485], // SW Mermaid–Mysterious
        [35.62570, 139.88390], // SW Mysterious Island west
        [35.62630, 139.88320], // SW Med Harbor south
        [35.62665, 139.88275], // W south of entrance
      ],
      confidence: 'visually_verified',
      source: META.source,
      notes: 'maxBounds용 외곽선이 아니라 실제 파크 윤곽에 가깝게 수동 재작성. 버스터미널·외부도로·호텔 외부부지·스포츠파크 방향 제외. 판타지 스프링스 포함.',
      checkedAt: META.checkedAt,
    },
    paidAreaOutline: {
      ring: [
        [35.62705, 139.88280],
        [35.62750, 139.88295],
        [35.62805, 139.88325],
        [35.62860, 139.88385],
        [35.62905, 139.88445],
        [35.62928, 139.88515],
        [35.62932, 139.88600],
        [35.62938, 139.88695],
        [35.62940, 139.88785],
        [35.62920, 139.88850],
        [35.62880, 139.88875],
        [35.62825, 139.88870],
        [35.62750, 139.88835],
        [35.62685, 139.88805],
        [35.62625, 139.88750],
        [35.62575, 139.88700],
        [35.62535, 139.88630],
        [35.62518, 139.88570],
        [35.62535, 139.88495],
        [35.62585, 139.88405],
        [35.62640, 139.88340],
        [35.62675, 139.88295],
      ],
      confidence: 'estimated',
      source: META.source,
      notes: '유료구역 중심의 약간 안쪽 안내선. parkOutline보다 덜 강조.',
      checkedAt: META.checkedAt,
    },
    entranceZone: {
      ring: [
        [35.62700, 139.88225],
        [35.62700, 139.88270],
        [35.62655, 139.88270],
        [35.62655, 139.88225],
      ],
      confidence: 'estimated',
      source: META.source,
      notes: '입구존은 프리게이트 소구역만 표시(티켓게이트 전면).',
      checkedAt: META.checkedAt,
    },
    source: META.source,
    notes: META.notes,
    checkedAt: META.checkedAt,
  },
};
