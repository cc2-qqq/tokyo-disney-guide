// Localized detailed vector basemap (Protomaps PMTiles + MapLibre).
// Keeps structure + POI/road/place labels; language priority is Korean-first.
/* global maplibregl, pmtiles, basemaps */
import {
  buildTranslationLookup,
  translationPrimaryExpression,
  japaneseNameExpression,
} from './data/mapLabelTranslations.js';

const SOURCE_ID = 'protomaps';
const PMTILES_REL = {
  TDL: './data/maps/tdl-basemap.pmtiles',
  TDS: './data/maps/tds-basemap.pmtiles',
};

const GLYPHS = 'https://protomaps.github.io/basemaps-assets/fonts/{fontstack}/{range}.pbf';
const SPRITE_BASE = 'https://protomaps.github.io/basemaps-assets/sprites/v4';

// App owns these kinds as markers/labels — hide from vector POI text to avoid duplicates.
const APP_OWNED_POI_KINDS = [
  'attraction',
  'dark_ride',
  'amusement_ride',
  'roller_coaster',
  'carousel',
  'log_ride',
  'toilets',
];

// Expand beyond default Protomaps POI filter so park shops/hotels/food keep labels.
const PARK_POI_KINDS = [
  'beach', 'forest', 'marina', 'park', 'peak', 'zoo', 'garden',
  'aerodrome', 'station', 'bus_stop', 'ferry_terminal', 'stadium',
  'university', 'library', 'school', 'animal', 'drinking_water', 'post_office',
  'building', 'townhall', 'restaurant', 'fast_food', 'cafe', 'bar',
  'supermarket', 'convenience', 'books', 'beauty', 'electronics', 'clothes',
  'museum', 'theatre', 'artwork',
  // Disney-relevant extras present in local PMTiles extracts
  'hotel', 'gift', 'ice_cream', 'kiosk', 'confectionery', 'pastry', 'beverages',
  'beverage_stand', 'food_court', 'toys', 'bag', 'cosmetics', 'jewelry',
  'perfumery', 'information', 'atm', 'fountain', 'photo', 'events_venue',
  'bakery', 'bbq', 'variety_store', 'hairdresser', 'bureau_de_change',
  'massage', 'police', 'amusement_arcade', 'planetarium', 'castle',
  'swimming_pool', 'shelter', 'clock',
];

export const LABEL_MODES = {
  KO_FIRST: 'ko',
  KO_JA: 'ko_ja',
  JA: 'ja',
};

let protocolReady = false;
let translationLookup = null;

function getLookup() {
  if (!translationLookup) translationLookup = buildTranslationLookup();
  return translationLookup;
}

export function ensurePmtilesProtocol() {
  if (protocolReady) return;
  if (typeof maplibregl === 'undefined' || typeof pmtiles === 'undefined') {
    throw new Error('MapLibre/PMTiles libraries are not loaded');
  }
  const protocol = new pmtiles.Protocol({ metadata: true });
  maplibregl.addProtocol('pmtiles', protocol.tile);
  protocolReady = true;
}

export function resolvePmtilesHref(parkId) {
  const rel = PMTILES_REL[parkId] || PMTILES_REL.TDL;
  return new URL(rel, document.baseURI || window.location.href).href;
}

function flavorForTheme(theme) {
  if (theme === 'dark') return 'dark';
  if (theme === 'light') return 'light';
  const dark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
  return dark ? 'dark' : 'light';
}

function normalizeLabelMode(mode) {
  if (mode === LABEL_MODES.KO_JA || mode === 'ko+ja' || mode === 'ko_ja') return LABEL_MODES.KO_JA;
  if (mode === LABEL_MODES.JA || mode === 'ja') return LABEL_MODES.JA;
  return LABEL_MODES.KO_FIRST;
}

function primaryNameExpr(labelMode) {
  if (labelMode === LABEL_MODES.JA) return japaneseNameExpression();
  return translationPrimaryExpression(getLookup());
}

function japaneseAuxExpr() {
  return japaneseNameExpression();
}

/**
 * Build text-field for symbol layers.
 * - ko: Korean/dict/en/ja primary only (JP kept in data + detail cards)
 * - ko_ja: Korean primary + JP aux (smaller via format)
 * - ja: Japanese/original only
 */
function buildTextField(labelMode) {
  const primary = primaryNameExpr(labelMode);
  if (labelMode === LABEL_MODES.JA) return primary;
  if (labelMode !== LABEL_MODES.KO_JA) return primary;

  return [
    'format',
    primary, { 'font-scale': 1 },
    '\n', {},
    japaneseAuxExpr(), { 'font-scale': 0.78 },
  ];
}

function patchSymbolLayer(layer, labelMode) {
  if (!layer || layer.type !== 'symbol') return layer;
  const next = {
    ...layer,
    layout: { ...(layer.layout || {}) },
    paint: { ...(layer.paint || {}) },
  };

  // Skip housenumber / shield layers that are not place names.
  const id = layer.id || '';
  if (id.includes('housenumber') || id.includes('shield')) return next;

  // App draws Korean theme-land / port labels — hide vector neighbourhood labels to avoid doubles.
  if (id === 'places_subplace') {
    next.layout.visibility = 'none';
    return next;
  }

  if (layer['source-layer'] === 'pois') {
    // Replace default filter: keep park POIs, drop app-owned attractions/toilets.
    next.filter = [
      'all',
      ['in', ['get', 'kind'], ['literal', PARK_POI_KINDS]],
      ['!', ['in', ['get', 'kind'], ['literal', APP_OWNED_POI_KINDS]]],
      ['>=', ['zoom'], ['+', ['get', 'min_zoom'], 0]],
    ];

    next.layout['icon-image'] = [
      'match',
      ['get', 'kind'],
      'station', 'train_station',
      'hotel', 'hotel',
      'gift', 'gift',
      'ice_cream', 'ice_cream',
      'information', 'information',
      'drinking_water', 'drinking_water',
      'fountain', 'fountain',
      ['get', 'kind'],
    ];
    next.layout['icon-optional'] = true;
    next.layout['text-optional'] = true;
    next.layout['text-max-width'] = 9;
    next.layout['text-size'] = [
      'interpolate', ['linear'], ['zoom'],
      15, 10,
      17, 12,
      19, 15,
    ];
    next.paint['text-halo-width'] = 1.4;
    next.paint['text-halo-color'] = next.paint['text-halo-color'] || '#ffffff';
  }

  if (next.layout['text-field'] != null || layer['source-layer'] === 'pois'
      || layer['source-layer'] === 'places' || layer['source-layer'] === 'roads'
      || layer['source-layer'] === 'water' || layer['source-layer'] === 'landuse') {
    // Only rewrite name-bearing layers (not addr housenumbers already skipped).
    if (!id.includes('housenumber') && !id.includes('shield')) {
      next.layout['text-field'] = buildTextField(labelMode);
      next.layout['text-max-width'] = next.layout['text-max-width'] || 8;
      if (next.paint['text-halo-width'] == null) next.paint['text-halo-width'] = 1.2;
    }
  }

  return next;
}

/**
 * Build a MapLibre style with structure + localized labels (not unlabeled).
 * @param {string} parkId
 * @param {'auto'|'light'|'dark'} theme
 * @param {'ko'|'ko_ja'|'ja'} labelMode
 */
export function buildLocalizedStyle(parkId, theme = 'auto', labelMode = LABEL_MODES.KO_FIRST) {
  if (typeof basemaps === 'undefined') {
    throw new Error('@protomaps/basemaps is not loaded');
  }
  const mode = normalizeLabelMode(labelMode);
  const flavorName = flavorForTheme(theme);
  const flavor = basemaps.namedFlavor(flavorName);
  // Official Protomaps localization: ko prefers name:ko; ja for Japanese-primary mode.
  const lang = mode === LABEL_MODES.JA ? 'ja' : 'ko';
  const baseLayers = basemaps.layers(SOURCE_ID, flavor, { lang }) || [];
  const layers = baseLayers.map((layer) => patchSymbolLayer(layer, mode));

  const href = resolvePmtilesHref(parkId);
  return {
    version: 8,
    name: `tdg-localized-${parkId}-${mode}`,
    glyphs: GLYPHS,
    sprite: `${SPRITE_BASE}/${flavorName}`,
    sources: {
      [SOURCE_ID]: {
        type: 'vector',
        url: `pmtiles://${href}`,
        attribution:
          '<a href="https://protomaps.com" target="_blank" rel="noopener">Protomaps</a> · '
          + '<a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">&copy; OpenStreetMap</a>',
      },
    },
    layers,
  };
}

/** @deprecated Use buildLocalizedStyle — kept as alias for older call sites. */
export function buildUnlabeledStyle(parkId, theme = 'auto') {
  return buildLocalizedStyle(parkId, theme, LABEL_MODES.KO_FIRST);
}

export function solidFallbackStyle(theme = 'auto') {
  const dark = flavorForTheme(theme) === 'dark';
  return {
    version: 8,
    name: 'tdg-solid-fallback',
    sources: {},
    layers: [{
      id: 'background',
      type: 'background',
      paint: { 'background-color': dark ? '#1a1f24' : '#e8eef3' },
    }],
  };
}

export { PMTILES_REL };
