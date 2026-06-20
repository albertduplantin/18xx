import type { HexCoord, Direction, TrackPath } from "@18xx/shared";

/** Axial direction vectors, clockwise from top-right (flat-top orientation) */
const DIRECTION_VECTORS: Record<Direction, HexCoord> = {
  0: { q: 1, r: -1 },
  1: { q: 1, r: 0 },
  2: { q: 0, r: 1 },
  3: { q: -1, r: 1 },
  4: { q: -1, r: 0 },
  5: { q: 0, r: -1 },
};

export function hexNeighbor(coord: HexCoord, dir: Direction): HexCoord {
  const v = DIRECTION_VECTORS[dir];
  return { q: coord.q + v.q, r: coord.r + v.r };
}

export function hexDistance(a: HexCoord, b: HexCoord): number {
  return (Math.abs(a.q - b.q) + Math.abs(a.q + a.r - b.q - b.r) + Math.abs(a.r - b.r)) / 2;
}

export function hexKey(coord: HexCoord): string {
  return `${coord.q},${coord.r}`;
}

export function parseHexKey(key: string): HexCoord {
  const [q, r] = key.split(",").map(Number);
  return { q: q ?? 0, r: r ?? 0 };
}

export function oppositeDirection(dir: Direction): Direction {
  return ((dir + 3) % 6) as Direction;
}

/** Rotate a direction by rotation steps (each step = 60°) */
export function rotateDirection(dir: Direction, rotation: number): Direction {
  return ((dir + rotation) % 6) as Direction;
}

/** Get the exit direction from a neighbor's perspective */
export function entryDirection(dir: Direction): Direction {
  return oppositeDirection(dir);
}

/** Convert pixel coordinates to hex (flat-top, origin at center) */
export function pixelToHex(x: number, y: number, size: number): HexCoord {
  const q = ((2 / 3) * x) / size;
  const r = ((-1 / 3) * x + (Math.sqrt(3) / 3) * y) / size;
  return hexRound(q, r);
}

/** Snap float axial coords to nearest hex */
function hexRound(q: number, r: number): HexCoord {
  const s = -q - r;
  let rq = Math.round(q);
  let rr = Math.round(r);
  const rs = Math.round(s);
  const dq = Math.abs(rq - q);
  const dr = Math.abs(rr - r);
  const ds = Math.abs(rs - s);
  if (dq > dr && dq > ds) rq = -rr - rs;
  else if (dr > ds) rr = -rq - rs;
  return { q: rq, r: rr };
}

/** Center of a hex in SVG pixels (flat-top orientation) */
export function hexToPixel(coord: HexCoord, size: number): { x: number; y: number } {
  return {
    x: size * (3 / 2) * coord.q,
    y: size * (Math.sqrt(3) / 2 * coord.q + Math.sqrt(3) * coord.r),
  };
}

/** SVG polygon points for a flat-top hexagon */
export function hexCorners(cx: number, cy: number, size: number): string {
  return Array.from({ length: 6 }, (_, i) => {
    const angle = (Math.PI / 180) * (60 * i);
    return `${cx + size * Math.cos(angle)},${cy + size * Math.sin(angle)}`;
  }).join(" ");
}

/** Rotate track paths by a given rotation (0-5 steps of 60°) */
export function rotatePaths(paths: readonly TrackPath[], rotation: number): TrackPath[] {
  return paths.map((p) => ({
    from: rotateDirection(p.from, rotation),
    to: rotateDirection(p.to, rotation),
  }));
}

/** Build an adjacency map from placed tiles for route finding */
export type HexGraph = Map<string, Map<string, number>>;
