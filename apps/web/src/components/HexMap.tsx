import React, { useState, useRef, useCallback, useMemo } from "react";
import type { HexDef, PlacedTile, TileDef, HexCoord, GameState, GameDef, Route } from "@18xx/shared";
import { hexToPixel, hexCorners, hexKey, rotatePaths } from "@18xx/engine";

const HEX_SIZE = 52;

// Physical 18xx board background — warm parchment/tan, not green felt
const BOARD_BG = "#b8a87a";

// Tile fill colors matching physical 18xx tile set
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
  validTileHexes?: ReadonlySet<string>;
  activeRoutes?: readonly Route[];
};

// ─── Revenue helper ───────────────────────────────────────────────────────────

function phaseRevenue(revenue: number | Record<string, number>, phaseId: string): number {
  if (typeof revenue === "number") return revenue;
  return revenue[phaseId] ?? Object.values(revenue)[0] ?? 0;
}

// ─── Track rendering ──────────────────────────────────────────────────────────

function trackEndpoint(dir: number, size: number) {
  const angle = (dir * Math.PI) / 3;
  return { x: Math.cos(angle) * size, y: Math.sin(angle) * size };
}

function TrackPath({ from, to, size, color }: { from: number; to: number; size: number; color: string }) {
  const f = trackEndpoint(from, size * 0.97);
  const t = trackEndpoint(to, size * 0.97);
  const cx = (f.x + t.x) / 2 * 0.4;
  const cy = (f.y + t.y) / 2 * 0.4;
  return (
    <>
      {/* Shadow/outline for contrast */}
      <path d={`M ${f.x} ${f.y} Q ${cx} ${cy} ${t.x} ${t.y}`}
        stroke="rgba(0,0,0,0.3)" strokeWidth={size * 0.20} fill="none" strokeLinecap="round" />
      {/* Main track line — white on physical tiles */}
      <path d={`M ${f.x} ${f.y} Q ${cx} ${cy} ${t.x} ${t.y}`}
        stroke={color} strokeWidth={size * 0.14} fill="none" strokeLinecap="round" />
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
  const r = size * 0.22;
  const tokenR = slots === 1 ? r : r * 0.8;

  return (
    <g>
      {Array.from({ length: slots }, (_, i) => {
        const angle = slots > 1 ? (i * Math.PI * 2) / slots - Math.PI / 2 : 0;
        const dx = slots > 1 ? Math.cos(angle) * r * 1.2 : 0;
        const dy = slots > 1 ? Math.sin(angle) * r * 1.2 : 0;
        const token = tokens[i] ?? null;
        const tokenColor = token ? (companyColors[token] ?? "#888") : "#f0ece0";
        const textColor = token ? "#ffffff" : "#000";
        return (
          <g key={i} transform={`translate(${dx},${dy})`}>
            <circle r={tokenR} fill={tokenColor} stroke="#2a1a00" strokeWidth={1.5} />
            {token && (
              <text textAnchor="middle" dominantBaseline="middle" fontSize={tokenR * 0.85}
                fill={textColor} fontWeight="bold"
                fontFamily="'Copperplate Gothic', Copperplate, serif">
                {token}
              </text>
            )}
          </g>
        );
      })}
      {/* Revenue bubble — white oval with revenue value, top-right of city */}
      {revenue > 0 && (
        <g transform={`translate(${size * 0.38}, ${-size * 0.42})`}>
          <rect x={-14} y={-8} width={28} height={16} rx={8}
            fill="#f5f0e0" stroke="#5a4020" strokeWidth={1.2} />
          <text textAnchor="middle" dominantBaseline="middle" fontSize={9.5} fill="#1a0a00"
            fontWeight="bold" fontFamily="'Palatino Linotype', Palatino, Georgia, serif">
            {revenue}
          </text>
        </g>
      )}
    </g>
  );
}

// ─── Town dot ─────────────────────────────────────────────────────────────────

function TownDot({ size, revenue }: { size: number; revenue: number }) {
  const s = size * 0.18;
  return (
    <g>
      <rect x={-s} y={-s} width={s * 2} height={s * 2} fill="#1a1000" stroke="#0a0800" strokeWidth={1} rx={2} />
      {revenue > 0 && (
        <g transform={`translate(${size * 0.32}, ${-size * 0.32})`}>
          <rect x={-12} y={-7} width={24} height={14} rx={7}
            fill="#f5f0e0" stroke="#5a4020" strokeWidth={1.2} />
          <text textAnchor="middle" dominantBaseline="middle" fontSize={9} fill="#1a0a00"
            fontWeight="bold" fontFamily="'Palatino Linotype', Palatino, Georgia, serif">
            {revenue}
          </text>
        </g>
      )}
    </g>
  );
}

// ─── Single hex cell ──────────────────────────────────────────────────────────

function HexCell({
  hexDef, placed, tileDef, selected, highlighted, size, companyColors, phaseId, onClick,
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
}) {
  const { x, y } = hexToPixel(hexDef.coord, size);
  const isOffboard = !!hexDef.offboard;
  const effectiveTile = placed ? tileDef : hexDef.tile;

  const bgColor = isOffboard
    ? "#a02020"
    : effectiveTile
    ? (TILE_COLORS[effectiveTile.color] ?? TILE_COLORS.white!)
    : TILE_COLORS.white!;

  // Physical 18xx: tracks are white lines on colored tiles, tan on white/undeveloped
  const trackColor = (effectiveTile && effectiveTile.color !== "white") ? "#f8f4e8" : "#d0c8a8";

  const rotation = placed?.rotation ?? 0;
  const paths = effectiveTile ? rotatePaths(effectiveTile.paths, rotation) : [];
  const tokenSlots = placed?.tokenSlots ?? [];

  return (
    <g transform={`translate(${x},${y})`} onClick={onClick} style={{ cursor: "pointer" }}>
      <polygon
        points={hexCorners(0, 0, size)}
        fill={bgColor}
        stroke={selected ? "#e8d020" : highlighted ? "#50c840" : "#6b5a3a"}
        strokeWidth={selected ? 3 : highlighted ? 2.5 : 1}
      />
      {highlighted && (
        <polygon points={hexCorners(0, 0, size)} fill="rgba(80,200,64,0.15)" style={{ pointerEvents: "none" }} />
      )}

      {paths.map((p, i) => (
        <TrackPath key={i} from={p.from} to={p.to} size={size} color={trackColor} />
      ))}

      {effectiveTile?.cities.map((city, i) => (
        <CityCircle key={i} slots={city.slots} size={size}
          tokens={tokenSlots.slice(i * city.slots, (i + 1) * city.slots)}
          companyColors={companyColors}
          revenue={phaseRevenue(city.revenue, phaseId)} />
      ))}

      {effectiveTile?.towns.map((town, i) => (
        <TownDot key={i} size={size} revenue={phaseRevenue(town.revenue, phaseId)} />
      ))}

      {/* Hex label (city name) */}
      {hexDef.label && (
        <text
          y={size * 0.6}
          textAnchor="middle"
          fontSize={isOffboard ? size * 0.15 : size * 0.16}
          fill={isOffboard ? "#f5e8d0" : "#2a1a00"}
          fontWeight="700"
          fontFamily="'Copperplate Gothic', Copperplate, 'Palatino Linotype', serif"
          style={{ pointerEvents: "none" }}
        >
          {hexDef.label}
        </text>
      )}

      {/* Off-board revenue badge */}
      {isOffboard && hexDef.offboard && (
        <g transform={`translate(0, ${-size * 0.25})`} style={{ pointerEvents: "none" }}>
          <rect x={-22} y={-11} width={44} height={22} rx={11}
            fill="#f5ece0" stroke="#7a1a1a" strokeWidth={1.5} />
          <text textAnchor="middle" dominantBaseline="middle" fontSize={11} fill="#7a1a1a"
            fontWeight="bold" fontFamily="'Palatino Linotype', Palatino, Georgia, serif">
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

export function HexMap({ mapDef, state, def, tiles, selectedHex, onHexClick, validTileHexes, activeRoutes }: Props) {
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
      width="100%"
      height="100%"
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
          />
        );
      })}

      {activeRoutes && activeRoutes.length > 0 && (
        <RouteOverlay routes={activeRoutes} size={HEX_SIZE} />
      )}
    </svg>
  );
}
