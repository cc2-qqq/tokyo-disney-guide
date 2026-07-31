// HTML template helpers (return strings; app.js injects + wires events).
import {
  COORD_STATUS_LABEL, COORD_STATUS_BADGE, ACCURACY_LABEL,
  TYPE_LABEL, confidenceBand, rideEligibility, heightTierLabel,
  closureOnDate, formatDateKo, HEIGHT_MEASURE_NOTE,
} from './labels.js';
import { formatDistance, compass8, bearingDegrees } from './geo.js';

export function esc(s) {
  return (s == null ? '' : String(s)).replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

const TYPE_MARK = {
  attraction: '\u{1F3A0}', restroom: 'WC', firstAid: '\u271A',
  emergencyFacility: '\u271A', babyCare: '\u{1F476}',
};

function badge(poi) {
  const b = COORD_STATUS_BADGE[poi.coordinateStatus] || COORD_STATUS_BADGE.unknown;
  return `<span class="badge ${b.cls}">${esc(b.text)}</span>`;
}

export function listItem(poi, { distance, isFav, isDone } = {}) {
  const name = esc(poi.nameKo || poi.name);
  const sub = esc(poi.nameNote || poi.nameEn || '');
  const area = esc(poi.areaNameKo || '');
  const mark = TYPE_MARK[poi.type] || '\u{1F4CD}';
  const dist = distance != null ? `<span class="li-dist">${esc(formatDistance(distance))}</span>` : '';
  const favMark = isFav ? '<span class="li-fav" aria-label="즐겨찾기됨">\u2605</span>' : '';
  const doneMark = isDone ? '<span class="li-done" aria-label="완료">\u2713</span>' : '';
  let statusBadge = '';
  if (poi.operatingStatus === 'closed_longterm') statusBadge = '<span class="badge badge-closed">운영 종료</span>';
  else if (poi._closedOnVisit) statusBadge = '<span class="badge badge-closed">방문일 휴장</span>';
  return `
    <li>
      <button class="li" data-poi="${esc(poi.id)}" type="button">
        <span class="li-mark li-${esc(poi.type)}" aria-hidden="true">${mark}</span>
        <span class="li-body">
          <span class="li-name">${name} ${favMark}${doneMark}</span>
          <span class="li-meta">${area ? esc(area) + ' · ' : ''}${esc(TYPE_LABEL[poi.type] || '')}${sub ? ' · ' + sub : ''}</span>
        </span>
        <span class="li-right">${dist}${statusBadge}${badge(poi)}</span>
      </button>
    </li>`;
}

export function listHtml(pois, opts = {}) {
  if (!pois.length) return emptyState(opts.emptyMsg || '표시할 항목이 없습니다.');
  return `<ul class="poi-list">${pois.map((p) => listItem(p, {
    distance: p._dist,
    isFav: opts.isFav && opts.isFav(p.id),
    isDone: opts.isDone && opts.isDone(p.id),
  })).join('')}</ul>`;
}

export function emptyState(msg) {
  return `<div class="empty">${esc(msg)}</div>`;
}

const OFFICIAL_APP_NOTE = '실시간 대기시간과 운영 여부는 도쿄디즈니리조트 공식 앱에서 확인해 주세요.';
const STRAIGHT_LINE_NOTE = '실제 보행경로가 아닌 현재 위치와 목적지 간 직선 방향입니다. 실제 이동거리와 소요시간은 다를 수 있습니다.';

function confChip(poi) {
  const band = confidenceBand(poi.confidenceScore, poi.coordinateStatus);
  const statusLabel = COORD_STATUS_LABEL[poi.coordinateStatus] || '미확인';
  const acc = ACCURACY_LABEL[poi.coordinateStatus] || '미확인';
  return `
    <div class="detail-grid">
      <div class="dg-k">좌표 신뢰도</div><div class="dg-v">${esc(statusLabel)} · 신뢰도 ${esc(band.label)}</div>
      <div class="dg-k">예상 위치 오차</div><div class="dg-v">${esc(acc)}</div>
    </div>`;
}

function directionCard(dir) {
  if (!dir) return '';
  const dir8 = compass8(dir.bearing);
  return `
    <div class="dir-card" role="status">
      <div class="dir-title">직선거리 안내</div>
      <div class="dir-main"><strong>${esc(formatDistance(dir.distance))}</strong> · ${esc(dir8)}쪽 방향 (${Math.round(dir.bearing)}\u00B0)</div>
      <p class="dir-note">${esc(STRAIGHT_LINE_NOTE)}</p>
    </div>`;
}

function actionRow(poi, { isFav, inVisit } = {}, canDirection) {
  return `
    <div class="detail-actions">
      <button class="btn ${isFav ? 'btn-active' : ''}" data-act="fav" data-poi="${esc(poi.id)}" type="button" aria-pressed="${!!isFav}">
        <span aria-hidden="true">${isFav ? '\u2605' : '\u2606'}</span> 즐겨찾기
      </button>
      <button class="btn" data-act="direction" data-poi="${esc(poi.id)}" type="button" ${canDirection ? '' : 'disabled'}>
        <span aria-hidden="true">\u{1F9ED}</span> 방향 보기
      </button>
      <button class="btn ${inVisit ? 'btn-active' : ''}" data-act="visit" data-poi="${esc(poi.id)}" type="button" aria-pressed="${!!inVisit}">
        <span aria-hidden="true">\u{1F4CB}</span> 내 방문 목록
      </button>
    </div>`;
}

function closedBanner(poi) {
  if (poi.operatingStatus !== 'closed_longterm') return '';
  const info = poi.closedInfo || {};
  return `<div class="closed-banner" role="status">
      <strong>\u26D4 운영 종료 · 장기 휴장</strong>
      <p>${esc(info.since ? formatDateKo(info.since) + '부터 ' : '')}휴장 중입니다${info.reopen ? ` (재개 ${esc(info.reopen)})` : ''}.${info.reason ? ' ' + esc(info.reason) + '.' : ''}</p>
      <p class="small">기본 지도·목록에서는 제외되어 있습니다.${info.sourceUrl ? ` <a href="${esc(info.sourceUrl)}" target="_blank" rel="noopener">공식 안내</a>` : ''}</p>
    </div>`;
}

function closureWarning(closure) {
  if (!closure) return '';
  const period = `${formatDateKo(closure.startDate)} ~ ${closure.endDate ? formatDateKo(closure.endDate) : '미정(TBD)'}`;
  return `<div class="closed-banner closure-warn" role="status">
      <strong>\u26A0\uFE0F 방문 예정일에는 공식 휴장 예정입니다.</strong>
      <p>공식 휴장 기간: ${esc(period)}</p>
      ${closure.note ? `<p class="small">${esc(closure.note)}</p>` : ''}
      <p class="small">사전 발표된 휴장 정보입니다. 실시간 운휴 여부는 공식 앱에서 다시 확인해 주세요.${closure.sourceUrl ? ` <a href="${esc(closure.sourceUrl)}" target="_blank" rel="noopener">공식 안내</a>` : ''}</p>
    </div>`;
}

export function attractionDetail(poi, { children, isFav, inVisit, distance, userCoords, direction, visitDate }) {
  const closure = closureOnDate(poi, visitDate);
  const rides = (children || []).map((c) => {
    const r = rideEligibility(poi, c.height);
    return `<div class="ride-row ${r.cls}">
        <span class="ride-name">${esc(c.name)} (${esc(c.height)}cm)</span>
        <span class="ride-verdict">${esc(r.label)}</span>
      </div>`;
  }).join('');
  const distLine = distance != null
    ? `<div class="dg-k">현재 위치에서</div><div class="dg-v">직선거리 ${esc(formatDistance(distance))}</div>`
    : `<div class="dg-k">현재 위치에서</div><div class="dg-v">현재 위치를 켜면 직선거리를 볼 수 있어요</div>`;
  return `
    <div class="detail">
      <div class="detail-head">
        <span class="li-mark li-attraction" aria-hidden="true">${TYPE_MARK.attraction}</span>
        <div>
          <h2 class="detail-title">${esc(poi.nameKo)}</h2>
          <p class="detail-sub">${esc(poi.nameJa || '')}${poi.nameJa && poi.nameEn ? ' · ' : ''}${esc(poi.nameEn || '')}</p>
        </div>
      </div>
      ${closedBanner(poi)}
      ${closureWarning(closure)}
      <div class="detail-tags">
        <span class="tag">${esc(poi.areaNameKo || '')}</span>
        <span class="tag">${esc(heightTierLabel(poi))}</span>
        ${poi.indoor ? '<span class="tag">실내</span>' : '<span class="tag">야외</span>'}
        ${poi.thrill ? '<span class="tag tag-thrill">스릴</span>' : ''}
        ${poi.kidFriendly ? '<span class="tag tag-kid">어린이 추천</span>' : ''}
      </div>

      <h3 class="detail-h3">아이별 탑승 가능 여부</h3>
      <div class="ride-list">${rides || '<div class="empty">아이 프로필이 없습니다. 설정에서 추가해 주세요.</div>'}</div>
      ${poi.heightMin != null && poi.heightStatus === 'official' ? `<p class="detail-note">\u2139\uFE0F ${esc(HEIGHT_MEASURE_NOTE)}${poi.heightSourceUrl ? ` <a href="${esc(poi.heightSourceUrl)}" target="_blank" rel="noopener">공식 키 제한 안내</a>` : ''}</p>` : ''}

      <div class="detail-grid">${distLine}</div>
      ${confChip(poi)}
      ${directionCard(direction)}
      ${actionRow(poi, { isFav, inVisit }, !!userCoords)}
      ${poi.notes ? `<p class="detail-note">${esc(poi.notes)}</p>` : ''}
      <p class="detail-note detail-warn">\u2139\uFE0F ${esc(OFFICIAL_APP_NOTE)}</p>
    </div>`;
}

export function facilityDetail(poi, { isFav, inVisit, distance, userCoords, direction }) {
  const yn = (v) => v === true ? '있음' : v === false ? '없음' : '확인 필요';
  const rows = [
    ['시설 종류', TYPE_LABEL[poi.type] || ''],
    ['구역', poi.areaNameKo || ''],
  ];
  if (poi.type === 'restroom' || poi.type === 'babyCare') {
    rows.push(['일반화장실', yn(poi.generalRestroom)]);
    rows.push(['다기능화장실', yn(poi.accessibleRestroom)]);
    rows.push(['수유실', yn(poi.nursingRoom)]);
    rows.push(['베이비케어룸', yn(poi.babyCare)]);
  }
  rows.push(['게이트 안/밖', poi.insidePaidArea === true ? '게이트 안쪽' : poi.insidePaidArea === false ? '게이트 밖' : '확인 필요']);
  rows.push(['일반 게스트 이용', yn(poi.generalGuestAccessible)]);
  const grid = rows.map(([k, v]) => `<div class="dg-k">${esc(k)}</div><div class="dg-v">${esc(v)}</div>`).join('');
  const distLine = distance != null
    ? `<div class="dg-k">현재 위치에서</div><div class="dg-v">직선거리 ${esc(formatDistance(distance))}</div>` : '';
  return `
    <div class="detail">
      <div class="detail-head">
        <span class="li-mark li-${esc(poi.type)}" aria-hidden="true">${TYPE_MARK[poi.type] || 'WC'}</span>
        <div>
          <h2 class="detail-title">${esc(poi.name || poi.nameKo)}</h2>
          <p class="detail-sub">${esc(poi.nameNote || '')}</p>
        </div>
      </div>
      <div class="detail-grid">${grid}${distLine}</div>
      ${confChip(poi)}
      ${poi.evidence ? `<div class="detail-grid"><div class="dg-k">위치 확인 근거</div><div class="dg-v">${esc(poi.evidence)}</div></div>` : ''}
      ${directionCard(direction)}
      ${actionRow(poi, { isFav, inVisit }, !!userCoords)}
      ${poi.notes ? `<p class="detail-note">${esc(poi.notes)}</p>` : ''}
    </div>`;
}

export function computeDirection(userCoords, poi) {
  if (!userCoords || !poi || !poi.coordinates) return null;
  return {
    distance: undefined, // filled by caller with haversine to avoid double import cycles
    bearing: bearingDegrees(userCoords, poi.coordinates),
  };
}
