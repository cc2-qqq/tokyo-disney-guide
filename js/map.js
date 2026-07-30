// Leaflet map wrapper. Uses divIcon markers (no external marker images needed).
/* global L */

const ICONS = {
  attraction: { glyph: '\u{1F3A0}', cls: 'm-attraction', label: '어트랙션' },
  restroom: { glyph: 'WC', cls: 'm-restroom', label: '화장실' },
  babyCare: { glyph: '\u{1F476}', cls: 'm-baby', label: '베이비케어·수유' },
  firstAid: { glyph: '\u271A', cls: 'm-firstaid', label: '중앙구호실' },
  emergencyFacility: { glyph: '\u271A', cls: 'm-firstaid', label: '응급시설' },
};

export function createMapController(elId) {
  let map = null;
  let tileLayer = null;
  const poiLayer = () => markerGroup;
  let markerGroup = null;
  let markers = new Map(); // id -> marker
  let userMarker = null;
  let accuracyCircle = null;
  let directionLine = null;
  let tileErrorShown = false;
  let onTileError = null;

  function init(parkMeta, { onTileError: cb } = {}) {
    onTileError = cb;
    map = L.map(elId, {
      center: parkMeta.center,
      zoom: parkMeta.zoom,
      minZoom: parkMeta.minZoom,
      maxZoom: parkMeta.maxZoom,
      zoomControl: true,
      attributionControl: true,
    });
    tileLayer = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap contributors',
      crossOrigin: true,
    }).addTo(map);
    tileLayer.on('tileerror', () => {
      if (!tileErrorShown) {
        tileErrorShown = true;
        onTileError && onTileError();
      }
    });
    markerGroup = L.layerGroup().addTo(map);
    return map;
  }

  function setPark(parkMeta) {
    tileErrorShown = false;
    map.setView(parkMeta.center, parkMeta.zoom);
  }

  function makeIcon(poi, selected) {
    const spec = ICONS[poi.type] || ICONS.attraction;
    const approx = poi.coordinateStatus === 'low_estimated' || poi.coordinateStatus === 'medium_estimated';
    const html = `<div class="marker ${spec.cls} ${selected ? 'is-selected' : ''} ${approx ? 'is-approx' : ''}" aria-hidden="true"><span class="marker-glyph">${spec.glyph}</span></div>`;
    return L.divIcon({
      html,
      className: 'marker-wrap',
      iconSize: [30, 30],
      iconAnchor: [15, 15],
    });
  }

  function renderMarkers(pois, { onSelect, selectedId } = {}) {
    markerGroup.clearLayers();
    markers = new Map();
    for (const poi of pois) {
      if (!poi.coordinates) continue;
      const m = L.marker(poi.coordinates, {
        icon: makeIcon(poi, poi.id === selectedId),
        keyboard: true,
        title: poi.nameKo || poi.name,
        alt: `${(ICONS[poi.type] || {}).label || ''} ${poi.nameKo || poi.name}`,
      });
      m.on('click', () => onSelect && onSelect(poi.id));
      m.addTo(markerGroup);
      markers.set(poi.id, m);
    }
  }

  function highlight(id) {
    for (const [mid, m] of markers) {
      const el = m.getElement();
      if (!el) continue;
      const inner = el.querySelector('.marker');
      if (inner) inner.classList.toggle('is-selected', mid === id);
    }
  }

  function focusPoi(coords, zoom) {
    if (!coords) return;
    map.flyTo(coords, Math.max(map.getZoom(), zoom || 17), { duration: 0.6 });
  }

  function setUserLocation(coords, accuracy) {
    if (!coords) return;
    if (!userMarker) {
      userMarker = L.marker(coords, {
        icon: L.divIcon({
          html: '<div class="user-dot" aria-hidden="true"></div>',
          className: 'user-wrap',
          iconSize: [22, 22],
          iconAnchor: [11, 11],
        }),
        zIndexOffset: 1000,
        title: '현재 위치',
      }).addTo(map);
    } else {
      userMarker.setLatLng(coords);
    }
    if (accuracy != null) {
      if (!accuracyCircle) {
        accuracyCircle = L.circle(coords, {
          radius: accuracy, className: 'accuracy-circle',
          color: '#1a73e8', fillColor: '#1a73e8', fillOpacity: 0.12, weight: 1,
        }).addTo(map);
      } else {
        accuracyCircle.setLatLng(coords);
        accuracyCircle.setRadius(accuracy);
      }
    }
  }

  function centerOnUser(coords) {
    if (coords) map.flyTo(coords, Math.max(map.getZoom(), 17), { duration: 0.6 });
  }

  // Dashed, thin, secondary "as-the-crow-flies" line. NOT a walking route.
  function showDirection(from, to) {
    clearDirection();
    if (!from || !to) return;
    directionLine = L.polyline([from, to], {
      color: '#7a3ea8',
      weight: 3,
      opacity: 0.6,
      dashArray: '8, 10',
      lineCap: 'round',
    }).addTo(map);
    map.fitBounds(directionLine.getBounds(), { padding: [60, 60], maxZoom: 18 });
  }

  function clearDirection() {
    if (directionLine) { map.removeLayer(directionLine); directionLine = null; }
  }

  function invalidate() { if (map) setTimeout(() => map.invalidateSize(), 50); }

  return {
    init, setPark, renderMarkers, highlight, focusPoi,
    setUserLocation, centerOnUser, showDirection, clearDirection, invalidate,
    getMap: () => map,
  };
}
