import {
  PARKS, getPois, getAttractions, getAllAttractions, getFacilities, getPoiById, LANDMARK_ATTRACTIONS,
  getEntrances, getMainEntrance, getParkBoundaries,
} from './data/index.js';
import { closureOnDate } from './labels.js';
import { store } from './store.js';
import { createMapController } from './map.js';
import {
  createLocator, requestPositionOnce, haversineMeters, bearingDegrees, formatDistance, compass8,
} from './geo.js';
import {
  matchText, attractionMatchesFilters, facilityMatchesFilters,
  facilityVisible, facilityBandCounts, withDistance, sortByDistance,
  isRestroomTabFacility,
} from './search.js';
import {
  routeToPoi, canOfferWalkRoute, investigateRoute,
  VERIFYING_MSG, UNVERIFIED_SEGMENT_MSG,
} from './routing.js';
import { TDL_WALK_GRAPH, TDL_LEGACY_WALK_GRAPH } from './data/routes/tdlWalkGraph.js';
import { TDS_WALK_GRAPH } from './data/routes/tdsWalkGraph.js';
import {
  familyRideSummary, applyFamilyQuick, attractionPassesFamilyExtras,
} from './family.js';
import {
  buildShareData, encodeShareToParam, decodeShareParam, buildShareUrl,
  exportShareJson, parseShareJson,
} from './share.js';
import * as ui from './ui.js';

const WALK_GRAPHS = { TDL: TDL_WALK_GRAPH, TDS: TDS_WALK_GRAPH };
const ROUTE_DEBUG = (() => {
  try { return new URLSearchParams(window.location.search).has('routeDebug'); }
  catch { return false; }
})();

const state = {
  park: store.getPark(),
  // Panel only (sheet content). Map marker category uses layerMode.
  tab: 'map', // map | attractions | restrooms | favorites | settings | detail | search | filter | familyNearby
  prevTab: 'attractions',
  // Map app-marker category (independent of open panel).
  // map = sparse default (selected / visit list); category layers toggle on demand.
  layerMode: 'map', // map | attractions | restrooms | favorites | none
  // Entrance detail mode: show pregate/station + gate cues (via 근처 → 메인 입구).
  entranceDetail: false,
  query: '',
  selectedId: null,
  directionId: null,    // POI id currently showing direction line
  routeId: null,        // POI id currently showing walk route
  routeInfo: null,      // { mode, distance, confidence, reason, ... }
  user: null,           // { coords:[lat,lng], accuracy }
  locating: false,
  outsideParkChoice: null, // 'entrance' | 'keep' | null
  // Direction start: 'user' | 'entrance' | 'map' | null (auto)
  startOrigin: null,
  manualStart: null,      // [lat,lng] when startOrigin === 'map'
  pendingDirectionId: null, // resume direction after GPS grant
  pickingStart: false,
  pickingMeetup: false,
  visitSort: 'manual', // manual | must | undone | bothOk
  pendingShare: null, // imported share awaiting user choice
};

const map = createMapController('map');

// ---- DOM refs ----
const $ = (s) => document.querySelector(s);
const els = {};

function cacheEls() {
  els.parkToggle = $('#park-toggle');
  els.search = $('#search-input');
  els.locBtn = $('#loc-btn');
  els.filterBtn = $('#filter-btn');
  els.sheet = $('#sheet');
  els.sheetTitle = $('#sheet-title');
  els.sheetBody = $('#sheet-body');
  els.sheetClose = $('#sheet-close');
  els.nav = $('#bottomnav');
  els.offline = $('#offline-banner');
  els.toast = $('#toast');
  els.locStatus = $('#loc-status');
  els.mapFab = $('#map-fab');
}

// ---- helpers ----
function parkMeta() { return PARKS[state.park]; }

function includeLowTrust() { return store.getSettings().includeEstimated; }
function includePregate() { return !!store.getSettings().includePregate; }

function facilityVisibilityOpts() {
  return { includePregate: includePregate() };
}

function visibleFacilities({ restroomTabOnly = false } = {}) {
  return getFacilities(state.park).filter((f) => {
    if (restroomTabOnly && !isRestroomTabFacility(f)) return false;
    return facilityVisible(f, includeLowTrust(), state.park, facilityVisibilityOpts());
  });
}

/** Active map layer from layerMode (panel tab must not drive markers). */
function mapCategory() {
  if (state.layerMode === 'all') return 'map'; // legacy alias → sparse map
  return state.layerMode; // map | attractions | restrooms | favorites | none
}

function poiMatchesCategory(poi, category = mapCategory()) {
  if (!poi) return false;
  if (category === 'map' || category === 'none') return true;
  if (category === 'attractions') return poi.type === 'attraction';
  if (category === 'restrooms') return isRestroomTabFacility(poi);
  if (category === 'favorites') return store.isFavorite(poi.id);
  return true;
}

/** Sparse default map: selected / nav targets + visit-list stops (not every POI). */
function sparseMapPois() {
  const keep = new Set();
  if (state.selectedId) keep.add(state.selectedId);
  if (state.directionId) keep.add(state.directionId);
  if (state.routeId) keep.add(state.routeId);
  for (const id of store.getVisitList()) keep.add(id);
  return getPois(state.park).filter((p) => keep.has(p.id) && p.coordinates);
}

/** First unfinished visit-list stop (fallback: first item). */
function nextVisitId() {
  const list = store.getVisitList();
  if (!list.length) return null;
  for (const id of list) {
    if (!store.isDone(id)) return id;
  }
  return list[0];
}

/** Decorate POIs for visit-order markers / nearest restroom highlight. */
function decorateMapPois(pois) {
  const visitIds = store.getVisitList();
  const nextId = nextVisitId();
  const sparse = state.layerMode === 'map' || state.layerMode === 'all';
  let nearestId = null;
  if (state.layerMode === 'restrooms' && state.user?.coords && isInsidePark(state.user.coords)) {
    const n = nearestFacility('restroom', state.user.coords);
    nearestId = n?.id || null;
  }
  return pois.map((p) => {
    const vi = visitIds.indexOf(p.id);
    const inVisit = vi >= 0;
    return {
      ...p,
      _visitOrder: inVisit ? vi + 1 : null,
      _visitMust: inVisit && store.getVisitPriority(p.id) === 'must',
      _visitDone: inVisit && store.isDone(p.id),
      _isNext: inVisit && p.id === nextId,
      _isNearest: p.id === nearestId,
      _useVisitMarker: (sparse || state.layerMode === 'favorites') && inVisit,
    };
  });
}

// POIs shown on the map: filtered by layerMode.
function mapPois() {
  const cat = state.layerMode;
  if (cat === 'none') {
    const keep = new Set();
    if (state.selectedId) keep.add(state.selectedId);
    if (state.directionId) keep.add(state.directionId);
    if (state.routeId) keep.add(state.routeId);
    return getPois(state.park).filter((p) => keep.has(p.id) && p.coordinates);
  }
  if (cat === 'attractions') {
    return getAttractions(state.park).filter((p) => attractionPassesFamilyExtras(p, getFilters().attraction, store.getVisitDate()));
  }
  if (cat === 'restrooms') {
    const ff = { ...getFilters().facility };
    if (ff.inGateOnly == null) ff.inGateOnly = true;
    return visibleFacilities({ restroomTabOnly: true }).filter((p) => facilityMatchesFilters(p, ff));
  }
  if (cat === 'favorites') {
    const fav = new Set(store.getFavorites());
    const fromPois = getPois(state.park).filter((p) => fav.has(p.id) && p.coordinates
      && (p.type === 'attraction' || facilityVisible(p, includeLowTrust(), state.park, facilityVisibilityOpts())));
    const fromEnt = getEntrances(state.park).filter((p) => fav.has(p.id) && p.coordinates);
    return [...fromPois, ...fromEnt];
  }
  // map / all: sparse field guide view
  return sparseMapPois();
}

function clearSelectionIfWrongCategory(category = mapCategory()) {
  if (!state.selectedId) return;
  if (category === 'none') return; // keep selected marker while layers are off
  const poi = getPoiById(state.park, state.selectedId);
  if (poiMatchesCategory(poi, category)) return;
  state.selectedId = null;
  map.highlight(null);
  if (state.tab === 'detail') {
    state.tab = category === 'map' ? 'map' : category;
  }
}

function rideBadgeMap(pois) {
  // Map clutter rule: badges only on the selected attraction marker (lists/detail keep their own badges).
  if (!store.getSettings().showFamilyRideBadge) return {};
  if (!state.selectedId) return {};
  const children = store.getChildren();
  const out = {};
  for (const p of pois) {
    if (p.type !== 'attraction') continue;
    if (p.id !== state.selectedId) continue;
    const s = familyRideSummary(p, children);
    if (s.short) out[p.id] = s.short;
  }
  return out;
}

function syncMeetupMarker() {
  const m = store.getMeetup(state.park);
  if (m && m.coordinates) map.setMeetupMarker(m.coordinates, m.label || '가족 집결지');
  else map.clearMeetupMarker();
}

function distanceTo(poi) {
  const from = directionStartCoords();
  if (!from || !poi || !poi.coordinates) return null;
  return haversineMeters(from, poi.coordinates);
}

function directionStartCoords() {
  if (state.startOrigin === 'entrance' && parkMeta().entranceCoordinates) {
    return parkMeta().entranceCoordinates;
  }
  if (state.startOrigin === 'map' && state.manualStart) return state.manualStart;
  if (state.user && state.user.coords && isInsidePark(state.user.coords)) {
    return state.user.coords;
  }
  return null;
}

function directionOriginLabel() {
  if (state.startOrigin === 'entrance') return '파크 정문';
  if (state.startOrigin === 'map') return '지도에서 선택한 출발점';
  if (state.user && state.user.coords && isInsidePark(state.user.coords)) return '현재 위치';
  return '';
}

function directionFor(poi) {
  if (state.directionId !== poi.id || !poi.coordinates) return null;
  const from = directionStartCoords();
  if (!from) return null;
  const bearing = bearingDegrees(from, poi.coordinates);
  return {
    distance: haversineMeters(from, poi.coordinates),
    bearing,
    bearingLabel: `${compass8(bearing)}쪽 방향 (${Math.round(bearing)}\u00B0)`,
  };
}

// Tag attractions with a closure that overlaps the saved visit date (for list badges).
function annotateClosure(pois) {
  const vd = store.getVisitDate();
  return pois.map((p) => (p.type === 'attraction'
    ? { ...p, _closedOnVisit: closureOnDate(p, vd) }
    : p));
}

function toast(msg, ms = 2600) {
  els.toast.textContent = msg;
  els.toast.classList.add('show');
  clearTimeout(toast._t);
  toast._t = setTimeout(() => els.toast.classList.remove('show'), ms);
}

// ---- rendering ----
function renderMap() {
  const pois = decorateMapPois(withDistance(mapPois(), state.user && state.user.coords));
  map.renderMarkers(pois, {
    onSelect: selectPoi,
    selectedId: state.selectedId,
    rideBadges: rideBadgeMap(pois),
  });
  syncEntranceAndBoundary();
  syncMeetupMarker();
}

function syncEntranceAndBoundary() {
  const s = store.getSettings();
  const showEnt = s.showEntranceMarkers !== false;
  map.renderEntrances(getEntrances(state.park), {
    onSelect: selectPoi,
    selectedId: state.selectedId,
    show: showEnt,
    showAux: !!state.entranceDetail,
    // Compact main on normal layers; hero only in entrance mode (or when main is selected).
    heroMain: !!state.entranceDetail,
  });
  const thin = state.layerMode === 'attractions' || state.layerMode === 'restrooms'
    || state.layerMode === 'favorites';
  // Park outline opt-in only; gate cues only while entrance detail mode is on (zoom 18+ in map.js).
  map.setBoundaries(getParkBoundaries(state.park), {
    showParkBoundaries: s.showParkBoundaries === true,
    showPregateBoundary: !!state.entranceDetail && s.showPregateBoundary !== false,
    showBoundaryLabels: s.showBoundaryLabels === true,
    dimmed: thin,
  });
  syncNearbyFab();
}

function syncNearbyFab() {
  const btn = els.mapFab && els.mapFab.querySelector('[data-fab="nearby"]');
  if (btn) {
    const on = state.tab === 'familyNearby';
    btn.classList.toggle('on', on);
    btn.setAttribute('aria-pressed', on ? 'true' : 'false');
  }
}

function focusMainEntrance({ openDetail = true, enableEntranceMode = true } = {}) {
  if (enableEntranceMode) {
    state.entranceDetail = true;
    if (store.getSettings().showEntranceMarkers === false) {
      store.setSettings({ showEntranceMarkers: true });
    }
    syncEntranceAndBoundary();
  }
  const ent = getMainEntrance(state.park);
  if (!ent || !ent.coordinates) {
    const c = parkMeta().entranceCoordinates;
    if (c) map.focusPoi(c, 17);
    return;
  }
  map.focusPoi(ent.coordinates, 17);
  if (openDetail && store.getSettings().showEntranceMarkers !== false) selectPoi(ent.id);
  else syncEntranceAndBoundary();
}

/** Toggle auxiliary entrances + gate cues; main stays visible. */
function toggleEntranceDetailMode() {
  const ents = getEntrances(state.park);
  if (!ents.length) { toast('입구 데이터가 없습니다'); return; }
  state.entranceDetail = !state.entranceDetail;
  if (store.getSettings().showEntranceMarkers === false) {
    store.setSettings({ showEntranceMarkers: true });
  }
  syncEntranceAndBoundary();
  const main = getMainEntrance(state.park) || ents[0];
  if (state.entranceDetail) {
    if (main?.coordinates) map.focusPoi(main.coordinates, 16);
    toast('입구·프리게이트·스테이션 표시');
  } else {
    toast('메인 입구만 표시');
  }
  syncNav();
}

function showEntrancesOverview() {
  // Keep list sheet for nearby/detail flows; FAB uses toggleEntranceDetailMode.
  const ents = getEntrances(state.park);
  if (!ents.length) { toast('입구 데이터가 없습니다'); return; }
  state.entranceDetail = true;
  syncEntranceAndBoundary();
  const main = getMainEntrance(state.park) || ents[0];
  if (main.coordinates) {
    map.focusPoi(main.coordinates, 17);
  }
  els.sheetTitle.textContent = `${parkMeta().shortKo || state.park} 입구`;
  state.tab = 'search';
  els.sheet.classList.add('open');
  els.sheet.setAttribute('aria-hidden', 'false');
  els.sheetBody.innerHTML = `<p class="muted small">입구 위치는 안내용입니다. 파크 경계는 안내용 시각 표시입니다.</p>
    <ul class="poi-list">${ents.map((e) => `
      <li>
        <button class="li" data-poi="${ui.esc(e.id)}" type="button">
          <span class="li-mark li-entrance" aria-hidden="true">入</span>
          <span class="li-body">
            <span class="li-name">${ui.esc(e.nameKo)}</span>
            <span class="li-meta">${e.entranceKind === 'main_entrance' ? '메인 입구' : e.entranceKind === 'pre_gate' ? '입구 앞 프리게이트' : '스테이션 진입 방향'}</span>
          </span>
        </button>
      </li>`).join('')}</ul>
    <div class="detail-actions">
      <button class="btn btn-primary" data-act="focus-main-entrance" type="button">파크 정문으로 이동</button>
    </div>`;
  syncNav();
}

// Korean label layer: sources (per park) + options (per selection/fav/setting).
function syncLabelSources() {
  const meta = parkMeta();
  map.setLabelSources({
    parkMeta: meta,
    areas: meta.areas,
    attractions: getAllAttractions(state.park),
    facilities: getFacilities(state.park),
    landmark: LANDMARK_ATTRACTIONS,
  });
}
function syncLabelOptions() {
  map.setLabelOptions({
    selectedId: state.selectedId,
    favIds: new Set(store.getFavorites()),
    visitIds: new Set(store.getVisitList()),
    nextVisitId: nextVisitId(),
    directionId: state.directionId,
    mapLabelMode: store.getSettings().mapLabelMode || 'ko',
    category: mapCategory(),
  });
}

function chip(id, label, active) {
  return `<button class="chip ${active ? 'chip-on' : ''}" data-filter="${id}" type="button" aria-pressed="${!!active}">${ui.esc(label)}</button>`;
}

function familyQuickBar(f) {
  const children = store.getChildren();
  const c0 = children[0];
  const c1 = children[1];
  const bothLabel = children.length >= 2 ? '두 아이 모두 탑승 가능' : '모두 탑승 가능';
  const indoorOn = !!(f.indoor && f.height === 'all-children');
  return `<div class="family-quick" role="group" aria-label="가족 빠른 보기">
    <div class="family-quick-title">가족 빠른 보기</div>
    <div class="chips">
      <button class="chip ${f.height === 'all-children' && !f.indoor ? 'chip-on' : ''}" data-family-quick="all-children" type="button">${ui.esc(bothLabel)}</button>
      ${c0 ? `<button class="chip ${f.height === 'child:0' ? 'chip-on' : ''}" data-family-quick="child:0" type="button">${ui.esc(c0.name)} 탑승 가능</button>` : ''}
      ${c1 ? `<button class="chip ${f.height === 'child:1' ? 'chip-on' : ''}" data-family-quick="child:1" type="button">${ui.esc(c1.name)} 탑승 가능</button>` : ''}
      <button class="chip ${f.height === 'none' ? 'chip-on' : ''}" data-family-quick="none" type="button">키 제한 없음</button>
      <button class="chip ${indoorOn ? 'chip-on' : ''}" data-family-quick="indoor" type="button">실내 위주</button>
      <button class="chip ${f.kid ? 'chip-on' : ''}" data-family-quick="kid" type="button">어린이 추천</button>
      <button class="chip ${f.excludeClosed ? 'chip-on' : ''}" data-family-quick="excludeClosed" type="button">방문일 휴장 제외</button>
      <button class="chip" data-family-quick="reset" type="button">필터 초기화</button>
    </div>
    ${indoorOn ? '<p class="muted small indoor-note">실내로 분류된 어트랙션입니다. 실제 대기 장소와 온도는 현장에서 확인해 주세요.</p>' : ''}
  </div>`;
}

function attractionFilterBar(f) {
  const children = store.getChildren();
  const childChips = children.map((c, i) => chip(`h-child:${i}`, `${ui.esc(c.name)} 탑승 가능`, f.height === `child:${i}`)).join('');
  return `<div class="chips" role="group" aria-label="어트랙션 필터">
    ${chip('h-none', '키 제한 없음', f.height === 'none')}
    ${chip('h-81', '81cm 이하 이용 가능', f.height === '81')}
    ${chip('h-90', '90cm 이상', f.height === '90')}
    ${chip('h-102', '102cm 이상', f.height === '102')}
    ${chip('h-117', '117cm 이상', f.height === '117')}
    ${childChips}
    ${chip('h-all-children', '두 아이 모두 탑승 가능', f.height === 'all-children')}
    ${chip('h-unverified', '공식 기준 미확인', f.height === 'unverified')}
    ${chip('kid', '어린이 추천', f.kid)}
    ${chip('thrill', '스릴 있음', f.thrill)}
    ${chip('indoor', '실내', f.indoor)}
    ${chip('outdoor', '야외', f.outdoor)}
    ${chip('rainy', '비 오는 날', f.rainy)}
    ${chip('favorites', '즐겨찾기', f.favorites)}
    ${chip('nearest', '가까운 순', f.nearest)}
    ${chip('excludeClosed', '방문일 휴장 제외', f.excludeClosed)}
  </div>`;
}

function facilityFilterBar(f) {
  const inGate = f.inGateOnly !== false; // default: paid area only
  return `<div class="chips" role="group" aria-label="화장실 필터">
    ${chip('nearest', '가까운 순', f.nearest)}
    ${chip('generalOnly', '일반화장실', f.generalOnly)}
    ${chip('accessible', '다기능화장실', f.accessible)}
    ${chip('babyCare', '베이비케어·수유실', f.babyCare)}
    ${chip('inGateOnly', '파크 안쪽만', inGate)}
    ${chip('includePregate', '입구 밖 포함', includePregate())}
    ${chip('includeEstimated', '낮은 신뢰도 위치 포함', includeLowTrust())}
    ${chip('highOnly', 'High 신뢰도만', f.highOnly)}
  </div>`;
}

function facilityCountSummary() {
  const restroomsAll = getFacilities(state.park).filter((f) => f.type === 'restroom');
  const babyAll = getFacilities(state.park).filter((f) => f.type === 'babyCare');
  const aidAll = getFacilities(state.park).filter((f) => f.type === 'firstAid' || f.type === 'emergencyFacility');
  const restroomsKnown = restroomsAll.filter((f) => f.coordinateStatus !== 'unknown');
  const restroomsUnknown = restroomsAll.filter((f) => f.coordinateStatus === 'unknown');
  const shownRestrooms = visibleFacilities({ restroomTabOnly: true }).filter((f) => f.type === 'restroom');
  const shownBaby = visibleFacilities({ restroomTabOnly: true }).filter((f) => f.type === 'babyCare');
  const bands = facilityBandCounts(restroomsKnown);
  const pdfConfirmed = restroomsAll.filter((f) => f.pdfVerified).length;
  const guestDenom = restroomsAll.filter((f) => f.generalGuestAccessible !== false).length;
  const hotelOnly = restroomsAll.filter((f) => f.hotelOnly || f.generalGuestAccessible === false).length;
  return `<div class="facility-count notice">
      <p><strong>공식 지도 확인 화장실 ${pdfConfirmed}곳</strong> · 데이터 등록 ${restroomsAll.length}곳</p>
      <p class="small">현재 지도 표시 ${shownRestrooms.length}곳 · 위치 확인 중 ${restroomsUnknown.length}곳</p>
      <p class="small">일반 게스트용 ${guestDenom}곳 · 호텔·전용 ${hotelOnly}곳 (화장실 수에 중앙구호실·베이비케어 미포함)</p>
      <p class="small">베이비케어·수유실 ${babyAll.length}곳 · 응급시설 ${aidAll.length}곳 — 화장실 탭 개수에서 제외</p>
      <p class="small muted">표시 중 베이비케어 ${shownBaby.length}곳 · High ${bands.high} · Medium ${bands.medium} · Low ${bands.low}${includePregate() ? '' : ' · 입구 밖 기본 숨김'}</p>
    </div>`;
}

function getFilters() {
  const all = store.getFilters();
  return {
    attraction: all.attraction || { height: null },
    facility: store.getFacilityFilters(state.park),
  };
}
function setAttractionFilters(af) {
  const all = store.getFilters();
  all.attraction = af;
  store.setFilters(all);
}
function setFacilityFilters(ff) {
  store.setFacilityFilters(state.park, ff);
}

function listCtx() {
  return { isFavorite: (id) => store.isFavorite(id) };
}

function closedVisitBadge(closure) {
  return closure ? '<span class="badge badge-closed">방문일 휴장</span>' : '';
}

function filterCtx() {
  return { isFavorite: (id) => store.isFavorite(id), children: store.getChildren() };
}

function listOpts() {
  return {
    isFav: (id) => store.isFavorite(id),
    isDone: (id) => store.isDone(id),
    children: store.getChildren(),
    showFamilyBadge: !!store.getSettings().showFamilyRideBadge,
  };
}

function renderAttractions() {
  const f = getFilters().attraction;
  const vd = store.getVisitDate();
  let items = getAttractions(state.park).filter((p) => matchText(p, state.query)
    && attractionMatchesFilters(p, f, filterCtx())
    && attractionPassesFamilyExtras(p, f, vd));
  items = withDistance(items, state.user && state.user.coords);
  if (f.nearest) items = sortByDistance(items);
  items = annotateClosure(items);
  els.sheetTitle.textContent = `어트랙션 (${items.length})`;
  els.sheetBody.innerHTML = familyQuickBar(f) + attractionFilterBar(f) + ui.listHtml(items, {
    ...listOpts(),
    emptyMsg: '조건에 맞는 어트랙션이 없습니다.',
  });
}

function renderRestrooms() {
  const f = { ...getFilters().facility };
  // Default: park inside only (unless user turned the chip off).
  if (f.inGateOnly == null) f.inGateOnly = true;
  let items = visibleFacilities({ restroomTabOnly: true })
    .filter((p) => matchText(p, state.query) && facilityMatchesFilters(p, f));
  // Unknown restrooms: list-only with “위치 확인 중”
  const unknown = getFacilities(state.park)
    .filter((p) => p.type === 'restroom' && p.coordinateStatus === 'unknown')
    .filter((p) => matchText(p, state.query) && facilityMatchesFilters(p, { ...f, inGateOnly: false }));
  items = withDistance(items, state.user && state.user.coords);
  if (f.nearest) items = sortByDistance(items);
  const wc = items.filter((p) => p.type === 'restroom').length;
  const baby = items.filter((p) => p.type === 'babyCare').length;
  const resultCount = items.length;
  els.sheetTitle.textContent = `화장실 (${wc}) · 베이비케어 (${baby})`;
  let body = '';
  if (f.highOnly) {
    body += `<div class="filter-status notice" role="status">High 신뢰도만 보기 적용 중 · 결과 ${resultCount}곳</div>`;
  }
  body += facilityCountSummary() + facilityFilterBar(f);
  body += `<div class="notice"><p>중앙구호실·AED는 화장실이 아니어서 이 목록에 넣지 않습니다. 지도 탭에서 확인할 수 있어요.</p></div>`;
  const tdsHighOnlyEmpty = state.park === 'TDS' && f.highOnly && resultCount === 0;
  if (tdsHighOnlyEmpty) {
    body += `<div class="notice facility-empty-guidance" role="status">
      <p>도쿄디즈니씨 화장실은 현재 High 등급으로 검증된 좌표가 없습니다. 공식 지도 기반 추정 위치를 표시하려면 기본 위치 표시를 선택해 주세요.</p>
      <div class="detail-actions">
        <button class="btn btn-primary" data-act="facility-default-trust" type="button">기본 위치 표시</button>
        <button class="btn" data-act="facility-keep-filter" type="button">필터 유지</button>
      </div>
    </div>`;
  } else {
    body += ui.listHtml(items, {
      ...listOpts(),
      emptyMsg: '표시할 화장실·베이비케어가 없습니다. 필터를 조정해 보세요.',
    });
  }
  if (unknown.length) {
    body += `<h3 class="sheet-h3">위치 확인 중 (${unknown.length})</h3>`;
    body += ui.listHtml(unknown.map((p) => ({ ...p, nameNote: (p.nameNote ? `${p.nameNote} · ` : '') + '좌표 확인 중' })), {
      ...listOpts(),
      emptyMsg: '',
    });
  }
  els.sheetBody.innerHTML = body;
}

const PRIORITY_LABEL = { must: '꼭 가기', maybe: '가능하면', hold: '보류' };
const PRIORITY_ORDER = { must: 0, maybe: 1, hold: 2 };

function sortedVisitItems(visitItems) {
  const children = store.getChildren();
  const mode = state.visitSort;
  const indexed = visitItems.map((p, i) => ({ p, i }));
  if (mode === 'manual') return indexed.map((x) => x.p);
  indexed.sort((a, b) => {
    if (mode === 'must') {
      const pa = PRIORITY_ORDER[store.getVisitPriority(a.p.id)] ?? 1;
      const pb = PRIORITY_ORDER[store.getVisitPriority(b.p.id)] ?? 1;
      if (pa !== pb) return pa - pb;
    } else if (mode === 'undone') {
      const da = store.isDone(a.p.id) ? 1 : 0;
      const db = store.isDone(b.p.id) ? 1 : 0;
      if (da !== db) return da - db;
    } else if (mode === 'bothOk') {
      const sa = a.p.type === 'attraction' ? (familyRideSummary(a.p, children).okCount ?? -1) : -1;
      const sb = b.p.type === 'attraction' ? (familyRideSummary(b.p, children).okCount ?? -1) : -1;
      if (sa !== sb) return sb - sa;
    }
    return a.i - b.i;
  });
  return indexed.map((x) => x.p);
}

function sharePanelHtml() {
  return `<div class="share-panel">
    <h3 class="sheet-h3">가족에게 공유</h3>
    <p class="muted small">현재 계획의 사본을 공유합니다. 이후 변경사항은 자동으로 동기화되지 않습니다. 현재 위치(GPS)는 포함되지 않습니다.</p>
    <div class="detail-actions">
      <button class="btn btn-primary" data-act="share-link" type="button">공유 링크 만들기</button>
      <button class="btn" data-act="share-qr" type="button">QR 코드 표시</button>
      <button class="btn" data-act="share-export" type="button">JSON 내보내기</button>
      <button class="btn" data-act="share-import-file" type="button">JSON 가져오기</button>
    </div>
    <input id="share-file" type="file" accept="application/json,.json" hidden />
    <div id="share-result" class="share-result" hidden></div>
  </div>`;
}

function renderFavorites() {
  const favIds = store.getFavorites();
  const all = [...getPois(state.park), ...getEntrances(state.park)];
  let favs = all.filter((p) => favIds.includes(p.id));
  favs = annotateClosure(withDistance(favs, state.user && state.user.coords));
  const vd = store.getVisitDate();
  const visitIds = store.getVisitList();
  const visitItemsRaw = visitIds.map((id) => getPoiById(state.park, id)).filter(Boolean);
  const visitItems = sortedVisitItems(visitItemsRaw);
  const sort = state.visitSort;

  els.sheetTitle.textContent = '즐겨찾기 · 방문 목록';
  let body = `<h3 class="sheet-h3">즐겨찾기</h3>`;
  if (!favs.length) {
    body += `<div class="notice">
      <p>아직 즐겨찾기한 장소가 없어요.<br/>어트랙션이나 시설 상세에서 별을 눌러 추가할 수 있어요.</p>
      <button class="btn btn-primary" data-act="open-attractions" type="button">어트랙션 보기</button>
    </div>`;
  } else {
    body += ui.listHtml(favs, {
      ...listOpts(),
      isFav: () => true,
      emptyMsg: '아직 즐겨찾기한 장소가 없어요.',
    });
  }

  body += `<h3 class="sheet-h3">내 방문 목록</h3>`;
  body += `<div class="chips" role="group" aria-label="방문 목록 정렬">
    <button class="chip ${sort === 'manual' ? 'chip-on' : ''}" data-visit-sort="manual" type="button">내가 정한 순서</button>
    <button class="chip ${sort === 'must' ? 'chip-on' : ''}" data-visit-sort="must" type="button">꼭 가기 먼저</button>
    <button class="chip ${sort === 'undone' ? 'chip-on' : ''}" data-visit-sort="undone" type="button">미완료 먼저</button>
    <button class="chip ${sort === 'bothOk' ? 'chip-on' : ''}" data-visit-sort="bothOk" type="button">두 아이 모두 가능한 곳 먼저</button>
  </div>`;
  body += `<p class="muted small">정렬 보기는 화면 표시만 바꿉니다. 저장 순서는 위·아래 버튼으로 유지됩니다.</p>`;
  if (!visitItems.length) {
    body += ui.emptyState('방문할 곳을 상세 화면에서 "내 방문 목록"으로 추가해 보세요.');
  } else {
    body += `<ol class="visit-list">${visitItems.map((p) => {
      const done = store.isDone(p.id);
      const pr = store.getVisitPriority(p.id);
      const closedLong = p.operatingStatus === 'closed_longterm';
      const closedVisit = p.type === 'attraction' && closureOnDate(p, vd);
      const cbadge = closedLong ? '<span class="badge badge-closed">운영 종료</span>' : (closedVisitBadge(closedVisit));
      const idx = visitIds.indexOf(p.id);
      return `<li class="visit-row ${done ? 'is-done' : ''}">
        <button class="vbtn" data-poi="${ui.esc(p.id)}" type="button">
          <span class="prio-badge prio-${ui.esc(pr)}">[${ui.esc(PRIORITY_LABEL[pr])}]</span>
          ${ui.esc(p.nameKo || p.name)} ${cbadge}
        </button>
        <span class="visit-ctrls">
          <select class="prio-select" data-visit-prio="${ui.esc(p.id)}" aria-label="우선순위">
            <option value="must" ${pr === 'must' ? 'selected' : ''}>꼭 가기</option>
            <option value="maybe" ${pr === 'maybe' ? 'selected' : ''}>가능하면</option>
            <option value="hold" ${pr === 'hold' ? 'selected' : ''}>보류</option>
          </select>
          <button class="iconbtn" data-visit-up="${ui.esc(p.id)}" type="button" aria-label="위로" ${idx === 0 ? 'disabled' : ''}>\u2191</button>
          <button class="iconbtn" data-visit-down="${ui.esc(p.id)}" type="button" aria-label="아래로" ${idx === visitIds.length - 1 ? 'disabled' : ''}>\u2193</button>
          <button class="iconbtn ${done ? 'on' : ''}" data-visit-done="${ui.esc(p.id)}" type="button" aria-label="완료 표시" aria-pressed="${done}">\u2713</button>
          <button class="iconbtn" data-visit-remove="${ui.esc(p.id)}" type="button" aria-label="목록에서 제거">\u2715</button>
        </span>
      </li>`;
    }).join('')}</ol>
    <p class="muted small">검증된 실제 보행경로가 없어 자동 동선은 제공하지 않습니다. 순서는 직접 정한 순서입니다.</p>`;
  }
  body += sharePanelHtml();
  if (state.pendingShare) body += pendingShareHtml(state.pendingShare);
  els.sheetBody.innerHTML = body;
}

function pendingShareHtml(share) {
  return `<div class="notice share-import-prompt" role="dialog" aria-label="공유 계획 가져오기">
    <p><strong>공유된 방문 계획을 받았습니다.</strong></p>
    <p class="small">파크 ${ui.esc(share.park)} · 방문일 ${ui.esc(share.visitDate || '—')} · 방문 ${share.visitList.length}곳 · 즐겨찾기 ${share.favorites.length}곳</p>
    <p class="muted small">현재 계획의 사본입니다. 이후 변경사항은 자동으로 동기화되지 않습니다.</p>
    <div class="detail-actions">
      <button class="btn btn-primary" data-act="share-merge" type="button">현재 계획에 추가</button>
      <button class="btn" data-act="share-replace" type="button">현재 계획을 교체</button>
      <button class="btn" data-act="share-cancel" type="button">취소</button>
    </div>
  </div>`;
}

function renderSettings() {
  const children = store.getChildren();
  const s = store.getSettings();
  els.sheetTitle.textContent = '설정';
  const childRows = children.map((c, i) => `
    <div class="child-row">
      <input class="inp" data-child-name="${i}" value="${ui.esc(c.name)}" aria-label="아이 이름" maxlength="10" />
      <input class="inp inp-num" data-child-height="${i}" type="number" inputmode="numeric" min="50" max="200" value="${ui.esc(c.height)}" aria-label="키(cm)" /> cm
      <button class="iconbtn" data-child-remove="${i}" type="button" aria-label="삭제">\u2715</button>
    </div>`).join('');
  els.sheetBody.innerHTML = `
    <h3 class="sheet-h3">아이 키 프로필</h3>
    <div class="child-editor">${childRows}</div>
    <button class="btn" id="child-add" type="button">+ 아이 추가</button>
    <button class="btn btn-primary" id="child-save" type="button">저장</button>

    <h3 class="sheet-h3">방문 예정일</h3>
    <div class="child-row">
      <input class="inp" id="set-visitdate" type="date" value="${ui.esc(store.getVisitDate())}" aria-label="방문 예정일" />
    </div>
    <p class="muted small">이 날짜에 <strong>공식 사전 발표 휴장</strong>과 겹치는 어트랙션에 경고를 표시합니다. 실시간 운휴는 공식 앱에서 확인하세요.</p>

    <h3 class="sheet-h3">가족 집결지 (${state.park})</h3>
    ${meetupSettingsHtml()}

    <h3 class="sheet-h3">입구·경계 표시</h3>
      <p class="muted small">기본 지도는 메인 입구만 표시합니다. 「근처」시트에서 메인 입구·입구 주변 안내를 켤 수 있습니다. 게이트선은 확대 18 이상에서만 보입니다. 파크 경계는 기본 숨김이며, 켜도 확대 15–16에서만 잠깐 보입니다.</p>
    <label class="switch-row">
      <input type="checkbox" id="set-entrance-markers" ${s.showEntranceMarkers !== false ? 'checked' : ''} />
      <span>입구 표시</span>
    </label>
    <label class="switch-row">
      <input type="checkbox" id="set-park-boundaries" ${s.showParkBoundaries === true ? 'checked' : ''} />
      <span>파크 경계 표시 (확대 15–16만)</span>
    </label>
    <label class="switch-row">
      <input type="checkbox" id="set-pregate-boundary" ${s.showPregateBoundary !== false ? 'checked' : ''} />
      <span>입구 모드에서 게이트선·화살표</span>
    </label>
    <label class="switch-row">
      <input type="checkbox" id="set-boundary-labels" ${s.showBoundaryLabels === true ? 'checked' : ''} />
      <span>경계 라벨 표시</span>
    </label>

    <h3 class="sheet-h3">지도 표시</h3>
    <p class="muted small"><strong>기본 지도</strong>는 현재 위치·메인 입구·집결지·선택 시설·방문 순서 마커만 표시합니다. 어트랙션·화장실은 하단 탭으로 켜세요.</p>
    <label class="switch-row">
      <input type="checkbox" id="set-family-badge" ${s.showFamilyRideBadge !== false ? 'checked' : ''} />
      <span>가족 탑승 배지 표시</span>
    </label>
    <p class="muted small">목록·상세·선택한 마커에만 2/2 · 1/2 · 0/2 배지를 표시합니다.</p>
    <label class="switch-row">
      <input type="checkbox" id="set-estimated" ${s.includeEstimated ? 'checked' : ''} />
      <span>낮은 신뢰도 위치까지 표시</span>
    </label>
    <p class="muted small">켜면 Low(대략적인 위치)도 지도·목록에 포함됩니다. TDL의 Medium 추정(있을 경우)도 함께 표시됩니다.</p>
    <label class="switch-row">
      <input type="checkbox" id="set-pregate" ${s.includePregate ? 'checked' : ''} />
      <span>입구 밖 화장실 포함</span>
    </label>
    <p class="muted small">스테이션·버스터미널·택시터미널·프리게이트 광장 화장실을 표시합니다. 호텔 전용 시설은 기본 숨김입니다.</p>
    <button class="btn" id="map-reset" type="button">지도 초기화</button>
    <p class="muted small">선택한 파크 전체가 보기 좋은 범위로 돌아옵니다. 경로·선택도 함께 지워집니다.</p>

    <h3 class="sheet-h3">지도 라벨</h3>
    <p class="muted small">벡터 배경의 식당·상점·건물·도로 등 상세 정보는 유지하고, 이름은 선택한 언어 우선순위로 표시합니다. 어트랙션·화장실은 앱 마커가 우선입니다.</p>
    <div class="chips">
      ${[
        ['ko', '한국어 우선'],
        ['ko_ja', '한국어 + 일본어'],
        ['ja', '일본어 원문'],
      ].map(([v, label]) => `<button class="chip ${(s.mapLabelMode || 'ko') === v ? 'chip-on' : ''}" data-map-label="${v}" type="button">${label}</button>`).join('')}
    </div>
    <p class="muted small">기본값은 <strong>한국어 우선</strong>입니다. 일본어 원문 데이터는 삭제되지 않으며, 상세 카드나 「한국어 + 일본어」 모드에서 확인할 수 있어요.</p>

    <h3 class="sheet-h3">테마</h3>
    <div class="chips">
      ${['auto', 'light', 'dark'].map((t) => `<button class="chip ${s.theme === t ? 'chip-on' : ''}" data-theme="${t}" type="button">${t === 'auto' ? '자동' : t === 'light' ? '밝게' : '어둡게'}</button>`).join('')}
    </div>

    <h3 class="sheet-h3">오프라인 사용 안내</h3>
    <div class="notice">
      <p>앱 셸·데이터는 오프라인에서도 동작합니다. 벡터 배경(PMTiles)은 Range 요청으로 구간만 받으며 Service Worker에 전체 파일을 미리 넣지 않습니다. 배경 로딩에 실패하면 단색 배경과 앱 마커·목록으로 계속할 수 있습니다.</p>
    </div>

    <h3 class="sheet-h3">데이터 현황</h3>
    <div class="notice">
      <p><strong>TDL</strong> 공식 PDF 노란 화장실 아이콘 29곳 = 데이터 29곳(유료 20·프리게이트 8·호텔 1). Unknown 좌표 포함. 베이비케어·중앙구호실은 화장실 수에서 제외.</p>
      <p><strong>TDS</strong> 공식 PDF 노란 화장실 아이콘 20곳 = 데이터 20곳(유료 15·프리게이트 4·호텔 1). 베이비케어·중앙구호실은 화장실 수에서 제외. 기본은 Medium 이상, Low·입구 밖은 필터로 켭니다.</p>
      <p><strong>키 기준</strong> 공식 FAQ(2026-08-01) 기준으로 운영 어트랙션 전수 반영. 레이징 스피리츠는 117~195cm.</p>
      <p><strong>보행 경로</strong> 상세 보행 경로는 검증 중입니다. 현재는 목적지 방향과 직선거리만 안내합니다. 현재 위치가 없거나 파크 밖이면 정문·지도에서 출발점을 고를 수 있습니다.</p>
      <p><strong>운영 종료·장기 휴장</strong> 스페이스 마운틴·버즈 라이트이어(TDL), 머메이드 라군 시어터(TDS)는 기본 목록·지도에서 제외했습니다.</p>
      <p class="small">모든 좌표는 실측 GPS가 아니며 참고용입니다. 실시간 대기시간·운영 여부는 공식 앱에서 확인하세요.</p>
    </div>`;
}

function meetupSettingsHtml() {
  const m = store.getMeetup(state.park);
  const mainEnt = getMainEntrance(state.park);
  const quickEntrance = mainEnt
    ? `<button class="btn" data-act="meetup-set-poi" data-poi="${ui.esc(mainEnt.id)}" type="button">${ui.esc(mainEnt.nameKo)}를 집결지로</button>`
    : `<button class="btn" data-act="meetup-entrance" type="button">파크 정문을 집결지로</button>`;
  if (!m) {
    return `<p class="muted small">가족이 흩어질 때 만날 곳을 저장해 두세요. TDL·TDS는 각각 따로 저장됩니다.</p>
      <div class="detail-actions">
        ${quickEntrance}
        <button class="btn" data-act="meetup-from-selected" type="button">현재 선택 시설을 집결지로</button>
        <button class="btn" data-act="meetup-pick-map" type="button">사용자 지정 위치</button>
        <button class="btn" data-act="meetup-entrance" type="button">파크 정문 좌표로 지정</button>
      </div>`;
  }
  return `<div class="notice">
      <p><strong>${ui.esc(m.label || '가족 집결지')}</strong></p>
      ${m.note ? `<p class="small">${ui.esc(m.note)}</p>` : ''}
      <p class="muted small">저장: ${ui.esc(m.savedAt ? new Date(m.savedAt).toLocaleString('ko-KR') : '—')}</p>
      <label class="child-row" style="margin-top:8px">
        <input class="inp" id="meetup-note" value="${ui.esc(m.note || '')}" placeholder="메모 (예: 길이 잃으면 여기서 만나기)" aria-label="집결지 메모" />
      </label>
      <div class="detail-actions">
        <button class="btn btn-primary" data-act="meetup-view" type="button">집결지 보기</button>
        <button class="btn" data-act="meetup-direction" type="button">방향 보기</button>
        <button class="btn" data-act="meetup-note-save" type="button">메모 저장</button>
        <button class="btn" data-act="meetup-pick-map" type="button">집결지 변경</button>
        <button class="btn" data-act="meetup-clear" type="button">집결지 삭제</button>
      </div>
    </div>`;
}

function renderDetail(id) {
  const poi = getPoiById(state.park, id);
  if (!poi) { openTab(state.prevTab); return; }
  const withArea = getPois(state.park).find((p) => p.id === id) || poi;
  els.sheetTitle.textContent = withArea.nameKo || withArea.name;
  const routeInfo = (state.routeId === id && state.routeInfo) ? state.routeInfo : null;
  const graph = WALK_GRAPHS[state.park];
  const fromGuess = routeStartCoords() || parkMeta().entranceCoordinates;
  const canWalkRoute = withArea.type === 'entrance' ? false : canOfferWalkRoute(graph, withArea, fromGuess, {
    maxBounds: parkMeta().maxBounds,
    entranceCoords: parkMeta().entranceCoordinates,
  });
  const common = {
    isFav: store.isFavorite(id),
    inVisit: store.inVisitList(id),
    distance: distanceTo(withArea),
    userCoords: state.user && state.user.coords,
    // Avoid duplicating the direction card when routeInfo already shows direction.
    direction: (routeInfo && (routeInfo.mode === 'direction' || routeInfo.mode === 'need-origin' || routeInfo.mode === 'outside-park'))
      ? null
      : directionFor(withArea),
    routeInfo,
    canWalkRoute,
    showFamilyBadge: !!store.getSettings().showFamilyRideBadge,
  };
  let html;
  if (withArea.type === 'entrance') {
    html = ui.entranceDetail(withArea, { parkName: parkMeta().nameKo, ...common });
  } else if (withArea.type === 'attraction') {
    html = ui.attractionDetail(withArea, { children: store.getChildren(), visitDate: store.getVisitDate(), ...common });
    html += `<div class="detail-actions">
      <button class="btn" data-act="meetup-set-poi" data-poi="${ui.esc(id)}" type="button">이 시설을 가족 집결지로</button>
    </div>`;
  } else {
    html = ui.facilityDetail(withArea, common);
    html += `<div class="detail-actions">
      <button class="btn" data-act="meetup-set-poi" data-poi="${ui.esc(id)}" type="button">이 시설을 가족 집결지로</button>
    </div>`;
  }
  els.sheetBody.innerHTML = html;
}

function nearbyReferencePoint() {
  if (state.user && state.user.coords && isInsidePark(state.user.coords)) {
    return { from: state.user.coords, mode: 'user', label: '현재 위치' };
  }
  if (state.user && state.user.coords && !isInsidePark(state.user.coords)) {
    return { from: null, mode: 'outside', label: '파크 밖' };
  }
  return { from: null, mode: 'noloc', label: null };
}

function nearbyDistLabel(from, coords) {
  if (!from || !coords) return '거리 없음';
  return `직선 ${formatDistance(haversineMeters(from, coords))}`;
}

function nearbyQuickRow({
  title, meta, mapAct, mapPoi, directionPoi, disabledNote,
}) {
  const actions = [];
  if (mapAct || mapPoi) {
    const attrs = mapAct
      ? `data-act="${ui.esc(mapAct)}"${mapPoi ? ` data-poi="${ui.esc(mapPoi)}"` : ''}`
      : `data-poi="${ui.esc(mapPoi)}"`;
    actions.push(`<button class="btn btn-primary" ${attrs} type="button">지도에서 보기</button>`);
  }
  if (directionPoi) {
    actions.push(`<button class="btn" data-act="direction" data-poi="${ui.esc(directionPoi)}" type="button">방향 보기</button>`);
  }
  return `<li class="nearby-item">
    <div class="nearby-main">
      <strong class="nearby-name">${ui.esc(title)}</strong>
      <span class="li-meta">${ui.esc(meta || '')}${disabledNote ? ` · ${ui.esc(disabledNote)}` : ''}</span>
    </div>
    ${actions.length ? `<div class="nearby-actions">${actions.join('')}</div>` : ''}
  </li>`;
}

function renderFamilyNearby() {
  state._nearbyFromEntrance = false;
  els.sheetTitle.textContent = '근처';
  const ref = nearbyReferencePoint();
  const from = ref.from;
  const entranceRef = parkMeta().entranceCoordinates;
  const distFrom = from || (ref.mode === 'outside' || ref.mode === 'noloc' ? null : entranceRef);

  let body = '';
  if (ref.mode === 'noloc') {
    body += `<div class="notice"><p>직선거리를 보려면 현재 위치가 필요합니다. 메인 입구·집결지는 위치 없이도 열 수 있어요.</p></div>`;
  } else if (ref.mode === 'outside') {
    body += `<div class="notice"><p>현재 위치가 파크 밖입니다. 긴 직선거리는 표시하지 않습니다.</p>
      <button class="btn" data-act="nearby-from-entrance" type="button">정문 기준으로 거리 보기</button></div>`;
  } else {
    body += `<p class="muted small">현재 위치 기준 직선거리입니다. 실제 이동거리는 다를 수 있어요.</p>`;
  }

  const restroom = from ? nearestFacility('restroom', from) : null;
  const firstAid = from ? nearestFacility('firstAid', from) : null;
  const baby = from ? nearestFacility('baby', from) : null;
  const main = getMainEntrance(state.park);
  const meetup = store.getMeetup(state.park);

  body += `<ul class="poi-list nearby-list">`;
  body += nearbyQuickRow({
    title: restroom ? (restroom.nameKo || '가장 가까운 화장실') : '가장 가까운 화장실',
    meta: restroom ? nearbyDistLabel(distFrom, restroom.coordinates) : (from ? '근처에 없음' : '위치 필요'),
    mapPoi: restroom?.id,
    directionPoi: restroom?.id,
    disabledNote: !restroom && from ? null : null,
  });
  body += nearbyQuickRow({
    title: firstAid ? (firstAid.nameKo || '가장 가까운 구호실') : '가장 가까운 구호실',
    meta: firstAid ? nearbyDistLabel(distFrom, firstAid.coordinates) : (from ? '근처에 없음' : '위치 필요'),
    mapPoi: firstAid?.id,
    directionPoi: firstAid?.id,
  });
  body += nearbyQuickRow({
    title: baby ? (baby.nameKo || '가장 가까운 수유실') : '가장 가까운 수유실',
    meta: baby ? nearbyDistLabel(distFrom, baby.coordinates) : (from ? '근처에 없음' : '위치 필요'),
    mapPoi: baby?.id,
    directionPoi: baby?.id,
  });
  body += nearbyQuickRow({
    title: main ? (main.nameKo || '메인 입구') : '메인 입구',
    meta: main ? nearbyDistLabel(from, main.coordinates) : '데이터 없음',
    mapAct: 'focus-main-entrance',
    mapPoi: main?.id,
    directionPoi: main?.id,
  });
  if (meetup && meetup.coordinates) {
    body += `<li class="nearby-item">
      <div class="nearby-main">
        <strong class="nearby-name">${ui.esc(meetup.label || '가족 집결지')}</strong>
        <span class="li-meta">${ui.esc(nearbyDistLabel(from, meetup.coordinates))}</span>
      </div>
      <div class="nearby-actions">
        <button class="btn btn-primary" data-act="meetup-view" type="button">지도에서 보기</button>
        <button class="btn" data-act="meetup-direction" type="button">방향 보기</button>
      </div>
    </li>`;
  } else {
    body += nearbyQuickRow({
      title: '가족 집결지',
      meta: '아직 저장되지 않음 · 설정에서 지정할 수 있어요',
      mapAct: 'meetup-view',
    });
  }
  body += `<li class="nearby-item">
    <div class="nearby-main">
      <strong class="nearby-name">현재 위치 다시 찾기</strong>
      <span class="li-meta">${ref.mode === 'user' ? '위치가 켜져 있습니다' : '위치 권한·GPS를 다시 요청합니다'}</span>
    </div>
    <div class="nearby-actions">
      <button class="btn btn-primary" data-act="request-location" type="button">현재 위치 다시 찾기</button>
    </div>
  </li>`;
  body += `</ul>`;

  body += `<div class="chips" role="group" aria-label="입구 안내">
    <button class="chip ${state.entranceDetail ? 'chip-on' : ''}" data-act="toggle-entrance-detail" type="button" aria-pressed="${state.entranceDetail ? 'true' : 'false'}">
      ${state.entranceDetail ? '입구 주변 안내 켜짐' : '입구 주변 안내'}
    </button>
  </div>
  <p class="muted small">입구 주변 안내를 켜면 프리게이트·스테이션 아이콘이 표시됩니다. 게이트선은 확대 18 이상에서만 보입니다.</p>`;

  // Keep restroom tab discoverable without duplicating the map FAB.
  body += `<div class="detail-actions">
    <button class="btn" data-act="open-restrooms" type="button">화장실 탭 열기</button>
  </div>`;

  els.sheetBody.innerHTML = body;
  syncNearbyFab();
}

function renderSearch() {
  const q = state.query;
  const cat = mapCategory();
  let atts = [];
  let facs = [];
  if (cat === 'attractions') {
    atts = getAllAttractions(state.park).filter((p) => matchText(p, q) && attractionMatchesFilters(p, getFilters().attraction, filterCtx()));
  } else if (cat === 'restrooms') {
    facs = visibleFacilities({ restroomTabOnly: true }).filter((p) => matchText(p, q) && facilityMatchesFilters(p, getFilters().facility));
  } else if (cat === 'favorites') {
    const fav = new Set(store.getFavorites());
    atts = getAllAttractions(state.park).filter((p) => fav.has(p.id) && matchText(p, q));
    facs = getFacilities(state.park).filter((p) => fav.has(p.id) && matchText(p, q));
  } else {
    atts = getAllAttractions(state.park).filter((p) => matchText(p, q) && attractionMatchesFilters(p, getFilters().attraction, filterCtx()));
    facs = visibleFacilities().filter((p) => matchText(p, q));
  }
  let items = withDistance([...atts, ...facs], state.user && state.user.coords);
  if (getFilters().attraction.nearest || getFilters().facility.nearest) items = sortByDistance(items);
  items = annotateClosure(items);
  els.sheetTitle.textContent = q ? `"${q}" 검색 결과 (${items.length})` : '검색';
  els.sheetBody.innerHTML = (q ? '' : `<p class="muted small">한국어·일본어·영어 이름, 구역, 시설 종류로 검색할 수 있어요.</p>`)
    + ui.listHtml(items, { ...listOpts(), emptyMsg: '검색 결과가 없습니다.' });
}

function renderFilter() {
  const f = getFilters();
  const forFacility = state.prevTab === 'restrooms';
  els.sheetTitle.textContent = '필터';
  els.sheetBody.innerHTML = `<p class="muted small">${forFacility ? '화장실·시설' : '어트랙션'} 필터</p>`
    + (forFacility ? facilityFilterBar(f.facility) : attractionFilterBar(f.attraction));
}

const RENDERERS = {
  attractions: renderAttractions,
  restrooms: renderRestrooms,
  favorites: renderFavorites,
  settings: renderSettings,
  search: renderSearch,
  filter: renderFilter,
  familyNearby: renderFamilyNearby,
};

function renderSheet() {
  const r = RENDERERS[state.tab];
  if (r) r();
  else if (state.tab === 'detail') renderDetail(state.selectedId);
}

// ---- navigation / sheet ----
function openSheetPanel(tab) {
  if (['attractions', 'restrooms', 'favorites', 'settings', 'familyNearby'].includes(tab)) state.prevTab = tab;
  state.tab = tab;
  els.sheet.classList.add('open');
  els.sheet.setAttribute('aria-hidden', 'false');
  renderSheet();
  syncNav();
}

function openTab(tab) {
  if (tab === 'map') {
    state.layerMode = 'map';
    closeSheet();
    return;
  }
  if (['attractions', 'restrooms', 'favorites'].includes(tab)) {
    state.layerMode = tab;
  }
  clearSelectionIfWrongCategory(mapCategory());
  openSheetPanel(tab);
  renderMap();
  syncLabelSources();
  syncLabelOptions();
  syncNav();
}

/** Close panel only — does not reset layerMode (X button / backdrop). */
function closeSheet() {
  els.sheet.classList.remove('open');
  els.sheet.setAttribute('aria-hidden', 'true');
  state.tab = 'map';
  // After closing detail, re-apply layer rules (none → hide selected app marker).
  if (state.layerMode === 'none') {
    state.selectedId = null;
    map.highlight(null);
  } else {
    clearSelectionIfWrongCategory(mapCategory());
  }
  renderMap();
  syncLabelOptions();
  syncNav();
}

/** Bottom category toggle: same tab while its list is open → back to sparse map. */
function toggleLayerTab(tab) {
  if (state.query) { state.query = ''; els.search.value = ''; }
  if (tab === 'map') {
    state.layerMode = 'map';
    closeSheet();
    renderMap();
    syncLabelOptions();
    syncNav();
    return;
  }
  if (tab === 'settings') {
    if (state.tab === 'settings') { closeSheet(); return; }
    openSheetPanel('settings');
    return;
  }
  // Second click on the open category → hide that layer and return to sparse map.
  if (state.layerMode === tab && state.tab === tab) {
    state.layerMode = 'map';
    closeSheet();
    renderMap();
    syncLabelOptions();
    syncNav();
    return;
  }
  state.layerMode = tab;
  clearSelectionIfWrongCategory(mapCategory());
  openSheetPanel(tab);
  renderMap();
  syncLabelSources();
  syncLabelOptions();
  syncNav();
}

function syncNav() {
  els.nav.querySelectorAll('button').forEach((b) => {
    const tab = b.dataset.tab;
    let on = false;
    if (tab === 'map') on = state.layerMode === 'map' || state.layerMode === 'none' || state.layerMode === 'all';
    else if (tab === 'attractions' || tab === 'restrooms' || tab === 'favorites') on = state.layerMode === tab;
    else if (tab === 'settings') on = state.tab === 'settings';
    b.classList.toggle('nav-on', on);
    if (on) b.setAttribute('aria-current', 'page');
    else b.removeAttribute('aria-current');
  });
  syncNearbyFab();
}

function selectPoi(id) {
  // Switching destination clears previous walk/direction overlays.
  if ((state.routeId && state.routeId !== id) || (state.directionId && state.directionId !== id)) {
    clearNavLines();
  }
  state.selectedId = id;
  const poi = getPoiById(state.park, id);
  if (poi && poi.coordinates) map.focusPoi(poi.coordinates, 17);
  // Re-render so selected marker gets name label + family badge; aux entrances expand label.
  renderMap();
  syncLabelOptions();
  state.tab = 'detail';
  els.sheet.classList.add('open');
  els.sheet.setAttribute('aria-hidden', 'false');
  renderDetail(id);
  syncNav();
}

// ---- park switch ----
function clearNavLines() {
  state.directionId = null;
  state.routeId = null;
  state.routeInfo = null;
  state.pendingDirectionId = null;
  state.pickingStart = false;
  state.startOrigin = null;
  state.manualStart = null;
  map.clearDirection();
  map.clearRoute();
  map.clearStartMarker();
  map.cancelPickStart();
  if (typeof map.clearRouteDebug === 'function') map.clearRouteDebug();
}

function setPark(p) {
  if (p === state.park) return;
  state.park = p;
  state.selectedId = null;
  state.outsideParkChoice = null;
  clearNavLines();
  store.setPark(p);
  els.parkToggle.querySelectorAll('button').forEach((b) => {
    const on = b.dataset.park === p;
    b.classList.toggle('on', on);
    b.setAttribute('aria-pressed', on ? 'true' : 'false');
  });
  map.setPark(parkMeta());
  // Keep layerMode; re-render same layer for the new park. Clear selection/direction.
  clearSelectionIfWrongCategory(mapCategory());
  renderMap();
  syncLabelSources();
  syncLabelOptions();
  if (state.tab === 'detail') {
    if (state.layerMode === 'attractions' || state.layerMode === 'restrooms' || state.layerMode === 'favorites') {
      openSheetPanel(state.layerMode);
    } else {
      closeSheet();
    }
  } else if (state.tab !== 'map') renderSheet();
  toast(`${PARKS[p].nameKo}로 전환했습니다`);
}

function resetMapView() {
  clearNavLines();
  state.selectedId = null;
  map.resetView(parkMeta());
  syncLabelOptions();
  toast('지도를 초기화했습니다');
}

function isInsidePark(coords) {
  if (!coords) return false;
  const meta = parkMeta();
  const [[s1, w1], [n1, e1]] = meta.bounds;
  return coords[0] >= s1 && coords[0] <= n1 && coords[1] >= w1 && coords[1] <= e1;
}

function routeStartCoords() {
  if (state.outsideParkChoice === 'entrance' && parkMeta().entranceCoordinates) {
    return parkMeta().entranceCoordinates;
  }
  if (state.user && state.user.coords && isInsidePark(state.user.coords)) {
    return state.user.coords;
  }
  if (state.user && state.user.coords && state.outsideParkChoice === 'entrance') {
    return parkMeta().entranceCoordinates;
  }
  return null;
}

// ---- direction / walk route ----
function applyDirection(id, from, originLabel) {
  const poi = getPoiById(state.park, id);
  if (!poi || !poi.coordinates || !from) return;
  const bearing = bearingDegrees(from, poi.coordinates);
  state.directionId = id;
  state.routeId = id;
  state.pendingDirectionId = null;
  state.routeInfo = {
    mode: 'direction',
    support: 'direction',
    poiId: id,
    distance: haversineMeters(from, poi.coordinates),
    bearingLabel: `${compass8(bearing)}쪽 방향 (${Math.round(bearing)}\u00B0)`,
    originLabel: originLabel || directionOriginLabel(),
    reason: VERIFYING_MSG,
  };
  map.clearRoute();
  map.clearRouteDebug();
  map.cancelPickStart();
  state.pickingStart = false;
  if (state.startOrigin === 'map' || state.startOrigin === 'entrance') {
    map.setStartMarker(from, originLabel || '출발점');
  } else {
    map.clearStartMarker();
  }
  map.showDirection(from, poi.coordinates);
  if (ROUTE_DEBUG) maybeShowLegacyDebug(poi, from);
  renderDetail(id);
  toast('방향·직선거리만 안내합니다');
}

function showNeedOrigin(id, reason, mode = 'need-origin') {
  const poi = getPoiById(state.park, id);
  if (!poi) return;
  state.directionId = null;
  state.routeId = id;
  state.routeInfo = {
    mode,
    support: 'need-origin',
    poiId: id,
    reason,
  };
  map.clearRoute();
  map.clearDirection();
  map.clearRouteDebug();
  renderDetail(id);
}

function showDirection(id) {
  const poi = getPoiById(state.park, id);
  if (!poi || !poi.coordinates) return;

  // Explicit origin already chosen
  if (state.startOrigin === 'entrance' && parkMeta().entranceCoordinates) {
    applyDirection(id, parkMeta().entranceCoordinates, '파크 정문');
    return;
  }
  if (state.startOrigin === 'map' && state.manualStart) {
    applyDirection(id, state.manualStart, '지도에서 선택한 출발점');
    return;
  }

  // GPS available and inside park
  if (state.user && state.user.coords && isInsidePark(state.user.coords)) {
    state.startOrigin = 'user';
    applyDirection(id, state.user.coords, '현재 위치');
    return;
  }

  // GPS available but outside park — never draw a long cross-city line
  if (state.user && state.user.coords && !isInsidePark(state.user.coords)) {
    map.clearDirection();
    showNeedOrigin(id, '현재 위치가 파크 밖에 있습니다.', 'outside-park');
    toast('현재 위치가 파크 밖에 있습니다.', 3500);
    return;
  }

  // No GPS yet — request permission, keep button usable, offer origin choices
  state.pendingDirectionId = id;
  showNeedOrigin(id, '방향 안내를 위해 현재 위치가 필요합니다.');
  toast('방향 안내를 위해 현재 위치가 필요합니다.', 3200);
  requestLocationForDirection(id);
}

function requestLocationForDirection(id) {
  const requestForId = id;
  setLocStatus('현재 위치를 확인하는 중…');
  requestPositionOnce()
    .then(({ coords, accuracy }) => {
      const first = !state.user;
      state.user = { coords, accuracy };
      map.setUserLocation(coords, accuracy);
      if (!state.locating) {
        // Keep a watch going so the blue dot stays fresh (same as loc button).
        ensureLocatorWatching();
      }

      // User already picked entrance/map — update GPS only, do not clobber that origin.
      if (state.startOrigin === 'entrance' || state.startOrigin === 'map') {
        const inside = isInsidePark(coords);
        setLocStatus(inside
          ? `현재 위치 확인됨 (정확도 약 ${Math.round(accuracy)}m)`
          : '현재 위치가 파크 밖에 있습니다.');
        renderMap();
        return;
      }

      const inside = isInsidePark(coords);
      if (!inside) {
        setLocStatus('현재 위치가 파크 밖에 있습니다.');
        const target = state.pendingDirectionId || requestForId;
        if (target && state.selectedId === target) {
          showNeedOrigin(target, '현재 위치가 파크 밖에 있습니다.', 'outside-park');
          toast('현재 위치가 파크 밖에 있습니다.', 3500);
        }
        return;
      }
      setLocStatus(`현재 위치 확인됨 (정확도 약 ${Math.round(accuracy)}m)`);
      if (first) map.centerOnUser(coords);
      const target = state.pendingDirectionId || requestForId;
      if (target && (state.pendingDirectionId === target || state.startOrigin == null || state.startOrigin === 'user')) {
        state.startOrigin = 'user';
        applyDirection(target, coords, '현재 위치');
      } else if (state.tab === 'detail' && state.selectedId) {
        renderDetail(state.selectedId);
      }
      renderMap();
    })
    .catch((err) => {
      const msg = (err && err.message) || '위치를 가져오지 못했습니다.';
      setLocStatus(msg);
      // Do not overwrite an origin the user already chose.
      if (state.startOrigin === 'entrance' || state.startOrigin === 'map') return;
      const target = state.pendingDirectionId || requestForId;
      if (target && state.selectedId === target) {
        showNeedOrigin(
          target,
          '위치 권한을 허용하거나 출발점을 선택해 주세요.',
          'need-origin',
        );
        toast('위치 권한을 허용하거나 출발점을 선택해 주세요.', 4000);
      }
    });
}

function ensureLocatorWatching() {
  if (state.locating && locator) return;
  state.locating = true;
  els.locBtn.classList.add('on');
  locator = createLocator({
    onStatus: (s) => setLocStatus(s),
    onError: (e) => {
      setLocStatus(e.message);
      state.locating = false;
      els.locBtn.classList.remove('on');
    },
    onPosition: ({ coords, accuracy }) => {
      state.user = { coords, accuracy };
      map.setUserLocation(coords, accuracy);
      let msg = `현재 위치 확인됨 (정확도 약 ${Math.round(accuracy)}m)`;
      if (accuracy > 60) msg += ' · 정확도가 낮습니다';
      if (!isInsidePark(coords)) {
        msg = '현재 위치가 파크 밖에 있습니다.';
        if (state.pendingDirectionId) {
          showNeedOrigin(state.pendingDirectionId, '현재 위치가 파크 밖에 있습니다.', 'outside-park');
        }
      }
      setLocStatus(msg);
      if (state.pendingDirectionId && isInsidePark(coords)) {
        state.startOrigin = 'user';
        applyDirection(state.pendingDirectionId, coords, '현재 위치');
      } else if (state.tab === 'detail' && state.selectedId) {
        renderDetail(state.selectedId);
      }
      renderMap();
    },
  });
  locator.start();
}

function useEntranceOrigin(id) {
  state.startOrigin = 'entrance';
  state.manualStart = null;
  state.outsideParkChoice = 'entrance';
  map.clearStartMarker();
  applyDirection(id, parkMeta().entranceCoordinates, '파크 정문');
}

function beginMapOriginPick(id) {
  state.pendingDirectionId = id;
  state.pickingStart = true;
  state.startOrigin = null;
  toast('지도에서 출발점을 탭하세요', 3500);
  setLocStatus('지도에서 출발점을 탭하세요');
  // Collapse sheet a bit so the map is usable on mobile
  map.beginPickStart((coords) => {
    if (!isInsidePark(coords)) {
      toast('파크 안에서 출발점을 선택해 주세요', 3500);
      state.pickingStart = false;
      if (state.selectedId) renderDetail(state.selectedId);
      return;
    }
    state.startOrigin = 'map';
    state.manualStart = coords;
    state.pickingStart = false;
    setLocStatus('지도에서 선택한 출발점 사용');
    applyDirection(id, coords, '지도에서 선택한 출발점');
  });
}

function showRoute(id) {
  const poi = getPoiById(state.park, id);
  if (!poi || !poi.coordinates) return;

  if (!state.user) {
    toast('현재 위치가 없습니다. 파크 입구부터 검증된 예상 경로를 봅니다.');
    state.outsideParkChoice = 'entrance';
  } else if (!isInsidePark(state.user.coords) && state.outsideParkChoice !== 'entrance') {
    const dist = haversineMeters(state.user.coords, poi.coordinates);
    state.routeInfo = {
      mode: 'direction',
      support: 'unsupported',
      distance: dist,
      reason: '현재 위치가 선택한 파크 밖에 있습니다. 아래에서 파크 입구 출발을 선택하거나 방향 보기를 이용해 주세요.',
    };
    state.routeId = id;
    map.clearRoute();
    map.clearDirection();
    map.clearRouteDebug();
    renderDetail(id);
    injectOutsideParkChoices(id);
    return;
  }

  const from = routeStartCoords() || parkMeta().entranceCoordinates;
  if (!from) { toast('출발 위치를 확인할 수 없습니다'); return; }

  const graph = WALK_GRAPHS[state.park];
  const result = routeToPoi(graph, from, poi, { maxBounds: parkMeta().maxBounds, requireVerified: true });
  state.directionId = null;
  state.routeId = id;
  if (result.ok) {
    state.routeInfo = {
      mode: 'walk',
      distance: result.distance,
      support: result.support,
      supportLabel: result.supportLabel,
      confidence: result.confidence,
      coverageNote: result.coverageNote,
    };
    map.showRoute(result.path);
    if (ROUTE_DEBUG) map.showRouteDebug(result.debug, { graph });
    else map.clearRouteDebug();
    toast(`${result.supportLabel} · ${formatDistance(result.distance)}`);
  } else {
    const dirFrom = state.user && isInsidePark(state.user.coords) ? state.user.coords : from;
    const dist = haversineMeters(dirFrom, poi.coordinates);
    state.routeInfo = {
      mode: 'direction',
      support: result.support || 'unsupported',
      distance: dist,
      reason: result.reason || UNVERIFIED_SEGMENT_MSG,
    };
    map.showDirection(dirFrom, poi.coordinates);
    if (ROUTE_DEBUG) {
      maybeShowLegacyDebug(poi, from);
      if (result.debug) map.showRouteDebug(result.debug, { graph });
    } else {
      map.clearRouteDebug();
    }
    toast('검증된 경로 없음 — 방향만 표시');
  }
  renderDetail(id);
}

function maybeShowLegacyDebug(poi, from) {
  if (!ROUTE_DEBUG || state.park !== 'TDL') return;
  const legacy = investigateRoute(TDL_LEGACY_WALK_GRAPH, from, poi, {
    maxBounds: parkMeta().maxBounds,
  });
  if (legacy.debug) {
    map.showRouteDebug(legacy.debug, { graph: TDL_LEGACY_WALK_GRAPH });
    console.info('[routeDebug] legacy path', legacy);
  }
}

function injectOutsideParkChoices(id) {
  // Direction-first outside-park UX is rendered via routeInfo (outside-park card).
  showNeedOrigin(id, '현재 위치가 파크 밖에 있습니다.', 'outside-park');
}

// ---- location ----
let locator = null;
function toggleLocation() {
  if (state.locating) {
    if (locator) locator.stop();
    state.locating = false;
    els.locBtn.classList.remove('on');
    setLocStatus('');
    return;
  }
  state.locating = true;
  els.locBtn.classList.add('on');
  locator = createLocator({
    onStatus: (s) => setLocStatus(s),
    onError: (e) => {
      setLocStatus(e.message);
      state.locating = false;
      els.locBtn.classList.remove('on');
      toast(e.message, 4000);
    },
    onPosition: ({ coords, accuracy }) => {
      const first = !state.user;
      state.user = { coords, accuracy };
      // Always update the blue dot if somehow in view, but never pan outside maxBounds.
      map.setUserLocation(coords, accuracy);
      let msg = `현재 위치 확인됨 (정확도 약 ${Math.round(accuracy)}m)`;
      if (accuracy > 60) msg += ' · 정확도가 낮습니다';
      const inside = isInsidePark(coords);
      if (!inside) {
        msg = '현재 위치가 파크 밖에 있습니다.';
        // Do not auto-pan the map to chase out-of-park GPS.
        if (state.pendingDirectionId) {
          showNeedOrigin(state.pendingDirectionId, '현재 위치가 파크 밖에 있습니다.', 'outside-park');
        }
      } else if (first) {
        map.centerOnUser(coords);
      }
      setLocStatus(msg);
      if (inside && state.pendingDirectionId) {
        state.startOrigin = 'user';
        applyDirection(state.pendingDirectionId, coords, '현재 위치');
      } else {
        renderMap();
        if (state.tab === 'detail' && state.selectedId) renderDetail(state.selectedId);
      }
    },
  });
  locator.start();
}

function setLocStatus(s) {
  els.locStatus.textContent = s || '';
  els.locStatus.classList.toggle('show', !!s);
}

// ---- filter toggles ----
function toggleAttractionFilter(key) {
  const f = getFilters().attraction;
  if (key.startsWith('h-')) {
    const val = key.slice(2); // none | 81 | 90 | child:0 | all-children | unverified ...
    f.height = f.height === val ? null : val;
  } else {
    f[key] = !f[key];
  }
  setAttractionFilters(f);
}

function applyFamilyQuickAction(action) {
  const next = applyFamilyQuick(getFilters().attraction, action, store.getChildren());
  if (action === 'excludeClosed') {
    const f = getFilters().attraction;
    f.excludeClosed = !f.excludeClosed;
    setAttractionFilters(f);
  } else if (action === 'kid') {
    const f = getFilters().attraction;
    f.kid = !f.kid;
    setAttractionFilters(f);
  } else {
    setAttractionFilters(next);
  }
  renderSheet();
  renderMap();
}

function saveMeetup(partial) {
  const prev = store.getMeetup(state.park) || {};
  const meetup = {
    park: state.park,
    coordinates: partial.coordinates,
    facilityId: partial.facilityId || null,
    label: partial.label || '가족 집결지',
    note: partial.note != null ? partial.note : (prev.note || ''),
    savedAt: new Date().toISOString(),
  };
  store.setMeetup(state.park, meetup);
  syncMeetupMarker();
  toast('가족 집결지를 저장했습니다');
}

function setMeetupFromPoi(id) {
  const poi = getPoiById(state.park, id);
  if (!poi || !poi.coordinates) { toast('좌표가 없어 집결지로 지정할 수 없습니다'); return; }
  saveMeetup({
    coordinates: poi.coordinates,
    facilityId: poi.id,
    label: poi.nameKo || poi.name || '가족 집결지',
  });
  if (state.tab === 'settings') renderSettings();
  else if (state.tab === 'detail') renderDetail(id);
}

function setMeetupFromSelected() {
  if (!state.selectedId) { toast('먼저 시설을 선택해 주세요'); return; }
  setMeetupFromPoi(state.selectedId);
}

function setMeetupEntrance() {
  const main = getMainEntrance(state.park);
  const c = (main && main.coordinates) || parkMeta().entranceCoordinates;
  if (!c) return;
  saveMeetup({
    coordinates: c,
    facilityId: main ? main.id : null,
    label: main ? main.nameKo : `${parkMeta().nameKo} 정문`,
  });
  if (state.tab === 'settings') renderSettings();
}

function beginMeetupPick() {
  state.pickingMeetup = true;
  toast('지도에서 집결지를 탭하세요', 3500);
  closeSheet();
  map.beginPickStart((coords) => {
    state.pickingMeetup = false;
    if (!isInsidePark(coords)) {
      toast('파크 안에서 집결지를 선택해 주세요', 3500);
      return;
    }
    saveMeetup({ coordinates: coords, facilityId: null, label: '지도에서 선택한 집결지' });
    openSheetPanel('settings');
  });
}

function viewMeetup() {
  const m = store.getMeetup(state.park);
  if (!m || !m.coordinates) { toast('저장된 가족 집결지가 없습니다'); openSheetPanel('settings'); return; }
  map.focusPoi(m.coordinates, 17);
  syncMeetupMarker();
  toast(m.label || '가족 집결지');
}

function directionToMeetup() {
  const m = store.getMeetup(state.park);
  if (!m || !m.coordinates) { toast('저장된 가족 집결지가 없습니다'); return; }
  // Synthetic direction to meetup coords without a POI id — use entrance-style overlay.
  const from = directionStartCoords() || (state.user && state.user.coords);
  if (!from) {
    toast('방향 안내를 위해 현재 위치 또는 출발점이 필요합니다');
    toggleLocation();
    return;
  }
  const bearing = bearingDegrees(from, m.coordinates);
  state.directionId = null;
  state.routeId = null;
  state.routeInfo = {
    mode: 'direction',
    support: 'direction',
    distance: haversineMeters(from, m.coordinates),
    bearingLabel: `${compass8(bearing)}쪽 방향 (${Math.round(bearing)}\u00B0)`,
    originLabel: directionOriginLabel() || '출발점',
    reason: VERIFYING_MSG,
  };
  map.showDirection(from, m.coordinates);
  map.focusPoi(m.coordinates, 17);
  toast(`집결지 직선거리 ${formatDistance(state.routeInfo.distance)}`);
}

function nearestFacility(kind, from) {
  let pool = visibleFacilities();
  if (kind === 'restroom') pool = pool.filter((f) => f.type === 'restroom');
  else if (kind === 'accessible') pool = pool.filter((f) => f.type === 'restroom' && f.accessibleRestroom);
  else if (kind === 'baby') pool = pool.filter((f) => f.type === 'babyCare' || f.babyCare || f.nursingRoom);
  else if (kind === 'firstAid') pool = pool.filter((f) => f.type === 'firstAid' || f.type === 'emergencyFacility');
  if (!from) return null;
  let best = null; let bestD = Infinity;
  for (const p of pool) {
    if (!p.coordinates) continue;
    const d = haversineMeters(from, p.coordinates);
    if (d < bestD) { bestD = d; best = p; }
  }
  return best;
}

function jumpNearest(kind) {
  if (kind === 'meetup') { viewMeetup(); return; }
  let from = null;
  if (state._nearbyFromEntrance) {
    from = parkMeta().entranceCoordinates;
  } else {
    const ref = nearbyReferencePoint();
    from = ref.from;
    if (!from) {
      if (ref.mode === 'outside') {
        toast('파크 밖입니다. 정문 기준으로 보려면 「지금 근처」에서 선택하세요');
        openSheetPanel('familyNearby');
        return;
      }
      toast('주변 시설을 보려면 현재 위치가 필요합니다.');
      openSheetPanel('familyNearby');
      return;
    }
  }
  const poi = nearestFacility(kind, from);
  if (!poi) { toast('근처에 해당 시설이 없습니다'); return; }
  selectPoi(poi.id);
}

function showNearbyFromEntrance() {
  // Reuse the compact nearby sheet with entrance coordinates as distance origin.
  const from = parkMeta().entranceCoordinates;
  if (!from) { toast('정문 좌표가 없습니다'); return; }
  const savedUser = state.user;
  state.user = { coords: from, accuracy: null };
  renderFamilyNearby();
  state.user = savedUser;
  state._nearbyFromEntrance = true;
  els.sheetTitle.textContent = '근처 (정문 기준)';
}

function currentShareSnapshot() {
  return buildShareData({
    park: state.park,
    visitDate: store.getVisitDate(),
    children: store.getChildren(),
    favorites: store.getFavorites(),
    visitList: store.getVisitList(),
    done: store.getDone(),
    priorities: store.getVisitPriorities(),
    meetup: store.getMeetup(state.park),
  });
}

async function createShareLink(withQr) {
  try {
    const data = currentShareSnapshot();
    const param = await encodeShareToParam(data);
    const url = buildShareUrl(window.location.href.split('#')[0], param);
    const box = els.sheetBody.querySelector('#share-result');
    if (box) {
      box.hidden = false;
      box.innerHTML = `<p class="muted small">현재 계획의 사본을 공유합니다. 이후 변경사항은 자동으로 동기화되지 않습니다.</p>
        <input class="inp share-url" readonly value="${ui.esc(url)}" aria-label="공유 링크" />
        <button class="btn" data-act="share-copy" type="button">링크 복사</button>
        <div id="share-qr-box" class="share-qr-box" ${withQr ? '' : 'hidden'}></div>`;
      const copyBtn = box.querySelector('[data-act="share-copy"]');
      if (copyBtn) {
        copyBtn.addEventListener('click', async () => {
          try {
            await navigator.clipboard.writeText(url);
            toast('링크를 복사했습니다');
          } catch {
            box.querySelector('.share-url').select();
            toast('링크를 길게 눌러 복사해 주세요');
          }
        });
      }
      if (withQr) renderQr(url, box.querySelector('#share-qr-box'));
    }
    if (navigator.share) {
      try { await navigator.share({ title: '도쿄 디즈니 방문 계획', url, text: '가족 방문 계획 사본' }); } catch { /* cancelled */ }
    }
  } catch (err) {
    toast(err.message || '공유 링크를 만들지 못했습니다');
  }
}

function renderQr(text, el) {
  if (!el) return;
  el.hidden = false;
  const makeQr = typeof window !== 'undefined' ? window.qrcode : null;
  if (typeof makeQr !== 'function') {
    el.innerHTML = '<p class="muted small">QR 라이브러리를 불러오지 못했습니다. 공유 링크를 사용해 주세요.</p>';
    return;
  }
  try {
    const qr = makeQr(0, 'M');
    qr.addData(text);
    qr.make();
    el.innerHTML = qr.createImgTag(4, 8);
    const img = el.querySelector('img');
    if (img) {
      img.alt = '방문 계획 공유 QR';
      img.style.maxWidth = '100%';
      img.style.height = 'auto';
      img.style.imageRendering = 'pixelated';
    }
  } catch {
    el.innerHTML = '<p class="muted small">QR을 만들지 못했습니다. 링크가 너무 길 수 있습니다.</p>';
  }
}

function exportShareFile() {
  const data = currentShareSnapshot();
  const blob = new Blob([exportShareJson(data)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `tokyo-disney-plan-${state.park}-${store.getVisitDate()}.json`;
  a.click();
  URL.revokeObjectURL(a.href);
  toast('JSON 파일을 내보냈습니다');
}

function applyPendingShare(mode) {
  const share = state.pendingShare;
  if (!share) return;
  if (share.park && share.park !== state.park) setPark(share.park);
  if (share.visitDate) store.setVisitDate(share.visitDate);
  if (share.children && share.children.length) store.setChildren(share.children);

  if (mode === 'replace') {
    store.setFavorites(share.favorites || []);
    store.setVisitList(share.visitList || []);
    store.setDone(share.done || []);
    store.setVisitPriorities(share.priorities || {});
    if (share.meetup) store.setMeetup(state.park, { ...share.meetup, park: state.park });
    else store.clearMeetup(state.park);
  } else {
    const fav = new Set(store.getFavorites());
    (share.favorites || []).forEach((id) => fav.add(id));
    store.setFavorites([...fav]);
    const visit = store.getVisitList().slice();
    const pr = store.getVisitPriorities();
    for (const id of share.visitList || []) {
      if (!visit.includes(id)) visit.push(id);
      if (share.priorities && share.priorities[id]) pr[id] = share.priorities[id];
    }
    store.setVisitList(visit);
    store.setVisitPriorities(pr);
    const done = new Set(store.getDone());
    (share.done || []).forEach((id) => done.add(id));
    store.setDone([...done]);
    if (share.meetup && !store.getMeetup(state.park)) {
      store.setMeetup(state.park, { ...share.meetup, park: state.park });
    }
  }
  state.pendingShare = null;
  syncMeetupMarker();
  renderFavorites();
  renderMap();
  toast(mode === 'replace' ? '공유 계획으로 교체했습니다' : '공유 계획을 추가했습니다');
}

async function consumeShareFromUrl() {
  try {
    const params = new URLSearchParams(window.location.search);
    const s = params.get('s');
    if (!s) return;
    state.pendingShare = await decodeShareParam(s);
    // Clean URL without losing path
    params.delete('s');
    const clean = `${window.location.pathname}${params.toString() ? `?${params}` : ''}${window.location.hash || ''}`;
    window.history.replaceState({}, '', clean);
    openSheetPanel('favorites');
    toast('공유된 방문 계획을 받았습니다');
  } catch (err) {
    toast(err.message || '공유 링크를 읽지 못했습니다');
  }
}
function toggleFacilityFilter(key) {
  if (key === 'includeEstimated') {
    store.setSettings({ includeEstimated: !includeLowTrust() });
    renderMap();
    syncLabelOptions();
    return;
  }
  if (key === 'includePregate') {
    const on = !includePregate();
    store.setSettings({ includePregate: on });
    if (on) {
      const f = getFilters().facility;
      f.inGateOnly = false;
      setFacilityFilters(f);
    }
    renderMap();
    syncLabelOptions();
    return;
  }
  const f = getFilters().facility;
  if (key === 'inGateOnly') {
    // Default true when unset; toggle off → show outside (requires includePregate).
    const currentlyOn = f.inGateOnly !== false;
    f.inGateOnly = !currentlyOn;
    if (!f.inGateOnly) store.setSettings({ includePregate: true });
    else store.setSettings({ includePregate: false });
  } else {
    f[key] = !f[key];
  }
  setFacilityFilters(f);
}

// ---- events ----
function bindEvents() {
  els.parkToggle.addEventListener('click', (e) => {
    const b = e.target.closest('button[data-park]');
    if (b) setPark(b.dataset.park);
  });

  els.locBtn.addEventListener('click', toggleLocation);
  if (els.mapFab) {
    els.mapFab.addEventListener('click', (e) => {
      const b = e.target.closest('button[data-fab]');
      if (!b) return;
      if (b.dataset.fab === 'nearby') {
        if (state.tab === 'familyNearby') closeSheet();
        else openSheetPanel('familyNearby');
        syncNearbyFab();
      }
    });
  }

  els.filterBtn.addEventListener('click', () => {
    if (state.tab === 'filter') {
      if (state.prevTab && state.prevTab !== 'filter') openSheetPanel(state.prevTab);
      else closeSheet();
    } else openSheetPanel('filter');
  });

  els.search.addEventListener('input', (e) => {
    state.query = e.target.value.trim();
    if (state.query) openTab('search');
    else if (state.tab === 'search') renderSearch();
  });
  els.search.addEventListener('focus', () => { if (state.query) openTab('search'); });

  els.sheetClose.addEventListener('click', () => closeSheet());

  els.nav.addEventListener('click', (e) => {
    const b = e.target.closest('button[data-tab]');
    if (!b) return;
    toggleLayerTab(b.dataset.tab);
  });

  // delegated clicks inside the sheet body
  els.sheetBody.addEventListener('click', (e) => {
    const t = e.target;
    const liBtn = t.closest('button[data-poi]');
    const filterBtn = t.closest('button[data-filter]');

    if (filterBtn) {
      const key = filterBtn.dataset.filter;
      const forFacility = state.tab === 'restrooms' || (state.tab === 'filter' && state.prevTab === 'restrooms');
      if (forFacility) toggleFacilityFilter(key); else toggleAttractionFilter(key);
      renderSheet();
      renderMap();
      return;
    }

    const famQuick = t.closest('button[data-family-quick]');
    if (famQuick) {
      applyFamilyQuickAction(famQuick.dataset.familyQuick);
      return;
    }

    const sortBtn = t.closest('button[data-visit-sort]');
    if (sortBtn) {
      state.visitSort = sortBtn.dataset.visitSort;
      renderFavorites();
      return;
    }

    // detail action buttons (fav/route/direction/visit) — check data-act first
    const act = t.closest('button[data-act]');
    if (act) {
      const id = act.dataset.poi;
      const a = act.dataset.act;
      if (a === 'fav') { const on = store.toggleFavorite(id); toast(on ? '즐겨찾기에 추가' : '즐겨찾기 해제'); renderDetail(id); syncLabelOptions(); }
      if (a === 'route') showRoute(id);
      if (a === 'direction') {
        state.startOrigin = null;
        showDirection(id);
      }
      if (a === 'visit') { const on = store.toggleVisit(id); toast(on ? '방문 목록에 추가' : '방문 목록에서 제거'); renderDetail(id); }
      if (a === 'clear-route') {
        state.startOrigin = null;
        state.manualStart = null;
        clearNavLines();
        if (state.selectedId) renderDetail(state.selectedId);
        toast('방향 안내를 지웠습니다');
      }
      if (a === 'origin-user') {
        state.startOrigin = 'user';
        state.manualStart = null;
        if (state.user && state.user.coords && isInsidePark(state.user.coords)) {
          applyDirection(id, state.user.coords, '현재 위치');
        } else {
          showNeedOrigin(id, '방향 안내를 위해 현재 위치가 필요합니다.');
          requestLocationForDirection(id);
        }
      }
      if (a === 'origin-entrance') useEntranceOrigin(id);
      if (a === 'origin-map') beginMapOriginPick(id);
      if (a === 'route-from-entrance') useEntranceOrigin(id);
      if (a === 'keep-map') { state.outsideParkChoice = 'keep'; clearNavLines(); toast('파크 지도를 유지합니다'); map.resetView(parkMeta()); }
      if (a === 'switch-other-park') { setPark(state.park === 'TDL' ? 'TDS' : 'TDL'); }
      if (a === 'request-location') { if (!state.locating) toggleLocation(); }
      if (a === 'nearby-from-entrance') showNearbyFromEntrance();
      if (a === 'nearby-jump') jumpNearest(act.dataset.nearby);
      if (a === 'meetup-view') viewMeetup();
      if (a === 'meetup-direction') directionToMeetup();
      if (a === 'meetup-pick-map') beginMeetupPick();
      if (a === 'meetup-from-selected') setMeetupFromSelected();
      if (a === 'meetup-entrance') setMeetupEntrance();
      if (a === 'meetup-set-poi') setMeetupFromPoi(id);
      if (a === 'show-entrances') showEntrancesOverview();
      if (a === 'focus-main-entrance') focusMainEntrance();
      if (a === 'toggle-entrance-detail') {
        toggleEntranceDetailMode();
        if (state.tab === 'familyNearby') renderFamilyNearby();
      }
      if (a === 'open-attractions') openTab('attractions');
      if (a === 'open-restrooms') openTab('restrooms');
      if (a === 'focus-entrance') {
        const ent = getPoiById(state.park, id);
        if (ent && ent.coordinates) {
          map.focusPoi(ent.coordinates, 17);
          toast(ent.nameKo || '입구로 이동');
        }
      }
      if (a === 'meetup-clear') { store.clearMeetup(state.park); syncMeetupMarker(); toast('집결지를 삭제했습니다'); renderSettings(); }
      if (a === 'meetup-note-save') {
        const m = store.getMeetup(state.park);
        if (m) {
          const noteEl = els.sheetBody.querySelector('#meetup-note');
          store.setMeetup(state.park, { ...m, note: (noteEl && noteEl.value) || '' });
          toast('메모를 저장했습니다');
          renderSettings();
        }
      }
      if (a === 'share-link') createShareLink(false);
      if (a === 'share-qr') createShareLink(true);
      if (a === 'share-export') exportShareFile();
      if (a === 'share-import-file') {
        const inp = els.sheetBody.querySelector('#share-file');
        if (inp) inp.click();
      }
      if (a === 'share-merge') applyPendingShare('merge');
      if (a === 'share-replace') applyPendingShare('replace');
      if (a === 'share-cancel') { state.pendingShare = null; renderFavorites(); }
      if (a === 'facility-default-trust') {
        // Clear High-only for current park only; keep includeEstimated as-is.
        const ff = getFilters().facility;
        ff.highOnly = false;
        setFacilityFilters(ff);
        toast('기본 위치 표시로 전환했습니다');
        renderRestrooms();
        renderMap();
      }
      if (a === 'facility-keep-filter') {
        toast('High 신뢰도만 보기를 유지합니다');
      }
      return;
    }

    // visit-list controls
    const up = t.closest('[data-visit-up]');
    const down = t.closest('[data-visit-down]');
    const rm = t.closest('[data-visit-remove]');
    const dn = t.closest('[data-visit-done]');
    if (up || down || rm || dn) {
      const id = (up || down || rm || dn).getAttribute('data-visit-up') || (down && down.getAttribute('data-visit-down')) || (rm && rm.getAttribute('data-visit-remove')) || (dn && dn.getAttribute('data-visit-done'));
      let list = store.getVisitList();
      const i = list.indexOf(id);
      if (up && i > 0) { [list[i - 1], list[i]] = [list[i], list[i - 1]]; store.setVisitList(list); }
      else if (down && i >= 0 && i < list.length - 1) { [list[i + 1], list[i]] = [list[i], list[i + 1]]; store.setVisitList(list); }
      else if (rm) {
        list = list.filter((x) => x !== id);
        store.setVisitList(list);
        const pr = store.getVisitPriorities();
        delete pr[id];
        store.setVisitPriorities(pr);
      } else if (dn) { store.toggleDone(id); }
      renderFavorites();
      return;
    }

    // list row / visit row select
    if (liBtn) { selectPoi(liBtn.dataset.poi); return; }
    const vbtn = t.closest('.vbtn[data-poi]');
    if (vbtn) { selectPoi(vbtn.dataset.poi); return; }

    // settings: theme (also refreshes vector basemap flavor)
    const themeBtn = t.closest('button[data-theme]');
    if (themeBtn) {
      store.setSettings({ theme: themeBtn.dataset.theme });
      applyTheme(themeBtn.dataset.theme);
      renderSettings();
      syncLabelOptions();
      return;
    }
    const labelBtn = t.closest('button[data-map-label]');
    if (labelBtn) {
      const mode = labelBtn.dataset.mapLabel || 'ko';
      store.setSettings({ mapLabelMode: mode });
      if (map && typeof map.setBasemapLabelMode === 'function') map.setBasemapLabelMode(mode);
      renderSettings();
      syncLabelOptions();
      return;
    }
  });

  // settings inputs
  els.sheetBody.addEventListener('click', (e) => {
    if (e.target.id === 'child-add') {
      const c = store.getChildren(); c.push({ name: '새 아이', height: 100 }); store.setChildren(c); renderSettings();
    }
    if (e.target.id === 'child-save') { saveChildren(); toast('아이 프로필을 저장했습니다'); }
    if (e.target.id === 'map-reset') { resetMapView(); }
    const crm = e.target.closest('[data-child-remove]');
    if (crm) { const c = store.getChildren(); c.splice(Number(crm.dataset.childRemove), 1); store.setChildren(c); renderSettings(); }
  });
  els.sheetBody.addEventListener('change', (e) => {
    if (e.target.id === 'set-estimated') {
      store.setSettings({ includeEstimated: e.target.checked });
      renderMap();
      if (state.tab === 'restrooms') renderRestrooms();
    }
    if (e.target.id === 'set-family-badge') {
      store.setSettings({ showFamilyRideBadge: e.target.checked });
      renderMap();
      if (state.tab === 'attractions' || state.tab === 'favorites' || state.tab === 'detail') renderSheet();
    }
    if (e.target.id === 'set-entrance-markers') {
      store.setSettings({ showEntranceMarkers: e.target.checked });
      renderMap();
    }
    if (e.target.id === 'set-park-boundaries') {
      store.setSettings({ showParkBoundaries: !!e.target.checked });
      renderMap();
    }
    if (e.target.id === 'set-pregate-boundary') {
      store.setSettings({ showPregateBoundary: !!e.target.checked });
      renderMap();
    }
    if (e.target.id === 'set-boundary-labels') {
      store.setSettings({ showBoundaryLabels: !!e.target.checked });
      renderMap();
    }
    if (e.target.id === 'set-pregate') {
      const on = e.target.checked;
      store.setSettings({ includePregate: on });
      const f = getFilters().facility;
      f.inGateOnly = !on;
      setFacilityFilters(f);
      renderMap();
      if (state.tab === 'restrooms') renderRestrooms();
    }
    if (e.target.id === 'set-visitdate') {
      store.setVisitDate(e.target.value);
      toast(`방문 예정일: ${e.target.value}`);
    }
    if (e.target.matches('select[data-visit-prio]')) {
      store.setVisitPriority(e.target.dataset.visitPrio, e.target.value);
      renderFavorites();
    }
    if (e.target.id === 'share-file' && e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      const reader = new FileReader();
      reader.onload = () => {
        try {
          state.pendingShare = parseShareJson(String(reader.result));
          renderFavorites();
          toast('공유 파일을 읽었습니다. 추가·교체를 선택하세요.');
        } catch (err) {
          toast(err.message || 'JSON을 읽지 못했습니다');
        }
      };
      reader.readAsText(file);
      e.target.value = '';
    }
  });

  window.addEventListener('online', updateOnline);
  window.addEventListener('offline', updateOnline);
}

function saveChildren() {
  const names = [...els.sheetBody.querySelectorAll('[data-child-name]')];
  const heights = [...els.sheetBody.querySelectorAll('[data-child-height]')];
  const children = names.map((n, i) => ({
    name: (n.value || '아이').trim().slice(0, 10),
    height: Math.max(50, Math.min(200, Number(heights[i].value) || 100)),
  }));
  store.setChildren(children);
  // Child-based height filters must recompute immediately.
  if (state.tab === 'attractions' || state.tab === 'search' || state.tab === 'filter') renderSheet();
}

function applyTheme(theme) {
  const root = document.documentElement;
  if (theme === 'auto') root.removeAttribute('data-theme');
  else root.setAttribute('data-theme', theme);
  if (map && typeof map.setBasemapTheme === 'function') map.setBasemapTheme(theme);
}

function updateOnline() {
  const off = !navigator.onLine;
  els.offline.classList.toggle('show', off);
  els.offline.setAttribute('aria-hidden', off ? 'false' : 'true');
}

// ---- init ----
function init() {
  cacheEls();
  // park toggle initial state
  els.parkToggle.querySelectorAll('button').forEach((b) => {
    const on = b.dataset.park === state.park;
    b.classList.toggle('on', on);
    b.setAttribute('aria-pressed', on ? 'true' : 'false');
  });
  // Create the map first, then apply theme so basemap flavor can sync safely.
  map.init(parkMeta(), {
    theme: store.getSettings().theme,
    labelMode: store.getSettings().mapLabelMode || 'ko',
    onTileError: () => toast('벡터 배경지도를 불러오지 못했습니다. 단색 배경과 한국어 마커·목록으로 계속할 수 있어요.', 4000),
  });
  applyTheme(store.getSettings().theme);
  renderMap();
  syncLabelSources();
  syncLabelOptions();
  bindEvents();
  syncNav();
  updateOnline();
  map.invalidate();
  consumeShareFromUrl();

  if ('serviceWorker' in navigator) {
    // Reload once when a NEW service worker takes control (so an updated deploy
    // applies without a manual hard reload). Guarded so the first-ever install
    // (no prior controller) does not trigger a reload loop.
    const hadController = !!navigator.serviceWorker.controller;
    let reloaded = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (reloaded || !hadController) return;
      reloaded = true;
      window.location.reload();
    });
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('./sw.js').catch(() => {});
    });
  }
}

init();
