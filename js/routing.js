// Park-internal walk routing over a hand-authored graph (Dijkstra).
// User-facing walk routes require routingEnabled + fully verified edges.
import { haversineMeters } from './geo.js';

export const SNAP_MAX_M = 25; // start → nearest walk node
export const DEST_CONNECTOR_MAX_M = 20; // destination → connector node
export const APPROACH_MAX_M = 25; // legacy alias for start snap

const VERIFYING_MSG = '현재 상세 보행 경로는 검증 중입니다. 목적지 방향과 직선거리만 안내합니다.';
const UNVERIFIED_SEGMENT_MSG = '이 구간은 아직 실제 보행로 검증이 완료되지 않아 직선 방향만 안내합니다.';
const UNSUPPORTED_MSG = VERIFYING_MSG;

const VERIFIED = 'verified';

function edgeKey(a, b) { return a < b ? `${a}|${b}` : `${b}|${a}`; }

function nodeById(graph) {
  const m = new Map();
  for (const n of graph.nodes) m.set(n.id, n);
  return m;
}

function edgeStatus(e) {
  if (!e) return 'unverified';
  if (e.status) return e.status;
  if (e.verified === true) return VERIFIED;
  if (e.blocked || e.temporarilyClosed) return 'blocked';
  return 'unverified';
}

function isRoutableEdge(e, { requireVerified }) {
  const st = edgeStatus(e);
  if (st === 'blocked') return false;
  if (e.temporarilyClosed) return false;
  if (requireVerified && st !== VERIFIED) return false;
  return true;
}

/** Polyline length along [lat,lng][] */
export function lineDistanceMeters(coords) {
  if (!coords || coords.length < 2) return 0;
  let sum = 0;
  for (let i = 1; i < coords.length; i += 1) {
    sum += haversineMeters(coords[i - 1], coords[i]);
  }
  return sum;
}

/** Edge geometry in travel direction from→to (falls back to straight). */
export function edgeGeometry(graph, fromId, toId) {
  const nodes = nodeById(graph);
  const a = nodes.get(fromId);
  const b = nodes.get(toId);
  if (!a || !b) return null;
  const edge = (graph.edges || []).find(
    (e) => (e.from === fromId && e.to === toId) || (e.from === toId && e.to === fromId && !e.oneWay),
  );
  if (edge && Array.isArray(edge.geometry) && edge.geometry.length >= 2) {
    const g = edge.geometry;
    const forward = edge.from === fromId;
    return forward ? g.slice() : g.slice().reverse();
  }
  return [a.coordinates, b.coordinates];
}

export function buildAdjacency(graph, { requireVerified = false } = {}) {
  const adj = new Map();
  const ensure = (id) => { if (!adj.has(id)) adj.set(id, []); return adj.get(id); };
  for (const n of graph.nodes) ensure(n.id);
  for (const e of graph.edges) {
    if (!isRoutableEdge(e, { requireVerified })) continue;
    const dist = e.distance != null
      ? e.distance
      : lineDistanceMeters(edgeGeometry(graph, e.from, e.to));
    ensure(e.from).push({ to: e.to, distance: dist, meta: e });
    if (!e.oneWay) ensure(e.to).push({ to: e.from, distance: dist, meta: e });
  }
  return adj;
}

function resolveDistance(graph, fromId, toId, declared) {
  if (declared != null && declared > 0) return declared;
  const geom = edgeGeometry(graph, fromId, toId);
  return lineDistanceMeters(geom);
}

/** Nearest graph node to a latlng within maxM. */
export function nearestNode(graph, coords, { maxM = SNAP_MAX_M } = {}) {
  let best = null; let bestD = Infinity;
  for (const n of graph.nodes) {
    const d = haversineMeters(coords, n.coordinates);
    if (d < bestD) { bestD = d; best = n; }
  }
  if (!best || bestD > maxM) return null;
  return { node: best, distance: bestD };
}

export function destinationNode(graph, poi) {
  return connectorDestination(graph, poi) || (poi?.coordinates ? nearestNode(graph, poi.coordinates) : null);
}

export function connectorDestination(graph, poi) {
  if (!poi || !graph) return null;
  const conn = (graph.destinationConnectors || []).find((c) => c.poiId === poi.id);
  if (!conn) return null;
  const n = graph.nodes.find((x) => x.id === conn.nodeId);
  if (!n) return null;
  const dist = conn.distance != null
    ? conn.distance
    : (poi.coordinates ? haversineMeters(poi.coordinates, n.coordinates) : 0);
  return { node: n, distance: dist, viaConnector: true, connector: conn };
}

/**
 * Dijkstra. Stores prev edge endpoints for geometry rebuild.
 */
export function dijkstra(graph, startId, endId, { requireVerified = true } = {}) {
  if (!graph || startId === endId) {
    const n = graph && graph.nodes.find((x) => x.id === startId);
    if (!n) return null;
    return {
      path: [n.coordinates],
      nodeIds: [startId],
      edgeIds: [],
      distance: 0,
      confidence: graph.confidence || '부분',
      allVerified: true,
    };
  }
  const nodes = nodeById(graph);
  const adj = buildAdjacency(graph, { requireVerified });
  if (!nodes.has(startId) || !nodes.has(endId)) return null;

  const dist = new Map();
  const prev = new Map(); // id -> previous node id
  const open = new Set(nodes.keys());
  for (const id of open) dist.set(id, Infinity);
  dist.set(startId, 0);

  while (open.size) {
    let u = null; let best = Infinity;
    for (const id of open) {
      const d = dist.get(id);
      if (d < best) { best = d; u = id; }
    }
    if (u == null || best === Infinity) break;
    open.delete(u);
    if (u === endId) break;
    for (const edge of adj.get(u) || []) {
      if (!open.has(edge.to)) continue;
      const w = resolveDistance(graph, u, edge.to, edge.distance);
      const alt = best + w;
      if (alt < dist.get(edge.to)) {
        dist.set(edge.to, alt);
        prev.set(edge.to, u);
      }
    }
  }

  if (dist.get(endId) === Infinity) return null;
  const nodeIds = [];
  let cur = endId;
  while (cur != null) {
    nodeIds.push(cur);
    cur = prev.get(cur);
  }
  nodeIds.reverse();

  const edgeIds = [];
  const path = [];
  let allVerified = true;
  for (let i = 0; i < nodeIds.length; i += 1) {
    if (i === 0) {
      path.push(nodes.get(nodeIds[0]).coordinates);
      continue;
    }
    const from = nodeIds[i - 1];
    const to = nodeIds[i];
    const edge = (graph.edges || []).find(
      (e) => (e.from === from && e.to === to) || (e.from === to && e.to === from && !e.oneWay),
    );
    if (edge) {
      edgeIds.push(edge.id || edgeKey(from, to));
      if (edgeStatus(edge) !== VERIFIED) allVerified = false;
    }
    const geom = edgeGeometry(graph, from, to);
    for (let j = 1; j < geom.length; j += 1) path.push(geom[j]);
  }

  return {
    path,
    nodeIds,
    edgeIds,
    distance: dist.get(endId),
    confidence: graph.confidence || '부분',
    allVerified,
  };
}

function inMaxBounds(coords, maxBounds) {
  if (!maxBounds || !coords) return true;
  const [[s, w], [n, e]] = maxBounds;
  return coords[0] >= s && coords[0] <= n && coords[1] >= w && coords[1] <= e;
}

function coverageOfArea(graph, areaId) {
  const cov = graph.routingCoverage || {};
  return cov[areaId] || 'unverified';
}

/** Whether UI may offer a verified walk-route button for this POI. */
export function canOfferWalkRoute(graph, poi, fromCoords, { maxBounds, entranceCoords } = {}) {
  if (!graph || !graph.routingEnabled || !poi) return false;
  const dest = connectorDestination(graph, poi);
  if (!dest) return false;
  const areaCov = coverageOfArea(graph, dest.node.area);
  if (areaCov === 'unverified') return false;
  const from = fromCoords || entranceCoords;
  if (!from) return false;
  const result = routeToPoi(graph, from, poi, { maxBounds, requireVerified: true });
  return !!(result && result.ok);
}

/**
 * Full route from user/start coords to a POI.
 * Walk mode only when routingEnabled and every used edge is verified.
 */
export function routeToPoi(graph, fromCoords, poi, {
  maxBounds,
  requireVerified = true,
  startSnapMaxM = SNAP_MAX_M,
  destSnapMaxM = DEST_CONNECTOR_MAX_M,
} = {}) {
  if (!graph || !fromCoords || !poi || !poi.coordinates) {
    return { ok: false, reason: UNSUPPORTED_MSG, support: 'unsupported' };
  }
  if (!graph.routingEnabled) {
    return { ok: false, reason: VERIFYING_MSG, support: 'disabled' };
  }
  if (maxBounds && (!inMaxBounds(fromCoords, maxBounds) || !inMaxBounds(poi.coordinates, maxBounds))) {
    return { ok: false, reason: UNSUPPORTED_MSG, support: 'unsupported' };
  }

  const dest = connectorDestination(graph, poi);
  if (!dest) {
    return { ok: false, reason: UNSUPPORTED_MSG, support: 'unsupported' };
  }
  const exitDist = haversineMeters(dest.node.coordinates, poi.coordinates);
  if (exitDist > destSnapMaxM) {
    return { ok: false, reason: UNVERIFIED_SEGMENT_MSG, support: 'snap-fail', debug: { exitDist } };
  }

  const start = nearestNode(graph, fromCoords, { maxM: startSnapMaxM });
  if (!start) {
    return { ok: false, reason: UNVERIFIED_SEGMENT_MSG, support: 'snap-fail' };
  }

  const result = dijkstra(graph, start.node.id, dest.node.id, { requireVerified });
  if (!result) {
    // Retry without verified filter only to classify failure reason — never return that path to users.
    const anyPath = dijkstra(graph, start.node.id, dest.node.id, { requireVerified: false });
    if (anyPath && !anyPath.allVerified) {
      return {
        ok: false,
        reason: UNVERIFIED_SEGMENT_MSG,
        support: 'unverified',
        debug: explainRoute(graph, fromCoords, poi, anyPath, start, dest),
      };
    }
    return { ok: false, reason: UNSUPPORTED_MSG, support: 'unsupported' };
  }
  if (requireVerified && !result.allVerified) {
    return {
      ok: false,
      reason: UNVERIFIED_SEGMENT_MSG,
      support: 'unverified',
      debug: explainRoute(graph, fromCoords, poi, result, start, dest),
    };
  }

  // Start snap: include approach only when within snap limit (already enforced).
  // Do NOT extend the drawn path into the POI building footprint — end at connector node.
  const path = [];
  if (start.distance > 0.5) path.push(fromCoords);
  for (const pt of result.path) path.push(pt);
  for (const pt of path) {
    if (maxBounds && !inMaxBounds(pt, maxBounds)) {
      return { ok: false, reason: UNSUPPORTED_MSG, support: 'unsupported' };
    }
  }

  const approach = start.distance + exitDist;
  const verifiedRatio = result.edgeIds.length
    ? 1
    : 1;
  return {
    ok: true,
    mode: 'walk',
    path,
    nodeIds: result.nodeIds,
    edgeIds: result.edgeIds,
    distance: result.distance + approach,
    confidence: 'verified',
    coverageNote: graph.coverageNote || '',
    support: 'verified',
    supportLabel: '검증된 예상 보행 경로',
    verifiedRatio,
    debug: explainRoute(graph, fromCoords, poi, result, start, dest),
  };
}

/** Detailed breakdown for routeDebug overlays / reports. */
export function explainRoute(graph, fromCoords, poi, dijkstraResult, start, dest) {
  const nodes = nodeById(graph);
  const nodeIds = dijkstraResult.nodeIds || [];
  const edges = [];
  for (let i = 1; i < nodeIds.length; i += 1) {
    const from = nodeIds[i - 1];
    const to = nodeIds[i];
    const edge = (graph.edges || []).find(
      (e) => (e.from === from && e.to === to) || (e.from === to && e.to === from && !e.oneWay),
    );
    const geom = edgeGeometry(graph, from, to) || [];
    edges.push({
      id: (edge && edge.id) || edgeKey(from, to),
      from,
      to,
      status: edgeStatus(edge),
      lengthM: Math.round(lineDistanceMeters(geom)),
      geometry: geom,
      hasIntermediate: geom.length > 2,
    });
  }
  return {
    startSnap: start ? { nodeId: start.node.id, distanceM: Math.round(start.distance) } : null,
    destConnector: dest ? {
      nodeId: dest.node.id,
      distanceM: Math.round(dest.distance || 0),
      exitToPoiM: poi?.coordinates
        ? Math.round(haversineMeters(dest.node.coordinates, poi.coordinates))
        : null,
    } : null,
    nodeIds,
    edges,
    approachConnector: start && fromCoords
      ? { from: fromCoords, to: start.node.coordinates, lengthM: Math.round(start.distance) }
      : null,
    exitConnector: dest && poi?.coordinates
      ? {
        from: dest.node.coordinates,
        to: poi.coordinates,
        lengthM: Math.round(haversineMeters(dest.node.coordinates, poi.coordinates)),
      }
      : null,
    nodes: nodeIds.map((id) => ({
      id,
      coordinates: nodes.get(id)?.coordinates,
      status: nodes.get(id)?.status || (nodes.get(id)?.verified ? VERIFIED : 'unverified'),
      notes: nodes.get(id)?.notes,
    })),
  };
}

/** Reproduce a legacy (possibly unverified) path for investigation. */
export function investigateRoute(graph, fromCoords, poi, opts = {}) {
  const g = { ...graph, routingEnabled: true };
  return routeToPoi(g, fromCoords, poi, { ...opts, requireVerified: false, startSnapMaxM: opts.startSnapMaxM ?? 90, destSnapMaxM: opts.destSnapMaxM ?? 100 });
}

export { UNSUPPORTED_MSG, VERIFYING_MSG, UNVERIFIED_SEGMENT_MSG };

export function graphStats(graph) {
  return {
    nodes: graph.nodes.length,
    edges: graph.edges.length,
    connectors: (graph.destinationConnectors || []).length,
    routingEnabled: !!graph.routingEnabled,
  };
}

export function findBrokenEdges(graph) {
  const ids = new Set(graph.nodes.map((n) => n.id));
  return graph.edges.filter((e) => !ids.has(e.from) || !ids.has(e.to));
}

export function findZeroLengthEdges(graph) {
  return graph.edges.filter((e) => {
    const geom = edgeGeometry(graph, e.from, e.to);
    const d = e.distance != null ? e.distance : lineDistanceMeters(geom);
    return !(d > 0);
  });
}

export function connectedComponentCount(graph) {
  const adj = buildAdjacency(graph, { requireVerified: false });
  const seen = new Set();
  let comps = 0;
  for (const n of graph.nodes) {
    if (seen.has(n.id)) continue;
    comps += 1;
    const stack = [n.id];
    while (stack.length) {
      const u = stack.pop();
      if (seen.has(u)) continue;
      seen.add(u);
      for (const e of adj.get(u) || []) stack.push(e.to);
    }
  }
  return comps;
}

export { edgeKey, edgeStatus };
