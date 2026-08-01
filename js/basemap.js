// Unlabeled vector basemap (Protomaps PMTiles + MapLibre).
// Intentionally omits ALL symbol/text layers so Japanese OSM labels never appear.
/* global maplibregl, pmtiles, basemaps */

const SOURCE_ID = 'protomaps';
const PMTILES_REL = {
  TDL: './data/maps/tdl-basemap.pmtiles',
  TDS: './data/maps/tds-basemap.pmtiles',
};

let protocolReady = false;

export function ensurePmtilesProtocol() {
  if (protocolReady) return;
  if (typeof maplibregl === 'undefined' || typeof pmtiles === 'undefined') {
    throw new Error('MapLibre/PMTiles libraries are not loaded');
  }
  // metadata:true so MapLibre can read vector_layers from the archive TileJSON.
  const protocol = new pmtiles.Protocol({ metadata: true });
  maplibregl.addProtocol('pmtiles', protocol.tile);
  protocolReady = true;
}

export function resolvePmtilesHref(parkId) {
  const rel = PMTILES_REL[parkId] || PMTILES_REL.TDL;
  return new URL(rel, document.baseURI || window.location.href).href;
}

function flavorForTheme(theme) {
  // theme: 'light' | 'dark' | 'auto'
  if (theme === 'dark') return 'dark';
  if (theme === 'light') return 'light';
  const dark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
  return dark ? 'dark' : 'light';
}

/**
 * Build a MapLibre style with structure layers only (no place/road/POI text).
 * Uses @protomaps/basemaps nolabels path (no `lang` option) + symbol strip.
 */
export function buildUnlabeledStyle(parkId, theme = 'auto') {
  if (typeof basemaps === 'undefined') {
    throw new Error('@protomaps/basemaps is not loaded');
  }
  const flavor = basemaps.namedFlavor(flavorForTheme(theme));
  const layers = (basemaps.layers(SOURCE_ID, flavor, {}) || [])
    .filter((layer) => layer && layer.type !== 'symbol');

  const href = resolvePmtilesHref(parkId);
  return {
    version: 8,
    name: `tdg-unlabeled-${parkId}`,
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
