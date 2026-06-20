import React, { useState, useRef, useCallback } from "react";
import type { HexDef, PlacedTile, TileDef, HexCoord, GameState } from "@18xx/shared";
import { hexToPixel, hexCorners, hexKey, rotatePaths } from "@18xx/engine";

const HEX_SIZE = 52;
const SQRT3 = Math.sqrt(3);

type Props = {
  mapDef: readonly HexDef[];
  state: GameState;
  tiles: readonly TileDef[];
  selectedHex: HexCoord | null;
  onHexClick: (coord: HexCoord) => void;
};

// ─── Track rendering ────────────────────────────────────────────────────────

function trackEndpoint(dir: number, size: number): { x: number; y: number } {
  const angle = (dir * Math.PI) / 3;
  return { x: Math.cos(angle) * size, y: Math.sin(angle) * size };
}

function TrackPath({ from, to, size }: { from: number; to: number; size: number }) {
  const f = trackEndpoint(from, size * 0.97);
  const t = trackEndpoint(to, size * 0.97);
  const cx = (f.x + t.x) / 2 * 0.4;
  const cy = (f.y + t.y) / 2 * 0.4;
  return (
    <path
      d={`M ${f.x} ${f.y} Q ${cx} ${cy} ${t.x} ${t.y}`}
      stroke="#c8a96e"
      strokeWidth={size * 0.14}
      fill="none"
      strokeLinecap="round"
    />
  );
}

// ─── City / Town rendering ───────────────────────────────────────────────────

function CityCircle({ slots, size, tokens, companyColors }: {
  slots: number;
  size: number;
  tokens: readonly (string | null)[];
  companyColors: Record<string, string>;
}) {
  const r = size * 0.22;
  if (slots === 1) {
    const token = tokens[0] ?? null;
    return (
      <g>
        <circle r={r} fill={token ? (companyColors[token] ?? "#888") : "#fff"} stroke="#333" strokeWidth={2} />
        {token && <text textAnchor="middle" dominantBaseline="middle" fontSize={r * 0.9} fill="#fff" fontWeight="bold">{token}</text>}
      </g>
    );
  }

  return (
    <g>
      {Array.from({ length: slots }, (_, i) => {
        const angle = (i * Math.PI * 2) / slots - Math.PI / 2;
        const dx = slots > 1 ? Math.cos(angle) * r * 1.2 : 0;
        const dy = slots > 1 ? Math.sin(angle) * r * 1.2 : 0;
        const token = tokens[i] ?? null;
        return (
          <g key={i} transform={`translate(${dx},${dy})`}>
            <circle r={r * 0.8} fill={token ? (companyColors[token] ?? "#888") : "#fff"} stroke="#333" strokeWidth={1.5} />
            {token && <text textAnchor="middle" dominantBaseline="middle" fontSize={r * 0.7} fill="#fff" fontWeight="bold">{token}</text>}
          </g>
        );
      })}
    </g>
  );
}

function TownDot({ size }: { size: number }) {
  return <rect x={-size * 0.1} y={-size * 0.1} width={size * 0.2} height={size * 0.2} fill="#c8a96e" stroke="#333" strokeWidth={1} rx={2} />;
}

// ─── Single hex ──────────────────────────────────────────────────────────────

const TILE_COLORS: Record<string, string> = {
  white: "#f5f0e8",
  yellow: "#f5d442",
  green: "#3a9e4e",
  brown: "#8b5e3c",
  gray: "#9a9a9a",
  red: "#c0392b",
};

function HexCell({
  hexDef,
  placed,
  tileDef,
  selected,
  size,
  companyColors,
  onClick,
}: {
  hexDef: HexDef;
  placed: PlacedTile | undefined;
  tileDef: TileDef | undefined;
  selected: boolean;
  size: number;
  companyColors: Record<string, string>;
  onClick: () => void;
}) {
  const { x, y } = hexToPixel(hexDef.coord, size);

  const effectiveTile = placed ? tileDef : hexDef.tile;
  const bgColor = hexDef.offboard
    ? "#c0392b"
    : effectiveTile
    ? TILE_COLORS[effectiveTile.color] ?? "#f5f0e8"
    : "#f5f0e8";

  const rotation = placed?.rotation ?? 0;
  const paths = effectiveTile ? rotatePaths(effectiveTile.paths, rotation) : [];
  const tokenSlots = placed?.tokenSlots ?? [];

  return (
    <g transform={`translate(${x},${y})`} onClick={onClick} style={{ cursor: "pointer" }}>
      <polygon
        points={hexCorners(0, 0, size)}
        fill={bgColor}
        stroke={selected ? "#f0e020" : "#555"}
        strokeWidth={selected ? 3 : 1.5}
      />

      {/* Track paths */}
      {paths.map((p, i) => (
        <TrackPath key={i} from={p.from} to={p.to} size={size} />
      ))}

      {/* Cities */}
      {effectiveTile?.cities.map((city, i) => (
        <CityCircle
          key={i}
          slots={city.slots}
          size={size}
          tokens={tokenSlots.slice(i * city.slots, (i + 1) * city.slots)}
          companyColors={companyColors}
        />
      ))}

      {/* Towns */}
      {effectiveTile?.towns.map((_town, i) => (
        <TownDot key={i} size={size} />
      ))}

      {/* Label */}
      {hexDef.label && (
        <text
          y={size * 0.55}
          textAnchor="middle"
          fontSize={size * 0.16}
          fill={hexDef.offboard ? "#fff" : "#333"}
          fontWeight="600"
          style={{ pointerEvents: "none" }}
        >
          {hexDef.label}
        </text>
      )}

      {/* Off-board revenue */}
      {hexDef.offboard && (
        <text
          y={-size * 0.3}
          textAnchor="middle"
          fontSize={size * 0.18}
          fill="#fff"
          fontWeight="bold"
          style={{ pointerEvents: "none" }}
        >
          {typeof hexDef.offboard.revenue === "number"
            ? `$${hexDef.offboard.revenue}`
            : "OB"}
        </text>
      )}
    </g>
  );
}

// ─── Full map ────────────────────────────────────────────────────────────────

export function HexMap({ mapDef, state, tiles, selectedHex, onHexClick }: Props) {
  const [viewBox, setViewBox] = useState({ x: -400, y: -300, w: 900, h: 700 });
  const [isPanning, setIsPanning] = useState(false);
  const panStart = useRef({ x: 0, y: 0, vx: 0, vy: 0 });

  const companyColors: Record<string, string> = {};
  // Populated from game def if available — passed via props in practice

  const onMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button !== 1 && e.button !== 0) return;
    setIsPanning(true);
    panStart.current = { x: e.clientX, y: e.clientY, vx: viewBox.x, vy: viewBox.y };
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
      const newH = newW * (v.h / v.w);
      return { ...v, w: newW, h: newH };
    });
  }, []);

  const tileMap = new Map(tiles.map((t) => [t.id, t]));

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
      <rect
        x={viewBox.x - 100}
        y={viewBox.y - 100}
        width={viewBox.w + 200}
        height={viewBox.h + 200}
        fill="#4a7c59"
      />
      {mapDef.map((hex) => {
        const key = hexKey(hex.coord);
        const placed = state.map[key];
        const tileDef = placed ? tileMap.get(placed.tileId) : undefined;
        const isSelected = selectedHex !== null &&
          selectedHex.q === hex.coord.q && selectedHex.r === hex.coord.r;

        return (
          <HexCell
            key={key}
            hexDef={hex}
            placed={placed}
            tileDef={tileDef}
            selected={isSelected}
            size={HEX_SIZE}
            companyColors={companyColors}
            onClick={() => onHexClick(hex.coord)}
          />
        );
      })}
    </svg>
  );
}
