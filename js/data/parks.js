// Park metadata (map center / default zoom / theme areas).
// Centers are derived from verified restroom anchor coordinates (TDL) and
// well-known park geography (TDS). Treated as map framing only, not facility data.

export const PARKS = {
  TDL: {
    id: 'TDL',
    nameKo: '도쿄 디즈니랜드',
    nameEn: 'Tokyo Disneyland',
    shortKo: '랜드',
    center: [35.63235, 139.88065],
    zoom: 16,
    defaultZoom: 16,
    minZoom: 15,
    maxZoom: 19,
    // rough bounding box used only to detect "outside the park"
    bounds: [
      [35.6280, 139.8770],
      [35.6365, 139.8855],
    ],
    // 지도를 처음/초기화 시 맞출 프레이밍(파크 전체가 보기 좋게)
    defaultBounds: [
      [35.62960, 139.87830],
      [35.63530, 139.88400],
    ],
    // Leaflet maxBounds: 드래그로 이 밖으로 못 나가게 제한(파크+게이트+최소 주변)
    maxBounds: [
      [35.62880, 139.87680],
      [35.63720, 139.88480],
    ],
    // 정문/게이트 근사 위치(월드바자 북측). 실측 아님.
    entranceCoordinates: [35.63520, 139.87995],
    // theme lands (경계는 근사값이며 지도 프레이밍/라벨 용도)
    // labelCenter: 각 구역의 시각적 중심(라벨 앵커). 어트랙션 좌표 단순 평균이 아니라
    // 공식 PDF 배치와 현재 좌표를 함께 보고 조정한 근사값이며 실측 좌표는 아닙니다.
    areas: [
      { id: 'world-bazaar', nameKo: '월드 바자', nameEn: 'World Bazaar', labelCenter: [35.63430, 139.87975] },
      { id: 'adventureland', nameKo: '어드벤처랜드', nameEn: 'Adventureland', labelCenter: [35.63360, 139.88205] },
      { id: 'westernland', nameKo: '웨스턴랜드', nameEn: 'Westernland', labelCenter: [35.63225, 139.88300] },
      { id: 'critter-country', nameKo: '크리터 컨트리', nameEn: 'Critter Country', labelCenter: [35.63040, 139.88345] },
      { id: 'fantasyland', nameKo: '판타지랜드', nameEn: 'Fantasyland', labelCenter: [35.63105, 139.88060] },
      { id: 'toontown', nameKo: '툰타운', nameEn: 'Toontown', labelCenter: [35.63015, 139.87960] },
      { id: 'tomorrowland', nameKo: '투머로우랜드', nameEn: 'Tomorrowland', labelCenter: [35.63205, 139.87895] },
    ],
  },
  TDS: {
    id: 'TDS',
    nameKo: '도쿄 디즈니씨',
    nameEn: 'Tokyo DisneySea',
    shortKo: '씨',
    center: [35.62670, 139.88540],
    zoom: 16,
    defaultZoom: 16,
    minZoom: 15,
    maxZoom: 19,
    bounds: [
      [35.6230, 139.8815],
      [35.6310, 139.8905],
    ],
    defaultBounds: [
      [35.62480, 139.88250],
      [35.62980, 139.88920],
    ],
    maxBounds: [
      [35.62320, 139.88100],
      [35.63060, 139.89020],
    ],
    // 정문/게이트 근사 위치(메디터레이니언 하버 서측, TDS 스테이션 방향). 실측 아님.
    entranceCoordinates: [35.62680, 139.88250],
    areas: [
      { id: 'mediterranean-harbor', nameKo: '메디터레이니언 하버', nameEn: 'Mediterranean Harbor', labelCenter: [35.62760, 139.88360] },
      { id: 'american-waterfront', nameKo: '아메리칸 워터프런트', nameEn: 'American Waterfront', labelCenter: [35.62900, 139.88460] },
      { id: 'port-discovery', nameKo: '포트 디스커버리', nameEn: 'Port Discovery', labelCenter: [35.62860, 139.88620] },
      { id: 'lost-river-delta', nameKo: '로스트 리버 델타', nameEn: 'Lost River Delta', labelCenter: [35.62705, 139.88735] },
      { id: 'arabian-coast', nameKo: '아라비안 코스트', nameEn: 'Arabian Coast', labelCenter: [35.62575, 139.88675] },
      { id: 'mermaid-lagoon', nameKo: '머메이드 라군', nameEn: 'Mermaid Lagoon', labelCenter: [35.62520, 139.88600] },
      { id: 'mysterious-island', nameKo: '미스테리어스 아일랜드', nameEn: 'Mysterious Island', labelCenter: [35.62670, 139.88550] },
      { id: 'fantasy-springs', nameKo: '판타지 스프링스', nameEn: 'Fantasy Springs', labelCenter: [35.62920, 139.88850] },
    ],
  },
};

export const PARK_IDS = ['TDL', 'TDS'];

// 대표(랜드마크) 어트랙션: 중간 확대(zoom 17)에서 우선 표시되는 헤드라이너.
// 운영 종료·장기 휴장 시설은 여기에 넣지 않는다.
export const LANDMARK_ATTRACTIONS = new Set([
  // TDL
  'tdl-a-pirates', 'tdl-a-jungle', 'tdl-a-btm', 'tdl-a-splash',
  'tdl-a-pooh', 'tdl-a-haunted', 'tdl-a-smallworld',
  'tdl-a-monsters', 'tdl-a-baymax', 'tdl-a-meetmickey',
  // TDS
  'tds-a-soaring', 'tds-a-tot', 'tds-a-toystory', 'tds-a-indiana',
  'tds-a-center', 'tds-a-sindbad', 'tds-a-frozen', 'tds-a-peterpan',
  'tds-a-aquatopia', 'tds-a-flounder',
]);

export function isLandmark(id) {
  return LANDMARK_ATTRACTIONS.has(id);
}
