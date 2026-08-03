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
    visitIds: new Set(),
    nextVisitId: null,
    directionId: null,
    mapLabelMode: LABEL_MODES.KO_FIRST,
  };
  let meetupMarker = null;
  let entranceGroup = null;
  let boundaryGroup = null;
  let boundaryLabelGroup = null;
  let entranceMarkers = new Map();
  let lastEntranceRender = null;
  let boundaryOpts = {
    showParkBoundaries: false,
    showPregateBoundary: false,
    showBoundaryLabels: false,
    dimmed: false,
  };
  let currentBoundaries = null;

  let compassControl = null;
  let bearingAnim = null;
  let rotateLabelRaf = 0;

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
    // leaflet-rotate (vendored): rotate panes + touchRotate. No device heading tracking.
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
      rotate: true,
      bearing: 0,
      touchRotate: true,
      shiftKeyRotate: true,
      // Built-in control cycles into device-compass mode — use our custom north button instead.
      rotateControl: false,
      compassBearing: false,
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

    // Boundaries/gate lines rotate with the map; labels stay screen-upright.
    const rotateParent = map.getPane('rotatePane') || map.getPane('mapPane');
    const norotateParent = map.getPane('norotatePane') || map.getPane('mapPane');
    map.createPane('boundaries', rotateParent);
    const bp = map.getPane('boundaries');
    bp.style.zIndex = 350;
    bp.style.pointerEvents = 'none';
    boundaryGroup = L.layerGroup().addTo(map);
    boundaryLabelGroup = L.layerGroup().addTo(map);

    entranceGroup = L.layerGroup().addTo(map);

    map.createPane('labels', norotateParent);
    const lp = map.getPane('labels');
    lp.style.zIndex = 620;
    lp.style.pointerEvents = 'none';
    labelGroup = L.layerGroup().addTo(map);

    addCompassControl();

    map.on('zoomend moveend', () => {
      renderLabels();
      renderBoundaries();
      if (lastEntranceRender) renderEntrances(lastEntranceRender.entrances, lastEntranceRender.opts);
    });
    map.on('rotate', onMapRotate);
    if (parkMeta.defaultBounds) {
      map.fitBounds(L.latLngBounds(parkMeta.defaultBounds), { animate: false });
    }
    // Test/debug hook: recover Leaflet instance from the container element.
    map.getContainer()._tdgMap = map;
    syncCompassUi();
    return map;
  }

  function onMapRotate() {
    syncCompassUi();
    // Throttle label overlap reflow — markers update via leaflet-rotate themselves.
    if (rotateLabelRaf) return;
    rotateLabelRaf = requestAnimationFrame(() => {
      rotateLabelRaf = 0;
      renderLabels();
    });
  }

  function syncCompassUi() {
    if (!compassControl || !map || typeof map.getBearing !== 'function') return;
    const bearing = map.getBearing() || 0;
    const rotated = Math.abs(((bearing % 360) + 360) % 360) > 0.5
      && Math.abs((((bearing % 360) + 360) % 360) - 360) > 0.5;
    const btn = compassControl._btn;
    const needle = compassControl._needle;
    if (btn) {
      btn.classList.toggle('is-rotated', rotated);
      btn.setAttribute('aria-pressed', rotated ? 'true' : 'false');
    }
    // Counter-rotate so the needle keeps pointing to geographic north on screen.
    if (needle) needle.style.transform = `rotate(${-bearing}deg)`;
  }

  function addCompassControl() {
    const Compass = L.Control.extend({
      options: { position: 'topleft' },
      onAdd(m) {
        const wrap = L.DomUtil.create('div', 'leaflet-bar leaflet-control tdg-compass');
        const btn = L.DomUtil.create('a', 'tdg-compass-btn', wrap);
        btn.href = '#';
        btn.setAttribute('role', 'button');
        btn.setAttribute('aria-label', '지도를 북쪽으로 맞추기');
        btn.setAttribute('tabindex', '0');
        btn.setAttribute('aria-pressed', 'false');
        const needle = L.DomUtil.create('span', 'tdg-compass-needle', btn);
        needle.setAttribute('aria-hidden', 'true');
        needle.textContent = '\u2B06'; // ⬆
        this._btn = btn;
        this._needle = needle;

        // Desktop assist: drag compass sideways to rotate (shift+wheel also works via plugin).
        let dragStartX = null;
        let dragStartBearing = 0;
        let didDrag = false;
        const onPointerDown = (e) => {
          if (e.pointerType === 'touch') return; // mobile uses two-finger rotate
          dragStartX = e.clientX;
          dragStartBearing = m.getBearing();
          didDrag = false;
          btn.setPointerCapture?.(e.pointerId);
          L.DomEvent.stop(e);
        };
        const onPointerMove = (e) => {
          if (dragStartX == null) return;
          const dx = e.clientX - dragStartX;
          if (Math.abs(dx) < 3) return;
          didDrag = true;
          m.setBearing(dragStartBearing + dx * 0.4);
          L.DomEvent.stop(e);
        };
        const onPointerUp = () => { dragStartX = null; };

        L.DomEvent.disableClickPropagation(wrap);
        L.DomEvent.on(btn, 'click', (e) => {
          L.DomEvent.preventDefault(e);
          L.DomEvent.stopPropagation(e);
          if (didDrag) { didDrag = false; return; }
          resetBearing(true);
        });
        L.DomEvent.on(btn, 'keydown', (e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            L.DomEvent.preventDefault(e);
            resetBearing(true);
          }
        });
        L.DomEvent.on(btn, 'pointerdown', onPointerDown);
        L.DomEvent.on(btn, 'pointermove', onPointerMove);
        L.DomEvent.on(btn, 'pointerup', onPointerUp);
        L.DomEvent.on(btn, 'pointercancel', onPointerUp);
        return wrap;
      },
    });
    compassControl = new Compass();
    compassControl.addTo(map);
  }

  /** Animate bearing to north (0°). Does not persist to localStorage. */
  function resetBearing(animate = true) {
    if (!map || typeof map.setBearing !== 'function') return;
    if (bearingAnim) cancelAnimationFrame(bearingAnim);
    const start = map.getBearing() || 0;
    const shortest = ((0 - start + 540) % 360) - 180;
    if (!animate || Math.abs(shortest) < 0.5) {
      map.setBearing(0);
      syncCompassUi();
      return;
    }
    const duration = Math.min(700, 280 + Math.abs(shortest) * 2);
    const t0 = performance.now();
    const step = (now) => {
      const p = Math.min(1, (now - t0) / duration);
      const eased = 1 - (1 - p) ** 3;
      map.setBearing(start + shortest * eased);
      if (p < 1) bearingAnim = requestAnimationFrame(step);
      else {
        bearingAnim = null;
        map.setBearing(0);
        syncCompassUi();
      }
    };
    bearingAnim = requestAnimationFrame(step);
  }

  function getBearing() {
    return (map && typeof map.getBearing === 'function') ? map.getBearing() : 0;
  }

  function setBearing(deg) {
    if (map && typeof map.setBearing === 'function') map.setBearing(deg);
    syncCompassUi();
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
    resetBearing(false);
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
    resetBearing(false);
    if (meta.defaultBounds) {
      map.fitBounds(L.latLngBounds(meta.defaultBounds), { animate: true });
    } else {
      map.setView(meta.center, meta.defaultZoom || meta.zoom);
    }
  }

  function makeIcon(poi, selected, rideBadge) {
    // Sparse default map: numbered visit-order markers (no name plates).
    if (poi._useVisitMarker && poi._visitOrder != null) {
      const cls = [
        'marker', 'is-visit',
        selected ? 'is-selected' : '',
        poi._visitMust ? 'is-must' : '',
        poi._visitDone ? 'is-done' : '',
        poi._isNext ? 'is-next' : '',
      ].filter(Boolean).join(' ');
      const star = poi._visitMust ? '<span class="visit-star" aria-hidden="true">★</span>' : '';
      const html = `<div class="${cls}" aria-hidden="true">${escapeHtml(String(poi._visitOrder))}${star}</div>`;
      return L.divIcon({
        html,
        className: 'marker-wrap',
        iconSize: [26, 26],
        iconAnchor: [13, 13],
      });
    }
    const spec = ICONS[poi.type] || ICONS.attraction;
    let trustCls = '';
    if (poi.coordinateStatus === 'medium_estimated') trustCls = 'is-medium';
    else if (poi.coordinateStatus === 'low_estimated') trustCls = 'is-low is-approx';
    const nearestCls = poi._isNearest ? 'is-nearest' : '';
    const badge = rideBadge
      ? `<span class="m-ride-badge" aria-hidden="true">${escapeHtml(rideBadge)}</span>`
      : '';
    const html = `<div class="marker ${spec.cls} ${selected ? 'is-selected' : ''} ${trustCls} ${nearestCls}" aria-hidden="true"><span class="marker-glyph">${spec.glyph}</span>${badge}</div>`;
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
      const selected = poi.id === selectedId;
      const m = L.marker(poi.coordinates, {
        icon: makeIcon(poi, selected, badges[poi.id]),
        keyboard: true,
        zIndexOffset: poi._isNearest ? 700 : (poi._isNext ? 650 : (poi._visitOrder != null ? 500 : 400)),
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

  function entranceIcon(ent, selected, { heroMain = false } = {}) {
    const kind = ent.entranceKind || 'main_entrance';
    const tier = kind === 'main_entrance' ? 'main'
      : kind === 'pre_gate' ? 'pregate'
        : 'station';
    const zoom = map ? map.getZoom() : 16;
    // Main: hero in entrance mode or when selected; otherwise compact (quiet on category maps).
    const mainHero = tier === 'main' && (heroMain || selected);
    const compact = tier === 'main' ? !mainHero : !selected;
    const glyph = tier === 'station' ? '駅' : '入';
    let labelHtml = '';
    if (tier === 'main') {
      if (mainHero) {
        labelHtml = `<span class="entrance-label">${escapeHtml(ent.nameKo || '입구')}</span>`;
      } else if (zoom >= 17) {
        labelHtml = '<span class="entrance-label entrance-label-short">입구</span>';
      }
    } else if (selected) {
      labelHtml = `<span class="entrance-label">${escapeHtml(ent.nameKo || '입구')}</span>`;
    }
    const sizeCls = mainHero ? 'is-hero' : (tier === 'main' ? 'is-quiet' : '');
    const html = `<div class="entrance-marker is-${tier} ${compact ? 'compact' : ''} ${sizeCls} ${selected ? 'is-selected' : ''}" aria-hidden="true">
      <span class="entrance-glyph">${glyph}</span>
      ${labelHtml}
    </div>`;
    const sizes = {
      main: mainHero
        ? { size: [124, 44], anchor: [62, 22] }
        : (labelHtml
          ? { size: [44, 36], anchor: [22, 18] }
          : { size: [28, 28], anchor: [14, 14] }),
      pregate: compact ? { size: [28, 28], anchor: [14, 14] } : { size: [96, 36], anchor: [48, 18] },
      station: compact ? { size: [28, 28], anchor: [14, 14] } : { size: [96, 36], anchor: [48, 18] },
    };
    const s = sizes[tier] || sizes.station;
    return L.divIcon({
      html,
      className: 'entrance-wrap',
      iconSize: s.size,
      iconAnchor: s.anchor,
    });
  }

  function renderEntrances(entrances, {
    onSelect, selectedId, show = true, showAux = false, heroMain = false,
  } = {}) {
    if (!entranceGroup) return;
    lastEntranceRender = { entrances, opts: { onSelect, selectedId, show, showAux, heroMain } };
    entranceGroup.clearLayers();
    entranceMarkers = new Map();
    if (!show) return;
    for (const ent of entrances || []) {
      if (!ent.coordinates) continue;
      const kind = ent.entranceKind || 'main_entrance';
      // Default map: main entrance only. Aux markers only in entrance detail mode.
      if (kind !== 'main_entrance' && !showAux) continue;
      const selected = ent.id === selectedId;
      const mainHero = kind === 'main_entrance' && (heroMain || selected);
      const z = mainHero ? 740 : (kind === 'main_entrance' ? 420 : (kind === 'pre_gate' ? 660 : 620));
      const m = L.marker(ent.coordinates, {
        icon: entranceIcon(ent, selected, { heroMain }),
        keyboard: true,
        zIndexOffset: z,
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

  function renderGateCues(opacityMul) {
    if (!currentBoundaries || !boundaryOpts.showPregateBoundary) return;
    // Gate line / approach arrow only at zoom 18+ so they don't crowd the main entrance label.
    const zoom = map ? map.getZoom() : 0;
    if (zoom < 18) return;
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
      const glyph = arrow.glyph || '▼';
      L.marker(tip, {
        icon: L.divIcon({
          html: `<div class="gate-cue" aria-hidden="true">
              <span class="gate-cue-label">${escapeHtml(arrow.label || '여기서 입장')}</span>
              <span class="gate-cue-arrow">${escapeHtml(glyph)}</span>
            </div>`,
          className: 'gate-cue-wrap',
          iconSize: [96, 40],
          iconAnchor: [48, 38],
        }),
        pane: 'labels',
        interactive: false,
        keyboard: false,
      }).addTo(boundaryLabelGroup);
    }
  }

  function renderBoundaries() {
    if (!map || !boundaryGroup) return;
    boundaryGroup.clearLayers();
    if (boundaryLabelGroup) boundaryLabelGroup.clearLayers();
    if (!currentBoundaries) return;

    const zoom = map.getZoom();
    const dim = !!boundaryOpts.dimmed;
    const opacityMul = dim ? 0.35 : 1;

    // Park outline: only when enabled AND zoom 15–16 (hidden at 17+ for declutter).
    if (boundaryOpts.showParkBoundaries && zoom >= 15 && zoom < 17) {
      const parkOutline = currentBoundaries.guestAreaOutline
        || currentBoundaries.parkOutline
        || currentBoundaries.parkOuterBoundary;
      const ring = parkOutline && Array.isArray(parkOutline.ring) ? parkOutline.ring : null;
      if (ring && ring.length >= 3) {
        L.polyline([...ring, ring[0]], {
          pane: 'boundaries',
          interactive: false,
          color: '#1a5a7a',
          weight: dim ? 2 : 2.5,
          opacity: (dim ? 0.75 : 0.95) * opacityMul,
          lineJoin: 'round',
          lineCap: 'round',
          className: 'park-outline-stroke',
          fill: false,
        }).addTo(boundaryGroup);

        // Labels off by default; if user enables, keep them on the same zoom band only.
        if (boundaryOpts.showBoundaryLabels && !dim) {
          const c = ringCentroid(ring);
          const label = parkOutline.label || '파크 영역(안내용)';
          const detail = parkOutline.detail
            || '일반 게스트 이용구역을 이해하기 위한 안내용 경계입니다. 공식·법적 경계가 아니며 실제 운영구역은 현장 안내를 따라 주세요.';
          if (c) {
            L.marker(c, {
              icon: L.divIcon({
                html: `<span class="boundary-label" title="${escapeHtml(detail)}">${escapeHtml(label)}</span>`,
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
      }
    }

    // Gate line / approach arrow are independent of park-outline visibility.
    renderGateCues(opacityMul);
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

  function setLabelOptions({
    selectedId, favIds, visitIds, nextVisitId, directionId, mapLabelMode, category,
  } = {}) {
    if (selectedId !== undefined) labelState.selectedId = selectedId;
    if (favIds !== undefined) labelState.favIds = favIds instanceof Set ? favIds : new Set(favIds || []);
    if (visitIds !== undefined) labelState.visitIds = visitIds instanceof Set ? visitIds : new Set(visitIds || []);
    if (nextVisitId !== undefined) labelState.nextVisitId = nextVisitId || null;
    if (directionId !== undefined) labelState.directionId = directionId || null;
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
        // Pregate is shown via entrance markers in entrance detail mode — not as an area label.
        if (ar.id === 'pregate') continue;
        out.push({
          key: 'area:' + ar.id, kind: 'area', latlng: ar.labelCenter,
          text: jaOnly ? (ar.nameJa || ar.nameEn || ar.nameKo) : ar.nameKo,
          sub: null, priority: 4,
        });
      }
    }
    const cat = s.category || 'map';
    const attractionsOnly = cat === 'attractions';
    const sparseMap = cat === 'map';
    // App POI name labels: selected / direction / next-visit only (never mass labels).
    const namedIds = new Set();
    if (s.selectedId) namedIds.add(s.selectedId);
    if (s.directionId) namedIds.add(s.directionId);
    if (sparseMap && s.nextVisitId) namedIds.add(s.nextVisitId);

    function pushNamed(poi, priority, selected) {
      if (!poi || !poi.coordinates) return;
      const isAttr = poi.type === 'attraction';
      out.push({
        key: (isAttr ? 'at:' : 'fac:') + poi.id,
        kind: isAttr ? 'attr' : 'facility',
        latlng: poi.coordinates,
        text: mainText(poi),
        sub: subText(poi),
        priority,
        selected: !!selected,
      });
    }

    for (const id of namedIds) {
      const poi = s.attractions.find((a) => a.id === id)
        || s.facilities.find((f) => f.id === id);
      if (!poi) continue;
      if (attractionsOnly && poi.type !== 'attraction') continue;
      if (cat === 'restrooms' && poi.type !== 'restroom' && poi.type !== 'babyCare') continue;
      if (cat === 'favorites' && !s.favIds.has(poi.id) && id !== s.selectedId && id !== s.directionId) continue;
      if (cat === 'none' && id !== s.selectedId && id !== s.directionId) continue;
      const selected = id === s.selectedId;
      const priority = selected ? 1 : (id === s.directionId ? 1.5 : 2);
      pushNamed(poi, priority, selected);
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
    getBearing, setBearing, resetBearing,
    getMap: () => map,
  };
}
