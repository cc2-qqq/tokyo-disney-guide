import { PARKS, getPois, getAttractions, getAllAttractions, getFacilities, getPoiById } from './data/index.js';
import { closureOnDate } from './labels.js';
import { store } from './store.js';
import { createMapController } from './map.js';
import { createLocator, haversineMeters, bearingDegrees, formatDistance } from './geo.js';
import {
  matchText, attractionMatchesFilters, facilityMatchesFilters,
  facilityVisible, withDistance, sortByDistance,
} from './search.js';
import * as ui from './ui.js';

const state = {
  park: store.getPark(),
  tab: 'map',           // map | attractions | restrooms | favorites | settings | search | filter | detail
  prevTab: 'attractions',
  query: '',
  selectedId: null,
  directionId: null,    // POI id currently showing direction line
  user: null,           // { coords:[lat,lng], accuracy }
  locating: false,
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

function includeEstimated() { return store.getSettings().includeEstimated; }

function visibleFacilities() {
  return getFacilities(state.park).filter((f) => facilityVisible(f, includeEstimated()));
}

// POIs shown on the map: all attractions + visible facilities.
function mapPois() {
  return [...getAttractions(state.park), ...visibleFacilities()];
}

function distanceTo(poi) {
  if (!state.user || !poi || !poi.coordinates) return null;
  return haversineMeters(state.user.coords, poi.coordinates);
}

function directionFor(poi) {
  if (state.directionId !== poi.id || !state.user || !poi.coordinates) return null;
  return {
    distance: haversineMeters(state.user.coords, poi.coordinates),
    bearing: bearingDegrees(state.user.coords, poi.coordinates),
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

function chip(id, label, active) {
  return `<button class="chip ${active ? 'chip-on' : ''}" data-filter="${id}" type="button" aria-pressed="${!!active}">${ui.esc(label)}</button>`;
}

function attractionFilterBar(f) {
  return `<div class="chips" role="group" aria-label="어트랙션 필터">
    ${chip('h-none', '키 제한 없음', f.height === 'none')}
    ${chip('h-90', '90cm 이상', f.height === '90')}
    ${chip('h-102', '102cm 이상', f.height === '102')}
    ${chip('h-117', '117cm 이상', f.height === '117')}
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
  return `<div class="chips" role="group" aria-label="화장실 필터">
    ${chip('nearest', '가까운 순', f.nearest)}
    ${chip('generalOnly', '일반화장실', f.generalOnly)}
    ${chip('accessible', '다기능화장실', f.accessible)}
    ${chip('nursing', '수유실', f.nursing)}
    ${chip('babyCare', '베이비케어룸', f.babyCare)}
    ${chip('inGateOnly', '게이트 안쪽', f.inGateOnly)}
    ${chip('highOnly', 'High 신뢰도만', f.highOnly)}
    ${chip('includeEstimated', '추정 위치 포함', includeEstimated())}
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

function renderAttractions() {
  const f = getFilters().attraction;
  let items = getAttractions(state.park).filter((p) => matchText(p, state.query) && attractionMatchesFilters(p, f, { isFavorite: (id) => store.isFavorite(id) }));
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
  const f = getFilters().facility;
  let items = visibleFacilities().filter((p) => matchText(p, state.query) && facilityMatchesFilters(p, f));
  items = withDistance(items, state.user && state.user.coords);
  if (f.nearest) items = sortByDistance(items);
  els.sheetTitle.textContent = `화장실·시설 (${items.length})`;
  let body = facilityFilterBar(f);
  if (state.park === 'TDS' && getFacilities('TDS').length === 0) {
    body += `<div class="notice">도쿄디즈니씨(TDS)의 화장실·응급시설 좌표는 검증된 데이터가 준비되는 대로 추가됩니다. 임의의 미검증 좌표는 표시하지 않습니다. (조사 예정)</div>`;
  }
  body += ui.listHtml(items, {
    isFav: (id) => store.isFavorite(id),
    emptyMsg: '표시할 화장실·시설이 없습니다. 필터를 조정하거나 "추정 위치 포함"을 켜 보세요.',
  });
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
    <label class="switch-row">
      <input type="checkbox" id="set-estimated" ${s.includeEstimated ? 'checked' : ''} />
      <span>추정 위치(대략적 위치) 포함해서 보기</span>
    </label>
    <p class="muted small">끄면 신뢰도가 낮은 추정 좌표(화장실·시설)는 지도와 목록에서 숨겨집니다. 어트랙션은 항상 대략적 위치로 표시됩니다.</p>

    <h3 class="sheet-h3">테마</h3>
    <div class="chips">
      ${['auto', 'light', 'dark'].map((t) => `<button class="chip ${s.theme === t ? 'chip-on' : ''}" data-theme="${t}" type="button">${t === 'auto' ? '자동' : t === 'light' ? '밝게' : '어둡게'}</button>`).join('')}
    </div>

    <h3 class="sheet-h3">오프라인 사용 안내</h3>
    <div class="notice">
      <p>출국 전에 TDL과 TDS 지도를 열고 주요 구역을 확대해 두면 일부 지도 타일을 오프라인에서도 볼 수 있습니다. 지도 타일이 없더라도 목록과 저장 정보는 사용할 수 있습니다.</p>
    </div>

    <h3 class="sheet-h3">데이터 현황</h3>
    <div class="notice">
      <p><strong>TDL</strong> 화장실 9곳 지도 기반 추정(대략 5~10m), 추가 검증 4곳, 미확인 1곳(비표시). 중앙구호실 1곳.</p>
      <p><strong>TDS</strong> 화장실·응급시설 검증 좌표 준비 중(미표시). 어트랙션 위치는 대략적 추정입니다.</p>
      <p><strong>운영 종료·장기 휴장</strong> 스페이스 마운틴·버즈 라이트이어(TDL), 머메이드 라군 시어터(TDS)는 기본 목록·지도에서 제외했습니다.</p>
      <p class="small">모든 좌표는 실측 GPS가 아니며 참고용입니다. 실시간 대기시간·운영 여부는 공식 앱에서 확인하세요.</p>
    </div>`;
}

function renderDetail(id) {
  const poi = getPoiById(state.park, id);
  if (!poi) { openTab(state.prevTab); return; }
  const withArea = getPois(state.park).find((p) => p.id === id) || poi;
  els.sheetTitle.textContent = withArea.nameKo || withArea.name;
  const common = {
    isFav: store.isFavorite(id),
    inVisit: store.inVisitList(id),
    distance: distanceTo(withArea),
    userCoords: state.user && state.user.coords,
    direction: directionFor(withArea),
  };
  if (withArea.type === 'attraction') {
    els.sheetBody.innerHTML = ui.attractionDetail(withArea, { children: store.getChildren(), visitDate: store.getVisitDate(), ...common });
  } else {
    els.sheetBody.innerHTML = ui.facilityDetail(withArea, common);
  }
}

function renderSearch() {
  const q = state.query;
  const atts = getAllAttractions(state.park).filter((p) => matchText(p, q) && attractionMatchesFilters(p, getFilters().attraction, { isFavorite: (id) => store.isFavorite(id) }));
  const facs = visibleFacilities().filter((p) => matchText(p, q));
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
  if (tab === 'map') {
    closeSheet();
  } else {
    els.sheet.classList.add('open');
    els.sheet.setAttribute('aria-hidden', 'false');
    renderSheet();
  }
  syncNav();
}

function closeSheet() {
  els.sheet.classList.remove('open');
  els.sheet.setAttribute('aria-hidden', 'true');
  state.tab = 'map';
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
  state.selectedId = id;
  const poi = getPoiById(state.park, id);
  if (poi && poi.coordinates) map.focusPoi(poi.coordinates, 17);
  map.highlight(id);
  state.tab = 'detail';
  els.sheet.classList.add('open');
  els.sheet.setAttribute('aria-hidden', 'false');
  renderDetail(id);
  syncNav();
}

// ---- park switch ----
function setPark(p) {
  if (p === state.park) return;
  state.park = p;
  state.selectedId = null;
  state.directionId = null;
  map.clearDirection();
  store.setPark(p);
  els.parkToggle.querySelectorAll('button').forEach((b) => {
    const on = b.dataset.park === p;
    b.classList.toggle('on', on);
    b.setAttribute('aria-pressed', on ? 'true' : 'false');
  });
  map.setPark(parkMeta());
  renderMap();
  if (state.tab !== 'map') renderSheet();
  toast(`${PARKS[p].nameKo}로 전환했습니다`);
}

// ---- direction ----
function showDirection(id) {
  const poi = getPoiById(state.park, id);
  if (!poi || !poi.coordinates) return;
  if (!state.user) { toast('먼저 현재 위치를 켜 주세요'); return; }
  state.directionId = id;
  map.showDirection(state.user.coords, poi.coordinates);
  renderDetail(id);
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
      map.setUserLocation(coords, accuracy);
      let msg = `현재 위치 확인됨 (정확도 약 ${Math.round(accuracy)}m)`;
      if (accuracy > 60) msg += ' · 정확도가 낮습니다';
      const meta = parkMeta();
      const [[s1, w1], [n1, e1]] = meta.bounds;
      const inside = coords[0] >= s1 && coords[0] <= n1 && coords[1] >= w1 && coords[1] <= e1;
      if (!inside) msg += ' · 파크 외부로 보입니다';
      setLocStatus(msg);
      if (first) map.centerOnUser(coords);
      renderMap();
      if (state.tab === 'detail') renderDetail(state.selectedId);
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
    const val = key.slice(2);
    f.height = f.height === val ? null : val;
  } else {
    f[key] = !f[key];
  }
  setAttractionFilters(f);
}
function toggleFacilityFilter(key) {
  if (key === 'includeEstimated') {
    store.setSettings({ includeEstimated: !includeEstimated() });
    renderMap();
    return;
  }
  const f = getFilters().facility;
  f[key] = !f[key];
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

    // detail action buttons (fav/direction/visit) — check data-act first
    const act = t.closest('button[data-act]');
    if (act) {
      const id = act.dataset.poi;
      if (act.dataset.act === 'fav') { const on = store.toggleFavorite(id); toast(on ? '즐겨찾기에 추가' : '즐겨찾기 해제'); renderDetail(id); }
      if (act.dataset.act === 'direction') showDirection(id);
      if (act.dataset.act === 'visit') { const on = store.toggleVisit(id); toast(on ? '방문 목록에 추가' : '방문 목록에서 제거'); renderDetail(id); }
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

    // settings: theme
    const themeBtn = t.closest('button[data-theme]');
    if (themeBtn) { applyTheme(themeBtn.dataset.theme); store.setSettings({ theme: themeBtn.dataset.theme }); renderSettings(); return; }
  });

  // settings inputs
  els.sheetBody.addEventListener('click', (e) => {
    if (e.target.id === 'child-add') {
      const c = store.getChildren(); c.push({ name: '새 아이', height: 100 }); store.setChildren(c); renderSettings();
    }
    if (e.target.id === 'child-save') { saveChildren(); toast('아이 프로필을 저장했습니다'); }
    const crm = e.target.closest('[data-child-remove]');
    if (crm) { const c = store.getChildren(); c.splice(Number(crm.dataset.childRemove), 1); store.setChildren(c); renderSettings(); }
  });
  els.sheetBody.addEventListener('change', (e) => {
    if (e.target.id === 'set-estimated') { store.setSettings({ includeEstimated: e.target.checked }); renderMap(); }
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
}

function applyTheme(theme) {
  const root = document.documentElement;
  if (theme === 'auto') root.removeAttribute('data-theme');
  else root.setAttribute('data-theme', theme);
}

function updateOnline() {
  const off = !navigator.onLine;
  els.offline.classList.toggle('show', off);
  els.offline.setAttribute('aria-hidden', off ? 'false' : 'true');
}

// ---- init ----
function init() {
  cacheEls();
  applyTheme(store.getSettings().theme);
  // park toggle initial state
  els.parkToggle.querySelectorAll('button').forEach((b) => {
    const on = b.dataset.park === state.park;
    b.classList.toggle('on', on);
    b.setAttribute('aria-pressed', on ? 'true' : 'false');
  });
  map.init(parkMeta(), {
    onTileError: () => toast('지도 타일을 불러오지 못했습니다. 오프라인이면 목록·검색·즐겨찾기를 이용하세요.', 4000),
  });
  renderMap();
  bindEvents();
  syncNav();
  updateOnline();
  map.invalidate();

  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('./sw.js').catch(() => {});
    });
  }
}

init();
