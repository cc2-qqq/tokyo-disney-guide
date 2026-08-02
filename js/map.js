// Leaflet map wrapper. Uses divIcon markers (no external marker images needed).
// Basemap: localized Protomaps PMTiles via MapLibre (NOT OSM Japanese raster).
/* global L */
import {
  ensurePmtilesProtocol,
  buildLocalizedStyle,
  solidFallbackStyle,
  LABEL_MODES,
} from './basemap.js';

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
  let debugGroup = null;
  let startMarker = null;
  let pickHandler = null;
  let basemapFailed = false;
  let onBasemapError = null;
  let currentTheme = 'auto';
  let currentParkId = 'TDL';
  let currentLabelMode = LABEL_MODES.KO_FIRST;

  // ---- App overlay labels (attractions / selected facilities).
  // Vector basemap keeps restaurants/shops/roads; attractions+toilets stay app-owned.
  const labelState = {
    category: 'map', // map | attractions | restrooms | favorites | none
    parkMeta: null,
    areas: [],
    attractions: [],
    facilities: [],
    landmark: new Set(),
    selectedId: null,
    favIds: new Set(),
    mapLabelMode: LABEL_MODES.KO_FIRST,
  };
  let meetupMarker = null;
  let entranceGroup = null;
  let boundaryGroup = null;
  let boundaryLabelGroup = null;
  let entranceMarkers = new Map();
  let lastEntranceRender = null;
  let boundaryOpts = {
    showParkBoundaries: true,
    showPregateBoundary: true,
    showBoundaryLabels: true,
    dimmed: false,
  };
  let currentBoundaries = null;

  function applyBasemapStyle(parkId, theme, { fallback = false, labelMode } = {}) {
    currentParkId = parkId || currentParkId;
    currentTheme = theme || currentTheme;
    if (labelMode) currentLabelMode = labelMode;
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
        : buildLocalizedStyle(currentParkId, currentTheme, currentLabelMode);
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

  function init(parkMeta, { onTileError: cb, theme, labelMode } = {}) {
    onBasemapError = cb;
    currentTheme = theme || 'auto';
    currentLabelMode = labelMode || LABEL_MODES.KO_FIRST;
    labelState.mapLabelMode = currentLabelMode;
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

    // Localized vector PMTiles basemap (no Japanese OSM raster tiles).
    applyBasemapStyle(currentParkId, currentTheme);

    markerGroup = L.layerGroup().addTo(map);

    // Boundaries below POI markers; entrances above typical markers.
    map.createPane('boundaries');
    const bp = map.getPane('boundaries');
    bp.style.zIndex = 350;
    bp.style.pointerEvents = 'none';
    boundaryGroup = L.layerGroup().addTo(map);
    boundaryLabelGroup = L.layerGroup().addTo(map);

    entranceGroup = L.layerGroup().addTo(map);

    // Dedicated non-interactive pane above markers for Korean text labels.
    map.createPane('labels');
    const lp = map.getPane('labels');
    lp.style.zIndex = 620;
    lp.style.pointerEvents = 'none';
    labelGroup = L.layerGroup().addTo(map);

    map.on('zoomend moveend', () => {
      renderLabels();
      renderBoundaries();
      if (lastEntranceRender) renderEntrances(lastEntranceRender.entrances, lastEntranceRender.opts);
    });
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
    // Apply this park's drag limits, then swap localized basemap + frame.
    map.setMinZoom(parkMeta.minZoom);
    map.setMaxZoom(parkMeta.maxZoom);
    map.setMaxBounds(parkMeta.maxBounds ? L.latLngBounds(parkMeta.maxBounds) : null);
    applyBasemapStyle(currentParkId, currentTheme);
    resetView(parkMeta);
    renderBoundaries();
  }

  function setBasemapTheme(theme) {
    currentTheme = theme || 'auto';
    if (!map) return; // theme may be applied before Leaflet init
    if (!basemapFailed) applyBasemapStyle(currentParkId, currentTheme);
    else applyBasemapStyle(currentParkId, currentTheme, { fallback: true });
  }

  function setBasemapLabelMode(mode) {
    currentLabelMode = mode || LABEL_MODES.KO_FIRST;
    labelState.mapLabelMode = currentLabelMode;
    if (!map) return;
    if (!basemapFailed) applyBasemapStyle(currentParkId, currentTheme);
    else applyBasemapStyle(currentParkId, currentTheme, { fallback: true });
    renderLabels();
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

  function makeIcon(poi, selected, rideBadge) {
    const spec = ICONS[poi.type] || ICONS.attraction;
    let trustCls = '';
    if (poi.coordinateStatus === 'medium_estimated') trustCls = 'is-medium';
    else if (poi.coordinateStatus === 'low_estimated') trustCls = 'is-low is-approx';
    const badge = rideBadge
      ? `<span class="m-ride-badge" aria-hidden="true">${escapeHtml(rideBadge)}</span>`
      : '';
    const html = `<div class="marker ${spec.cls} ${selected ? 'is-selected' : ''} ${trustCls}" aria-hidden="true"><span class="marker-glyph">${spec.glyph}</span>${badge}</div>`;
    return L.divIcon({
      html,
      className: 'marker-wrap',
      iconSize: [30, 30],
      iconAnchor: [15, 15],
    });
  }

  function renderMarkers(pois, { onSelect, selectedId, rideBadges } = {}) {
    markerGroup.clearLayers();
    markers = new Map();
    const badges = rideBadges || {};
    for (const poi of pois) {
      if (!poi.coordinates) continue;
      const m = L.marker(poi.coordinates, {
        icon: makeIcon(poi, poi.id === selectedId, badges[poi.id]),
        keyboard: true,
        title: poi.nameKo || poi.name,
        alt: `${(ICONS[poi.type] || {}).label || ''} ${poi.nameKo || poi.name}`,
      });
      m.on('click', () => onSelect && onSelect(poi.id));
      m.addTo(markerGroup);
      markers.set(poi.id, m);
    }
  }

  function setMeetupMarker(coords, label) {
    clearMeetupMarker();
    if (!coords || !map) return;
    meetupMarker = L.marker(coords, {
      icon: L.divIcon({
        html: `<div class="meetup-marker" title="${escapeHtml(label || '가족 집결지')}" aria-hidden="true"><span class="meetup-ico">집</span></div>`,
        className: 'meetup-wrap',
        iconSize: [40, 40],
        iconAnchor: [20, 20],
      }),
      zIndexOffset: 800,
      title: label || '가족 집결지',
    }).addTo(map);
  }

  function clearMeetupMarker() {
    if (meetupMarker) {
      map.removeLayer(meetupMarker);
      meetupMarker = null;
    }
  }

  function entranceIcon(ent, selected) {
    const kind = ent.entranceKind || 'main_entrance';
    const tier = kind === 'main_entrance' ? 'main'
      : kind === 'pre_gate' ? 'pregate'
        : 'station';
    const html = `<div class="entrance-marker is-${tier} ${selected ? 'is-selected' : ''}" aria-hidden="true">
      <span class="entrance-glyph">入</span>
      <span class="entrance-label">${escapeHtml(ent.nameKo || '입구')}</span>
    </div>`;
    const sizes = {
      main: { size: [124, 44], anchor: [62, 22] },
      pregate: { size: [72, 26], anchor: [36, 13] },
      station: { size: [58, 22], anchor: [29, 11] },
    };
    const s = sizes[tier] || sizes.station;
    return L.divIcon({
      html,
      className: 'entrance-wrap',
      iconSize: s.size,
      iconAnchor: s.anchor,
    });
  }

  function renderEntrances(entrances, { onSelect, selectedId, show = true } = {}) {
    if (!entranceGroup) return;
    lastEntranceRender = { entrances, opts: { onSelect, selectedId, show } };
    entranceGroup.clearLayers();
    entranceMarkers = new Map();
    if (!show) return;
    const zByKind = { main_entrance: 740, pre_gate: 660, station_side: 620 };
    const z = map ? map.getZoom() : 16;
    for (const ent of entrances || []) {
      if (!ent.coordinates) continue;
      // Skip tiny aux markers until zoomed in so they don't merge into one blob.
      const kind = ent.entranceKind || 'main_entrance';
      if (kind !== 'main_entrance' && z < 17) continue;
      const m = L.marker(ent.coordinates, {
        icon: entranceIcon(ent, ent.id === selectedId),
        keyboard: true,
        zIndexOffset: zByKind[kind] || 620,
        title: ent.nameKo || '입구',
        alt: ent.nameKo || '입구',
      });
      m.on('click', () => onSelect && onSelect(ent.id));
      m.addTo(entranceGroup);
      entranceMarkers.set(ent.id, m);
    }
  }

  function setBoundaries(boundaries, opts = {}) {
    currentBoundaries = boundaries || null;
    boundaryOpts = { ...boundaryOpts, ...opts };
    renderBoundaries();
  }

  function ringCentroid(ring) {
    if (!ring || !ring.length) return null;
    let lat = 0; let lng = 0;
    for (const c of ring) { lat += c[0]; lng += c[1]; }
    return [lat / ring.length, lng / ring.length];
  }

  function renderBoundaries() {
    if (!map || !boundaryGroup) return;
    boundaryGroup.clearLayers();
    if (boundaryLabelGroup) boundaryLabelGroup.clearLayers();
    if (!currentBoundaries || !boundaryOpts.showParkBoundaries) return;

    const zoom = map.getZoom();
    const dim = !!boundaryOpts.dimmed;
    const opacityMul = dim ? 0.35 : 1;

    const parkOutline = currentBoundaries.parkOutline
      || currentBoundaries.parkOuterBoundary;
    const ring = parkOutline && Array.isArray(parkOutline.ring) ? parkOutline.ring : null;
    // Park maps usually minZoom=16; still draw from 15 so outline remains if framing expands.
    if (!ring || ring.length < 3 || zoom < 15) return;

    const thin = dim;

    // Stroke-only OSM outline (no interior fill). Inverse outside-mask via SVG
    // evenodd was unreliable in this Leaflet path stack, so we keep the park
    // basemap fully readable and rely on the real outline geometry.
    L.polyline([...ring, ring[0]], {
      pane: 'boundaries',
      interactive: false,
      color: '#154a6e',
      weight: thin ? 2.25 : 3.25,
      opacity: (thin ? 0.7 : 1) * opacityMul,
      lineJoin: 'round',
      lineCap: 'round',
      className: 'park-outline-stroke',
      fill: false,
    }).addTo(boundaryGroup);

    if (boundaryOpts.showBoundaryLabels && !dim && zoom >= 17) {
      const c = ringCentroid(ring);
      if (c) {
        L.marker(c, {
          icon: L.divIcon({
            html: '<span class="boundary-label">파크 영역 (OSM)</span>',
            className: 'boundary-label-wrap',
            iconSize: [0, 0],
            iconAnchor: [0, 0],
          }),
          pane: 'labels',
          interactive: false,
          keyboard: false,
        }).addTo(boundaryLabelGroup);
      }
    }

    // Ticket-gate line + approach arrow (no filled entranceZone polygon).
    if (boundaryOpts.showPregateBoundary && zoom >= 17) {
      const gate = currentBoundaries.gateLine;
      if (gate && Array.isArray(gate.latlngs) && gate.latlngs.length >= 2) {
        L.polyline(gate.latlngs, {
          pane: 'boundaries',
          interactive: false,
          color: '#b33d12',
          weight: 4,
          opacity: 0.9 * opacityMul,
          lineCap: 'square',
        }).addTo(boundaryGroup);
      }
      const arrow = currentBoundaries.approachArrow;
      if (arrow && Array.isArray(arrow.latlngs) && arrow.latlngs.length >= 2) {
        L.polyline(arrow.latlngs, {
          pane: 'boundaries',
          interactive: false,
          color: '#b33d12',
          weight: 3,
          opacity: 0.85 * opacityMul,
          dashArray: null,
        }).addTo(boundaryGroup);
        const tip = arrow.latlngs[arrow.latlngs.length - 1];
        L.marker(tip, {
          icon: L.divIcon({
            html: `<div class="gate-cue" aria-hidden="true">
              <span class="gate-cue-arrow">${escapeHtml(arrow.glyph || '▲')}</span>
              <span class="gate-cue-label">${escapeHtml(arrow.label || '여기서 입장')}</span>
            </div>`,
            className: 'gate-cue-wrap',
            iconSize: [88, 36],
            iconAnchor: [44, 34],
          }),
          pane: 'labels',
          interactive: false,
          keyboard: false,
        }).addTo(boundaryLabelGroup);
      }
    }
  }

  function highlight(id) {
    for (const [mid, m] of markers) {
      const el = m.getElement();
      if (!el) continue;
      const inner = el.querySelector('.marker');
      if (inner) inner.classList.toggle('is-selected', mid === id);
    }
    for (const [mid, m] of entranceMarkers) {
      const el = m.getElement();
      if (!el) continue;
      const inner = el.querySelector('.entrance-marker');
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

  function setStartMarker(coords, title = '출발점') {
    if (!map || !coords) return;
    if (!startMarker) {
      startMarker = L.marker(coords, {
        icon: L.divIcon({
          html: '<div class="start-dot" aria-hidden="true">출발</div>',
          className: 'start-wrap',
          iconSize: [36, 22],
          iconAnchor: [18, 11],
        }),
        zIndexOffset: 900,
        title,
      }).addTo(map);
    } else {
      startMarker.setLatLng(coords);
      startMarker.setTooltipContent?.(title);
    }
  }

  function clearStartMarker() {
    if (startMarker) { map.removeLayer(startMarker); startMarker = null; }
  }

  /** One-shot map tap to choose a direction start point. */
  function beginPickStart(onPick, { prompt } = {}) {
    cancelPickStart();
    if (!map) return;
    const el = map.getContainer();
    el.classList.add('is-picking-start');
    el.style.cursor = 'crosshair';
    if (prompt) {
      /* caller shows toast */
    }
    pickHandler = (e) => {
      const coords = [e.latlng.lat, e.latlng.lng];
      cancelPickStart();
      onPick && onPick(coords);
    };
    map.once('click', pickHandler);
  }

  function cancelPickStart() {
    if (!map) return;
    if (pickHandler) {
      map.off('click', pickHandler);
      pickHandler = null;
    }
    const el = map.getContainer();
    el.classList.remove('is-picking-start');
    el.style.cursor = '';
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

  /** Developer-only walk-graph overlay (?routeDebug=1). Not shown to normal users. */
  function showRouteDebug(debug, { graph } = {}) {
    clearRouteDebug();
    if (!map || !debug) return;
    if (!debugGroup) debugGroup = L.layerGroup().addTo(map);

    if (graph) {
      for (const edge of graph.edges || []) {
        const geom = edge.geometry && edge.geometry.length >= 2
          ? edge.geometry
          : null;
        if (!geom) continue;
        const st = edge.status || (edge.verified ? 'verified' : 'unverified');
        const color = st === 'verified' ? '#14804a' : st === 'blocked' ? '#999' : '#c45c26';
        L.polyline(geom, {
          color, weight: 3, opacity: 0.55, dashArray: st === 'verified' ? null : '4,6',
          className: 'route-debug-edge',
        }).bindTooltip(`${edge.id || '?'} · ${st} · ${edge.distance || '?'}m`, { sticky: true })
          .addTo(debugGroup);
      }
      for (const n of graph.nodes || []) {
        L.circleMarker(n.coordinates, {
          radius: 5, color: '#10202e', fillColor: '#ffe08a', fillOpacity: 0.95, weight: 1,
        }).bindTooltip(`${n.id}<br>${n.notes || ''}`, { direction: 'top' }).addTo(debugGroup);
      }
    }

    if (debug.approachConnector) {
      L.polyline([debug.approachConnector.from, debug.approachConnector.to], {
        color: '#d9480f', weight: 3, dashArray: '2,8', opacity: 0.9,
      }).bindTooltip(`approach ${debug.approachConnector.lengthM}m`).addTo(debugGroup);
    }
    if (debug.exitConnector) {
      L.polyline([debug.exitConnector.from, debug.exitConnector.to], {
        color: '#d9480f', weight: 3, dashArray: '2,8', opacity: 0.9,
      }).bindTooltip(`exit ${debug.exitConnector.lengthM}m`).addTo(debugGroup);
    }
    (debug.nodes || []).forEach((n, i) => {
      if (!n.coordinates) return;
      L.marker(n.coordinates, {
        icon: L.divIcon({
          className: 'route-debug-node',
          html: `<span class="rdn">${i}</span>`,
          iconSize: [22, 22],
          iconAnchor: [11, 11],
        }),
        interactive: false,
      }).addTo(debugGroup);
    });
    (debug.edges || []).forEach((edge, i) => {
      if (!edge.geometry || edge.geometry.length < 2) return;
      const mid = edge.geometry[Math.floor(edge.geometry.length / 2)];
      L.marker(mid, {
        icon: L.divIcon({
          className: 'route-debug-edge-label',
          html: `<span class="rde">E${i}:${edge.lengthM}m/${edge.status}</span>`,
          iconSize: [0, 0],
        }),
        interactive: false,
      }).addTo(debugGroup);
    });
  }

  function clearRouteDebug() {
    if (debugGroup) { debugGroup.clearLayers(); }
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

  function setLabelOptions({ selectedId, favIds, mapLabelMode, category } = {}) {
    if (selectedId !== undefined) labelState.selectedId = selectedId;
    if (favIds !== undefined) labelState.favIds = favIds instanceof Set ? favIds : new Set(favIds || []);
    if (mapLabelMode !== undefined) labelState.mapLabelMode = mapLabelMode;
    if (category !== undefined) labelState.category = category;
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

    // ko-first: Korean-only on map (JP in detail cards). ko_ja: bilingual overlay.
    const showJaSub = s.mapLabelMode === LABEL_MODES.KO_JA;
    const jaOnly = s.mapLabelMode === LABEL_MODES.JA;

    function mainText(poi) {
      if (jaOnly) return poi.nameJa || poi.name || poi.nameKo;
      return poi.nameKo || poi.nameEn || poi.name || poi.nameJa;
    }
    function subText(poi) {
      if (!showJaSub || jaOnly) return null;
      const ja = poi.nameJa || poi.name;
      const main = mainText(poi);
      if (!ja || ja === main) return null;
      return ja;
    }

    if (zoom <= 15 && s.parkMeta.center) {
      out.push({
        key: '__park', kind: 'park', latlng: s.parkMeta.center,
        text: jaOnly ? (s.parkMeta.nameJa || s.parkMeta.nameKo) : s.parkMeta.nameKo,
        sub: null, priority: 0,
      });
    }
    if (zoom >= 16) {
      for (const ar of s.areas) {
        if (!ar.labelCenter) continue;
        out.push({
          key: 'area:' + ar.id, kind: 'area', latlng: ar.labelCenter,
          text: jaOnly ? (ar.nameJa || ar.nameEn || ar.nameKo) : ar.nameKo,
          sub: null, priority: 2,
        });
      }
    }
    const cat = s.category || 'map';
    const hideAttrLabels = cat === 'restrooms' || cat === 'none';
    const hideNonFavAttr = cat === 'favorites';
    const attractionsOnly = cat === 'attractions';

    // App attraction labels (vector attraction names are hidden in basemap).
    const showRep = zoom >= 16;
    const showAll = zoom >= 17;
    if (!hideAttrLabels) {
      for (const at of s.attractions) {
        if (!at.coordinates) continue;
        if ((at.operatingStatus || 'operating') !== 'operating') continue;
        if (hideNonFavAttr && !s.favIds.has(at.id)) continue;
        const isFav = s.favIds.has(at.id);
        const isRep = s.landmark.has(at.id);
        let include = false; let priority = 5;
        if (attractionsOnly) {
          // Attractions tab: show Korean attraction labels (rep at 16+, all at 17+).
          if (isRep && showRep) { include = true; priority = 4; }
          if (showAll || zoom >= 16) { include = true; priority = Math.min(priority, 5); }
        } else {
          if (isFav && zoom >= 16) { include = true; priority = 3; }
          if (isRep && showRep) { include = true; priority = Math.min(priority, 4); }
          if (showAll) { include = true; priority = Math.min(priority, 5); }
        }
        if (include) {
          out.push({
            key: 'at:' + at.id, kind: 'attr', latlng: at.coordinates,
            text: mainText(at), sub: subText(at), priority,
          });
        }
      }
    }
    // Selected POI always shown (including layerMode none — search/detail exception).
    if (s.selectedId) {
      const sel = s.attractions.find((a) => a.id === s.selectedId)
        || s.facilities.find((f) => f.id === s.selectedId);
      if (sel && sel.coordinates) {
        const isAttr = sel.type === 'attraction';
        const allowed = cat === 'none' || cat === 'map' ? true
          : attractionsOnly ? isAttr
            : cat === 'restrooms' ? (sel.type === 'restroom' || sel.type === 'babyCare')
              : cat === 'favorites' ? s.favIds.has(sel.id)
                : true;
        if (allowed) {
          out.push({
            key: (isAttr ? 'at:' : 'fac:') + sel.id,
            kind: isAttr ? 'attr' : 'facility',
            latlng: sel.coordinates,
            text: mainText(sel),
            sub: subText(sel),
            priority: 1, selected: true,
          });
        }
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
    init, setPark, setBasemapTheme, setBasemapLabelMode, resetView, renderMarkers, highlight, focusPoi,
    setUserLocation, centerOnUser, showDirection, clearDirection,
    setStartMarker, clearStartMarker, beginPickStart, cancelPickStart,
    setMeetupMarker, clearMeetupMarker,
    renderEntrances, setBoundaries, renderBoundaries,
    showRoute, clearRoute, showRouteDebug, clearRouteDebug, invalidate,
    setLabelSources, setLabelOptions, renderLabels,
    getMap: () => map,
  };
}
