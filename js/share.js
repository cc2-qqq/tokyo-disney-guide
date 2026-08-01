// Family plan share: compact URL payload, JSON import/export. Never includes GPS.

const SHARE_VERSION = 1;

function toB64Url(bytes) {
  let bin = '';
  for (let i = 0; i < bytes.length; i += 1) bin += String.fromCharCode(bytes[i]);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromB64Url(str) {
  const pad = str.length % 4 === 0 ? '' : '='.repeat(4 - (str.length % 4));
  const b64 = str.replace(/-/g, '+').replace(/_/g, '/') + pad;
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i += 1) out[i] = bin.charCodeAt(i);
  return out;
}

async function compressJson(obj) {
  const json = JSON.stringify(obj);
  if (typeof CompressionStream === 'undefined') {
    return { m: 'r', d: toB64Url(new TextEncoder().encode(json)) };
  }
  const stream = new Blob([json]).stream().pipeThrough(new CompressionStream('deflate-raw'));
  const buf = await new Response(stream).arrayBuffer();
  return { m: 'z', d: toB64Url(new Uint8Array(buf)) };
}

async function decompressPayload({ m, d }) {
  const bytes = fromB64Url(d);
  if (m === 'r' || typeof DecompressionStream === 'undefined') {
    return JSON.parse(new TextDecoder().decode(bytes));
  }
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  const text = await new Response(stream).text();
  return JSON.parse(text);
}

/** Build minimal share object from store snapshot (no GPS). */
export function buildShareData({
  park, visitDate, children, favorites, visitList, done, priorities, meetup, includeFilters, filters,
}) {
  const data = {
    v: SHARE_VERSION,
    p: park === 'TDS' ? 'TDS' : 'TDL',
    d: visitDate,
    c: (children || []).map((x) => ({ n: x.name, h: Number(x.height) || 0 })),
    f: (favorites || []).slice(0, 80),
    vl: (visitList || []).map((id) => ({
      i: id,
      pr: (priorities && priorities[id]) || 'maybe',
      dn: !!(done && done.includes(id)),
    })),
  };
  if (meetup && meetup.coordinates) {
    data.m = {
      n: meetup.label || '',
      note: meetup.note || '',
      c: meetup.coordinates,
      f: meetup.facilityId || null,
      at: meetup.savedAt || null,
    };
  }
  if (includeFilters && filters) data.fl = filters;
  return data;
}

export async function encodeShareToParam(data) {
  const packed = await compressJson(data);
  return `s=${packed.m}.${packed.d}`;
}

export async function decodeShareParam(paramValue) {
  if (!paramValue) return null;
  const raw = paramValue.startsWith('s=') ? paramValue.slice(2) : paramValue;
  const dot = raw.indexOf('.');
  if (dot < 0) return null;
  const m = raw.slice(0, dot);
  const d = raw.slice(dot + 1);
  if (!d) return null;
  const data = await decompressPayload({ m, d });
  if (!data || data.v !== SHARE_VERSION) throw new Error('지원하지 않는 공유 형식입니다.');
  return normalizeShare(data);
}

function normalizeShare(data) {
  return {
    park: data.p === 'TDS' ? 'TDS' : 'TDL',
    visitDate: data.d || null,
    children: (data.c || []).map((x) => ({ name: x.n || '아이', height: Number(x.h) || 100 })),
    favorites: data.f || [],
    visitList: (data.vl || []).map((x) => x.i).filter(Boolean),
    done: (data.vl || []).filter((x) => x.dn).map((x) => x.i),
    priorities: Object.fromEntries((data.vl || []).map((x) => [x.i, x.pr || 'maybe'])),
    meetup: data.m ? {
      label: data.m.n || '',
      note: data.m.note || '',
      coordinates: data.m.c,
      facilityId: data.m.f || null,
      savedAt: data.m.at || null,
      park: data.p === 'TDS' ? 'TDS' : 'TDL',
    } : null,
    filters: data.fl || null,
  };
}

export function exportShareJson(data) {
  return JSON.stringify({ ...data, exportedAt: new Date().toISOString(), note: '도쿄 디즈니 현장 가이드 방문 계획 사본' }, null, 2);
}

export function parseShareJson(text) {
  const obj = JSON.parse(text);
  // Accept either packed share shape or normalizeShare shape
  if (obj.v && (obj.p || obj.vl)) return normalizeShare(obj);
  if (obj.park && (obj.visitList || obj.children)) {
    return {
      park: obj.park === 'TDS' ? 'TDS' : 'TDL',
      visitDate: obj.visitDate || null,
      children: obj.children || [],
      favorites: obj.favorites || [],
      visitList: obj.visitList || [],
      done: obj.done || [],
      priorities: obj.priorities || {},
      meetup: obj.meetup || null,
      filters: obj.filters || null,
    };
  }
  throw new Error('올바른 공유 JSON이 아닙니다.');
}

export function buildShareUrl(baseUrl, param) {
  const u = new URL(baseUrl);
  u.searchParams.delete('s');
  // param is "s=m.d" — set as single query
  const [k, v] = param.split('=');
  u.searchParams.set(k || 's', v || param);
  return u.toString();
}
