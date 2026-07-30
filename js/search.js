import { haversineMeters } from './geo.js';

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

// Attraction filter chips.
export function attractionMatchesFilters(poi, filters, ctx) {
  const f = filters || {};
  if (f.height === 'none' && poi.heightMin != null) return false;
  if (f.height === '90' && !(poi.heightMin != null && poi.heightMin >= 90)) return false;
  if (f.height === '102' && !(poi.heightMin != null && poi.heightMin >= 102)) return false;
  if (f.height === '117' && !(poi.heightMin != null && poi.heightMin >= 117)) return false;
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
//  - low_estimated: only when includeEstimated is on
//  - high/medium: always
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
