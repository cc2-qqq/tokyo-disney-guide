import { PARKS, PARK_IDS, LANDMARK_ATTRACTIONS, isLandmark } from './parks.js';
import { TDL_ATTRACTIONS, TDL_RESTROOMS, TDL_EMERGENCY, TDL_BABYCARE } from './tdl.js';
import { TDS_ATTRACTIONS, TDS_RESTROOMS, TDS_EMERGENCY, TDS_BABYCARE } from './tds.js';
import { ENTRANCES } from './entrances.js';
import { PARK_BOUNDARIES } from './boundaries.js';

const DATA = {
  TDL: {
    attractions: TDL_ATTRACTIONS,
    restrooms: TDL_RESTROOMS,
    emergency: TDL_EMERGENCY,
    babyCare: TDL_BABYCARE,
  },
  TDS: {
    attractions: TDS_ATTRACTIONS,
    restrooms: TDS_RESTROOMS,
    emergency: TDS_EMERGENCY,
    babyCare: TDS_BABYCARE,
  },
};

export { PARKS, PARK_IDS, LANDMARK_ATTRACTIONS, isLandmark };

export function getParkMeta(parkId) {
  return PARKS[parkId];
}

// All POIs for a park (attractions + facilities), each with a resolved area name.
export function getPois(parkId) {
  const meta = PARKS[parkId];
  const areaName = (id) => (meta.areas.find((x) => x.id === id)?.nameKo ?? id);
  const d = DATA[parkId];
  const withArea = (arr) => arr.map((x) => ({ ...x, areaNameKo: areaName(x.area) }));
  return [
    ...withArea(d.attractions),
    ...withArea(d.restrooms),
    ...withArea(d.emergency),
    ...withArea(d.babyCare),
  ];
}

// Attractions currently operating (used for the map + attractions list).
export function getAttractions(parkId) {
  return getPois(parkId).filter((p) => p.type === 'attraction' && (p.operatingStatus || 'operating') === 'operating');
}

// All attractions incl. long-term-closed (used for search + detail lookup).
export function getAllAttractions(parkId) {
  return getPois(parkId).filter((p) => p.type === 'attraction');
}

export function getArchivedAttractions(parkId) {
  return getPois(parkId).filter((p) => p.type === 'attraction' && (p.operatingStatus || 'operating') !== 'operating');
}

// Facility POIs = restrooms, baby care/nursing, emergency.
export function getFacilities(parkId) {
  return getPois(parkId).filter((p) => p.type !== 'attraction');
}

export function getPoiById(parkId, id) {
  return getPois(parkId).find((p) => p.id === id)
    || getEntranceById(parkId, id)
    || null;
}

export function getEntrances(parkId) {
  const list = ENTRANCES[parkId] || [];
  return list.map((e) => ({ ...e, areaNameKo: '입구·프리게이트' }));
}

export function getEntranceById(parkId, id) {
  return getEntrances(parkId).find((e) => e.id === id) || null;
}

export function getMainEntrance(parkId) {
  return getEntrances(parkId).find((e) => e.entranceKind === 'main_entrance') || null;
}

export function getParkBoundaries(parkId) {
  return PARK_BOUNDARIES[parkId] || null;
}

export { ENTRANCES, PARK_BOUNDARIES };
