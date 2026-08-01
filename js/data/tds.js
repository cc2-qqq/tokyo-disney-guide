// Tokyo DisneySea (TDS) data.
//
// RESTROOM / EMERGENCY STATUS: intentionally EMPTY.
// The task requires that no unverified placeholder coordinates be invented for TDS.
// The official PDF confirms ~14 in-gate restroom candidates plus uncertain
// entrance-area candidates, but Google Maps POI (!3d/!4d) extraction was not
// completed for TDS in this pass, so no restroom coordinates are published yet.
// This is tracked as a remaining investigation item (see README).
//
// ATTRACTIONS: approximate landmark positions (port-level), clearly badged
// "대략적 위치". Height limits are official where marked 'official'.

// TDS restrooms / baby care / first aid.
// HONESTY: Google Maps POI (!3d/!4d) was NOT extracted in this pass.
// Coordinates are landmark estimates from official TDS_map_kr.pdf layout +
// nearby attraction anchors + satellite context. Therefore:
//   - coordinateVerified: false, approximate: true
//   - coordinateStatus: medium_estimated | low_estimated (never high without POI)
//   - TDS default map shows medium+; low only when "낮은 신뢰도 위치까지 표시" is on
// Unknown candidates are omitted entirely.

export const TDS_RESTROOMS = [
  {
    id: 'tds-r01', park: 'TDS', area: 'mediterranean-harbor', type: 'restroom',
    name: '메디터레이니언 하버 화장실 (정문 인근)',
    nameNote: '정문·하버 광장 쪽',
    coordinates: [35.62720, 139.88310],
    generalRestroom: true, accessibleRestroom: true, babyCare: false, nursingRoom: false,
    insidePaidArea: true, generalGuestAccessible: true,
    pdfVerified: true, coordinateVerified: false, approximate: true,
    coordinateStatus: 'medium_estimated', coordinateSourceType: 'landmark_estimate',
    source: '공식 TDS_map_kr.pdf 화장실 아이콘 + 하버 광장·입구 앵커 추정',
    sourceUrl: null, checkedAt: '2026-08-01',
    googlePoiName: null,
    evidence: '공식 PDF 메디터레이니언 하버 정문·광장 부근 화장실 표기. Google POI 미확보.',
    estimatedAccuracyMeters: 15, confidenceScore: 52,
    notes: 'Google POI 미확인. 공식 지도 기반 Medium 추정 위치(기본 표시).',
  },
  {
    id: 'tds-r02', park: 'TDS', area: 'mediterranean-harbor', type: 'restroom',
    name: '메디터레이니언 하버 화장실 (포트리스 인근)',
    nameNote: '포트리스 익스플로레이션 방향',
    coordinates: [35.62700, 139.88400],
    generalRestroom: true, accessibleRestroom: true, babyCare: false, nursingRoom: false,
    insidePaidArea: true, generalGuestAccessible: true,
    pdfVerified: true, coordinateVerified: false, approximate: true,
    coordinateStatus: 'medium_estimated', coordinateSourceType: 'landmark_estimate',
    source: '공식 PDF + 포트리스 앵커 추정',
    sourceUrl: null, checkedAt: '2026-08-01',
    googlePoiName: null,
    evidence: '공식 PDF 포트리스 인근 화장실 표기. Google POI 미확보.',
    estimatedAccuracyMeters: 15, confidenceScore: 50,
    notes: 'Google POI 미확인.',
  },
  {
    id: 'tds-r03', park: 'TDS', area: 'american-waterfront', type: 'restroom',
    name: '아메리칸 워터프런트 화장실 (타워 오브 테러 인근)',
    nameNote: '타워 오브 테러 방향',
    coordinates: [35.62870, 139.88490],
    generalRestroom: true, accessibleRestroom: true, babyCare: false, nursingRoom: false,
    insidePaidArea: true, generalGuestAccessible: true,
    pdfVerified: true, coordinateVerified: false, approximate: true,
    coordinateStatus: 'medium_estimated', coordinateSourceType: 'landmark_estimate',
    source: '공식 PDF + 타워 오브 테러 앵커 추정',
    sourceUrl: null, checkedAt: '2026-08-01',
    googlePoiName: null,
    evidence: '공식 PDF 아메리칸 워터프런트 화장실 표기. Google POI 미확보.',
    estimatedAccuracyMeters: 15, confidenceScore: 50,
    notes: 'Google POI 미확인.',
  },
  {
    id: 'tds-r04', park: 'TDS', area: 'american-waterfront', type: 'restroom',
    name: '아메리칸 워터프런트 화장실 (토이스토리 인근)',
    nameNote: '토이 스토리 마니아 방향',
    coordinates: [35.62920, 139.88460],
    generalRestroom: true, accessibleRestroom: null, babyCare: false, nursingRoom: false,
    insidePaidArea: true, generalGuestAccessible: true,
    pdfVerified: true, coordinateVerified: false, approximate: true,
    coordinateStatus: 'low_estimated', coordinateSourceType: 'landmark_estimate',
    source: '공식 PDF + 토이스토리 앵커 육안 추정',
    sourceUrl: null, checkedAt: '2026-08-01',
    googlePoiName: null,
    evidence: 'PDF에 워터프런트 북측 화장실 표기. 출입구 위치 불명확.',
    estimatedAccuracyMeters: 25, confidenceScore: 35,
    notes: '대략적인 위치. 추가 검증 필요.',
  },
  {
    id: 'tds-r05', park: 'TDS', area: 'port-discovery', type: 'restroom',
    name: '포트 디스커버리 화장실',
    nameNote: '아쿠아토피아·니모 씨라이더 인근',
    coordinates: [35.62855, 139.88625],
    generalRestroom: true, accessibleRestroom: true, babyCare: false, nursingRoom: false,
    insidePaidArea: true, generalGuestAccessible: true,
    pdfVerified: true, coordinateVerified: false, approximate: true,
    coordinateStatus: 'medium_estimated', coordinateSourceType: 'landmark_estimate',
    source: '공식 PDF + 포트 디스커버리 앵커 추정',
    sourceUrl: null, checkedAt: '2026-08-01',
    googlePoiName: null,
    evidence: '공식 PDF 포트 디스커버리 화장실 표기. Google POI 미확보.',
    estimatedAccuracyMeters: 15, confidenceScore: 48,
    notes: 'Google POI 미확인.',
  },
  {
    id: 'tds-r06', park: 'TDS', area: 'lost-river-delta', type: 'restroom',
    name: '로스트 리버 델타 화장실',
    nameNote: '인디아나 존스·레이징 스피리츠 인근',
    coordinates: [35.62700, 139.88740],
    generalRestroom: true, accessibleRestroom: true, babyCare: false, nursingRoom: false,
    insidePaidArea: true, generalGuestAccessible: true,
    pdfVerified: true, coordinateVerified: false, approximate: true,
    coordinateStatus: 'medium_estimated', coordinateSourceType: 'landmark_estimate',
    source: '공식 PDF + 로스트 리버 델타 앵커 추정',
    sourceUrl: null, checkedAt: '2026-08-01',
    googlePoiName: null,
    evidence: '공식 PDF 로스트 리버 델타 화장실 표기. Google POI 미확보.',
    estimatedAccuracyMeters: 15, confidenceScore: 48,
    notes: 'Google POI 미확인.',
  },
  {
    id: 'tds-r07', park: 'TDS', area: 'arabian-coast', type: 'restroom',
    name: '아라비안 코스트 화장실',
    nameNote: '신드바드·캐러밴 카루셀 인근',
    coordinates: [35.62570, 139.88685],
    generalRestroom: true, accessibleRestroom: true, babyCare: false, nursingRoom: false,
    insidePaidArea: true, generalGuestAccessible: true,
    pdfVerified: true, coordinateVerified: false, approximate: true,
    coordinateStatus: 'medium_estimated', coordinateSourceType: 'landmark_estimate',
    source: '공식 PDF + 아라비안 코스트 앵커 추정',
    sourceUrl: null, checkedAt: '2026-08-01',
    googlePoiName: null,
    evidence: '공식 PDF 아라비안 코스트 화장실 표기. Google POI 미확보.',
    estimatedAccuracyMeters: 15, confidenceScore: 48,
    notes: 'Google POI 미확인.',
  },
  {
    id: 'tds-r08', park: 'TDS', area: 'mermaid-lagoon', type: 'restroom',
    name: '머메이드 라군 화장실',
    nameNote: '머메이드 라군 입구·실내 구역 인근',
    coordinates: [35.62525, 139.88570],
    generalRestroom: true, accessibleRestroom: true, babyCare: false, nursingRoom: false,
    insidePaidArea: true, generalGuestAccessible: true,
    pdfVerified: true, coordinateVerified: false, approximate: true,
    coordinateStatus: 'low_estimated', coordinateSourceType: 'landmark_estimate',
    source: '공식 PDF + 머메이드 라군 앵커 육안 추정',
    sourceUrl: null, checkedAt: '2026-08-01',
    googlePoiName: null,
    evidence: 'PDF에 머메이드 라군 화장실 표기. 실내/야외 출입구 구분 불명확.',
    estimatedAccuracyMeters: 25, confidenceScore: 32,
    notes: '대략적인 위치. 추가 검증 필요.',
  },
  {
    id: 'tds-r09', park: 'TDS', area: 'mysterious-island', type: 'restroom',
    name: '미스테리어스 아일랜드 화장실',
    nameNote: '센터 오브 디 어스 인근',
    coordinates: [35.62675, 139.88555],
    generalRestroom: true, accessibleRestroom: null, babyCare: false, nursingRoom: false,
    insidePaidArea: true, generalGuestAccessible: true,
    pdfVerified: true, coordinateVerified: false, approximate: true,
    coordinateStatus: 'low_estimated', coordinateSourceType: 'landmark_estimate',
    source: '공식 PDF + 미스테리어스 아일랜드 앵커 육안 추정',
    sourceUrl: null, checkedAt: '2026-08-01',
    googlePoiName: null,
    evidence: 'PDF에 미스테리어스 아일랜드 화장실 표기. Google POI 미확보.',
    estimatedAccuracyMeters: 25, confidenceScore: 30,
    notes: '대략적인 위치. 추가 검증 필요.',
  },
  {
    id: 'tds-r10', park: 'TDS', area: 'fantasy-springs', type: 'restroom',
    name: '판타지 스프링스 화장실',
    nameNote: '판타지 스프링스 입구·광장 인근',
    coordinates: [35.62915, 139.88830],
    generalRestroom: true, accessibleRestroom: true, babyCare: false, nursingRoom: false,
    insidePaidArea: true, generalGuestAccessible: true,
    pdfVerified: true, coordinateVerified: false, approximate: true,
    coordinateStatus: 'medium_estimated', coordinateSourceType: 'landmark_estimate',
    source: '공식 PDF(판타지 스프링스) + 포트 입구 앵커 추정',
    sourceUrl: null, checkedAt: '2026-08-01',
    googlePoiName: null,
    evidence: '공식 PDF 판타지 스프링스 화장실 표기. Google POI 미확보.',
    estimatedAccuracyMeters: 15, confidenceScore: 48,
    notes: 'Google POI 미확인. 호텔 전용 구역과 혼동하지 않도록 일반 게스트 구역으로만 표기.',
  },
  {
    id: 'tds-r11', park: 'TDS', area: 'american-waterfront', type: 'restroom',
    name: '아메리칸 워터프런트 화장실 (수변 중앙)',
    nameNote: '워터프런트 중앙·부두 방향',
    coordinates: [35.62840, 139.88470],
    generalRestroom: true, accessibleRestroom: true, babyCare: false, nursingRoom: false,
    insidePaidArea: true, generalGuestAccessible: true,
    pdfVerified: true, coordinateVerified: false, approximate: true,
    coordinateStatus: 'medium_estimated', coordinateSourceType: 'pdf_landmark',
    source: '공식 TDS_map_kr.pdf 추가 노란 화장실 아이콘 (워터프런트)',
    sourceUrl: null, checkedAt: '2026-08-01',
    googlePoiName: null,
    evidence: 'PDF 아메리칸 워터프런트에 r03/r04와 별도 노란 아이콘. 수변 건물 앵커.',
    estimatedAccuracyMeters: 20, confidenceScore: 48,
    notes: '구역 내 복수 화장실. Google POI 미확인.',
  },
  {
    id: 'tds-r12', park: 'TDS', area: 'lost-river-delta', type: 'restroom',
    name: '로스트 리버 델타 화장실 (남측)',
    nameNote: '델타 남측·아라비안 코스트 경계',
    coordinates: [35.62655, 139.88710],
    generalRestroom: true, accessibleRestroom: true, babyCare: false, nursingRoom: false,
    insidePaidArea: true, generalGuestAccessible: true,
    pdfVerified: true, coordinateVerified: false, approximate: true,
    coordinateStatus: 'medium_estimated', coordinateSourceType: 'pdf_landmark',
    source: '공식 PDF 로스트 리버 델타 추가 노란 화장실 아이콘',
    sourceUrl: null, checkedAt: '2026-08-01',
    googlePoiName: null,
    evidence: 'PDF 델타 구역에 r06과 별도 노란 아이콘.',
    estimatedAccuracyMeters: 20, confidenceScore: 46,
    notes: 'Google POI 미확인.',
  },
  {
    id: 'tds-r13', park: 'TDS', area: 'arabian-coast', type: 'restroom',
    name: '아라비안 코스트 화장실 (서측)',
    nameNote: '아라비안 코스트 서측 상점가 인근',
    coordinates: [35.62590, 139.88630],
    generalRestroom: true, accessibleRestroom: true, babyCare: false, nursingRoom: false,
    insidePaidArea: true, generalGuestAccessible: true,
    pdfVerified: true, coordinateVerified: false, approximate: true,
    coordinateStatus: 'medium_estimated', coordinateSourceType: 'pdf_landmark',
    source: '공식 PDF 아라비안 코스트 추가 노란 화장실 아이콘',
    sourceUrl: null, checkedAt: '2026-08-01',
    googlePoiName: null,
    evidence: 'PDF 아라비안 코스트에 r07과 별도 노란 아이콘.',
    estimatedAccuracyMeters: 20, confidenceScore: 46,
    notes: 'Google POI 미확인.',
  },
  {
    id: 'tds-r14', park: 'TDS', area: 'mysterious-island', type: 'restroom',
    name: '미스테리어스 아일랜드 화장실 (화산 기슭)',
    nameNote: '미스테리어스 아일랜드 추가 지점',
    coordinates: [35.62640, 139.88520],
    generalRestroom: true, accessibleRestroom: null, babyCare: false, nursingRoom: false,
    insidePaidArea: true, generalGuestAccessible: true,
    pdfVerified: true, coordinateVerified: false, approximate: true,
    coordinateStatus: 'low_estimated', coordinateSourceType: 'pdf_landmark',
    source: '공식 PDF 미스테리어스 아일랜드 추가 노란 화장실 아이콘',
    sourceUrl: null, checkedAt: '2026-08-01',
    googlePoiName: null,
    evidence: 'PDF 아일랜드에 r09와 별도 노란 아이콘. 출입 위치 불명확.',
    estimatedAccuracyMeters: 30, confidenceScore: 34,
    notes: '대략적인 위치. 추가 검증 필요.',
  },
  {
    id: 'tds-r15', park: 'TDS', area: 'fantasy-springs', type: 'restroom',
    name: '판타지 스프링스 화장실 (광장 동측)',
    nameNote: '판타지 스프링스 광장 동측',
    coordinates: [35.62900, 139.88880],
    generalRestroom: true, accessibleRestroom: true, babyCare: false, nursingRoom: false,
    insidePaidArea: true, generalGuestAccessible: true,
    pdfVerified: true, coordinateVerified: false, approximate: true,
    coordinateStatus: 'medium_estimated', coordinateSourceType: 'pdf_landmark',
    source: '공식 PDF 판타지 스프링스 추가 노란 화장실 아이콘',
    sourceUrl: null, checkedAt: '2026-08-01',
    googlePoiName: null,
    evidence: 'PDF 판타지 스프링스에 r10과 별도 노란 아이콘. 호텔 전용 구역과 분리해 일반 게스트 광장으로만 등록.',
    estimatedAccuracyMeters: 20, confidenceScore: 46,
    notes: '호텔 전용 시설 아님.',
  },
  {
    id: 'tds-r-pg01', park: 'TDS', area: 'pregate', type: 'restroom',
    name: '도쿄디즈니씨 스테이션 화장실',
    nameNote: '디즈니씨 스테이션·파크웨이',
    coordinates: [35.62640, 139.88180],
    generalRestroom: true, accessibleRestroom: true, babyCare: false, nursingRoom: false,
    insidePaidArea: false, generalGuestAccessible: true, pregate: true,
    pdfVerified: true, coordinateVerified: false, approximate: true,
    coordinateStatus: 'low_estimated', coordinateSourceType: 'pdf_landmark',
    source: '공식 PDF 디즈니씨 스테이션 노란 화장실 아이콘',
    sourceUrl: null, checkedAt: '2026-08-01',
    googlePoiName: null,
    evidence: 'PDF 스테이션 표기 부근 노란 아이콘. 유료구역 밖.',
    estimatedAccuracyMeters: 40, confidenceScore: 34,
    notes: '입구 밖. 「입구 밖 화장실 포함」으로 표시.',
  },
  {
    id: 'tds-r-pg02', park: 'TDS', area: 'pregate', type: 'restroom',
    name: '버스터미널 화장실 (노스·사우스)',
    nameNote: '파크웨이 버스 터미널',
    coordinates: [35.62610, 139.88120],
    generalRestroom: true, accessibleRestroom: true, babyCare: false, nursingRoom: false,
    insidePaidArea: false, generalGuestAccessible: true, pregate: true,
    pdfVerified: true, coordinateVerified: false, approximate: true,
    coordinateStatus: 'low_estimated', coordinateSourceType: 'pdf_landmark',
    source: '공식 PDF 버스터미널 노란 화장실 아이콘',
    sourceUrl: null, checkedAt: '2026-08-01',
    googlePoiName: null,
    evidence: 'PDF 버스 터미널 표기 부근 노란 아이콘.',
    estimatedAccuracyMeters: 45, confidenceScore: 30,
    notes: '입구 밖. 노스·사우스 통합 표기(추가 분리 검증 권장).',
  },
  {
    id: 'tds-r-hotel-01', park: 'TDS', area: 'fantasy-springs', type: 'restroom',
    name: '판타지 스프링스 호텔·그랜드 샤토 게이트 화장실',
    nameNote: '호텔·그랜드 샤토 게이트 경계 (호텔 구역)',
    coordinates: [35.62950, 139.88920],
    generalRestroom: true, accessibleRestroom: true, babyCare: false, nursingRoom: false,
    insidePaidArea: false, generalGuestAccessible: false, hotelOnly: true, pregate: true,
    pdfVerified: true, coordinateVerified: false, approximate: true,
    coordinateStatus: 'low_estimated', coordinateSourceType: 'pdf_landmark',
    source: '공식 PDF 호텔·그랜드 샤토 게이트 인근 노란 아이콘',
    sourceUrl: null, checkedAt: '2026-08-01',
    googlePoiName: null,
    evidence: 'PDF 호텔 경계 아이콘. 일반 게스트 파크 화장실로 등록하지 않음.',
    estimatedAccuracyMeters: 40, confidenceScore: 28,
    notes: '호텔 전용·경계. 기본 지도 비표시.',
  },
];

export const TDS_EMERGENCY = [
  {
    id: 'tds-firstaid-01', park: 'TDS', area: 'mediterranean-harbor', type: 'firstAid',
    name: '중앙구호실 (중앙의무실)',
    nameNote: '메디터레이니언 하버 입구 인근',
    coordinates: [35.62700, 139.88290],
    insidePaidArea: true, generalGuestAccessible: true,
    pdfVerified: true, coordinateVerified: false, approximate: true,
    coordinateStatus: 'medium_estimated', coordinateSourceType: 'landmark_estimate',
    source: '공식 PDF 중앙의무실(녹색 십자) 표기 + 입구 앵커 추정',
    sourceUrl: null, checkedAt: '2026-08-01',
    googlePoiName: null,
    evidence: '공식 PDF 메디터레이니언 하버 입구 쪽 중앙의무실 표기. Google POI 미확보.',
    estimatedAccuracyMeters: 15, confidenceScore: 50,
    notes: 'AED 개별 좌표는 미검증으로 별도 표시하지 않음. Google POI 미확인.',
  },
];

export const TDS_BABYCARE = [
  {
    id: 'tds-baby-01', park: 'TDS', area: 'mediterranean-harbor', type: 'babyCare',
    name: '메디터레이니언 하버 베이비케어룸·수유실',
    nameNote: '하버 광장 인근',
    coordinates: [35.62730, 139.88320],
    generalRestroom: false, accessibleRestroom: true, babyCare: true, nursingRoom: true,
    insidePaidArea: true, generalGuestAccessible: true,
    pdfVerified: true, coordinateVerified: false, approximate: true,
    coordinateStatus: 'low_estimated', coordinateSourceType: 'landmark_estimate',
    source: '공식 PDF 베이비케어/수유 표기 + 하버 앵커 추정',
    sourceUrl: null, checkedAt: '2026-08-01',
    googlePoiName: null,
    evidence: '공식 PDF 메디터레이니언 하버 육아 지원 시설 표기. 정확 좌표 미확인.',
    estimatedAccuracyMeters: 25, confidenceScore: 34,
    notes: '대략적인 위치. 수유·기저귀 교환 지원.',
  },
  {
    id: 'tds-baby-02', park: 'TDS', area: 'mermaid-lagoon', type: 'babyCare',
    name: '머메이드 라군 베이비케어룸·수유실',
    nameNote: '머메이드 라군 인근',
    coordinates: [35.62515, 139.88575],
    generalRestroom: false, accessibleRestroom: true, babyCare: true, nursingRoom: true,
    insidePaidArea: true, generalGuestAccessible: true,
    pdfVerified: true, coordinateVerified: false, approximate: true,
    coordinateStatus: 'low_estimated', coordinateSourceType: 'landmark_estimate',
    source: '공식 PDF 베이비케어/수유 표기 + 머메이드 라군 앵커 추정',
    sourceUrl: null, checkedAt: '2026-08-01',
    googlePoiName: null,
    evidence: '공식 PDF 머메이드 라군 육아 지원 시설 표기. 정확 좌표 미확인.',
    estimatedAccuracyMeters: 25, confidenceScore: 32,
    notes: '대략적인 위치.',
  },
];

// heightStatus: 'official' | 'no_restriction' | 'unverified'
// Source of truth for operating height bands (checked 2026-08-01):
// https://faq.tokyodisneyresort.jp/answer/67eaa66757951a27c885678c/
// Raging Spirits max 195cm also confirmed on detail page.
const HFAQ = 'https://faq.tokyodisneyresort.jp/answer/67eaa66757951a27c885678c/';
const HCK = '2026-08-01';
const H_NR = { heightStatus: 'no_restriction', heightSourceUrl: HFAQ, heightCheckedAt: HCK };
const H_OFF = (min, max = null, extra = {}) => ({
  heightStatus: 'official', heightMin: min, heightMax: max,
  heightSourceUrl: extra.heightSourceUrl || HFAQ, heightCheckedAt: extra.heightCheckedAt || HCK,
  ...extra,
});

export const TDS_ATTRACTIONS = [
  // Mediterranean Harbor
  a('tds-a-soaring', 'mediterranean-harbor', '소어링: 판타스틱 플라이트', 'ソアリン：ファンタスティック・フライト', 'Soaring: Fantastic Flight', [35.62790, 139.88300], H_OFF(102), { indoor: true, kid: true, thrill: true, rainy: true }),
  a('tds-a-gondola', 'mediterranean-harbor', '베네치안 곤돌라', 'ヴェネツィアン・ゴンドラ', 'Venetian Gondolas', [35.62740, 139.88370], H_NR, { indoor: false, kid: true, rainy: false }),
  a('tds-a-fortress', 'mediterranean-harbor', '포트리스 익스플로레이션', 'フォートレス・エクスプロレーション', 'Fortress Explorations', [35.62710, 139.88420], H_NR, { indoor: false, kid: true, rainy: false }),
  a('tds-a-steamer-med', 'mediterranean-harbor', '디즈니씨 트랜짓 스티머 라인 (하버)', 'ディズニーシー・トランジットスチーマーライン', 'DisneySea Transit Steamer Line', [35.62760, 139.88400], H_NR, { indoor: false, kid: true, rainy: false }),

  // American Waterfront
  a('tds-a-tot', 'american-waterfront', '타워 오브 테러', 'タワー・オブ・テラー', 'Tower of Terror', [35.62880, 139.88470], H_OFF(102), { indoor: true, kid: false, thrill: true, rainy: true }),
  a('tds-a-toystory', 'american-waterfront', '토이 스토리 마니아!', 'トイ・ストーリー・マニア！', 'Toy Story Mania!', [35.62930, 139.88440], H_NR, { indoor: true, kid: true, rainy: true }),
  a('tds-a-turtletalk', 'american-waterfront', '터틀 토크', 'タートル・トーク', 'Turtle Talk', [35.62900, 139.88420], H_NR, { indoor: true, kid: true, rainy: true }),
  a('tds-a-electric', 'american-waterfront', '디즈니씨 일렉트릭 레일웨이', 'ディズニーシー・エレクトリックレールウェイ', 'DisneySea Electric Railway', [35.62910, 139.88490], H_NR, { indoor: false, kid: true, rainy: false }),

  // Port Discovery
  a('tds-a-aquatopia', 'port-discovery', '아쿠아토피아', 'アクアトピア', 'Aquatopia', [35.62870, 139.88600], H_NR, { indoor: false, kid: true, rainy: false }, '물에 젖을 수 있습니다.'),
  a('tds-a-searider', 'port-discovery', '니모 & 프렌즈 씨라이더', 'ニモ&フレンズ・シーライダー', 'Nemo & Friends SeaRider', [35.62850, 139.88640], H_OFF(90), { indoor: true, kid: true, thrill: false, rainy: true }),

  // Lost River Delta
  a('tds-a-indiana', 'lost-river-delta', '인디아나 존스 어드벤처: 크리스탈 해골의 마신', 'インディ・ジョーンズ・アドベンチャー：クリスタルスカルの魔宮', 'Indiana Jones Adventure', [35.62720, 139.88760], H_OFF(117), { indoor: true, kid: false, thrill: true, rainy: true }),
  a('tds-a-raging', 'lost-river-delta', '레이징 스피리츠', 'レイジングスピリッツ', 'Raging Spirits', [35.62680, 139.88720], H_OFF(117, 195, {
    heightSourceUrl: 'https://www.tokyodisneyresort.jp/tds/attraction/detail/242/',
    heightCheckedAt: HCK,
  }), { indoor: false, kid: false, thrill: true, rainy: false }),
  a('tds-a-steamer-lost', 'lost-river-delta', '트랜짓 스티머 라인 (로스트 리버 델타)', 'トランジットスチーマーライン', 'Transit Steamer Line (Lost River Delta)', [35.62740, 139.88700], H_NR, { indoor: false, kid: true, rainy: false }),

  // Arabian Coast
  a('tds-a-sindbad', 'arabian-coast', '신드바드의 스토리북 보야지', 'シンドバッド・ストーリーブック・ヴォヤッジ', 'Sindbad\u2019s Storybook Voyage', [35.62580, 139.88650], H_NR, { indoor: true, kid: true, rainy: true }),
  a('tds-a-magiclamp', 'arabian-coast', '매지컬 램프 시어터', 'マジックランプシアター', 'The Magic Lamp Theater', [35.62560, 139.88680], H_NR, { indoor: true, kid: true, rainy: true }),
  a('tds-a-carpet', 'arabian-coast', '재스민의 플라잉 카펫', 'ジャスミンのフライングカーペット', 'Jasmine\u2019s Flying Carpets', [35.62600, 139.88690], H_NR, { indoor: false, kid: true, rainy: false }),
  a('tds-a-caravan', 'arabian-coast', '캐러밴 카루셀', 'キャラバンカルーセル', 'Caravan Carousel', [35.62575, 139.88700], H_NR, { indoor: false, kid: true, rainy: false }),

  // Mermaid Lagoon — Jumpin' Jellyfish: no height min (official detail); must sit alone.
  a('tds-a-flounder', 'mermaid-lagoon', '플런더의 플라잉 피시 코스터', 'フランダーのフライングフィッシュコースター', 'Flounder\u2019s Flying Fish Coaster', [35.62520, 139.88600], H_OFF(90), { indoor: false, kid: true, thrill: false, rainy: false }),
  a('tds-a-jellyfish', 'mermaid-lagoon', '점핑 젤리피시', 'ジャンピン・ジェリーフィッシュ', 'Jumpin\u2019 Jellyfish', [35.62535, 139.88615], {
    ...H_NR,
    heightSourceUrl: 'https://www.tokyodisneyresort.jp/tds/attraction/detail/239/',
    requiresIndependentSeating: true,
    boardingRestrictions: '혼자 안정적으로 앉을 수 있어야 합니다.',
  }, { indoor: false, kid: true, rainy: false }),
  a('tds-a-scuttle', 'mermaid-lagoon', '스커틀의 스쿠터', 'スカットルのスクーター', 'Scuttle\u2019s Scooters', [35.62545, 139.88600], H_NR, { indoor: false, kid: true, rainy: false }),
  a('tds-a-blowfish', 'mermaid-lagoon', '블로피시 벌룬 레이스', 'ブローフィッシュ・バルーンレース', 'Blowfish Balloon Race', [35.62525, 139.88580], H_NR, { indoor: true, kid: true, rainy: true }),
  a('tds-a-mermaidtheater', 'mermaid-lagoon', '머메이드 라군 시어터', 'マーメイドラグーンシアター', 'Mermaid Lagoon Theater', [35.62505, 139.88585], H_NR, { indoor: true, kid: true, rainy: true }, '2020년 7월 1일부터 휴장 중이며 재개 시기는 미정(TBD)입니다.', {
    operatingStatus: 'closed_longterm',
    closedInfo: { since: '2020-07-01', reopen: '미정(TBD)', reason: '장기 휴장', sourceUrl: 'https://www.tokyodisneyresort.jp/en/tds/attraction/detail/221/', checkedAt: '2026-07-31' },
  }),
  a('tds-a-arielplay', 'mermaid-lagoon', '아리엘의 플레이그라운드', 'アリエルのプレイグラウンド', 'Ariel\u2019s Playground', [35.62510, 139.88610], H_NR, { indoor: true, kid: true, rainy: true }),

  // Mysterious Island
  a('tds-a-center', 'mysterious-island', '센터 오브 디 어스', 'センター・オブ・ジ・アース', 'Journey to the Center of the Earth', [35.62660, 139.88540], H_OFF(117), { indoor: true, kid: false, thrill: true, rainy: true }),
  a('tds-a-20000', 'mysterious-island', '해저 2만 리', '海底2万マイル', '20,000 Leagues Under the Sea', [35.62680, 139.88560], H_NR, { indoor: true, kid: true, rainy: true }),

  // Fantasy Springs (2024 오픈)
  a('tds-a-frozen', 'fantasy-springs', '애나와 엘사의 프로즌 저니', 'アナとエルサのフローズンジャーニー', 'Anna and Elsa\u2019s Frozen Journey', [35.62950, 139.88820], H_NR, { indoor: true, kid: true, rainy: true }),
  a('tds-a-rapunzel', 'fantasy-springs', '라푼젤의 랜턴 페스티벌', 'ラプンツェルのランタンフェスティバル', 'Rapunzel\u2019s Lantern Festival', [35.62920, 139.88860], H_NR, { indoor: true, kid: true, rainy: true }),
  a('tds-a-peterpan', 'fantasy-springs', '피터팬의 네버랜드 어드벤처', 'ピーターパンのネバーランドアドベンチャー', 'Peter Pan\u2019s Never Land Adventure', [35.62890, 139.88880], H_OFF(102, null, {
    heightSourceUrl: 'https://www.tokyodisneyresort.jp/en/tds/attraction/detail/257/',
    heightCheckedAt: HCK,
  }), { indoor: true, kid: true, rainy: true }, '싱글라이더 대상. 아이를 무릎에 앉힐 수 없습니다.'),
  a('tds-a-tinkerbell', 'fantasy-springs', '팅커벨의 비지 버기', 'ティンカーベルのビジーバギー', 'Tinker Bell\u2019s Busy Buggies', [35.62905, 139.88840], H_NR, { indoor: true, kid: true, rainy: true }),
];

function a(id, area, nameKo, nameJa, nameEn, coordinates, heightSpec = {}, tags = {}, notes = '', opts = {}) {
  const h = heightSpec || {};
  return {
    id, park: 'TDS', area, type: 'attraction',
    nameKo, nameJa, nameEn,
    coordinates,
    heightMin: h.heightMin ?? null,
    heightMax: h.heightMax ?? null,
    heightStatus: h.heightStatus || 'unverified',
    heightSourceUrl: h.heightSourceUrl || opts.heightSourceUrl || null,
    heightCheckedAt: h.heightCheckedAt || opts.heightCheckedAt || null,
    heightNote: h.heightNote || opts.heightNote || null,
    requiresIndependentSeating: !!(h.requiresIndependentSeating || opts.requiresIndependentSeating),
    boardingRestrictions: h.boardingRestrictions || opts.boardingRestrictions || null,
    operatingStatus: opts.operatingStatus || 'operating',
    closedInfo: opts.closedInfo || null,
    closures: opts.closures || [],
    indoor: !!tags.indoor,
    thrill: !!tags.thrill,
    kidFriendly: !!tags.kid,
    rainyRecommended: tags.rainy != null ? !!tags.rainy : !!tags.indoor,
    coordinateStatus: 'low_estimated',
    approximate: true,
    coordinateVerified: false,
    coordinateSourceType: 'layout_estimate',
    estimatedAccuracyMeters: 45,
    confidenceScore: 28,
    source: '공식 PDF 포트 배치 + 파크 지리 기반 근사 위치',
    notes: notes || '어트랙션 위치는 대략적 추정이며 지도상 정확 좌표는 검증 예정입니다.',
  };
}

// Official closures (source: https://www.tokyodisneyresort.jp/en/tds/monthly/stop.html, checkedAt 2026-07-31).
const TDS_SRC = 'https://www.tokyodisneyresort.jp/en/tds/monthly/stop.html';
const CKS = '2026-07-31';
const c = (startDate, endDate, note = '') => ({ startDate, endDate, closureType: 'refurbishment', sourceUrl: TDS_SRC, checkedAt: CKS, note });
const TDS_CLOSURES = {
  'tds-a-indiana': [c('2025-08-18', null, '장기 휴장(재개 미정)')],
  'tds-a-carpet': [c('2026-07-28', '2026-08-10')],
  'tds-a-steamer-med': [c('2026-08-04', '2026-11-30')],
  'tds-a-fortress': [c('2026-07-01', '2026-09-14', '\u201c더 레오나르도 챌린지\u201d 프로그램 휴장 (요새 탐험 자체는 이용 가능할 수 있음)')],
  'tds-a-flounder': [c('2026-08-12', '2026-08-26')],
  'tds-a-scuttle': [c('2026-08-27', '2026-08-31')],
  'tds-a-tot': [c('2026-09-28', '2026-11-05')],
  'tds-a-magiclamp': [c('2026-12-08', '2026-12-22')],
  'tds-a-center': [c('2027-01-08', '2027-03-08')],
};
for (const att of TDS_ATTRACTIONS) {
  if (TDS_CLOSURES[att.id]) att.closures = TDS_CLOSURES[att.id];
}
