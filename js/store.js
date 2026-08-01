// localStorage-backed app state. All keys namespaced with 'tdg:'.
const KEY = {
  park: 'tdg:park',
  favorites: 'tdg:favorites',
  children: 'tdg:children',
  filters: 'tdg:filters',
  visitList: 'tdg:visitList',
  done: 'tdg:done',
  settings: 'tdg:settings',
  visitDate: 'tdg:visitDate',
  visitPriorities: 'tdg:visitPriorities',
  meetup: 'tdg:meetup', // { TDL: {...}, TDS: {...} }
};

const DEFAULT_VISIT_DATE = '2026-08-10';

function read(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    if (raw == null) return fallback;
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}
function write(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage full / disabled: keep working in-memory */
  }
}

const DEFAULT_CHILDREN = [
  { name: '담이', height: 115 },
  { name: '이서', height: 103 },
];

const DEFAULT_SETTINGS = {
  includeEstimated: false, // 낮은 신뢰도(Low, 및 TDL Medium)까지 표시
  includePregate: false, // 입구 밖(프리게이트) 화장실 포함
  theme: 'auto', // 'auto' | 'light' | 'dark'
  // Vector basemap label language: Korean-first (keeps JP as data / high-zoom aux).
  mapLabelMode: 'ko', // 'ko' | 'ko_ja' | 'ja'
  showFamilyRideBadge: true, // 목록·마커 가족 탑승 배지
  showEntranceMarkers: true, // 입구 마커
  showParkBoundaries: true, // 파크·유료구역 경계
  showPregateBoundary: true, // 프리게이트 영역 경계
  showBoundaryLabels: true, // 경계 라벨
};

const PRIORITIES = new Set(['must', 'maybe', 'hold']);

export const store = {
  getPark() {
    const p = read(KEY.park, 'TDL');
    return p === 'TDS' ? 'TDS' : 'TDL';
  },
  setPark(p) { write(KEY.park, p); },

  getFavorites() { return read(KEY.favorites, []); },
  isFavorite(id) { return this.getFavorites().includes(id); },
  toggleFavorite(id) {
    const list = this.getFavorites();
    const i = list.indexOf(id);
    if (i >= 0) list.splice(i, 1); else list.push(id);
    write(KEY.favorites, list);
    return list.includes(id);
  },
  setFavorites(list) { write(KEY.favorites, Array.isArray(list) ? list : []); },

  getChildren() {
    const c = read(KEY.children, null);
    if (!Array.isArray(c) || c.length === 0) return DEFAULT_CHILDREN.slice();
    return c;
  },
  setChildren(children) { write(KEY.children, children); },

  getFilters() { return this.normalizeFilters(read(KEY.filters, {})); },
  setFilters(f) { write(KEY.filters, this.normalizeFilters(f)); },

  /**
   * Normalize filter storage.
   * Attraction filters stay shared; facility filters are per-park
   * ({ facilityByPark: { TDL, TDS } }).
   * Legacy shared `facility` migrates to TDL only so High-only does not carry into TDS.
   */
  normalizeFilters(raw) {
    const src = raw && typeof raw === 'object' ? raw : {};
    const attraction = src.attraction || {};
    let facilityByPark = src.facilityByPark;
    if (!facilityByPark || typeof facilityByPark !== 'object') {
      facilityByPark = { TDL: {}, TDS: {} };
      if (src.facility && typeof src.facility === 'object') {
        facilityByPark.TDL = { ...src.facility };
      }
    } else {
      facilityByPark = {
        TDL: { ...(facilityByPark.TDL || {}) },
        TDS: { ...(facilityByPark.TDS || {}) },
      };
    }
    return { attraction, facilityByPark };
  },

  getFacilityFilters(park) {
    const p = park === 'TDS' ? 'TDS' : 'TDL';
    const all = this.getFilters();
    return { ...(all.facilityByPark[p] || {}) };
  },

  setFacilityFilters(park, ff) {
    const p = park === 'TDS' ? 'TDS' : 'TDL';
    const all = this.getFilters();
    all.facilityByPark[p] = ff && typeof ff === 'object' ? { ...ff } : {};
    this.setFilters(all);
  },

  getVisitList() { return read(KEY.visitList, []); },
  setVisitList(list) { write(KEY.visitList, list); },
  inVisitList(id) { return this.getVisitList().includes(id); },
  toggleVisit(id) {
    const list = this.getVisitList();
    const i = list.indexOf(id);
    if (i >= 0) {
      list.splice(i, 1);
      const pr = this.getVisitPriorities();
      delete pr[id];
      this.setVisitPriorities(pr);
    } else {
      list.push(id);
      const pr = this.getVisitPriorities();
      if (!pr[id]) pr[id] = 'maybe';
      this.setVisitPriorities(pr);
    }
    write(KEY.visitList, list);
    return list.includes(id);
  },

  getVisitPriorities() { return read(KEY.visitPriorities, {}) || {}; },
  setVisitPriorities(map) { write(KEY.visitPriorities, map || {}); },
  getVisitPriority(id) {
    const p = this.getVisitPriorities()[id];
    return PRIORITIES.has(p) ? p : 'maybe';
  },
  setVisitPriority(id, priority) {
    const pr = this.getVisitPriorities();
    pr[id] = PRIORITIES.has(priority) ? priority : 'maybe';
    this.setVisitPriorities(pr);
  },

  getDone() { return read(KEY.done, []); },
  isDone(id) { return this.getDone().includes(id); },
  setDone(list) { write(KEY.done, Array.isArray(list) ? list : []); },
  toggleDone(id) {
    const list = this.getDone();
    const i = list.indexOf(id);
    if (i >= 0) list.splice(i, 1); else list.push(id);
    write(KEY.done, list);
    return list.includes(id);
  },

  getSettings() { return { ...DEFAULT_SETTINGS, ...read(KEY.settings, {}) }; },
  setSettings(s) { write(KEY.settings, { ...this.getSettings(), ...s }); },

  getVisitDate() {
    const v = read(KEY.visitDate, DEFAULT_VISIT_DATE);
    return /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : DEFAULT_VISIT_DATE;
  },
  setVisitDate(d) { if (/^\d{4}-\d{2}-\d{2}$/.test(d)) write(KEY.visitDate, d); },

  /** Per-park meetup: { park, coordinates, facilityId, label, note, savedAt } */
  getMeetup(park) {
    const all = read(KEY.meetup, {}) || {};
    const p = park === 'TDS' ? 'TDS' : 'TDL';
    return all[p] || null;
  },
  setMeetup(park, meetup) {
    const all = read(KEY.meetup, {}) || {};
    const p = park === 'TDS' ? 'TDS' : 'TDL';
    if (!meetup) delete all[p];
    else all[p] = { ...meetup, park: p };
    write(KEY.meetup, all);
  },
  clearMeetup(park) { this.setMeetup(park, null); },
};
