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
    minZoom: 15,
    maxZoom: 19,
    // rough bounding box used only to detect "outside the park"
    bounds: [
      [35.6280, 139.8770],
      [35.6365, 139.8855],
    ],
    // theme lands (경계는 근사값이며 지도 프레이밍/라벨 용도)
    areas: [
      { id: 'world-bazaar', nameKo: '월드 바자', nameEn: 'World Bazaar' },
      { id: 'adventureland', nameKo: '어드벤처랜드', nameEn: 'Adventureland' },
      { id: 'westernland', nameKo: '웨스턴랜드', nameEn: 'Westernland' },
      { id: 'critter-country', nameKo: '크리터 컨트리', nameEn: 'Critter Country' },
      { id: 'fantasyland', nameKo: '판타지랜드', nameEn: 'Fantasyland' },
      { id: 'toontown', nameKo: '툰타운', nameEn: 'Toontown' },
      { id: 'tomorrowland', nameKo: '투머로우랜드', nameEn: 'Tomorrowland' },
    ],
  },
  TDS: {
    id: 'TDS',
    nameKo: '도쿄 디즈니씨',
    nameEn: 'Tokyo DisneySea',
    shortKo: '씨',
    center: [35.62670, 139.88540],
    zoom: 16,
    minZoom: 15,
    maxZoom: 19,
    bounds: [
      [35.6230, 139.8815],
      [35.6310, 139.8905],
    ],
    areas: [
      { id: 'mediterranean-harbor', nameKo: '메디터레이니언 하버', nameEn: 'Mediterranean Harbor' },
      { id: 'american-waterfront', nameKo: '아메리칸 워터프런트', nameEn: 'American Waterfront' },
      { id: 'port-discovery', nameKo: '포트 디스커버리', nameEn: 'Port Discovery' },
      { id: 'lost-river-delta', nameKo: '로스트 리버 델타', nameEn: 'Lost River Delta' },
      { id: 'arabian-coast', nameKo: '아라비안 코스트', nameEn: 'Arabian Coast' },
      { id: 'mermaid-lagoon', nameKo: '머메이드 라군', nameEn: 'Mermaid Lagoon' },
      { id: 'mysterious-island', nameKo: '미스테리어스 아일랜드', nameEn: 'Mysterious Island' },
      { id: 'fantasy-springs', nameKo: '판타지 스프링스', nameEn: 'Fantasy Springs' },
    ],
  },
};

export const PARK_IDS = ['TDL', 'TDS'];
