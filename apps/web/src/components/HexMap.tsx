import React, { useState, useRef, useCallback, useMemo } from "react";
import type { HexDef, PlacedTile, TileDef, HexCoord, GameState, GameDef, Route } from "@18xx/shared";
import { hexToPixel, hexCorners, hexKey, rotatePaths } from "@18xx/engine";

const HEX_SIZE = 52;
const BOARD_BG = "#b8a87a";

const TILE_COLORS: Record<string, string> = {
  white:  "#e8e0ca",
  yellow: "#e8c832",
  green:  "#3a9e4e",
  brown:  "#8b5e3c",
  gray:   "#909090",
  red:    "#a02020",
};

const ROUTE_COLORS = ["#e63030", "#2060e0", "#20a850", "#e08000", "#8020c0", "#00a0b0"];

type Props = {
  mapDef: readonly HexDef[];
  state: GameState;
  def: GameDef;
  tiles: readonly TileDef[];
  selectedHex: HexCoord | null;
  onHexClick: (coord: HexCoord) => void;
  /** Called when clicking a valid tile-placement hex — passes screen coords for popup positioning */
  onValidTileClick?: (coord: HexCoord, screenX: number, screenY: number) => void;
  validTileHexes?: ReadonlySet<string>;
  activeRoutes?: readonly Route[];
};

// ─── Revenue helper ───────────────────────────────────────────────────────────

function phaseRevenue(revenue: number | Record<string, number>, phaseId: string): number {
  if (typeof revenue === "number") return revenue;
  return revenue[phaseId] ?? Object.values(revenue)[0] ?? 0;
}

// ─── Track geometry ───────────────────────────────────────────────────────────
//
// Flat-top hex: edge midpoints (where tracks exit) are at angle (dir - 0.5) × 60°
// from center, at distance = size × √3/2 (the apothem, not the circumradius).
//
// dir 0 → 330° (NE edge)   dir 1 → 30° (SE edge)   dir 2 → 90° (S edge)
// dir 3 → 150° (SW edge)   dir 4 → 210° (W edge)   dir 5 → 270° (N edge)
//
// Using center (0,0) as Bézier control point gives:
//   • delta=3 (straight):  f+t = 0  → P1 on the line P0-P2  → straight line ✓
//   • delta=2 (120° arc):  smooth arc bowing slightly toward center ✓
//   • delta=1 (60° arc):   tight corner arc staying near the outer edge ✓

export function trackEndpoint(dir: number, size: number): { x: number; y: number } {
  const angle = (dir - 0.5) * Math.PI / 3;
  const r = size * Math.sqrt(3) / 2;   // apothem = edge midpoint distance
  return { x: Math.cos(angle) * r, y: Math.sin(angle) * r };
}

// ─── Track path ───────────────────────────────────────────────────────────────

function TrackPath({ from, to, size, color }: { from: number; to: number; size: number; color: string }) {
  const f = trackEndpoint(from, size);
  const t = trackEndpoint(to, size);
  // Control point = hex center → makes straight tracks straight and curves natural
  const d = `M ${f.x} ${f.y} Q 0 0 ${t.x} ${t.y}`;
  return (
    <>
      <path d={d} stroke="rgba(0,0,0,0.35)" strokeWidth={size * 0.22} fill="none" strokeLinecap="round" />
      <path d={d} stroke={color}            strokeWidth={size * 0.13} fill="none" strokeLinecap="round" />
    </>
  );
}

// ─── City circle ──────────────────────────────────────────────────────────────

function CityCircle({ slots, size, tokens, companyColors, revenue }: {
  slots: number;
  size: number;
  tokens: readonly (string | null)[];
  companyColors: Record<string, string>;
  revenue: number;
}) {
  const r = size * 0.25;
  const spread = r * 1.3;

  return (
    <g>
      {Array.from({ length: slots }, (_, i) => {
        const angle = slots > 1 ? (i * Math.PI * 2) / slots - Math.PI / 2 : 0;
        const dx = slots > 1 ? Math.cos(angle) * spread : 0;
        const dy = slots > 1 ? Math.sin(angle) * spread : 0;
        const token = tokens[i] ?? null;
        const fill = token ? (companyColors[token] ?? "#888") : "#f5ece0";
        return (
          <g key={i} transform={`translate(${dx},${dy})`}>
            <circle r={r} fill={fill} stroke="#1a0800" strokeWidth={2} />
            {token && (
              <text textAnchor="middle" dominantBaseline="middle"
                fontSize={r * 0.75} fill="#fff" fontWeight="bold"
                fontFamily="'Copperplate Gothic', Copperplate, serif">
                {token}
              </text>
            )}
          </g>
        );
      })}
      {revenue > 0 && (
        <g transform={`translate(${size * 0.38}, ${-size * 0.40})`}>
          <rect x={-14} y={-8} width={28} height={16} rx={8}
            fill="#fffbe0" stroke="#4a3010" strokeWidth={1.2} />
          <text textAnchor="middle" dominantBaseline="middle"
            fontSize={9.5} fill="#1a0a00" fontWeight="bold"
            fontFamily="'Palatino Linotype', Palatino, Georgia, serif">
            {revenue}
          </text>
        </g>
      )}
    </g>
  );
}

// ─── Town ─────────────────────────────────────────────────────────────────────
// In 18xx, towns are drawn as a filled rectangle (bar) across the track.

function Town({ size, revenue }: { size: number; revenue: number }) {
  const w = size * 0.22, h = size * 0.12;
  return (
    <g>
      <rect x={-w / 2} y={-h / 2} width={w} height={h}
        fill="#1a0a00" stroke="#000" strokeWidth={0.5} rx={2} />
      {revenue > 0 && (
        <g transform={`translate(${size * 0.30}, ${-size * 0.32})`}>
          <rect x={-12} y={-7} width={24} height={14} rx={7}
            fill="#fffbe0" stroke="#4a3010" strokeWidth={1.2} />
          <text textAnchor="middle" dominantBaseline="middle"
            fontSize={9} fill="#1a0a00" fontWeight="bold"
            fontFamily="'Palatino Linotype', Palatino, Georgia, serif">
            {revenue}
          </text>
        </g>
      )}
    </g>
  );
}

// ─── Single hex ───────────────────────────────────────────────────────────────

function HexCell({
  hexDef, placed, tileDef, selected, highlighted, size, companyColors, phaseId,
  onClick, onValidTileClick,
}: {
  hexDef: HexDef;
  placed: PlacedTile | undefined;
  tileDef: TileDef | undefined;
  selected: boolean;
  highlighted: boolean;
  size: number;
  companyColors: Record<string, string>;
  phaseId: string;
  onClick: () => void;
  onValidTileClick?: (e: React.MouseEvent) => void;
}) {
  const { x, y } = hexToPixel(hexDef.coord, size);
  const isOffboard = !!hexDef.offboard;
  const effectiveTile = placed ? tileDef : hexDef.tile;

  const bgColor = isOffboard
    ? "#a02020"
    : effectiveTile
    ? (TILE_COLORS[effectiveTile.color] ?? TILE_COLORS.white!)
    : TILE_COLORS.white!;

  // White track on colored tiles; tan on white/undeveloped hexes
  const trackColor = (effectiveTile && effectiveTile.color !== "white") ? "#f8f4e8" : "#d0c8a8";

  const rotation = placed?.rotation ?? 0;
  const paths = effectiveTile ? rotatePaths(effectiveTile.paths, rotation) : [];
  const tokenSlots = placed?.tokenSlots ?? [];

  const handleClick = (e: React.MouseEvent) => {
    if (highlighted && onValidTileClick) {
      e.stopPropagation();
      onValidTileClick(e);
    } else {
      onClick();
    }
  };

  return (
    <g transform={`translate(${x},${y})`} onClick={handleClick} style={{ cursor: "pointer" }}>
      {/* Hex background */}
      <polygon
        points={hexCorners(0, 0, size)}
        fill={bgColor}
        stroke={selected ? "#e8d020" : highlighted ? "#50c840" : "#6b5a3a"}
        strokeWidth={selected ? 3 : highlighted ? 2.5 : 1}
      />
      {highlighted && (
        <polygon points={hexCorners(0, 0, size)} fill="rgba(80,200,64,0.18)" style={{ pointerEvents: "none" }} />
      )}

      {/* Track paths */}
      {paths.map((p, i) => (
        <TrackPath key={i} from={p.from} to={p.to} size={size} color={trackColor} />
      ))}

      {/* Cities */}
      {effectiveTile?.cities.map((city, i) => (
        <CityCircle key={i} slots={city.slots} size={size}
          tokens={tokenSlots.slice(i * city.slots, (i + 1) * city.slots)}
          companyColors={companyColors}
          revenue={phaseRevenue(city.revenue, phaseId)} />
      ))}

      {/* Towns */}
      {effectiveTile?.towns.map((town, i) => (
        <Town key={i} size={size} revenue={phaseRevenue(town.revenue, phaseId)} />
      ))}

      {/* City name */}
      {hexDef.label && (
        <text y={size * 0.62} textAnchor="middle"
          fontSize={isOffboard ? size * 0.15 : size * 0.16}
          fill={isOffboard ? "#f5e8d0" : "#2a1a00"}
          fontWeight="700"
          fontFamily="'Copperplate Gothic', Copperplate, 'Palatino Linotype', serif"
          style={{ pointerEvents: "none" }}>
          {hexDef.label}
        </text>
      )}

      {/* Terrain surcharge badge */}
      {hexDef.terrain && !isOffboard && (
        <g transform={`translate(${size * 0.52}, ${-size * 0.52})`} style={{ pointerEvents: "none" }}>
          <circle r={size * 0.18}
            fill={hexDef.terrain.type === "mountain" ? "#6b5a3a" : "#2060a0"}
            stroke="#fff" strokeWidth={1} />
          <text textAnchor="middle" dominantBaseline="middle"
            fontSize={size * 0.14} fill="#fff" fontWeight="bold" fontFamily="monospace">
            {hexDef.terrain.type === "mountain" ? "⛰" : "~"}
          </text>
        </g>
      )}

      {/* Offboard revenue */}
      {isOffboard && hexDef.offboard && (
        <g transform={`translate(0, ${-size * 0.25})`} style={{ pointerEvents: "none" }}>
          <rect x={-22} y={-11} width={44} height={22} rx={11}
            fill="#fffbe0" stroke="#7a1a1a" strokeWidth={1.5} />
          <text textAnchor="middle" dominantBaseline="middle"
            fontSize={11} fill="#7a1a1a" fontWeight="bold"
            fontFamily="'Palatino Linotype', Palatino, Georgia, serif">
            ${phaseRevenue(hexDef.offboard.revenue, phaseId)}
          </text>
        </g>
      )}
    </g>
  );
}

// ─── Route overlay ────────────────────────────────────────────────────────────

function RouteOverlay({ routes, size }: { routes: readonly Route[]; size: number }) {
  return (
    <>
      {routes.map((route, ri) => {
        const color = ROUTE_COLORS[ri % ROUTE_COLORS.length]!;
        return (
          <g key={ri}>
            {route.hexes.map((hex, i) => {
              const next = route.hexes[i + 1];
              if (!next) return null;
              const { x: x1, y: y1 } = hexToPixel(hex, size);
              const { x: x2, y: y2 } = hexToPixel(next, size);
              return (
                <line key={i} x1={x1} y1={y1} x2={x2} y2={y2}
                  stroke={color} strokeWidth={size * 0.12} strokeLinecap="round"
                  opacity={0.72} style={{ pointerEvents: "none" }} />
              );
            })}
            {route.hexes.length > 0 && (() => {
              const last = route.hexes[route.hexes.length - 1]!;
              const { x, y } = hexToPixel(last, size);
              return (
                <g key="rev" style={{ pointerEvents: "none" }}>
                  <rect x={x - 20} y={y - size * 0.62} width={40} height={18} rx={9}
                    fill={color} stroke="#1a1a1a" strokeWidth={1} opacity={0.92} />
                  <text x={x} y={y - size * 0.53} textAnchor="middle" dominantBaseline="middle"
                    fontSize={11} fill="#fff" fontWeight="bold"
                    fontFamily="'Palatino Linotype', Palatino, Georgia, serif">
                    ${route.revenue}
                  </text>
                </g>
              );
            })()}
          </g>
        );
      })}
    </>
  );
}

// ─── Full map ─────────────────────────────────────────────────────────────────

export function HexMap({
  mapDef, state, def, tiles, selectedHex, onHexClick, onValidTileClick, validTileHexes, activeRoutes,
}: Props) {
  const [viewBox, setViewBox] = useState({ x: -400, y: -300, w: 900, h: 700 });
  const [isPanning, setIsPanning] = useState(false);
  const panStart = useRef({ x: 0, y: 0, vx: 0, vy: 0 });

  const companyColors = useMemo(() => {
    const map: Record<string, string> = {};
    for (const c of def.companies) map[c.id] = c.color;
    return map;
  }, [def.companies]);

  const tileMap = useMemo(() => new Map(tiles.map((t) => [t.id, t])), [tiles]);

  const onMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button !== 1 && !(e.button === 0 && e.altKey)) return;
    setIsPanning(true);
    panStart.current = { x: e.clientX, y: e.clientY, vx: viewBox.x, vy: viewBox.y };
    e.preventDefault();
  }, [viewBox]);

  const onMouseMove = useCallback((e: React.MouseEvent) => {
    if (!isPanning) return;
    const scale = viewBox.w / (e.currentTarget as SVGElement).clientWidth;
    setViewBox((v) => ({
      ...v,
      x: panStart.current.vx - (e.clientX - panStart.current.x) * scale,
      y: panStart.current.vy - (e.clientY - panStart.current.y) * scale,
    }));
  }, [isPanning, viewBox.w]);

  const onMouseUp = useCallback(() => setIsPanning(false), []);

  const onWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    const factor = e.deltaY > 0 ? 1.1 : 0.9;
    setViewBox((v) => {
      const newW = Math.min(2000, Math.max(300, v.w * factor));
      return { ...v, w: newW, h: newW * (v.h / v.w) };
    });
  }, []);

  return (
    <svg
      width="100%" height="100%"
      viewBox={`${viewBox.x} ${viewBox.y} ${viewBox.w} ${viewBox.h}`}
      style={{ display: "block", userSelect: "none", cursor: isPanning ? "grabbing" : "grab" }}
      onMouseDown={onMouseDown}
      onMouseMove={onMouseMove}
      onMouseUp={onMouseUp}
      onMouseLeave={onMouseUp}
      onWheel={onWheel}
    >
      <rect x={viewBox.x - 100} y={viewBox.y - 100} width={viewBox.w + 200} height={viewBox.h + 200}
        fill={BOARD_BG} />

      {mapDef.map((hex) => {
        const key = hexKey(hex.coord);
        const placed = state.map[key];
        const tileDef = placed ? tileMap.get(placed.tileId) : undefined;
        const isSelected = selectedHex?.q === hex.coord.q && selectedHex?.r === hex.coord.r;
        const isHighlighted = validTileHexes?.has(key) ?? false;

        return (
          <HexCell
            key={key}
            hexDef={hex}
            placed={placed}
            tileDef={tileDef}
            selected={isSelected}
            highlighted={isHighlighted}
            size={HEX_SIZE}
            companyColors={companyColors}
            phaseId={state.phaseId}
            onClick={() => onHexClick(hex.coord)}
            {...(isHighlighted && onValidTileClick
              ? { onValidTileClick: (e: React.MouseEvent) => onValidTileClick(hex.coord, e.clientX, e.clientY) }
              : {})}
          />
        );
      })}

      {activeRoutes && activeRoutes.length > 0 && (
        <RouteOverlay routes={activeRoutes} size={HEX_SIZE} />
      )}
    </svg>
  );
}
