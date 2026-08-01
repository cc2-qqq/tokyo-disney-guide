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
  return true;
}

// Facility (restroom/emergency/babyCare) filters.
export function facilityMatchesFilters(poi, filters) {
  const f = filters || {};
  if (f.generalOnly && !poi.generalRestroom) return false;
  if (f.accessible && !poi.accessibleRestroom) return false;
  if (f.nursing && !poi.nursingRoom) return false;
  if (f.babyCare && !poi.babyCare) return false;
  if (f.inGateOnly && poi.insidePaidArea !== true) return false;
  if (f.highOnly && poi.coordinateStatus !== 'high_estimated') return false;
  return true;
}

// Visibility rule for FACILITY points on the map/list:
//  - unknown: never shown
//  - low_estimated / medium_estimated: only when includeEstimated is on
//  - high: always
export function facilityVisible(poi, includeEstimated) {
  if (poi.coordinateStatus === 'unknown') return false;
  if (poi.coordinateStatus === 'low_estimated' || poi.coordinateStatus === 'medium_estimated') {
    return !!includeEstimated;
  }
  return true;
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
