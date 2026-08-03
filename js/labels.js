// Human-friendly Korean labels. Never show raw technical field names to users.

export const COORD_STATUS_LABEL = {
  // High: TDL Google-POI-derived estimates (not resurveyed GPS).
  high_estimated: '지도 자료 기반 추정 위치',
  // Dining: cross-checked against official map + landmark/POI (still not surveyed GPS).
  high_verified: '공식 지도·랜드마크 대조 위치',
  // Medium: official park-map + landmark estimate (TDS default visible band).
  medium_estimated: '공식 지도 기반 추정 위치',
  low_estimated: '대략적인 위치',
  unknown: '위치 미확인',
};

export const COORD_STATUS_BADGE = {
  high_estimated: { text: '지도 기반 추정', cls: 'badge-high' },
  high_verified: { text: '공식 지도 대조', cls: 'badge-high' },
  medium_estimated: { text: '공식 지도 기반 추정 위치', cls: 'badge-medium' },
  low_estimated: { text: '대략적인 위치', cls: 'badge-low' },
  unknown: { text: '위치 미확인', cls: 'badge-unknown' },
};

export const MEDIUM_ESTIMATE_DETAIL_NOTE =
  '공식 도쿄디즈니리조트 지도와 주변 시설을 기준으로 추정한 위치입니다. 실제 출입구와 다소 차이가 있을 수 있습니다.';

// Shown under any attraction that has an official height limit.
export const HEIGHT_MEASURE_NOTE = '현장에서는 신발을 신은 상태의 공식 측정과 캐스트 판단을 따릅니다.';

// Accuracy shown by status band (avoid over-precise ±3m claims).
export const ACCURACY_LABEL = {
  high_estimated: '약 5~10m',
  high_verified: '약 5~15m',
  medium_estimated: '약 10~15m',
  low_estimated: '약 20~30m',
  unknown: '미확인',
};

export const TYPE_LABEL = {
  attraction: '어트랙션',
  restroom: '화장실',
  firstAid: '중앙구호실',
  emergencyFacility: '응급시설',
  babyCare: '베이비케어룸·수유실',
  entrance: '입구',
  restaurant: '식당·식음',
};

export const MEAL_TYPE_LABEL = {
  meal: '식사',
  light_meal: '가벼운 식사',
  snack: '간식',
  dessert: '디저트',
  drink: '음료',
  popcorn: '팝콘',
};

export const TYPE_ICON = {
  attraction: '\u{1F3A2}', // ferris wheel-ish
  restroom: '\u{1F6BB}',
  firstAid: '\u{1F691}',
  emergencyFacility: '\u{1F691}',
  babyCare: '\u{1F476}',
  restaurant: '\u{1F374}',
};

export function confidenceBand(score, status) {
  if (status === 'unknown' || score == null) return { key: 'unknown', label: '미확인' };
  if (score >= 70) return { key: 'high', label: '높음' };
  if (score >= 45) return { key: 'medium', label: '보통' };
  return { key: 'low', label: '낮음' };
}

// Normalize legacy 'none' -> 'no_restriction'.
export function heightStatusOf(attraction) {
  const s = attraction && attraction.heightStatus;
  if (s === 'none') return 'no_restriction';
  return s || 'unverified';
}

// Ride eligibility for a child, from an attraction record (min + optional max).
export function rideEligibility(attraction, childHeightCm) {
  const status = heightStatusOf(attraction);
  if (status === 'unverified') {
    return { ok: null, label: '공식 키 기준 확인 필요', cls: 'ride-unknown' };
  }
  if (status === 'no_restriction' || (attraction.heightMin == null && attraction.heightMax == null)) {
    return { ok: true, label: '탑승 가능', cls: 'ride-ok' };
  }
  if (childHeightCm == null) {
    return { ok: null, label: heightTierLabel(attraction), cls: 'ride-unknown' };
  }
  if (attraction.heightMin != null && childHeightCm < attraction.heightMin) {
    return { ok: false, label: '키 기준 미달', cls: 'ride-no' };
  }
  if (attraction.heightMax != null && childHeightCm > attraction.heightMax) {
    return { ok: false, label: '최대 키 초과', cls: 'ride-no' };
  }
  return { ok: true, label: '탑승 가능', cls: 'ride-ok' };
}

// Pre-announced closure overlapping a visit date (YYYY-MM-DD). endDate null = TBD/ongoing.
export function closureOnDate(attraction, dateStr) {
  if (!attraction || !Array.isArray(attraction.closures) || !dateStr) return null;
  for (const cl of attraction.closures) {
    if (!cl.startDate) continue;
    const afterStart = dateStr >= cl.startDate;
    const beforeEnd = cl.endDate == null ? true : dateStr <= cl.endDate;
    if (afterStart && beforeEnd) return cl;
  }
  return null;
}

export function formatDateKo(dateStr) {
  if (!dateStr) return '미정';
  const [y, m, d] = dateStr.split('-');
  return `${y}.${Number(m)}.${Number(d)}`;
}

export const OPERATING_STATUS_LABEL = {
  operating: '운영 중(예정)',
  closed_longterm: '운영 종료 · 장기 휴장',
};

export function heightTierLabel(attraction) {
  const status = heightStatusOf(attraction);
  if (status === 'unverified') return '공식 키 기준 확인 필요';
  if (status === 'no_restriction' || (attraction.heightMin == null && attraction.heightMax == null)) {
    return '키 제한 없음';
  }
  if (attraction.heightMin != null && attraction.heightMax != null) {
    return `${attraction.heightMin}~${attraction.heightMax}cm`;
  }
  if (attraction.heightMin != null) return `${attraction.heightMin}cm 이상`;
  if (attraction.heightMax != null) return `${attraction.heightMax}cm 이하`;
  return '공식 키 기준 확인 필요';
}

/** True if a child of given height can ride (strict: false for unverified). */
export function childCanRide(attraction, childHeightCm) {
  return rideEligibility(attraction, childHeightCm).ok === true;
}
