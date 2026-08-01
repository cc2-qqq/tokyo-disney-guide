// Leaflet map wrapper. Uses divIcon markers (no external marker images needed).
// Basemap: unlabeled Protomaps PMTiles via MapLibre (NOT OSM Japanese raster).
/* global L */
import { ensurePmtilesProtocol, buildUnlabeledStyle, solidFallbackStyle } from './basemap.js';

const ICONS = {
  attraction: { glyph: '\u{1F3A0}', cls: 'm-attraction', label: '어트랙션' },
  restroom: { glyph: 'WC', cls: 'm-restroom', label: '화장실' },
  babyCare: { glyph: '\u{1F476}', cls: 'm-baby', label: '베이비케어·수유' },
  firstAid: { glyph: '\u271A', cls: 'm-firstaid', label: '중앙구호실' },
  emergencyFacility: { glyph: '\u271A', cls: 'm-firstaid', label: '응급시설' },
};

function escapeHtml(s) {
  return (s == null ? '' : String(s)).replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

export function createMapController(elId) {
  let map = null;
  let glLayer = null;
  let markerGroup = null;
  let labelGroup = null;
  let markers = new Map(); // id -> marker
  let userMarker = null;
  let accuracyCircle = null;
  let directionLine = null;
  let routeLine = null;
  let basemapFailed = false;
  let onBasemapError = null;
  let currentTheme = 'auto';
  let currentParkId = 'TDL';

  // ---- Korean self-drawn label layer state ----
  // Basemap is unlabeled vector structure only; these are the only map texts.
  const labelState = {
    parkMeta: null,
    areas: [],
    attractions: [],
    facilities: [],
    landmark: new Set(),
    selectedId: null,
    favIds: new Set(),
    mapLang: 'ko', // always Korean-only on the map
  };

  function applyBasemapStyle(parkId, theme, { fallback = false } = {}) {
    currentParkId = parkId || currentParkId;
    currentTheme = theme || currentTheme;
    if (!map) return;
    if (typeof L.maplibreGL !== 'function') {
      useSolidFallback('MapLibre GL Leaflet plugin missing');
      return;
    }
    let style;
    try {
      if (!fallback) ensurePmtilesProtocol();
      style = fallback
        ? solidFallbackStyle(currentTheme)
        : buildUnlabeledStyle(currentParkId, currentTheme);
    } catch (err) {
      useSolidFallback(err && err.message);
      return;
    }

    if (!glLayer) {
      glLayer = L.maplibreGL({
        style,
        interactive: false,
        attributionControl: false,
        padding: 0.08,
      }).addTo(map);
      const ml = glLayer.getMaplibreMap && glLayer.getMaplibreMap();
      if (ml) {
        ml.on('error', (e) => {
          const msg = (e && e.error && (e.error.message || e.error.statusText)) || '';
          // Ignore normal tile misses near extract edges / overzoom.
          if (!msg || /404|not found|tile|AbortError|cancel/i.test(msg)) return;
          // Only hard-fail on byte-serving / network / style source problems.
          if (/Failed to fetch|NetworkError|content-length|Byte Serving|ETag|pmtiles/i.test(msg)) {
            if (!basemapFailed && !fallback) useSolidFallback(msg);
          }
        });
      }
    } else {
      const ml = glLayer.getMaplibreMap && glLayer.getMaplibreMap();
      if (ml) ml.setStyle(style);
    }
    map.getContainer().classList.toggle('basemap-fallback', !!fallback);
  }

  function useSolidFallback(reason) {
    if (basemapFailed || !map) return;
    basemapFailed = true;
    try {
      applyBasemapStyle(currentParkId, currentTheme, { fallback: true });
    } catch {
      /* ignore */
    }
    try { map.getContainer().classList.add('basemap-fallback'); } catch { /* ignore */ }
    onBasemapError && onBasemapError(reason || 'vector basemap failed');
  }

  function init(parkMeta, { onTileError: cb, theme } = {}) {
    onBasemapError = cb;
    currentTheme = theme || 'auto';
    currentParkId = parkMeta.id || 'TDL';
    map = L.map(elId, {
      center: parkMeta.center,
      zoom: parkMeta.defaultZoom || parkMeta.zoom,
      minZoom: parkMeta.minZoom,
      maxZoom: parkMeta.maxZoom,
      zoomControl: true,
      attributionControl: true,
      // Keep the user inside the park: hard drag limit (not a snap-back).
      maxBounds: parkMeta.maxBounds ? L.latLngBounds(parkMeta.maxBounds) : undefined,
      maxBoundsViscosity: 1.0,
      bounceAtZoomLimits: false,
    });
    labelState.parkMeta = parkMeta;

    if (map.attributionControl) {
      map.attributionControl.setPrefix(false);
      map.attributionControl.addAttribution(
        '<a href="https://protomaps.com" target="_blank" rel="noopener">Protomaps</a> · '
        + '<a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">&copy; OpenStreetMap</a>',
      );
    }

    // Unlabeled vector PMTiles basemap (no Japanese raster tiles).
    applyBasemapStyle(currentParkId, currentTheme);

    markerGroup = L.layerGroup().addTo(map);

    // Dedicated non-interactive pane above markers for Korean text labels.
    map.createPane('labels');
    const lp = map.getPane('labels');
    lp.style.zIndex = 620;
    lp.style.pointerEvents = 'none';
    labelGroup = L.layerGroup().addTo(map);

    map.on('zoomend moveend', renderLabels);
    if (parkMeta.defaultBounds) {
      map.fitBounds(L.latLngBounds(parkMeta.defaultBounds), { animate: false });
    }
    // Test/debug hook: recover Leaflet instance from the container element.
    map.getContainer()._tdgMap = map;
    return map;
  }

  function setPark(parkMeta) {
    basemapFailed = false;
    labelState.parkMeta = parkMeta;
    currentParkId = parkMeta.id || currentParkId;
    clearRoute();
    clearDirection();
    // Apply this park's drag limits, then swap unlabeled basemap + frame.
    map.setMinZoom(parkMeta.minZoom);
    map.setMaxZoom(parkMeta.maxZoom);
    map.setMaxBounds(parkMeta.maxBounds ? L.latLngBounds(parkMeta.maxBounds) : null);
    applyBasemapStyle(currentParkId, currentTheme);
    resetView(parkMeta);
  }

  function setBasemapTheme(theme) {
    currentTheme = theme || 'auto';
    if (!map) return; // theme may be applied before Leaflet init
    if (!basemapFailed) applyBasemapStyle(currentParkId, currentTheme);
    else applyBasemapStyle(currentParkId, currentTheme, { fallback: true });
  }

  // Frame the park nicely (used on switch + "지도 초기화").
  function resetView(parkMeta) {
    const meta = parkMeta || labelState.parkMeta;
    if (!meta) return;
    if (meta.defaultBounds) {
      map.fitBounds(L.latLngBounds(meta.defaultBounds), { animate: true });
    } else {
      map.setView(meta.center, meta.defaultZoom || meta.zoom);
    }
  }

  function makeIcon(poi, selected) {
    const spec = ICONS[poi.type] || ICONS.attraction;
    let trustCls = '';
    if (poi.coordinateStatus === 'medium_estimated') trustCls = 'is-medium';
    else if (poi.coordinateStatus === 'low_estimated') trustCls = 'is-low is-approx';
    const html = `<div class="marker ${spec.cls} ${selected ? 'is-selected' : ''} ${trustCls}" aria-hidden="true"><span class="marker-glyph">${spec.glyph}</span></div>`;
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
    // Never pan the map outside park maxBounds to chase an out-of-park GPS fix.
    if (!coords || !map) return;
    const mb = map.getMaxBounds();
    if (mb && !mb.contains(L.latLng(coords[0], coords[1]))) return;
    map.flyTo(coords, Math.max(map.getZoom(), 17), { duration: 0.6 });
  }

  // Long-dash crow-flies "직선 방향 안내" — NOT a walking route.
  function showDirection(from, to) {
    clearDirection();
    clearRoute();
    if (!from || !to) return;
    directionLine = L.polyline([from, to], {
      color: '#7a3ea8',
      weight: 3,
      opacity: 0.55,
      dashArray: '2, 12',
      lineCap: 'round',
      className: 'dir-line',
    }).addTo(map);
    map.fitBounds(directionLine.getBounds(), { padding: [60, 60], maxZoom: 18 });
  }

  function clearDirection() {
    if (directionLine) { map.removeLayer(directionLine); directionLine = null; }
  }

  // Solid "예상 보행 경로" along the park graph (visually distinct from dir-line).
  function showRoute(latlngs) {
    clearRoute();
    clearDirection();
    if (!latlngs || latlngs.length < 2) return;
    routeLine = L.polyline(latlngs, {
      color: '#0b6bcb',
      weight: 5,
      opacity: 0.9,
      lineCap: 'round',
      lineJoin: 'round',
      dashArray: null,
      className: 'route-line',
    }).addTo(map);
    map.fitBounds(routeLine.getBounds(), { padding: [50, 50], maxZoom: 18 });
  }

  function clearRoute() {
    if (routeLine) { map.removeLayer(routeLine); routeLine = null; }
  }

  // ---- Korean label layer ----
  // Sources change on park switch / marker render; options change on select / fav / setting.
  function setLabelSources({ parkMeta, areas, attractions, facilities, landmark }) {
    if (parkMeta) labelState.parkMeta = parkMeta;
    if (areas) labelState.areas = areas;
    if (attractions) labelState.attractions = attractions;
    if (facilities) labelState.facilities = facilities;
    if (landmark) labelState.landmark = landmark instanceof Set ? landmark : new Set(landmark);
    renderLabels();
  }

  function setLabelOptions({ selectedId, favIds } = {}) {
    if (selectedId !== undefined) labelState.selectedId = selectedId;
    if (favIds !== undefined) labelState.favIds = favIds instanceof Set ? favIds : new Set(favIds || []);
    // Map labels are Korean-only; Japanese names stay in detail cards.
    labelState.mapLang = 'ko';
    renderLabels();
  }

  // Rough on-screen box for a label, used only for greedy overlap avoidance.
  function labelBox(cp, text, kind, hasSub) {
    const perChar = kind === 'area' ? 13 : 11;
    const maxW = kind === 'area' ? 150 : 96;
    const lineH = kind === 'area' ? 18 : 15;
    const full = Math.min(maxW, Math.max(28, (text ? text.length : 0) * perChar) + 10);
    const lines = ((text ? text.length : 0) * perChar > maxW ? 2 : 1) + (hasSub ? 1 : 0);
    const h = lineH * lines + 6;
    const offY = kind === 'area' || kind === 'park' ? 0 : 12; // attr/facility sit below the point
    const cx = cp.x;
    const cy = cp.y + offY + (kind === 'area' || kind === 'park' ? 0 : h / 2);
    return { x1: cx - full / 2, y1: cy - h / 2, x2: cx + full / 2, y2: cy + h / 2 };
  }

  function overlaps(a, b, gap) {
    return !(a.x2 + gap < b.x1 || a.x1 - gap > b.x2 || a.y2 + gap < b.y1 || a.y1 - gap > b.y2);
  }

  function buildCandidates(zoom) {
    const s = labelState;
    const out = [];
    if (!s.parkMeta) return out;

    if (zoom <= 15 && s.parkMeta.center) {
      out.push({ key: '__park', kind: 'park', latlng: s.parkMeta.center, text: s.parkMeta.nameKo, sub: null, priority: 0 });
    }
    if (zoom >= 16) {
      for (const ar of s.areas) {
        if (!ar.labelCenter) continue;
        out.push({ key: 'area:' + ar.id, kind: 'area', latlng: ar.labelCenter, text: ar.nameKo, sub: null, priority: 2 });
      }
    }
    const showRep = zoom >= 17;
    const showAll = zoom >= 18;
    for (const at of s.attractions) {
      if (!at.coordinates) continue;
      if ((at.operatingStatus || 'operating') !== 'operating') continue; // exclude closed/long-term
      const isFav = s.favIds.has(at.id);
      const isRep = s.landmark.has(at.id);
      let include = false; let priority = 5;
      if (isFav && zoom >= 16) { include = true; priority = 3; }
      if (isRep && showRep) { include = true; priority = Math.min(priority, 4); }
      if (showAll) { include = true; priority = Math.min(priority, 5); }
      if (include) {
        out.push({ key: 'at:' + at.id, kind: 'attr', latlng: at.coordinates, text: at.nameKo, sub: null, priority });
      }
    }
    // Selected POI (attraction or facility) always shown, highest priority.
    if (s.selectedId) {
      const sel = s.attractions.find((a) => a.id === s.selectedId)
        || s.facilities.find((f) => f.id === s.selectedId);
      if (sel && sel.coordinates) {
        out.push({
          key: (sel.type === 'attraction' ? 'at:' : 'fac:') + sel.id,
          kind: sel.type === 'attraction' ? 'attr' : 'facility',
          latlng: sel.coordinates,
          text: sel.nameKo || sel.name,
          sub: null,
          priority: 1, selected: true,
        });
      }
    }
    // de-dup by key, keep the lowest-priority (most important) instance
    const byKey = new Map();
    for (const c of out) {
      const prev = byKey.get(c.key);
      if (!prev || c.priority < prev.priority) byKey.set(c.key, prev ? { ...c, selected: c.selected || prev.selected } : c);
    }
    return [...byKey.values()];
  }

  function labelIcon(c) {
    const cls = c.kind === 'area' ? 'map-label-area'
      : c.kind === 'park' ? 'map-label-park'
        : c.kind === 'facility' ? 'map-label-facility' : 'map-label-attr';
    const selCls = c.selected ? ' is-selected' : '';
    const sub = c.sub ? `<span class="ml-sub">${escapeHtml(c.sub)}</span>` : '';
    const html = `<span class="map-label ${cls}${selCls}"><span class="ml-main">${escapeHtml(c.text)}</span>${sub}</span>`;
    return L.divIcon({ html, className: 'map-label-wrap', iconSize: [0, 0], iconAnchor: [0, 0] });
  }

  function renderLabels() {
    if (!map || !labelGroup) return;
    labelGroup.clearLayers();
    const zoom = map.getZoom();
    const cands = buildCandidates(zoom).sort((a, b) => a.priority - b.priority);
    const placed = [];
    const bounds = map.getBounds().pad(0.05);
    for (const c of cands) {
      const ll = L.latLng(c.latlng[0], c.latlng[1]);
      if (!bounds.contains(ll)) continue;
      const cp = map.latLngToContainerPoint(ll);
      const box = labelBox(cp, c.text, c.kind, !!c.sub);
      let hit = false;
      for (const p of placed) { if (overlaps(box, p, 2)) { hit = true; break; } }
      if (hit) continue;
      placed.push(box);
      L.marker(ll, { icon: labelIcon(c), pane: 'labels', interactive: false, keyboard: false }).addTo(labelGroup);
    }
  }

  function invalidate() { if (map) setTimeout(() => { map.invalidateSize(); renderLabels(); }, 50); }

  return {
    init, setPark, setBasemapTheme, resetView, renderMarkers, highlight, focusPoi,
    setUserLocation, centerOnUser, showDirection, clearDirection,
    showRoute, clearRoute, invalidate,
    setLabelSources, setLabelOptions, renderLabels,
    getMap: () => map,
  };
}
