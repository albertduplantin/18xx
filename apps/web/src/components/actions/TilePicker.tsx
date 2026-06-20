import React, { useState } from "react";
import type { TileDef, HexCoord, GameState } from "@18xx/shared";
import { hexCorners, rotatePaths } from "@18xx/engine";

const TILE_COLORS: Record<string, string> = {
  yellow: "#f5d442", green: "#3a9e4e", brown: "#8b5e3c", gray: "#9a9a9a",
};

type Props = {
  tiles: readonly TileDef[];
  state: GameState;
  coord: HexCoord;
  companyId: string;
  onPlace: (tileId: string, rotation: number) => void;
  onClose: () => void;
};

const SIZE = 32;

function MiniHex({ tile, rotation }: { tile: TileDef; rotation: number }) {
  const cx = SIZE, cy = SIZE;
  const paths = rotatePaths(tile.paths, rotation);
  const color = TILE_COLORS[tile.color] ?? "#ccc";

  function endpt(dir: number) {
    const angle = (dir * Math.PI) / 3;
    return { x: cx + Math.cos(angle) * SIZE * 0.97, y: cy + Math.sin(angle) * SIZE * 0.97 };
  }

  return (
    <svg width={SIZE * 2 + 4} height={SIZE * 2 + 4} style={{ display: "block" }}>
      <polygon points={hexCorners(cx, cy, SIZE)} fill={color} stroke="#555" strokeWidth={1.5} />
      {paths.map((p, i) => {
        const f = endpt(p.from);
        const t = endpt(p.to);
        const qx = (f.x + t.x) / 2 * 0.3 + cx * 0.7;
        const qy = (f.y + t.y) / 2 * 0.3 + cy * 0.7;
        return <path key={i} d={`M${f.x} ${f.y} Q${qx} ${qy} ${t.x} ${t.y}`} stroke="#c8a96e" strokeWidth={SIZE * 0.14} fill="none" strokeLinecap="round" />;
      })}
      {tile.cities.map((_, i) => (
        <circle key={i} cx={cx} cy={cy} r={SIZE * 0.22} fill="#fff" stroke="#333" strokeWidth={1.5} />
      ))}
      {tile.towns.map((_, i) => (
        <rect key={i} x={cx - SIZE * 0.1} y={cy - SIZE * 0.1} width={SIZE * 0.2} height={SIZE * 0.2} fill="#c8a96e" stroke="#333" strokeWidth={1} />
      ))}
      <text x={cx} y={SIZE * 2} textAnchor="middle" fontSize={9} fill="#333" fontWeight="600">#{tile.id}</text>
    </svg>
  );
}

export function TilePicker({ tiles, state, coord, companyId, onPlace, onClose }: Props) {
  const [rotation, setRotation] = useState(0);
  const [filter, setFilter] = useState<string>("all");
  const [selected, setSelected] = useState<TileDef | null>(null);

  // Only show tiles available in current phase (based on color)
  const availableColors = ["yellow", "green", "brown", "gray"]; // TODO: filter by phase

  const filtered = tiles.filter((t) => filter === "all" || t.color === filter);

  return (
    <div style={{
      position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)",
      display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000,
    }}>
      <div style={{
        background: "#1e2040", border: "1px solid #555", borderRadius: 12,
        padding: 20, width: 560, maxHeight: "80vh", display: "flex", flexDirection: "column", gap: 12,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <h3 style={{ fontSize: 15, fontWeight: "bold", margin: 0 }}>
            Choose Tile for ({coord.q},{coord.r})
          </h3>
          <button onClick={onClose} style={{ marginLeft: "auto", background: "none", border: "none", color: "#aaa", fontSize: 18, cursor: "pointer" }}>✕</button>
        </div>

        {/* Color filter */}
        <div style={{ display: "flex", gap: 6 }}>
          {["all", ...availableColors].map((c) => (
            <button key={c} onClick={() => setFilter(c)}
              style={{
                padding: "4px 12px", borderRadius: 12, border: "none", cursor: "pointer", fontSize: 12,
                background: filter === c ? (TILE_COLORS[c] ?? "#4040c0") : "#333",
                color: filter === c && c !== "all" ? "#333" : "#fff", fontWeight: filter === c ? "bold" : "normal",
              }}>
              {c}
            </button>
          ))}
        </div>

        {/* Tile grid */}
        <div style={{ overflowY: "auto", flex: 1, display: "flex", flexWrap: "wrap", gap: 8, padding: 4 }}>
          {filtered.map((tile) => (
            <div key={tile.id}
              onClick={() => setSelected(tile)}
              style={{
                border: `2px solid ${selected?.id === tile.id ? "#6060e0" : "#333"}`,
                borderRadius: 8, cursor: "pointer", padding: 4,
                background: selected?.id === tile.id ? "#2a2060" : "#12122a",
              }}>
              <MiniHex tile={tile} rotation={selected?.id === tile.id ? rotation : 0} />
            </div>
          ))}
          {filtered.length === 0 && <div style={{ color: "#555", fontSize: 13 }}>No tiles match this filter</div>}
        </div>

        {/* Rotation + confirm */}
        {selected && (
          <div style={{ borderTop: "1px solid #333", paddingTop: 12, display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{ fontSize: 12, color: "#aaa" }}>Tile #{selected.id} · Rotation:</div>
            <div style={{ display: "flex", gap: 4 }}>
              {[0, 1, 2, 3, 4, 5].map((r) => (
                <button key={r} onClick={() => setRotation(r)}
                  style={{ width: 28, height: 28, background: rotation === r ? "#4040c0" : "#333", border: "none", borderRadius: 4, color: "#fff", cursor: "pointer", fontSize: 12 }}>
                  {r * 60}°
                </button>
              ))}
            </div>
            <button
              onClick={() => onPlace(selected.id, rotation)}
              style={{ marginLeft: "auto", padding: "8px 20px", background: "#4040c0", border: "none", borderRadius: 6, color: "#fff", cursor: "pointer", fontWeight: "bold", fontSize: 13 }}>
              Place Tile
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
