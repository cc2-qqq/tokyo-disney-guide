// Park boundary guidance sourced from OpenStreetMap theme_park polygons.
// Manual attraction-hull / maxBounds-style rings are intentionally NOT used.
//
// Protomaps local PMTiles only expose theme parks as Point POIs (source-layer
// "pois", kind=theme_park) — no landuse polygon geometry. Therefore rings are
// a static extract of OSM ways (see data/boundaries/*.geojson).

import { PARK_BOUNDARY_GEOJSON } from './parkBoundaryGeojson.js';

function fromOsm(parkId) {
  const pack = PARK_BOUNDARY_GEOJSON[parkId];
  if (!pack) return null;
  const props = pack.feature?.properties || {};
  return {
    parkOutline: {
      ring: pack.ring,
      geometryType: props.geometryType || 'Polygon',
      multipolygon: !!props.multipolygon,
      osmType: props.osmType,
      osmId: props.osmId,
      featureId: pack.feature?.id || null,
      confidence: 'osm_extract',
      source: props.source || 'OpenStreetMap',
      sourceUrl: props.sourceUrl || null,
      license: props.license || 'ODbL',
      notes: props.notes
        || 'OSM tourism=theme_park polygon (not legal cadastral). Static extract — not maxBounds / not attraction hull.',
      checkedAt: props.extractedAt || null,
      coordinateCount: pack.ring?.length || 0,
    },
    // Gate cue (line), not a filled entranceZone polygon.
    gateLine: null,
    approachArrow: null,
    source: props.source || 'OpenStreetMap',
    notes: 'Manual parkOutline rings removed. Using OSM theme_park way geometry.',
    checkedAt: props.extractedAt || null,
  };
}

// Short ticket-gate cue + approach arrow (visual only; not a filled zone).
const GATE_CUES = {
  TDL: {
    gateLine: {
      // East–west across World Bazaar ticket gates
      latlngs: [
        [35.63528, 139.87962],
        [35.63528, 139.88028],
      ],
      notes: '티켓게이트 안내선(안내용). 면적 entranceZone 아님.',
    },
    approachArrow: {
      // From pregate plaza toward main gate (south→north into park)
      latlngs: [
        [35.63500, 139.87995],
        [35.63522, 139.87995],
      ],
      label: '여기서 입장',
      glyph: '▲',
    },
  },
  TDS: {
    gateLine: {
      // North–south across Mediterranean Harbor ticket gates
      latlngs: [
        [35.62652, 139.88242],
        [35.62708, 139.88242],
      ],
      notes: '티켓게이트 안내선(안내용). 면적 entranceZone 아님.',
    },
    approachArrow: {
      // From west approach toward gate (west→east into park)
      latlngs: [
        [35.62680, 139.88210],
        [35.62680, 139.88242],
      ],
      label: '여기서 입장',
      glyph: '▶',
    },
  },
};

function build(parkId) {
  const base = fromOsm(parkId);
  if (!base) return null;
  const cues = GATE_CUES[parkId] || {};
  return {
    ...base,
    gateLine: cues.gateLine || null,
    approachArrow: cues.approachArrow || null,
  };
}

export const PARK_BOUNDARIES = {
  TDL: build('TDL'),
  TDS: build('TDS'),
};
