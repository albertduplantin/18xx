import type { HexCoord, GameState, GameDef, TileDef, Route, Direction, TrackPath } from "@18xx/shared";
import { hexKey, hexNeighbor, oppositeDirection } from "./hex-grid.js";

// ─── Def index (built once per GameDef, never rebuilt) ────────────────────────
// Replaces all O(n) Array.find() calls with O(1) Map lookups.

type DefIndex = {
  tileById: Map<string, TileDef>;
  hexDefByKey: Map<string, { offboard?: { revenue: number | Record<string, number> } }>;
};

const defIndexCache = new WeakMap<GameDef, DefIndex>();

function getDefIndex(def: GameDef): DefIndex {
  let idx = defIndexCache.get(def);
  if (!idx) {
    const tileById = new Map<string, TileDef>();
    for (const t of def.tiles) tileById.set(t.id, t);
    for (const h of def.map) if (h.tile) tileById.set(h.tile.id, h.tile as TileDef);
    const hexDefByKey = new Map<string, { offboard?: { revenue: number | Record<string, number> } }>();
    for (const h of def.map) hexDefByKey.set(hexKey(h.coord), h);
    idx = { tileById, hexDefByKey };
    defIndexCache.set(def, idx);
  }
  return idx;
}

// ─── Rotated-paths cache (built once per tileId×rotation pair) ────────────────

type RotatedPath = { from: Direction; to: Direction };

const rotatedPathsCache = new Map<string, readonly RotatedPath[]>();

function getCachedRotatedPaths(tileId: string, paths: readonly TrackPath[], rotation: number): readonly RotatedPath[] {
  const key = `${tileId}:${rotation}`;
  let cached = rotatedPathsCache.get(key);
  if (!cached) {
    cached = paths.map((p) => ({
      from: ((p.from + rotation) % 6) as Direction,
      to: ((p.to + rotation) % 6) as Direction,
    }));
    rotatedPathsCache.set(key, cached);
  }
  return cached;
}

// ─── Graph cache (per state.map object — rebuilt only when tiles change) ──────
// GameState is immutable: applyAction always returns a new object.
// state.map is a new object only when a tile is placed.
// WeakMap lets garbage collection reclaim stale states automatically.

type Node = {
  key: string;
  coord: HexCoord;
  revenue: number;
  isCity: boolean;
  isTown: boolean;
  isOffboard: boolean;
  tokens: readonly (string | null)[];
};

type NetworkGraph = {
  nodes: Map<string, Node>;
  edges: Map<string, readonly string[]>;  // Array (not Set) for faster iteration
};

const graphCache = new WeakMap<GameState["map"], Map<string, NetworkGraph>>();

function getPhaseRevenue(revenue: number | Record<string, number>, phaseId: string): number {
  if (typeof revenue === "number") return revenue;
  return revenue[phaseId] ?? 0;
}

// ─── Track tracer ─────────────────────────────────────────────────────────────

function traceTrack(
  stateMap: GameState["map"],
  idx: DefIndex,
  startCoord: HexCoord,
  exitDir: Direction,
): string | null {
  let q = startCoord.q + (exitDir === 0 ? 1 : exitDir === 1 ? 1 : exitDir === 2 ? 0 : exitDir === 3 ? -1 : exitDir === 4 ? -1 : 0);
  let r = startCoord.r + (exitDir === 0 ? -1 : exitDir === 1 ? 0 : exitDir === 2 ? 1 : exitDir === 3 ? 1 : exitDir === 4 ? 0 : -1);
  let entryDir: Direction = ((exitDir + 3) % 6) as Direction;

  const visited = new Set<string>();

  while (true) {
    const key = `${q},${r}`;
    if (visited.has(key)) return null;
    visited.add(key);

    const hexDef = idx.hexDefByKey.get(key);
    if (hexDef?.offboard) return `${key}:offboard`;

    const placed = stateMap[key];
    if (!placed) return null;

    const tileDef = idx.tileById.get(placed.tileId);
    if (!tileDef) return null;

    const rotated = getCachedRotatedPaths(placed.tileId, tileDef.paths, placed.rotation);

    let nextExitDir: Direction | null = null;
    for (const p of rotated) {
      if (p.from === entryDir) { nextExitDir = p.to; break; }
      if (p.to === entryDir) { nextExitDir = p.from; break; }
    }
    if (nextExitDir === null) return null;

    if (tileDef.cities.length > 0) return `${key}:c0`;
    if (tileDef.towns.length > 0) return `${key}:t0`;

    // Advance to next hex inline (avoids hexNeighbor object allocation)
    const d = nextExitDir;
    const dq = d === 0 ? 1 : d === 1 ? 1 : d === 2 ? 0 : d === 3 ? -1 : d === 4 ? -1 : 0;
    const dr = d === 0 ? -1 : d === 1 ? 0 : d === 2 ? 1 : d === 3 ? 1 : d === 4 ? 0 : -1;
    q += dq; r += dr;
    entryDir = ((d + 3) % 6) as Direction;
  }
}

// ─── Graph builder ─────────────────────────────────────────────────────────────

function buildGraph(state: GameState, def: GameDef, phaseId: string): NetworkGraph {
  const idx = getDefIndex(def);
  const nodes = new Map<string, Node>();
  const edgesSet = new Map<string, Set<string>>();

  function addEdge(a: string, b: string) {
    if (a === b) return;
    let sa = edgesSet.get(a); if (!sa) { sa = new Set(); edgesSet.set(a, sa); }
    let sb = edgesSet.get(b); if (!sb) { sb = new Set(); edgesSet.set(b, sb); }
    sa.add(b); sb.add(a);
  }

  // Pass 1: nodes for placed city/town tiles
  for (const key of Object.keys(state.map)) {
    const placed = state.map[key]!;
    const tileDef = idx.tileById.get(placed.tileId);
    if (!tileDef) continue;

    const comma = key.indexOf(",");
    const coord: HexCoord = { q: Number(key.slice(0, comma)), r: Number(key.slice(comma + 1)) };

    for (let ci = 0; ci < tileDef.cities.length; ci++) {
      const nodeKey = `${key}:c${ci}`;
      nodes.set(nodeKey, {
        key: nodeKey, coord,
        revenue: getPhaseRevenue(tileDef.cities[ci]!.revenue, phaseId),
        isCity: true, isTown: false, isOffboard: false,
        tokens: placed.tokenSlots,
      });
    }
    for (let ti = 0; ti < tileDef.towns.length; ti++) {
      const nodeKey = `${key}:t${ti}`;
      nodes.set(nodeKey, {
        key: nodeKey, coord,
        revenue: getPhaseRevenue(tileDef.towns[ti]!.revenue, phaseId),
        isCity: false, isTown: true, isOffboard: false,
        tokens: [],
      });
    }
  }

  // Offboard hex nodes
  for (const hexDef of def.map) {
    if (!hexDef.offboard) continue;
    const key = hexKey(hexDef.coord);
    const nodeKey = `${key}:offboard`;
    nodes.set(nodeKey, {
      key: nodeKey, coord: hexDef.coord,
      revenue: getPhaseRevenue(hexDef.offboard.revenue, phaseId),
      isCity: true, isTown: false, isOffboard: true,
      tokens: [],
    });
  }

  // Pass 2: trace track to build edges
  for (const key of Object.keys(state.map)) {
    const placed = state.map[key]!;
    const tileDef = idx.tileById.get(placed.tileId);
    if (!tileDef) continue;
    if (tileDef.cities.length === 0 && tileDef.towns.length === 0) continue;

    const comma = key.indexOf(",");
    const coord: HexCoord = { q: Number(key.slice(0, comma)), r: Number(key.slice(comma + 1)) };
    const rotated = getCachedRotatedPaths(placed.tileId, tileDef.paths, placed.rotation);
    const fromNodeKey = tileDef.cities.length > 0 ? `${key}:c0` : `${key}:t0`;

    const tracedDirs = new Set<number>();
    for (const p of rotated) {
      for (const dir of [p.from, p.to] as Direction[]) {
        if (tracedDirs.has(dir)) continue;
        tracedDirs.add(dir);
        const toNodeKey = traceTrack(state.map, idx, coord, dir);
        if (toNodeKey && nodes.has(toNodeKey)) addEdge(fromNodeKey, toNodeKey);
      }
    }
  }

  // Convert edge Sets to arrays for faster DFS iteration
  const edges = new Map<string, readonly string[]>();
  for (const [k, s] of edgesSet) edges.set(k, [...s]);

  return { nodes, edges };
}

function getCachedGraph(state: GameState, def: GameDef): NetworkGraph {
  let phaseMap = graphCache.get(state.map);
  if (!phaseMap) { phaseMap = new Map(); graphCache.set(state.map, phaseMap); }
  let graph = phaseMap.get(state.phaseId);
  if (!graph) { graph = buildGraph(state, def, state.phaseId); phaseMap.set(state.phaseId, graph); }
  return graph;
}

// ─── Route finder ─────────────────────────────────────────────────────────────

export function calculateOptimalRoutes(
  state: GameState,
  def: GameDef,
  companyId: string,
): readonly Route[] {
  const company = state.companies[companyId];
  if (!company || company.trains.length === 0) return [];

  const graph = getCachedGraph(state, def);
  const results: Route[] = [];

  for (const trainTypeId of company.trains) {
    const trainDef = def.trains.find((t) => t.id === trainTypeId);
    if (!trainDef || typeof trainDef.distance !== "number") continue;
    const maxStops = trainDef.distance;

    // Find this company's token nodes
    const companyTokenNodes: string[] = [];
    for (const [k, n] of graph.nodes) {
      if (n.isCity && !n.isOffboard && n.tokens.some((t) => t === companyId)) {
        companyTokenNodes.push(k);
      }
    }
    if (companyTokenNodes.length === 0) continue;
    const tokenSet = new Set(companyTokenNodes);

    let bestRoute: Route | null = null;
    let bestRevenue = 0;

    // DFS with backtracking — no array spread, no visited.includes()
    const visited = new Set<string>();
    const path: string[] = [];
    let pathHasToken = false;

    function dfs(nodeKey: string, revenue: number, stops: number): void {
      if (stops > maxStops) return;

      const node = graph.nodes.get(nodeKey)!;
      const rev = revenue + node.revenue;
      const hadToken = pathHasToken;
      if (tokenSet.has(nodeKey)) pathHasToken = true;

      if (path.length >= 1 && pathHasToken && rev > bestRevenue) {
        bestRevenue = rev;
        // Extract route (only done when we find a better route — infrequent)
        bestRoute = {
          trainTypeId,
          hexes: path.map((k) => {
            const c = k.indexOf(":");
            const coordStr = k.slice(0, c);
            const comma = coordStr.indexOf(",");
            return { q: Number(coordStr.slice(0, comma)), r: Number(coordStr.slice(comma + 1)) };
          }),
          revenue: rev,
        };
      }

      if (!node.isOffboard) {
        const neighbors = graph.edges.get(nodeKey);
        if (neighbors) {
          for (const nb of neighbors) {
            if (!visited.has(nb)) {
              visited.add(nb);
              path.push(nb);
              dfs(nb, rev, stops + 1);
              path.pop();
              visited.delete(nb);
            }
          }
        }
      }

      pathHasToken = hadToken;
    }

    for (const startNode of companyTokenNodes) {
      visited.clear();
      visited.add(startNode);
      path.length = 0;
      path.push(startNode);
      pathHasToken = true;
      dfs(startNode, 0, 1);
    }

    if (bestRoute) results.push(bestRoute);
  }

  return results;
}

export function totalRevenue(routes: readonly Route[]): number {
  return routes.reduce((sum, r) => sum + r.revenue, 0);
}
