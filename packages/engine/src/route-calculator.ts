import type { HexCoord, GameState, GameDef, TileDef, Route, Direction } from "@18xx/shared";
import { hexKey, hexNeighbor, oppositeDirection, rotatePaths } from "./hex-grid.js";

/**
 * Find a tile by ID in either the standard tile bank or the map's inline
 * (pre-printed) tile definitions. Pre-printed city tiles like "NYC_MAP" only
 * exist in def.map, not in def.tiles.
 */
function findTileDef(def: GameDef, tileId: string): TileDef | undefined {
  return def.tiles.find((t) => t.id === tileId)
    ?? def.map.find((h) => h.tile?.id === tileId)?.tile;
}

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
  edges: Map<string, Set<string>>;
};

function getPhaseRevenue(revenue: number | Record<string, number>, phaseId: string): number {
  if (typeof revenue === "number") return revenue;
  return revenue[phaseId] ?? 0;
}

/**
 * Follow track from a hex's exit direction through blank track tiles until
 * reaching a city, town, or offboard hex. Returns the destination node key,
 * or null if the track dead-ends or exits the map.
 */
function traceTrack(
  state: GameState,
  def: GameDef,
  startCoord: HexCoord,
  exitDir: number,
): string | null {
  let coord = hexNeighbor(startCoord, exitDir as Direction);
  let entryDir = oppositeDirection(exitDir as Direction);
  const visited = new Set<string>();

  while (true) {
    const key = hexKey(coord);
    if (visited.has(key)) return null;
    visited.add(key);

    // Check for offboard hex — it's a revenue terminus
    const hexDef = def.map.find((h) => h.coord.q === coord.q && h.coord.r === coord.r);
    if (hexDef?.offboard) return `${key}:offboard`;

    const placed = state.map[key];
    if (!placed) return null;

    const tileDef = findTileDef(def, placed.tileId);
    if (!tileDef) return null;

    const rotatedPaths = rotatePaths(tileDef.paths, placed.rotation);

    // Find a path that enters from entryDir
    const matchingPath = rotatedPaths.find((p) => p.from === entryDir || p.to === entryDir);
    if (!matchingPath) return null;

    // Revenue stop found — return its node key
    if (tileDef.cities.length > 0) return `${key}:c0`;
    if (tileDef.towns.length > 0) return `${key}:t0`;

    // Blank track: continue in the other direction
    const nextExitDir = matchingPath.from === entryDir ? matchingPath.to : matchingPath.from;
    coord = hexNeighbor(coord, nextExitDir as Direction);
    entryDir = oppositeDirection(nextExitDir as Direction);
  }
}

function buildGraph(state: GameState, def: GameDef, phaseId: string): NetworkGraph {
  const nodes = new Map<string, Node>();
  const edges = new Map<string, Set<string>>();

  function addEdge(a: string, b: string) {
    if (a === b) return;
    if (!edges.has(a)) edges.set(a, new Set());
    if (!edges.has(b)) edges.set(b, new Set());
    edges.get(a)!.add(b);
    edges.get(b)!.add(a);
  }

  // Pass 1: create nodes for all placed city/town hexes
  for (const [key, placed] of Object.entries(state.map)) {
    const tileDef = findTileDef(def, placed.tileId);
    if (!tileDef) continue;

    const coordParts = key.split(",");
    const coord: HexCoord = { q: Number(coordParts[0]), r: Number(coordParts[1]) };

    for (let ci = 0; ci < tileDef.cities.length; ci++) {
      const city = tileDef.cities[ci]!;
      const nodeKey = `${key}:c${ci}`;
      nodes.set(nodeKey, {
        key: nodeKey,
        coord,
        revenue: getPhaseRevenue(city.revenue, phaseId),
        isCity: true,
        isTown: false,
        isOffboard: false,
        tokens: placed.tokenSlots,
      });
      if (!edges.has(nodeKey)) edges.set(nodeKey, new Set());
    }

    for (let ti = 0; ti < tileDef.towns.length; ti++) {
      const town = tileDef.towns[ti]!;
      const nodeKey = `${key}:t${ti}`;
      nodes.set(nodeKey, {
        key: nodeKey,
        coord,
        revenue: getPhaseRevenue(town.revenue, phaseId),
        isCity: false,
        isTown: true,
        isOffboard: false,
        tokens: [],
      });
      if (!edges.has(nodeKey)) edges.set(nodeKey, new Set());
    }
  }

  // Add offboard hexes as revenue termini
  for (const hexDef of def.map) {
    if (!hexDef.offboard) continue;
    const key = hexKey(hexDef.coord);
    const nodeKey = `${key}:offboard`;
    nodes.set(nodeKey, {
      key: nodeKey,
      coord: hexDef.coord,
      revenue: getPhaseRevenue(hexDef.offboard.revenue, phaseId),
      isCity: true,
      isTown: false,
      isOffboard: true,
      tokens: [],
    });
    if (!edges.has(nodeKey)) edges.set(nodeKey, new Set());
  }

  // Pass 2: trace tracks from city/town nodes to find connections through blank tiles
  for (const [key, placed] of Object.entries(state.map)) {
    const tileDef = findTileDef(def, placed.tileId);
    if (!tileDef) continue;
    if (tileDef.cities.length === 0 && tileDef.towns.length === 0) continue;

    const coordParts = key.split(",");
    const coord: HexCoord = { q: Number(coordParts[0]), r: Number(coordParts[1]) };
    const rotatedPaths = rotatePaths(tileDef.paths, placed.rotation);

    const fromNodeKey = tileDef.cities.length > 0 ? `${key}:c0` : `${key}:t0`;

    const tracedExits = new Set<number>();
    for (const path of rotatedPaths) {
      for (const dir of [path.from, path.to]) {
        if (tracedExits.has(dir)) continue;
        tracedExits.add(dir);
        const toNodeKey = traceTrack(state, def, coord, dir);
        if (toNodeKey && nodes.has(toNodeKey)) {
          addEdge(fromNodeKey, toNodeKey);
        }
      }
    }
  }

  return { nodes, edges };
}

/** Find all valid routes for a company's trains using DFS */
export function calculateOptimalRoutes(
  state: GameState,
  def: GameDef,
  companyId: string,
): readonly Route[] {
  const company = state.companies[companyId];
  if (!company || company.trains.length === 0) return [];

  const phaseId = state.phaseId;
  const graph = buildGraph(state, def, phaseId);

  const results: Route[] = [];

  for (const trainTypeId of company.trains) {
    const trainDef = def.trains.find((t) => t.id === trainTypeId);
    if (!trainDef || typeof trainDef.distance !== "number") continue;
    const maxStops = trainDef.distance;

    const companyTokenNodes = new Set(
      [...graph.nodes.entries()]
        .filter(([, n]) => n.isCity && !n.isOffboard && n.tokens.some((t) => t === companyId))
        .map(([k]) => k),
    );

    if (companyTokenNodes.size === 0) continue;

    let bestRoute: Route | null = null;
    let bestRevenue = 0;

    function dfs(currentNode: string, visited: string[], revenue: number, stops: number) {
      if (stops > maxStops) return;

      const node = graph.nodes.get(currentNode)!;
      revenue += node.revenue;

      // Route is valid if it has ≥2 stops AND passes through at least one company token
      const hasToken = companyTokenNodes.has(currentNode);
      const routeHasToken = hasToken || visited.some((n) => companyTokenNodes.has(n));
      if (visited.length >= 2 && routeHasToken && revenue > bestRevenue) {
        bestRevenue = revenue;
        bestRoute = {
          trainTypeId,
          hexes: visited.map((k) => {
            const parts = k.split(":");
            const coords = parts[0]!.split(",");
            return { q: Number(coords[0]), r: Number(coords[1]) };
          }),
          revenue,
        };
      }

      // Don't extend from offboard termini
      if (node.isOffboard) return;

      const neighbors = graph.edges.get(currentNode) ?? new Set();
      for (const neighbor of neighbors) {
        if (!visited.includes(neighbor)) {
          dfs(neighbor, [...visited, neighbor], revenue, stops + 1);
        }
      }
    }

    for (const startNode of companyTokenNodes) {
      dfs(startNode, [startNode], 0, 1);
    }

    if (bestRoute) results.push(bestRoute);
  }

  return results;
}

/** Calculate total revenue from a set of routes */
export function totalRevenue(routes: readonly Route[]): number {
  return routes.reduce((sum, r) => sum + r.revenue, 0);
}
