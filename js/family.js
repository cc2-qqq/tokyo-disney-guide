// Family trip helpers: ride badges, nearby lists, indoor quick filter.
import { rideEligibility, childCanRide, heightTierLabel, closureOnDate } from './labels.js';
import { haversineMeters, formatDistance } from './geo.js';

export function familyRideSummary(attraction, children) {
  const kids = Array.isArray(children) ? children : [];
  const total = kids.length;
  if (!attraction || attraction.type !== 'attraction') {
    return { okCount: null, total, fraction: null, short: '?', text: '확인 필요', cls: 'ride-unknown' };
  }
  if (!total) {
    return { okCount: null, total: 0, fraction: null, short: '?', text: '아이 프로필 없음', cls: 'ride-unknown' };
  }
  let okCount = 0;
  let unknown = false;
  for (const c of kids) {
    const r = rideEligibility(attraction, c.height);
    if (r.ok === true) okCount += 1;
    else if (r.ok == null) unknown = true;
  }
  if (unknown && okCount < total) {
    // Any unverified / special-condition child → show "?" rather than a false 0/2.
    const allUnknown = kids.every((c) => rideEligibility(attraction, c.height).ok == null);
    if (allUnknown) {
      return { okCount: null, total, fraction: null, short: '?', text: '확인 필요', cls: 'ride-unknown' };
    }
  }
  const fraction = `${okCount}/${total}`;
  let text;
  let cls;
  if (okCount === total) {
    text = `두 아이 가능 ${fraction}`;
    if (total !== 2) text = `모두 가능 ${fraction}`;
    cls = 'ride-ok';
  } else if (okCount === 0) {
    text = total === 2 ? `두 아이 불가 ${fraction}` : `탑승 불가 ${fraction}`;
    cls = 'ride-no';
  } else {
    text = `한 아이만 가능 ${fraction}`;
    if (total !== 2) text = `일부 가능 ${fraction}`;
    cls = 'ride-partial';
  }
  // If any child is unknown and not all ok, prefer "?" when none clearly ok/no.
  if (unknown && okCount < total && okCount > 0) {
    // Keep numeric partial — some kids clearly can ride.
  } else if (unknown && okCount === 0) {
    return { okCount: null, total, fraction: null, short: '?', text: '확인 필요', cls: 'ride-unknown' };
  }
  return { okCount, total, fraction, short: fraction, text, cls };
}

export function familyBadgeHtml(attraction, children, { show = true } = {}) {
  if (!show || !attraction || attraction.type !== 'attraction') return '';
  const s = familyRideSummary(attraction, children);
  const height = heightTierLabel(attraction);
  return `<span class="fam-badges">
    <span class="fam-badge ${s.cls}">${escapeHtml(s.text)}</span>
    <span class="fam-badge fam-height">${escapeHtml(height)}</span>
  </span>`;
}

function escapeHtml(s) {
  return (s == null ? '' : String(s)).replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

/** Apply family quick filter presets onto attraction filter object. Returns new filter. */
export function applyFamilyQuick(filters, action, children) {
  const f = { ...(filters || {}), height: null, kid: false, indoor: false, outdoor: false,
    thrill: false, rainy: false, favorites: false, nearest: false, excludeClosed: false };
  const kids = children || [];
  switch (action) {
    case 'all-children':
      f.height = 'all-children';
      break;
    case 'child:0':
      if (kids[0]) f.height = 'child:0';
      break;
    case 'child:1':
      if (kids[1]) f.height = 'child:1';
      break;
    case 'none':
      f.height = 'none';
      break;
    case 'indoor':
      f.indoor = true;
      f.height = kids.length ? 'all-children' : null;
      break;
    case 'kid':
      f.kid = true;
      break;
    case 'excludeClosed':
      f.excludeClosed = true;
      break;
    case 'reset':
      return { height: null };
    default:
      break;
  }
  return f;
}

export function attractionPassesFamilyExtras(poi, filters, visitDate) {
  const f = filters || {};
  if (f.excludeClosed && closureOnDate(poi, visitDate)) return false;
  return true;
}

function trustLabel(poi) {
  const st = poi.coordinateStatus;
  if (st === 'high_estimated') return 'High';
  if (st === 'medium_estimated') return 'Medium';
  if (st === 'low_estimated') return 'Low';
  return '미확인';
}

function nearestOf(items, from, limit = 3) {
  if (!from) return [];
  return items
    .filter((p) => p && p.coordinates)
    .map((p) => ({ ...p, _dist: haversineMeters(from, p.coordinates) }))
    .sort((a, b) => a._dist - b._dist)
    .slice(0, limit);
}

/**
 * Build nearby family sections.
 * from: [lat,lng] reference point (user or entrance).
 */
export function buildNearbySections({
  from, attractions, facilities, children, visitDate, limit = 3,
}) {
  const restrooms = facilities.filter((f) => f.type === 'restroom' && f.generalRestroom !== false);
  const accessible = facilities.filter((f) => f.type === 'restroom' && f.accessibleRestroom);
  const baby = facilities.filter((f) => f.type === 'babyCare' || f.babyCare || f.nursingRoom);
  const firstAid = facilities.filter((f) => f.type === 'firstAid' || f.type === 'emergencyFacility');
  const bothOk = attractions.filter((a) => {
    if (!children.length) return false;
    return children.every((c) => childCanRide(a, c.height));
  });
  const indoor = attractions.filter((a) => a.indoor === true);

  const sections = [
    { key: 'restroom', title: '가까운 화장실', items: nearestOf(restrooms, from, limit) },
    { key: 'accessible', title: '가까운 다기능화장실', items: nearestOf(accessible, from, limit) },
    { key: 'baby', title: '가까운 베이비케어·수유실', items: nearestOf(baby, from, limit) },
    { key: 'both', title: '두 아이 모두 가능한 가까운 어트랙션', items: nearestOf(bothOk, from, limit) },
    { key: 'indoor', title: '가까운 실내 어트랙션', items: nearestOf(indoor, from, limit) },
    { key: 'firstAid', title: '가까운 중앙구호실', items: nearestOf(firstAid, from, limit) },
  ];

  return sections.map((sec) => ({
    ...sec,
    items: sec.items.map((p) => ({
      ...p,
      _trust: trustLabel(p),
      _closedOnVisit: p.type === 'attraction' ? !!closureOnDate(p, visitDate) : false,
      _distLabel: formatDistance(p._dist),
    })),
  }));
}

export { formatDistance, trustLabel };
