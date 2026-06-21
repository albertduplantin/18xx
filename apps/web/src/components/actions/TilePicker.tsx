import React, { useState } from "react";
import type { TileDef, HexCoord, GameState } from "@18xx/shared";
import { hexCorners, rotatePaths } from "@18xx/engine";

const TILE_COLORS: Record<string, string> = {
  yellow: "#e8c832",
  green:  "#3a9e4e",
  brown:  "#8b5e3c",
  gray:   "#909090",
  white:  "#e8e0ca",
};

const COLOR_ORDER = ["white", "yellow", "green", "brown", "gray"];

type Props = {
  tiles: readonly TileDef[];
  state: GameState;
  /** Colors available in the current phase — derived from def.phases */
  allowedColors: readonly string[];
  coord: HexCoord;
  companyId: string;
  onPlace: (tileId: string, rotation: number) => void;
  onClose: () => void;
};

const SIZE = 34;

function MiniHex({ tile, rotation, selected }: { tile: TileDef; rotation: number; selected: boolean }) {
  const cx = SIZE, cy = SIZE;
  const paths = rotatePaths(tile.paths, rotation);
  const bg = TILE_COLORS[tile.color] ?? "#ccc";

  function endpoint(dir: number) {
    const angle = (dir * Math.PI) / 3;
    return {
      x: cx + Math.cos(angle) * SIZE * 0.95,
      y: cy + Math.sin(angle) * SIZE * 0.95,
    };
  }

  return (
    <svg width={SIZE * 2 + 4} height={SIZE * 2 + 12} style={{ display: "block" }}>
      <polygon points={hexCorners(cx, cy, SIZE)} fill={bg}
        stroke={selected ? "#6060f0" : "#6b5a3a"} strokeWidth={selected ? 2.5 : 1} />

      {paths.map((p, i) => {
        const f = endpoint(p.from);
        const t = endpoint(p.to);
        const qx = (f.x + t.x) / 2 * 0.3 + cx * 0.7;
        const qy = (f.y + t.y) / 2 * 0.3 + cy * 0.7;
        return (
          <g key={i}>
            <path d={`M${f.x} ${f.y} Q${qx} ${qy} ${t.x} ${t.y}`}
              stroke="rgba(0,0,0,0.3)" strokeWidth={SIZE * 0.20} fill="none" strokeLinecap="round" />
            <path d={`M${f.x} ${f.y} Q${qx} ${qy} ${t.x} ${t.y}`}
              stroke="#f8f4e8" strokeWidth={SIZE * 0.13} fill="none" strokeLinecap="round" />
          </g>
        );
      })}

      {tile.cities.map((city, i) => {
        const angle = tile.cities.length > 1 ? (i * Math.PI * 2) / tile.cities.length - Math.PI / 2 : 0;
        const dx = tile.cities.length > 1 ? Math.cos(angle) * SIZE * 0.28 : 0;
        const dy = tile.cities.length > 1 ? Math.sin(angle) * SIZE * 0.28 : 0;
        return (
          <g key={i} transform={`translate(${cx + dx},${cy + dy})`}>
            <circle r={SIZE * 0.20} fill="#f0ece0" stroke="#2a1a00" strokeWidth={1.5} />
            {city.slots > 1 && (
              <text x={0} y={0} textAnchor="middle" dominantBaseline="middle"
                fontSize={SIZE * 0.22} fill="#555" fontWeight="bold">{city.slots}</text>
            )}
          </g>
        );
      })}

      {tile.towns.map((_, i) => {
        const s = SIZE * 0.14;
        return (
          <rect key={i} x={cx - s} y={cy - s} width={s * 2} height={s * 2}
            fill="#2a1a00" stroke="#0a0800" strokeWidth={1} rx={2} />
        );
      })}

      <text x={cx} y={SIZE * 2 + 9} textAnchor="middle" fontSize={9} fill="#aaa" fontWeight="600"
        fontFamily="monospace">
        #{tile.id}
      </text>
    </svg>
  );
}

export function TilePicker({ tiles, state, allowedColors, coord, companyId, onPlace, onClose }: Props) {
  const [rotation, setRotation] = useState(0);
  const [colorFilter, setColorFilter] = useState<string>(allowedColors[0] ?? "yellow");
  const [selected, setSelected] = useState<TileDef | null>(null);

  // Only show tiles of colors allowed in the current phase
  const available = tiles.filter((t) => allowedColors.includes(t.color));
  const filtered = available.filter((t) => t.color === colorFilter);

  const availableColorTabs = COLOR_ORDER.filter((c) => allowedColors.includes(c));

  return (
    <div style={{
      position: "fixed", inset: 0, background: "rgba(0,0,0,0.75)",
      display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000,
    }}>
      <div style={{
        background: "#1a1a30", border: "1px solid #4a4a80", borderRadius: 12,
        padding: 20, width: 580, maxHeight: "85vh", display: "flex", flexDirection: "column", gap: 12,
        boxShadow: "0 8px 32px rgba(0,0,0,0.6)",
      }}>
        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div>
            <div style={{ fontSize: 15, fontWeight: "bold", color: "#fff" }}>
              Choose Tile — ({coord.q},{coord.r})
            </div>
            <div style={{ fontSize: 11, color: "#888", marginTop: 2 }}>
              Phase {state.phaseId} · {companyId} operating
            </div>
          </div>
          <button onClick={onClose}
            style={{ marginLeft: "auto", background: "none", border: "none", color: "#888", fontSize: 20, cursor: "pointer", lineHeight: 1 }}>
            ✕
          </button>
        </div>

        {/* Color tabs */}
        <div style={{ display: "flex", gap: 6 }}>
          {availableColorTabs.map((c) => (
            <button key={c} onClick={() => { setColorFilter(c); setSelected(null); }}
              style={{
                padding: "5px 14px", borderRadius: 16, border: "2px solid",
                borderColor: colorFilter === c ? "#6060e0" : "transparent",
                cursor: "pointer", fontSize: 12, fontWeight: "bold",
                background: TILE_COLORS[c] ?? "#333",
                color: c === "yellow" || c === "white" ? "#333" : "#fff",
                textTransform: "capitalize",
              }}>
              {c} ({available.filter((t) => t.color === c).length})
            </button>
          ))}
        </div>

        {/* Tile grid */}
        <div style={{ overflowY: "auto", flex: 1, display: "flex", flexWrap: "wrap", gap: 6, padding: 4 }}>
          {filtered.map((tile) => (
            <div key={tile.id}
              onClick={() => setSelected(tile)}
              title={`Tile #${tile.id} — ${tile.cities.length} cit., ${tile.towns.length} town, ${tile.paths.length} paths`}
              style={{
                border: `2px solid ${selected?.id === tile.id ? "#6060e0" : "rgba(255,255,255,0.1)"}`,
                borderRadius: 8, cursor: "pointer", padding: 3,
                background: selected?.id === tile.id ? "#2a2060" : "rgba(255,255,255,0.04)",
              }}>
              <MiniHex tile={tile} rotation={selected?.id === tile.id ? rotation : 0} selected={selected?.id === tile.id} />
            </div>
          ))}
          {filtered.length === 0 && (
            <div style={{ color: "#555", fontSize: 13, padding: 12 }}>
              No {colorFilter} tiles in the set.
            </div>
          )}
        </div>

        {/* Rotation selector + confirm */}
        {selected && (
          <div style={{ borderTop: "1px solid #333", paddingTop: 12, display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <div style={{ fontSize: 12, color: "#aaa" }}>
              Tile <strong style={{ color: "#fff" }}>#{selected.id}</strong> · Rotation:
            </div>
            <div style={{ display: "flex", gap: 3 }}>
              {[0, 1, 2, 3, 4, 5].map((r) => (
                <button key={r} onClick={() => setRotation(r)}
                  style={{
                    width: 36, height: 28, cursor: "pointer", fontSize: 11, fontWeight: "bold",
                    background: rotation === r ? "#4040c0" : "#2a2a40",
                    border: `1px solid ${rotation === r ? "#6060e0" : "#444"}`,
                    borderRadius: 4, color: rotation === r ? "#fff" : "#888",
                  }}>
                  {r * 60}°
                </button>
              ))}
            </div>
            <button
              onClick={() => onPlace(selected.id, rotation)}
              style={{
                marginLeft: "auto", padding: "9px 22px",
                background: "#4040c0", border: "1px solid #6060e0", borderRadius: 6,
                color: "#fff", cursor: "pointer", fontWeight: "bold", fontSize: 13,
              }}>
              Place Tile
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
