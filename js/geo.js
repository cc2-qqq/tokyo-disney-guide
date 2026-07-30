// Geolocation + geometry helpers. User location stays in-memory only (never stored/sent).

export function haversineMeters(a, b) {
  const R = 6371000;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(b[0] - a[0]);
  const dLng = toRad(b[1] - a[1]);
  const lat1 = toRad(a[0]);
  const lat2 = toRad(b[0]);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

export function bearingDegrees(from, to) {
  const toRad = (d) => (d * Math.PI) / 180;
  const toDeg = (r) => (r * 180) / Math.PI;
  const lat1 = toRad(from[0]);
  const lat2 = toRad(to[0]);
  const dLng = toRad(to[1] - from[1]);
  const y = Math.sin(dLng) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng);
  return (toDeg(Math.atan2(y, x)) + 360) % 360;
}

const COMPASS = ['북', '북동', '동', '남동', '남', '남서', '서', '북서'];
export function compass8(deg) {
  return COMPASS[Math.round(deg / 45) % 8];
}

export function formatDistance(m) {
  if (m == null || Number.isNaN(m)) return '—';
  if (m < 1000) return `${Math.round(m)}m`;
  return `${(m / 1000).toFixed(m < 10000 ? 2 : 1)}km`;
}

export function isSupported() {
  return 'geolocation' in navigator;
}

// Returns a controller with start/stop for continuous watch.
// callbacks: onPosition({coords:[lat,lng], accuracy}), onError(codeInfo), onStatus(str)
export function createLocator({ onPosition, onError, onStatus } = {}) {
  let watchId = null;

  function classifyError(e) {
    // e.code: 1 PERMISSION_DENIED, 2 POSITION_UNAVAILABLE, 3 TIMEOUT
    switch (e && e.code) {
      case 1: return { code: 'denied', message: '위치 권한이 거부되었습니다. 브라우저 설정에서 허용해 주세요.' };
      case 2: return { code: 'unavailable', message: 'GPS 신호를 받을 수 없습니다. 실내나 지하일 수 있어요.' };
      case 3: return { code: 'timeout', message: '위치 확인이 지연되고 있습니다. 잠시 후 다시 시도해 주세요.' };
      default: return { code: 'unknown', message: '위치를 가져오지 못했습니다.' };
    }
  }

  function start() {
    if (!isSupported()) {
      onError && onError({ code: 'unsupported', message: '이 브라우저는 위치 기능을 지원하지 않습니다.' });
      return;
    }
    if (!window.isSecureContext && location.hostname !== 'localhost' && location.hostname !== '127.0.0.1') {
      onStatus && onStatus('HTTPS가 아니어서 위치 정확도가 낮거나 차단될 수 있습니다.');
    }
    onStatus && onStatus('현재 위치를 확인하는 중…');
    watchId = navigator.geolocation.watchPosition(
      (pos) => {
        onPosition && onPosition({
          coords: [pos.coords.latitude, pos.coords.longitude],
          accuracy: pos.coords.accuracy,
        });
      },
      (e) => { onError && onError(classifyError(e)); },
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 15000 },
    );
  }

  function stop() {
    if (watchId != null) {
      navigator.geolocation.clearWatch(watchId);
      watchId = null;
    }
  }

  return { start, stop };
}
