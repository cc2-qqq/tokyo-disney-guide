// Park boundary guidance.
// - rawOsmBoundary: OSM tourism=theme_park extract (audit / provenance only)
// - guestAreaOutline: orientation outline shown on the map (OSM baseline + edits)
//
// Protomaps local PMTiles only expose theme parks as Point POIs — no landuse
// theme_park polygons — so geometry is shipped as static GeoJSON extracts.

import { PARK_BOUNDARY_GEOJSON } from './parkBoundaryGeojson.js';

const DETAIL_NOTE =
  '일반 게스트 이용구역을 이해하기 위한 안내용 경계입니다. 공식·법적 경계가 아니며 실제 운영구역은 현장 안내를 따라 주세요.';

function fromPack(parkId) {
  const pack = PARK_BOUNDARY_GEOJSON[parkId];
  if (!pack?.guestArea) return null;
  const gProps = pack.guestArea.feature?.properties || {};
  const rProps = pack.rawOsm?.feature?.properties || {};

  return {
    guestAreaOutline: {
      ring: pack.guestArea.ring,
      geometryType: gProps.geometryType || 'Polygon',
      multipolygon: !!gProps.multipolygon,
      boundaryPurpose: gProps.boundaryPurpose || 'guest_orientation',
      officialBoundary: gProps.officialBoundary === true,
      confidence: 'guest_orientation_edit',
      source: gProps.source
        || 'OSM tourism=theme_park way + official Korean PDF + vector basemap visual alignment',
      sourceOsmId: gProps.sourceOsmId || rProps.osmId || null,
      sourceOsmUrl: gProps.sourceOsmUrl || rProps.sourceUrl || null,
      license: gProps.license || 'ODbL (OSM baseline) + app orientation edits',
      notes: gProps.notes || DETAIL_NOTE,
      label: '파크 영역(안내용)',
      detail: DETAIL_NOTE,
      checkedAt: gProps.checkedAt || null,
      coordinateCount: pack.guestArea.ring?.length || 0,
      edits: gProps.edits || null,
    },
    rawOsmBoundary: pack.rawOsm
      ? {
          ring: pack.rawOsm.ring,
          osmType: rProps.osmType || 'way',
          osmId: rProps.osmId || null,
          sourceUrl: rProps.sourceUrl || null,
          license: rProps.license || 'ODbL',
          notes: rProps.notes
            || 'Raw OSM tourism=theme_park polygon (audit only — not shown on map).',
          checkedAt: rProps.extractedAt || null,
          coordinateCount: pack.rawOsm.ring?.length || 0,
        }
      : null,
    // Backward-compatible alias used by older call sites / validators during transition.
    parkOutline: null,
    gateLine: null,
    approachArrow: null,
    source: gProps.source || 'guest_orientation',
    notes: DETAIL_NOTE,
    checkedAt: gProps.checkedAt || null,
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
      // From gate toward World Bazaar / park interior (north → south)
      latlngs: [
        [35.63522, 139.87995],
        [35.63500, 139.87995],
      ],
      label: '여기서 입장',
      glyph: '▼',
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
      // From west approach toward gate (west → east into park)
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
  const base = fromPack(parkId);
  if (!base) return null;
  // Prefer guestAreaOutline as the render ring; keep parkOutline alias in sync
  // so any leftover parkOutline readers still show the guest outline.
  base.parkOutline = {
    ...base.guestAreaOutline,
    // Explicit: displayed outline is guest orientation, not raw OSM.
    displayRole: 'guestAreaOutline',
  };
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

export const BOUNDARY_DETAIL_NOTE = DETAIL_NOTE;
