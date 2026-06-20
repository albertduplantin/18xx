import type { HexCoord, GameState, GameDef, PlacedTile, TileDef, Route } from "@18xx/shared";
import { hexKey, hexNeighbor, oppositeDirection, rotatePaths } from "./hex-grid.js";

type Node = {
  key: string;
  coord: HexCoord;
  revenue: number;
  isCity: boolean;
  isTown: boolean;
  tokens: readonly (string | null)[];
};

type Edge = { fromNode: string; toNode: string };

type NetworkGraph = {
  nodes: Map<string, Node>;
  edges: Map<string, Set<string>>;
};

function getPhaseRevenue(revenue: number | Record<string, number>, phaseId: string): number {
  if (typeof revenue === "number") return revenue;
  return revenue[phaseId] ?? 0;
}

function buildGraph(state: GameState, def: GameDef, phaseId: string): NetworkGraph {
  const nodes = new Map<string, Node>();
  const edges = new Map<string, Set<string>>();

  function addEdge(a: string, b: string) {
    if (!edges.has(a)) edges.set(a, new Set());
    if (!edges.has(b)) edges.set(b, new Set());
    edges.get(a)!.add(b);
    edges.get(b)!.add(a);
  }

  for (const [key, placed] of Object.entries(state.map)) {
    const tileDef = def.tiles.find((t) => t.id === placed.tileId);
    if (!tileDef) continue;

    const coordParts = key.split(",");
    const coord: HexCoord = { q: Number(coordParts[0]), r: Number(coordParts[1]) };
    const rotatedPaths = rotatePaths(tileDef.paths, placed.rotation);

    for (let ci = 0; ci < tileDef.cities.length; ci++) {
      const city = tileDef.cities[ci]!;
      const nodeKey = `${key}:c${ci}`;
      nodes.set(nodeKey, {
        key: nodeKey,
        coord,
        revenue: getPhaseRevenue(city.revenue, phaseId),
        isCity: true,
        isTown: false,
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
        tokens: [],
      });
      if (!edges.has(nodeKey)) edges.set(nodeKey, new Set());
    }

    for (const path of rotatedPaths) {
      const neighborCoord = hexNeighbor(coord, path.to);
      const neighborKey = hexKey(neighborCoord);
      const neighborPlaced = state.map[neighborKey];
      if (!neighborPlaced) continue;

      const neighborDef = def.tiles.find((t) => t.id === neighborPlaced.tileId);
      if (!neighborDef) continue;

      const neighborPaths = rotatePaths(neighborDef.paths, neighborPlaced.rotation);
      const entryDir = oppositeDirection(path.to);

      for (const np of neighborPaths) {
        if (np.from === entryDir || np.to === entryDir) {
          const fromNode = tileDef.cities.length > 0 ? `${key}:c0` : tileDef.towns.length > 0 ? `${key}:t0` : null;
          const toNode = neighborDef.cities.length > 0 ? `${neighborKey}:c0` : neighborDef.towns.length > 0 ? `${neighborKey}:t0` : null;
          if (fromNode && toNode) {
            addEdge(fromNode, toNode);
          }
          break;
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
  const phase = def.phases.find((p) => p.id === phaseId);

  const results: Route[] = [];

  for (const trainTypeId of company.trains) {
    const trainDef = def.trains.find((t) => t.id === trainTypeId);
    if (!trainDef || typeof trainDef.distance !== "number") continue;
    const maxStops = trainDef.distance;

    const companyTokenNodes = new Set(
      [...graph.nodes.entries()]
        .filter(([, n]) => n.isCity && n.tokens.some((t) => t === companyId))
        .map(([k]) => k)
    );

    let bestRoute: Route | null = null;
    let bestRevenue = 0;

    function dfs(currentNode: string, visited: string[], revenue: number, stops: number) {
      if (stops > maxStops) return;

      const node = graph.nodes.get(currentNode)!;
      revenue += node.revenue;

      const hasToken = companyTokenNodes.has(currentNode);
      const pathIsValid = visited.length >= 2 && (hasToken || visited.some((n) => companyTokenNodes.has(n)));

      if (pathIsValid && revenue > bestRevenue) {
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
