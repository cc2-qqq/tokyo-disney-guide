// Park-internal walk routing over a hand-authored graph (Dijkstra).
// NOT OSRM/ORS/GraphHopper — Disney park walkways are incomplete on public OSM.
import { haversineMeters } from './geo.js';

const SNAP_MAX_M = 90; // refuse to snap if farther than this from any node

function edgeKey(a, b) { return a < b ? `${a}|${b}` : `${b}|${a}`; }

/** Build adjacency list: id -> [{to, distance, meta}] */
export function buildAdjacency(graph) {
  const adj = new Map();
  const ensure = (id) => { if (!adj.has(id)) adj.set(id, []); return adj.get(id); };
  for (const n of graph.nodes) ensure(n.id);
  for (const e of graph.edges) {
    if (e.temporarilyClosed) continue;
    const dist = e.distance != null ? e.distance : null;
    ensure(e.from).push({ to: e.to, distance: dist, meta: e });
    if (!e.oneWay) ensure(e.to).push({ to: e.from, distance: dist, meta: e });
  }
  return adj;
}

function nodeById(graph) {
  const m = new Map();
  for (const n of graph.nodes) m.set(n.id, n);
  return m;
}

function resolveDistance(fromNode, toNode, declared) {
  if (declared != null && declared > 0) return declared;
  return haversineMeters(fromNode.coordinates, toNode.coordinates);
}

/** Nearest graph node to a latlng within SNAP_MAX_M. */
export function nearestNode(graph, coords, { maxM = SNAP_MAX_M } = {}) {
  let best = null; let bestD = Infinity;
  for (const n of graph.nodes) {
    const d = haversineMeters(coords, n.coordinates);
    if (d < bestD) { bestD = d; best = n; }
  }
  if (!best || bestD > maxM) return null;
  return { node: best, distance: bestD };
}

/** Destination connector node for a POI id, else nearest node to its coordinates. */
export function destinationNode(graph, poi) {
  if (!poi) return null;
  const conn = (graph.destinationConnectors || []).find((c) => c.poiId === poi.id);
  if (conn) {
    const n = graph.nodes.find((x) => x.id === conn.nodeId);
    if (n) return { node: n, distance: conn.distance || 0, viaConnector: true };
  }
  if (!poi.coordinates) return null;
  return nearestNode(graph, poi.coordinates);
}

/**
 * Dijkstra shortest path.
 * @returns {{ path:[lat,lng][], nodeIds:string[], distance:number, confidence:string } | null}
 */
export function dijkstra(graph, startId, endId) {
  if (!graph || startId === endId) {
    const n = graph && graph.nodes.find((x) => x.id === startId);
    if (!n) return null;
    return { path: [n.coordinates], nodeIds: [startId], distance: 0, confidence: graph.confidence || '부분' };
  }
  const nodes = nodeById(graph);
  const adj = buildAdjacency(graph);
  if (!nodes.has(startId) || !nodes.has(endId)) return null;

  const dist = new Map();
  const prev = new Map();
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
      const w = resolveDistance(nodes.get(u), nodes.get(edge.to), edge.distance);
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
  const path = nodeIds.map((id) => nodes.get(id).coordinates);
  return {
    path,
    nodeIds,
    distance: dist.get(endId),
    confidence: graph.confidence || '부분',
  };
}

const APPROACH_MAX_M = 100; // refuse long arbitrary straight approach legs
const UNSUPPORTED_MSG = '이 목적지는 아직 상세 경로를 지원하지 않아 직선 방향만 표시합니다.';

function inMaxBounds(coords, maxBounds) {
  if (!maxBounds || !coords) return true;
  const [[s, w], [n, e]] = maxBounds;
  return coords[0] >= s && coords[0] <= n && coords[1] >= w && coords[1] <= e;
}

/** Connector-only destination (no nearest-node fallback for walk routes). */
export function connectorDestination(graph, poi) {
  if (!poi || !graph) return null;
  const conn = (graph.destinationConnectors || []).find((c) => c.poiId === poi.id);
  if (!conn) return null;
  const n = graph.nodes.find((x) => x.id === conn.nodeId);
  if (!n) return null;
  return { node: n, distance: conn.distance || 0, viaConnector: true };
}

/**
 * Full route from user/start coords to a POI.
 * Requires a destinationConnector — otherwise ok:false (caller shows dashed direction).
 */
export function routeToPoi(graph, fromCoords, poi, { maxBounds } = {}) {
  if (!graph || !fromCoords || !poi || !poi.coordinates) {
    return { ok: false, reason: UNSUPPORTED_MSG, support: 'unsupported' };
  }
  if (maxBounds && (!inMaxBounds(fromCoords, maxBounds) || !inMaxBounds(poi.coordinates, maxBounds))) {
    return { ok: false, reason: UNSUPPORTED_MSG, support: 'unsupported' };
  }

  const dest = connectorDestination(graph, poi);
  if (!dest) {
    return { ok: false, reason: UNSUPPORTED_MSG, support: 'unsupported' };
  }

  const start = nearestNode(graph, fromCoords);
  if (!start || start.distance > APPROACH_MAX_M) {
    return { ok: false, reason: UNSUPPORTED_MSG, support: 'unsupported' };
  }

  const result = dijkstra(graph, start.node.id, dest.node.id);
  if (!result) {
    return { ok: false, reason: UNSUPPORTED_MSG, support: 'unsupported' };
  }

  const path = [fromCoords, ...result.path];
  if (poi.coordinates) {
    const last = path[path.length - 1];
    if (last[0] !== poi.coordinates[0] || last[1] !== poi.coordinates[1]) {
      path.push(poi.coordinates);
    }
  }
  // Guard: no path vertex outside park maxBounds; no oversized approach/exit legs.
  for (const pt of path) {
    if (maxBounds && !inMaxBounds(pt, maxBounds)) {
      return { ok: false, reason: UNSUPPORTED_MSG, support: 'unsupported' };
    }
  }
  const exitDist = haversineMeters(dest.node.coordinates, poi.coordinates);
  if (exitDist > APPROACH_MAX_M) {
    return { ok: false, reason: UNSUPPORTED_MSG, support: 'unsupported' };
  }

  const approach = start.distance + (dest.distance || 0) + exitDist;
  // Major = short snap to corridor; partial = longer but still within approach limit.
  const support = (start.distance <= 45 && exitDist <= 40) ? 'major' : 'partial';
  return {
    ok: true,
    mode: 'walk',
    path,
    nodeIds: result.nodeIds,
    distance: result.distance + approach,
    confidence: graph.confidence || '부분',
    coverageNote: graph.coverageNote || '',
    support,
    supportLabel: support === 'major' ? '주요 동선 경로 지원' : '부분 경로 지원',
  };
}

export { UNSUPPORTED_MSG, APPROACH_MAX_M };

/** Basic integrity helpers used by validate.mjs */
export function graphStats(graph) {
  return {
    nodes: graph.nodes.length,
    edges: graph.edges.length,
    connectors: (graph.destinationConnectors || []).length,
  };
}

export function findBrokenEdges(graph) {
  const ids = new Set(graph.nodes.map((n) => n.id));
  return graph.edges.filter((e) => !ids.has(e.from) || !ids.has(e.to));
}

export function findZeroLengthEdges(graph) {
  const byId = nodeById(graph);
  return graph.edges.filter((e) => {
    const a = byId.get(e.from); const b = byId.get(e.to);
    if (!a || !b) return false;
    const d = e.distance != null ? e.distance : haversineMeters(a.coordinates, b.coordinates);
    return !(d > 0);
  });
}

export function connectedComponentCount(graph) {
  const adj = buildAdjacency(graph);
  const seen = new Set();
  let comps = 0;
  for (const n of graph.nodes) {
    if (seen.has(n.id)) continue;
    comps++;
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

export { edgeKey, SNAP_MAX_M };
