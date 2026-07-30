// localStorage-backed app state. All keys namespaced with 'tdg:'.
const KEY = {
  park: 'tdg:park',
  favorites: 'tdg:favorites',
  children: 'tdg:children',
  filters: 'tdg:filters',
  visitList: 'tdg:visitList',
  done: 'tdg:done',
  settings: 'tdg:settings',
};

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
  includeEstimated: false, // 추정 위치(low) 표시 여부
  theme: 'auto', // 'auto' | 'light' | 'dark'
};

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

  getChildren() {
    const c = read(KEY.children, null);
    if (!Array.isArray(c) || c.length === 0) return DEFAULT_CHILDREN.slice();
    return c;
  },
  setChildren(children) { write(KEY.children, children); },

  getFilters() { return read(KEY.filters, {}); },
  setFilters(f) { write(KEY.filters, f); },

  getVisitList() { return read(KEY.visitList, []); },
  setVisitList(list) { write(KEY.visitList, list); },
  inVisitList(id) { return this.getVisitList().includes(id); },
  toggleVisit(id) {
    const list = this.getVisitList();
    const i = list.indexOf(id);
    if (i >= 0) list.splice(i, 1); else list.push(id);
    write(KEY.visitList, list);
    return list.includes(id);
  },

  getDone() { return read(KEY.done, []); },
  isDone(id) { return this.getDone().includes(id); },
  toggleDone(id) {
    const list = this.getDone();
    const i = list.indexOf(id);
    if (i >= 0) list.splice(i, 1); else list.push(id);
    write(KEY.done, list);
    return list.includes(id);
  },

  getSettings() { return { ...DEFAULT_SETTINGS, ...read(KEY.settings, {}) }; },
  setSettings(s) { write(KEY.settings, { ...this.getSettings(), ...s }); },
};
