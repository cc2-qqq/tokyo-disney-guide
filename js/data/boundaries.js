// Visual guidance polygons for park outer / paid / entrance areas.
// NOT legal cadastral boundaries. Approximate shapes derived from
// official PDF layout, attraction/restroom extents, maxBounds, and entrance anchors.

const META = {
  source: '공식 PDF 배치 + 등록 시설 범위 + park maxBounds/entranceCoordinates',
  notes: '앱 안내용 시각 경계입니다. 측량·법적 토지 경계가 아닙니다.',
  checkedAt: '2026-08-02',
};

export const PARK_BOUNDARIES = {
  TDL: {
    parkOuterBoundary: {
      ring: [
        [35.63590, 139.87740],
        [35.63600, 139.88160],
        [35.63420, 139.88430],
        [35.63100, 139.88460],
        [35.62890, 139.88320],
        [35.62900, 139.87790],
        [35.63240, 139.87710],
      ],
      confidence: 'estimated',
      source: META.source,
      notes: '파크 외곽 안내용 시각 경계(maxBounds보다 이해하기 쉬운 다각형).',
      checkedAt: META.checkedAt,
    },
    paidAreaBoundary: {
      ring: [
        [35.63505, 139.87885],
        [35.63505, 139.88085],
        [35.63385, 139.88315],
        [35.63155, 139.88375],
        [35.62995, 139.88355],
        [35.62975, 139.88025],
        [35.63085, 139.87855],
        [35.63345, 139.87845],
      ],
      confidence: 'visually_verified',
      source: META.source,
      notes: '유료구역 중심 동선 안내 경계. 등록 어트랙션·유료구역 화장실 범위를 참고.',
      checkedAt: META.checkedAt,
    },
    entranceAreaBoundary: {
      ring: [
        [35.63555, 139.87915],
        [35.63555, 139.88075],
        [35.63455, 139.88075],
        [35.63455, 139.87915],
      ],
      confidence: 'estimated',
      source: META.source,
      notes: '정문·티켓게이트·대기 전면 프리게이트 안내 영역.',
      checkedAt: META.checkedAt,
    },
    source: META.source,
    notes: META.notes,
    checkedAt: META.checkedAt,
  },
  TDS: {
    parkOuterBoundary: {
      ring: [
        [35.63020, 139.88120],
        [35.63040, 139.88780],
        [35.62920, 139.89000],
        [35.62620, 139.89010],
        [35.62440, 139.88820],
        [35.62430, 139.88280],
        [35.62580, 139.88090],
        [35.62820, 139.88080],
      ],
      confidence: 'estimated',
      source: META.source,
      notes: '파크 외곽 안내용 시각 경계.',
      checkedAt: META.checkedAt,
    },
    paidAreaBoundary: {
      ring: [
        [35.62935, 139.88305],
        [35.62955, 139.88660],
        [35.62895, 139.88895],
        [35.62705, 139.88895],
        [35.62525, 139.88795],
        [35.62495, 139.88555],
        [35.62555, 139.88325],
        [35.62715, 139.88275],
      ],
      confidence: 'visually_verified',
      source: META.source,
      notes: '유료구역 중심 동선 안내 경계. 등록 어트랙션·유료구역 화장실 범위를 참고.',
      checkedAt: META.checkedAt,
    },
    entranceAreaBoundary: {
      ring: [
        [35.62745, 139.88135],
        [35.62745, 139.88295],
        [35.62600, 139.88295],
        [35.62600, 139.88135],
      ],
      confidence: 'estimated',
      source: META.source,
      notes: '정문·티켓게이트·스테이션 쪽 프리게이트 안내 영역.',
      checkedAt: META.checkedAt,
    },
    source: META.source,
    notes: META.notes,
    checkedAt: META.checkedAt,
  },
};
