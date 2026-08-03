import { haversineMeters } from './geo.js';
import { heightStatusOf, childCanRide } from './labels.js';

function norm(s) {
  return (s || '').toString().toLowerCase().replace(/\s+/g, '');
}

// Searches KR/JP/EN names, area, and type label text.
export function matchText(poi, query) {
  if (!query) return true;
  const q = norm(query);
  const hay = [
    poi.nameKo, poi.nameJa, poi.nameEn, poi.name, poi.nameNote,
    poi.areaNameKo, poi.area, poi.googlePoiName,
    poi.summaryKo,
    ...(Array.isArray(poi.cuisineTags) ? poi.cuisineTags : []),
    ...(Array.isArray(poi.representativeMenusKo) ? poi.representativeMenusKo : []),
    poi.mealType, poi.facilityType,
    poi.mobileOrder === true ? '모바일오더|모바일 오더|mobileorder' : '',
    poi.childrenMenu === true ? '어린이메뉴|아이메뉴|아이 메뉴|childrenmenu' : '',
    poi.mealType === 'popcorn' || poi.facilityType === 'popcorn_wagon' ? '팝콘|popcorn' : '',
    poi.mealType === 'dessert' ? '디저트|dessert' : '',
  ].map(norm).join('|');
  return hay.includes(q);
}

/**
 * Attraction filter chips.
 * f.height keys:
 *   'none' | '81' | '90' | '102' | '117' | 'unverified'
 *   | 'child:0' | 'child:1' | ... (index into children)
 *   | 'all-children'
 * ctx: { isFavorite, children }
 */
export function attractionMatchesFilters(poi, filters, ctx) {
  const f = filters || {};
  const status = heightStatusOf(poi);
  const children = (ctx && ctx.children) || [];

  if (f.height === 'none') {
    if (!(status === 'no_restriction' || (poi.heightMin == null && poi.heightMax == null && status !== 'unverified'))) return false;
  } else if (f.height === 'unverified') {
    if (status !== 'unverified') return false;
  } else if (f.height === '81') {
    // Attractions a child ≤81cm could still meet (min ≤81 or no min, and max ok)
    // Spec wording: "81cm 이하 이용 가능" = rides usable at 81cm or below → min null or min ≤ 81
    const okAt81 = (status === 'no_restriction')
      || (status === 'official' && (poi.heightMin == null || poi.heightMin <= 81)
        && (poi.heightMax == null || poi.heightMax >= 81));
    if (!okAt81) return false;
  } else if (f.height === '90' || f.height === '102' || f.height === '117') {
    const band = Number(f.height);
    if (!(status === 'official' && poi.heightMin != null && poi.heightMin === band)) return false;
  } else if (typeof f.height === 'string' && f.height.startsWith('child:')) {
    const idx = Number(f.height.slice(6));
    const child = children[idx];
    if (!child || !childCanRide(poi, child.height)) return false;
  } else if (f.height === 'all-children') {
    if (!children.length) return false;
    if (!children.every((c) => childCanRide(poi, c.height))) return false;
  }

  if (f.kid && !poi.kidFriendly) return false;
  if (f.thrill && !poi.thrill) return false;
  if (f.indoor && !poi.indoor) return false;
  if (f.outdoor && poi.indoor) return false;
  if (f.rainy && !poi.rainyRecommended) return false;
  if (f.favorites && !(ctx && ctx.isFavorite(poi.id))) return false;
  // Visit-day official closure exclusion is applied in app via attractionPassesFamilyExtras.
  return true;
}

/** Restroom-tab facility kinds (excludes firstAid / AED / other). */
export function isRestroomTabFacility(poi) {
  if (!poi) return false;
  return poi.type === 'restroom' || poi.type === 'babyCare';
}

// Facility (restroom/emergency/babyCare) filters.
export function facilityMatchesFilters(poi, filters) {
  const f = filters || {};
  if (f.generalOnly && !(poi.type === 'restroom' && poi.generalRestroom)) return false;
  if (f.accessible && !(poi.type === 'restroom' && poi.accessibleRestroom)) return false;
  if (f.nursing && !poi.nursingRoom) return false;
  if (f.babyCare && !(poi.type === 'babyCare' || poi.babyCare)) return false;
  if (f.inGateOnly && poi.insidePaidArea !== true) return false;
  if (f.highOnly && poi.coordinateStatus !== 'high_estimated') return false;
  return true;
}

/**
 * Visibility rule for FACILITY points on the map/list (park-aware defaults).
 *  - unknown: never
 *  - high: always
 *  - medium: TDS default ON; TDL only when includeLow (낮은 신뢰도까지)
 *  - low: only when includeLow
 * includeLow = settings "낮은 신뢰도 위치까지 표시"
 */
export function facilityVisible(poi, includeLow, parkId, { includePregate = false } = {}) {
  const st = poi.coordinateStatus;
  if (st === 'unknown') return false;
  // Hotel-only / non-guest facilities stay hidden unless explicitly handled later.
  if (poi.generalGuestAccessible === false) return false;
  // Default: paid-area only; opt-in for station/bus/taxi pregate toilets.
  if (poi.insidePaidArea === false && !includePregate) return false;
  if (st === 'high_estimated' || st === 'high_verified') return true;
  if (st === 'medium_estimated') {
    if (parkId === 'TDS') return true;
    return !!includeLow;
  }
  if (st === 'low_estimated') return !!includeLow;
  return true;
}

/** Dining visibility: low_estimated hidden unless includeLow. */
export function restaurantVisible(poi, includeLow) {
  if (!poi || poi.type !== 'restaurant') return false;
  const st = poi.coordinateStatus;
  if (st === 'unknown') return false;
  if (poi.generalGuestAccessible === false) return false;
  if (st === 'high_verified' || st === 'high_estimated' || st === 'medium_estimated') return true;
  if (st === 'low_estimated') return !!includeLow;
  return true;
}

export function restaurantMatchesFilters(poi, filters) {
  const f = filters || {};
  if (f.childrenMenu && poi.childrenMenu !== true) return false;
  if (f.mobileOrder && poi.mobileOrder !== true) return false;
  // Meal-type chips are OR within the group when several are on.
  const mealChips = [];
  if (f.meal) {
    mealChips.push(poi.mealType === 'meal' || poi.mealType === 'light_meal');
  }
  if (f.snack) {
    mealChips.push(poi.mealType === 'snack' || poi.facilityType === 'snack_stand' || poi.facilityType === 'food_wagon');
  }
  if (f.dessert) mealChips.push(poi.mealType === 'dessert');
  if (f.drink) mealChips.push(poi.mealType === 'drink' || poi.facilityType === 'drink_stand');
  if (f.popcorn) mealChips.push(poi.mealType === 'popcorn' || poi.facilityType === 'popcorn_wagon');
  if (mealChips.length && !mealChips.some(Boolean)) return false;
  if (f.noReservation && poi.reservationRequired === true) return false;
  if (f.prioritySeating && poi.prioritySeating !== true) return false;
  if (f.indoor) {
    if (poi.indoorStatus !== 'indoor' && poi.indoorStatus !== 'mixed') return false;
  }
  if (f.alcohol && poi.alcoholAvailable !== true) return false;
  return true;
}

/** Count facilities by band for summary chips. */
export function facilityBandCounts(facilities) {
  const c = { high: 0, medium: 0, low: 0, unknown: 0 };
  for (const f of facilities) {
    if (f.coordinateStatus === 'high_estimated') c.high++;
    else if (f.coordinateStatus === 'medium_estimated') c.medium++;
    else if (f.coordinateStatus === 'low_estimated') c.low++;
    else if (f.coordinateStatus === 'unknown') c.unknown++;
  }
  return c;
}

export function withDistance(pois, userCoords) {
  if (!userCoords) return pois.map((p) => ({ ...p, _dist: null }));
  return pois.map((p) => ({
    ...p,
    _dist: p.coordinates ? haversineMeters(userCoords, p.coordinates) : null,
  }));
}

export function sortByDistance(pois) {
  return [...pois].sort((a, b) => {
    if (a._dist == null) return 1;
    if (b._dist == null) return -1;
    return a._dist - b._dist;
  });
}
