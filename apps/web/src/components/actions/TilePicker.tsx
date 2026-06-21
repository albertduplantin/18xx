import React, { useState, useEffect } from "react";
import type { TileDef, HexCoord, GameState } from "@18xx/shared";
import { hexCorners, rotatePaths } from "@18xx/engine";
import { trackEndpoint } from "../HexMap.js";

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
  allowedColors: readonly string[];
  coord: HexCoord;
  companyId: string;
  /** Screen position of the clicked hex — popup appears here */
  screenPos?: { x: number; y: number };
  onPlace: (tileId: string, rotation: number) => void;
  onClose: () => void;
};

const MINI = 28;   // mini hex radius for grid thumbnails
const PREV = 40;   // preview hex radius

// ─── Mini hex SVG ─────────────────────────────────────────────────────────────

function MiniHex({ tile, rotation, size = MINI, selected = false }: {
  tile: TileDef;
  rotation: number;
  size?: number;
  selected?: boolean;
}) {
  const cx = size + 2, cy = size + 2;
  const paths = rotatePaths(tile.paths, rotation);
  const bg = TILE_COLORS[tile.color] ?? "#ccc";
  const trackColor = tile.color === "white" || tile.color === "yellow" ? "#d0c8a8" : "#f8f4e8";

  function ep(dir: number) {
    const e = trackEndpoint(dir, size);
    return { x: cx + e.x, y: cy + e.y };
  }

  return (
    <svg width={size * 2 + 4} height={size * 2 + 4} style={{ display: "block" }}>
      <polygon points={hexCorners(cx, cy, size).split(" ").join(" ")}
        fill={bg} stroke={selected ? "#6060f0" : "#6b5a3a"} strokeWidth={selected ? 2 : 1} />

      {paths.map((p, i) => {
        const f = ep(p.from), t = ep(p.to);
        // Control point at hex center
        const d = `M${f.x} ${f.y} Q${cx} ${cy} ${t.x} ${t.y}`;
        return (
          <g key={i}>
            <path d={d} stroke="rgba(0,0,0,0.3)" strokeWidth={size * 0.22} fill="none" strokeLinecap="round" />
            <path d={d} stroke={trackColor}        strokeWidth={size * 0.13} fill="none" strokeLinecap="round" />
          </g>
        );
      })}

      {tile.cities.map((city, i) => {
        const angle = tile.cities.length > 1 ? (i * Math.PI * 2) / tile.cities.length - Math.PI / 2 : 0;
        const dx = tile.cities.length > 1 ? Math.cos(angle) * size * 0.28 : 0;
        const dy = tile.cities.length > 1 ? Math.sin(angle) * size * 0.28 : 0;
        return (
          <g key={i} transform={`translate(${cx + dx},${cy + dy})`}>
            <circle r={size * 0.24} fill="#f5ece0" stroke="#1a0800" strokeWidth={1.5} />
          </g>
        );
      })}

      {tile.towns.map((_, i) => {
        const w = size * 0.22, h = size * 0.12;
        return (
          <rect key={i} x={cx - w / 2} y={cy - h / 2} width={w} height={h}
            fill="#1a0a00" stroke="#000" strokeWidth={0.5} rx={2} />
        );
      })}
    </svg>
  );
}

// ─── Popup tile picker ────────────────────────────────────────────────────────

export function TilePicker({ tiles, state, allowedColors, coord, companyId, screenPos, onPlace, onClose }: Props) {
  const [rotation, setRotation] = useState(0);
  const [colorFilter, setColorFilter] = useState<string>(allowedColors[0] ?? "yellow");
  const [selected, setSelected] = useState<TileDef | null>(null);

  // Reset state whenever the target hex changes
  useEffect(() => {
    setSelected(null);
    setRotation(0);
    setColorFilter(allowedColors[0] ?? "yellow");
  }, [coord.q, coord.r, allowedColors]);

  const available = tiles.filter((t) => allowedColors.includes(t.color));
  const filtered = available.filter((t) => t.color === colorFilter);
  const availableColorTabs = COLOR_ORDER.filter((c) => allowedColors.includes(c));

  // Position the popup near the click point, clamped to viewport
  const W = 340, H = 420;
  const vw = typeof window !== "undefined" ? window.innerWidth : 1200;
  const vh = typeof window !== "undefined" ? window.innerHeight : 800;
  const rawX = (screenPos?.x ?? vw / 2) + 16;
  const rawY = (screenPos?.y ?? vh / 2) - H / 2;
  const left = Math.min(rawX, vw - W - 8);
  const top  = Math.max(8, Math.min(rawY, vh - H - 8));

  return (
    <>
      {/* Dismiss backdrop */}
      <div
        style={{ position: "fixed", inset: 0, zIndex: 900 }}
        onClick={onClose}
      />

      {/* Popup */}
      <div style={{
        position: "fixed",
        left, top,
        width: W,
        maxHeight: H,
        zIndex: 901,
        background: "#1a1a2e",
        border: "1px solid #4a4a80",
        borderRadius: 10,
        boxShadow: "0 8px 32px rgba(0,0,0,0.7)",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
      }}>

        {/* Header */}
        <div style={{ padding: "8px 12px", background: "#12122a", borderBottom: "1px solid #333", display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 12, fontWeight: "bold", color: "#fff" }}>
            Tuile → ({coord.q},{coord.r})
          </span>
          <span style={{ fontSize: 11, color: "#666", marginLeft: 2 }}>{companyId} · Phase {state.phaseId}</span>
          <button onClick={onClose} style={{ marginLeft: "auto", background: "none", border: "none", color: "#666", fontSize: 16, cursor: "pointer", lineHeight: 1 }}>✕</button>
        </div>

        {/* Color tabs */}
        <div style={{ display: "flex", gap: 4, padding: "6px 8px", background: "#12122a", borderBottom: "1px solid #222" }}>
          {availableColorTabs.map((c) => (
            <button key={c} onClick={() => { setColorFilter(c); setSelected(null); }}
              style={{
                padding: "3px 10px", borderRadius: 12, border: `2px solid ${colorFilter === c ? "#6060e0" : "transparent"}`,
                cursor: "pointer", fontSize: 11, fontWeight: "bold",
                background: TILE_COLORS[c] ?? "#333",
                color: c === "yellow" || c === "white" ? "#333" : "#fff",
              }}>
              {c[0]!.toUpperCase() + c.slice(1)} ({available.filter((t) => t.color === c).length})
            </button>
          ))}
        </div>

        {/* Tile grid */}
        <div style={{ flex: 1, overflowY: "auto", display: "flex", flexWrap: "wrap", gap: 4, padding: 6 }}>
          {filtered.map((tile) => (
            <div key={tile.id}
              onClick={() => setSelected(tile.id === selected?.id ? null : tile)}
              title={`Tuile #${tile.id}`}
              style={{
                border: `2px solid ${selected?.id === tile.id ? "#6060e0" : "rgba(255,255,255,0.08)"}`,
                borderRadius: 6, cursor: "pointer", padding: 2,
                background: selected?.id === tile.id ? "#2a2060" : "rgba(255,255,255,0.03)",
              }}>
              <MiniHex tile={tile} rotation={selected?.id === tile.id ? rotation : 0} selected={selected?.id === tile.id} />
            </div>
          ))}
          {filtered.length === 0 && (
            <div style={{ color: "#555", fontSize: 12, padding: 10 }}>
              Aucune tuile {colorFilter} disponible.
            </div>
          )}
        </div>

        {/* Selected tile: rotation + preview + confirm */}
        {selected && (
          <div style={{ borderTop: "1px solid #2a2a40", padding: "8px 10px", background: "#12122a" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
              {/* Preview */}
              <div style={{ flexShrink: 0 }}>
                <MiniHex tile={selected} rotation={rotation} size={PREV} selected />
              </div>

              {/* Rotation controls */}
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 10, color: "#888", marginBottom: 4 }}>Rotation</div>
                <div style={{ display: "flex", gap: 2, flexWrap: "wrap" }}>
                  {[0, 1, 2, 3, 4, 5].map((r) => (
                    <button key={r} onClick={() => setRotation(r)}
                      style={{
                        width: 38, height: 24, cursor: "pointer", fontSize: 10, fontWeight: "bold",
                        background: rotation === r ? "#4040c0" : "#252540",
                        border: `1px solid ${rotation === r ? "#6060e0" : "#333"}`,
                        borderRadius: 3, color: rotation === r ? "#fff" : "#888",
                      }}>
                      {r * 60}°
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div style={{ display: "flex", gap: 6 }}>
              <button onClick={onClose}
                style={{ flex: 1, padding: "7px", background: "#252540", border: "1px solid #444", borderRadius: 6, color: "#888", cursor: "pointer", fontSize: 12 }}>
                Annuler
              </button>
              <button onClick={() => onPlace(selected.id, rotation)}
                style={{ flex: 2, padding: "7px", background: "#4040c0", border: "1px solid #6060e0", borderRadius: 6, color: "#fff", cursor: "pointer", fontWeight: "bold", fontSize: 13 }}>
                Poser la tuile #{selected.id}
              </button>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
