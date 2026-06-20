import React, { useRef, useCallback, useState } from "react";
import type { HexCoord } from "@18xx/shared";
import { hexToPixel, hexCorners, hexKey, pixelToHex } from "@18xx/engine";
import type { EditorHex } from "./editor-store.js";

const SIZE = 52;

const HEX_COLORS: Record<string, string> = {
  blank: "#f5f0e8",
  city: "#f5d442",
  town: "#f5d442",
  offboard: "#c0392b",
  mountain: "#c8b880",
  water: "#5090c0",
};

type Props = {
  hexes: Map<string, EditorHex>;
  selectedCoord: HexCoord | null;
  tool: string;
  viewBox: { x: number; y: number; w: number; h: number };
  onClickHex: (coord: HexCoord) => void;
  onViewBoxChange: (vb: { x: number; y: number; w: number; h: number }) => void;
};

export function EditorMap({ hexes, selectedCoord, tool, viewBox, onClickHex, onViewBoxChange }: Props) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [isPanning, setIsPanning] = useState(false);
  const panRef = useRef({ mx: 0, my: 0, vx: 0, vy: 0 });
  const [ghostHex, setGhostHex] = useState<HexCoord | null>(null);

  const svgToHex = useCallback((clientX: number, clientY: number): HexCoord | null => {
    const svg = svgRef.current;
    if (!svg) return null;
    const rect = svg.getBoundingClientRect();
    const svgX = (clientX - rect.left) / rect.width * viewBox.w + viewBox.x;
    const svgY = (clientY - rect.top) / rect.height * viewBox.h + viewBox.y;
    return pixelToHex(svgX, svgY, SIZE);
  }, [viewBox]);

  const onMouseDown = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    if (e.button === 1 || (e.button === 0 && e.altKey)) {
      setIsPanning(true);
      panRef.current = { mx: e.clientX, my: e.clientY, vx: viewBox.x, vy: viewBox.y };
      e.preventDefault();
    }
  }, [viewBox]);

  const onMouseMove = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    if (isPanning) {
      const svg = svgRef.current;
      if (!svg) return;
      const scaleX = viewBox.w / svg.clientWidth;
      const scaleY = viewBox.h / svg.clientHeight;
      onViewBoxChange({
        ...viewBox,
        x: panRef.current.vx - (e.clientX - panRef.current.mx) * scaleX,
        y: panRef.current.vy - (e.clientY - panRef.current.my) * scaleY,
      });
    } else {
      const coord = svgToHex(e.clientX, e.clientY);
      setGhostHex(coord);
    }
  }, [isPanning, viewBox, svgToHex, onViewBoxChange]);

  const onMouseUp = useCallback(() => setIsPanning(false), []);

  const onWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    const factor = e.deltaY > 0 ? 1.12 : 0.88;
    onViewBoxChange({
      ...viewBox,
      w: Math.min(2500, Math.max(300, viewBox.w * factor)),
      h: Math.min(2000, Math.max(200, viewBox.h * factor)),
    });
  }, [viewBox, onViewBoxChange]);

  const onClick = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    if (e.altKey || e.button !== 0) return;
    const coord = svgToHex(e.clientX, e.clientY);
    if (coord) onClickHex(coord);
  }, [svgToHex, onClickHex]);

  const isSelected = (coord: HexCoord) =>
    selectedCoord?.q === coord.q && selectedCoord?.r === coord.r;

  return (
    <svg
      ref={svgRef}
      width="100%"
      height="100%"
      viewBox={`${viewBox.x} ${viewBox.y} ${viewBox.w} ${viewBox.h}`}
      style={{ display: "block", userSelect: "none", cursor: isPanning ? "grabbing" : tool === "erase" ? "crosshair" : "default" }}
      onMouseDown={onMouseDown}
      onMouseMove={onMouseMove}
      onMouseUp={onMouseUp}
      onMouseLeave={() => { setIsPanning(false); setGhostHex(null); }}
      onWheel={onWheel}
      onClick={onClick}
    >
      {/* Grid background */}
      <rect x={viewBox.x - 200} y={viewBox.y - 200} width={viewBox.w + 400} height={viewBox.h + 400} fill="#2a3a2a" />

      {/* Placed hexes */}
      {[...hexes.values()].map((hex) => {
        const { x, y } = hexToPixel(hex.coord, SIZE);
        const color = HEX_COLORS[hex.type] ?? "#f5f0e8";
        const selected = isSelected(hex.coord);

        return (
          <g key={hexKey(hex.coord)} transform={`translate(${x},${y})`}>
            <polygon
              points={hexCorners(0, 0, SIZE)}
              fill={color}
              stroke={selected ? "#f0e020" : "#555"}
              strokeWidth={selected ? 3 : 1.5}
            />
            {/* City circle */}
            {hex.type === "city" && (
              <circle r={SIZE * 0.22} fill="#fff" stroke="#333" strokeWidth={2} />
            )}
            {/* Town square */}
            {hex.type === "town" && (
              <rect x={-SIZE * 0.1} y={-SIZE * 0.1} width={SIZE * 0.2} height={SIZE * 0.2} fill="#c8a96e" stroke="#333" strokeWidth={1} />
            )}
            {/* Mountain lines */}
            {hex.type === "mountain" && (
              <path d="M -15 10 L 0 -15 L 15 10" fill="none" stroke="#6a5a30" strokeWidth={2} />
            )}
            {/* Water waves */}
            {hex.type === "water" && (
              <path d="M -20 0 Q -10 -8 0 0 Q 10 8 20 0" fill="none" stroke="#3060a0" strokeWidth={2.5} />
            )}
            {/* Label */}
            {hex.label && (
              <text
                y={hex.type === "offboard" ? 0 : SIZE * 0.55}
                textAnchor="middle"
                dominantBaseline="middle"
                fontSize={SIZE * 0.16}
                fill={hex.type === "offboard" ? "#fff" : "#333"}
                fontWeight="600"
                style={{ pointerEvents: "none" }}
              >
                {hex.label}
              </text>
            )}
            {hex.type === "offboard" && (
              <text
                y={-SIZE * 0.25}
                textAnchor="middle"
                dominantBaseline="middle"
                fontSize={SIZE * 0.17}
                fill="#fff"
                fontWeight="bold"
                style={{ pointerEvents: "none" }}
              >
                ${hex.offboardRevenue}
              </text>
            )}
          </g>
        );
      })}

      {/* Ghost hex (preview when adding) */}
      {ghostHex && tool === "add" && !hexes.has(hexKey(ghostHex)) && (
        (() => {
          const { x, y } = hexToPixel(ghostHex, SIZE);
          return (
            <g transform={`translate(${x},${y})`} style={{ pointerEvents: "none" }}>
              <polygon points={hexCorners(0, 0, SIZE)} fill="#f5f0e8" stroke="#f0e020" strokeWidth={2} opacity={0.4} />
            </g>
          );
        })()
      )}
    </svg>
  );
}
