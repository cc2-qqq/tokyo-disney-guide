import { PARKS, getPois, getAttractions, getAllAttractions, getFacilities, getPoiById, LANDMARK_ATTRACTIONS } from './data/index.js';
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
import * as ui from './ui.js';

const WALK_GRAPHS = { TDL: TDL_WALK_GRAPH, TDS: TDS_WALK_GRAPH };
const ROUTE_DEBUG = (() => {
  try { return new URLSearchParams(window.location.search).has('routeDebug'); }
  catch { return false; }
})();

const state = {
  park: store.getPark(),
  tab: 'map',           // map | attractions | restrooms | favorites | settings | search | filter | detail
  prevTab: 'attractions',
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

/** Active map category from bottom nav (detail/search inherit prevTab). */
function mapCategory() {
  if (state.tab === 'map' || state.tab === 'settings') return 'map';
  if (state.tab === 'attractions' || state.tab === 'restrooms' || state.tab === 'favorites') return state.tab;
  if (state.tab === 'detail' || state.tab === 'search' || state.tab === 'filter') {
    if (state.prevTab === 'attractions' || state.prevTab === 'restrooms' || state.prevTab === 'favorites') {
      return state.prevTab;
    }
  }
  return 'map';
}

function poiMatchesCategory(poi, category = mapCategory()) {
  if (!poi) return false;
  if (category === 'map') return true;
  if (category === 'attractions') return poi.type === 'attraction';
  if (category === 'restrooms') return isRestroomTabFacility(poi);
  if (category === 'favorites') return store.isFavorite(poi.id);
  return true;
}

// POIs shown on the map: filtered by bottom-nav category.
function mapPois() {
  const cat = mapCategory();
  if (cat === 'attractions') return getAttractions(state.park);
  if (cat === 'restrooms') {
    const ff = { ...getFilters().facility };
    if (ff.inGateOnly == null) ff.inGateOnly = true;
    return visibleFacilities({ restroomTabOnly: true }).filter((p) => facilityMatchesFilters(p, ff));
  }
  if (cat === 'favorites') {
    const fav = new Set(store.getFavorites());
    return getPois(state.park).filter((p) => fav.has(p.id) && p.coordinates
      && (p.type === 'attraction' || facilityVisible(p, includeLowTrust(), state.park, facilityVisibilityOpts())));
  }
  // map / settings: all app-managed markers
  return [...getAttractions(state.park), ...visibleFacilities()];
}

function clearSelectionIfWrongCategory(category = mapCategory()) {
  if (!state.selectedId) return;
  const poi = getPoiById(state.park, state.selectedId);
  if (poiMatchesCategory(poi, category)) return;
  state.selectedId = null;
  map.highlight(null);
  if (state.tab === 'detail') {
    // Drop detail for POI that no longer belongs to the active category.
    state.tab = category === 'map' ? 'map' : category;
  }
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
  const pois = withDistance(mapPois(), state.user && state.user.coords);
  map.renderMarkers(pois, { onSelect: selectPoi, selectedId: state.selectedId });
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
    mapLabelMode: store.getSettings().mapLabelMode || 'ko',
    category: mapCategory(),
  });
}

function chip(id, label, active) {
  return `<button class="chip ${active ? 'chip-on' : ''}" data-filter="${id}" type="button" aria-pressed="${!!active}">${ui.esc(label)}</button>`;
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
    facility: all.facility || {},
  };
}
function setAttractionFilters(af) {
  const all = store.getFilters();
  all.attraction = af;
  store.setFilters(all);
}
function setFacilityFilters(ff) {
  const all = store.getFilters();
  all.facility = ff;
  store.setFilters(all);
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

function renderAttractions() {
  const f = getFilters().attraction;
  let items = getAttractions(state.park).filter((p) => matchText(p, state.query) && attractionMatchesFilters(p, f, filterCtx()));
  items = withDistance(items, state.user && state.user.coords);
  if (f.nearest) items = sortByDistance(items);
  items = annotateClosure(items);
  els.sheetTitle.textContent = `어트랙션 (${items.length})`;
  els.sheetBody.innerHTML = attractionFilterBar(f) + ui.listHtml(items, {
    isFav: (id) => store.isFavorite(id),
    isDone: (id) => store.isDone(id),
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
  els.sheetTitle.textContent = `화장실 (${wc}) · 베이비케어 (${baby})`;
  let body = facilityCountSummary() + facilityFilterBar(f);
  body += `<div class="notice"><p>중앙구호실·AED는 화장실이 아니어서 이 목록에 넣지 않습니다. 지도 탭에서 확인할 수 있어요.</p></div>`;
  body += ui.listHtml(items, {
    isFav: (id) => store.isFavorite(id),
    emptyMsg: '표시할 화장실·베이비케어가 없습니다. 필터를 조정해 보세요.',
  });
  if (unknown.length) {
    body += `<h3 class="sheet-h3">위치 확인 중 (${unknown.length})</h3>`;
    body += ui.listHtml(unknown.map((p) => ({ ...p, nameNote: (p.nameNote ? `${p.nameNote} · ` : '') + '좌표 확인 중' })), {
      isFav: (id) => store.isFavorite(id),
      emptyMsg: '',
    });
  }
  els.sheetBody.innerHTML = body;
}

function renderFavorites() {
  const favIds = store.getFavorites();
  const all = getPois(state.park);
  let favs = all.filter((p) => favIds.includes(p.id));
  favs = annotateClosure(withDistance(favs, state.user && state.user.coords));
  const vd = store.getVisitDate();
  const visitIds = store.getVisitList();
  const visitItems = visitIds.map((id) => getPoiById(state.park, id)).filter(Boolean);

  els.sheetTitle.textContent = '즐겨찾기 · 방문 목록';
  let body = `<h3 class="sheet-h3">즐겨찾기</h3>`;
  body += ui.listHtml(favs, {
    isFav: () => true,
    isDone: (id) => store.isDone(id),
    emptyMsg: '아직 즐겨찾기한 항목이 없습니다. 상세 화면에서 별표를 눌러 추가하세요.',
  });

  body += `<h3 class="sheet-h3">내 방문 목록 <span class="muted">(내가 정한 순서)</span></h3>`;
  if (!visitItems.length) {
    body += ui.emptyState('방문할 곳을 상세 화면에서 "내 방문 목록"으로 추가해 보세요.');
  } else {
    body += `<ol class="visit-list">${visitItems.map((p, i) => {
      const done = store.isDone(p.id);
      const closedLong = p.operatingStatus === 'closed_longterm';
      const closedVisit = p.type === 'attraction' && closureOnDate(p, vd);
      const cbadge = closedLong ? '<span class="badge badge-closed">운영 종료</span>' : (closedVisitBadge(closedVisit));
      return `<li class="visit-row ${done ? 'is-done' : ''}">
        <button class="vbtn" data-poi="${ui.esc(p.id)}" type="button">${ui.esc(p.nameKo || p.name)} ${cbadge}</button>
        <span class="visit-ctrls">
          <button class="iconbtn" data-visit-up="${ui.esc(p.id)}" type="button" aria-label="위로" ${i === 0 ? 'disabled' : ''}>\u2191</button>
          <button class="iconbtn" data-visit-down="${ui.esc(p.id)}" type="button" aria-label="아래로" ${i === visitItems.length - 1 ? 'disabled' : ''}>\u2193</button>
          <button class="iconbtn ${done ? 'on' : ''}" data-visit-done="${ui.esc(p.id)}" type="button" aria-label="완료 표시" aria-pressed="${done}">\u2713</button>
          <button class="iconbtn" data-visit-remove="${ui.esc(p.id)}" type="button" aria-label="목록에서 제거">\u2715</button>
        </span>
      </li>`;
    }).join('')}</ol>
    <p class="muted small">검증된 실제 보행경로가 없어 "자동 최적 경로"는 제공하지 않습니다. 순서는 직접 정한 순서입니다.</p>`;
  }
  els.sheetBody.innerHTML = body;
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

    <h3 class="sheet-h3">지도 표시</h3>
    <p class="muted small"><strong>기본 위치 표시</strong> — TDL: High만 · TDS: Medium 이상(공식 지도 기반 추정). 어트랙션은 항상 대략적 위치로 표시됩니다.</p>
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

function renderDetail(id) {
  const poi = getPoiById(state.park, id);
  if (!poi) { openTab(state.prevTab); return; }
  const withArea = getPois(state.park).find((p) => p.id === id) || poi;
  els.sheetTitle.textContent = withArea.nameKo || withArea.name;
  const routeInfo = (state.routeId === id && state.routeInfo) ? state.routeInfo : null;
  const graph = WALK_GRAPHS[state.park];
  const fromGuess = routeStartCoords() || parkMeta().entranceCoordinates;
  const canWalkRoute = canOfferWalkRoute(graph, withArea, fromGuess, {
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
  };
  if (withArea.type === 'attraction') {
    els.sheetBody.innerHTML = ui.attractionDetail(withArea, { children: store.getChildren(), visitDate: store.getVisitDate(), ...common });
  } else {
    els.sheetBody.innerHTML = ui.facilityDetail(withArea, common);
  }
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
    + ui.listHtml(items, { isFav: (id) => store.isFavorite(id), emptyMsg: '검색 결과가 없습니다.' });
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
};

function renderSheet() {
  const r = RENDERERS[state.tab];
  if (r) r();
  else if (state.tab === 'detail') renderDetail(state.selectedId);
}

// ---- navigation / sheet ----
function openTab(tab) {
  if (['attractions', 'restrooms', 'favorites', 'settings'].includes(tab)) state.prevTab = tab;
  state.tab = tab;
  clearSelectionIfWrongCategory(mapCategory());
  if (tab === 'map') {
    closeSheet();
  } else {
    els.sheet.classList.add('open');
    els.sheet.setAttribute('aria-hidden', 'false');
    renderSheet();
  }
  renderMap();
  syncLabelSources();
  syncLabelOptions();
  syncNav();
}

function closeSheet() {
  els.sheet.classList.remove('open');
  els.sheet.setAttribute('aria-hidden', 'true');
  state.tab = 'map';
  clearSelectionIfWrongCategory('map');
  renderMap();
  syncLabelOptions();
  syncNav();
}

function syncNav() {
  const active = ['attractions', 'restrooms', 'favorites', 'settings'].includes(state.tab) ? state.tab : (state.tab === 'map' ? 'map' : state.prevTab);
  els.nav.querySelectorAll('button').forEach((b) => {
    const on = b.dataset.tab === active || (state.tab === 'map' && b.dataset.tab === 'map');
    b.classList.toggle('nav-on', on);
    b.setAttribute('aria-current', on ? 'page' : 'false');
  });
}

function selectPoi(id) {
  // Switching destination clears previous walk/direction overlays.
  if ((state.routeId && state.routeId !== id) || (state.directionId && state.directionId !== id)) {
    clearNavLines();
  }
  state.selectedId = id;
  const poi = getPoiById(state.park, id);
  if (poi && poi.coordinates) map.focusPoi(poi.coordinates, 17);
  map.highlight(id);
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
  // Keep current category/tab; re-render that park's data.
  clearSelectionIfWrongCategory(mapCategory());
  renderMap();
  syncLabelSources();
  syncLabelOptions();
  if (state.tab === 'detail') openTab(state.prevTab || 'map');
  else if (state.tab !== 'map') renderSheet();
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

  els.filterBtn.addEventListener('click', () => {
    if (state.tab === 'filter') { openTab(state.prevTab); }
    else openTab('filter');
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
    const tab = b.dataset.tab;
    // Start list tabs from a clean slate (don't carry over a stale search query).
    if (state.query) { state.query = ''; els.search.value = ''; }
    if (tab === 'map') { closeSheet(); return; }
    if (state.tab === tab) { closeSheet(); return; }
    openTab(tab);
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

    // detail action buttons (fav/route/direction/visit) — check data-act first
    const act = t.closest('button[data-act]');
    if (act) {
      const id = act.dataset.poi;
      if (act.dataset.act === 'fav') { const on = store.toggleFavorite(id); toast(on ? '즐겨찾기에 추가' : '즐겨찾기 해제'); renderDetail(id); syncLabelOptions(); }
      if (act.dataset.act === 'route') showRoute(id);
      if (act.dataset.act === 'direction') {
        state.startOrigin = null;
        showDirection(id);
      }
      if (act.dataset.act === 'visit') { const on = store.toggleVisit(id); toast(on ? '방문 목록에 추가' : '방문 목록에서 제거'); renderDetail(id); }
      if (act.dataset.act === 'clear-route') {
        state.startOrigin = null;
        state.manualStart = null;
        clearNavLines();
        if (state.selectedId) renderDetail(state.selectedId);
        toast('방향 안내를 지웠습니다');
      }
      if (act.dataset.act === 'origin-user') {
        state.startOrigin = 'user';
        state.manualStart = null;
        if (state.user && state.user.coords && isInsidePark(state.user.coords)) {
          applyDirection(id, state.user.coords, '현재 위치');
        } else {
          showNeedOrigin(id, '방향 안내를 위해 현재 위치가 필요합니다.');
          requestLocationForDirection(id);
        }
      }
      if (act.dataset.act === 'origin-entrance') useEntranceOrigin(id);
      if (act.dataset.act === 'origin-map') beginMapOriginPick(id);
      if (act.dataset.act === 'route-from-entrance') useEntranceOrigin(id);
      if (act.dataset.act === 'keep-map') { state.outsideParkChoice = 'keep'; clearNavLines(); toast('파크 지도를 유지합니다'); map.resetView(parkMeta()); }
      if (act.dataset.act === 'switch-other-park') { setPark(state.park === 'TDL' ? 'TDS' : 'TDL'); }
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
      else if (rm) { list = list.filter((x) => x !== id); store.setVisitList(list); }
      else if (dn) { store.toggleDone(id); }
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
