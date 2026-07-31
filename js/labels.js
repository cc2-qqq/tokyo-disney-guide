// Human-friendly Korean labels. Never show raw technical field names to users.

export const COORD_STATUS_LABEL = {
  // High좌표도 이번 세션에서 Google POI를 직접 재확인하지 않았고 sourceUrl/checkedAt이 없으므로
  // "확인"이 아닌 "지도 자료 기반 추정 위치"로 표기한다.
  high_estimated: '지도 자료 기반 추정 위치',
  medium_estimated: '추정 위치',
  low_estimated: '대략적인 위치',
  unknown: '위치 미확인',
};

export const COORD_STATUS_BADGE = {
  high_estimated: { text: '지도 기반 추정', cls: 'badge-high' },
  medium_estimated: { text: '추정 위치', cls: 'badge-medium' },
  low_estimated: { text: '대략적 위치', cls: 'badge-low' },
  unknown: { text: '위치 미확인', cls: 'badge-unknown' },
};

// Shown under any attraction that has an official height limit.
export const HEIGHT_MEASURE_NOTE = '현장에서는 신발을 신은 상태의 공식 측정과 캐스트 판단을 따릅니다.';

// Accuracy shown by status band (avoid over-precise ±3m claims).
export const ACCURACY_LABEL = {
  high_estimated: '약 5~10m',
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
};

export const TYPE_ICON = {
  attraction: '\u{1F3A2}', // ferris wheel-ish
  restroom: '\u{1F6BB}',
  firstAid: '\u{1F691}',
  emergencyFacility: '\u{1F691}',
  babyCare: '\u{1F476}',
};

export function confidenceBand(score, status) {
  if (status === 'unknown' || score == null) return { key: 'unknown', label: '미확인' };
  if (score >= 70) return { key: 'high', label: '높음' };
  if (score >= 45) return { key: 'medium', label: '보통' };
  return { key: 'low', label: '낮음' };
}

// Ride eligibility for a child, from an attraction record.
export function rideEligibility(attraction, childHeightCm) {
  if (attraction.heightStatus === 'none' || attraction.heightMin == null) {
    if (attraction.heightStatus === 'unverified') {
      return { ok: null, label: '공식 정보 재확인 필요', cls: 'ride-unknown' };
    }
    return { ok: true, label: '키 제한 없음', cls: 'ride-ok' };
  }
  if (attraction.heightStatus === 'unverified') {
    return { ok: null, label: '공식 정보 재확인 필요', cls: 'ride-unknown' };
  }
  if (childHeightCm == null) {
    return { ok: null, label: `${attraction.heightMin}cm 이상 필요`, cls: 'ride-unknown' };
  }
  if (childHeightCm >= attraction.heightMin) {
    return { ok: true, label: '탑승 가능', cls: 'ride-ok' };
  }
  return { ok: false, label: '키 제한 미달', cls: 'ride-no' };
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
  if (attraction.heightStatus === 'unverified') return '키 제한 재확인 필요';
  if (attraction.heightMin == null) return '키 제한 없음';
  return `${attraction.heightMin}cm 이상`;
}
