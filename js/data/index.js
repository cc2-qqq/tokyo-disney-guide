import { PARKS, PARK_IDS } from './parks.js';
import { TDL_ATTRACTIONS, TDL_RESTROOMS, TDL_EMERGENCY, TDL_BABYCARE } from './tdl.js';
import { TDS_ATTRACTIONS, TDS_RESTROOMS, TDS_EMERGENCY, TDS_BABYCARE } from './tds.js';

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

export { PARKS, PARK_IDS };

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

export function getAttractions(parkId) {
  return getPois(parkId).filter((p) => p.type === 'attraction');
}

// Facility POIs = restrooms, baby care/nursing, emergency.
export function getFacilities(parkId) {
  return getPois(parkId).filter((p) => p.type !== 'attraction');
}

export function getPoiById(parkId, id) {
  return getPois(parkId).find((p) => p.id === id) || null;
}
