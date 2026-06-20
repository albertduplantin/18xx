import React, { useCallback, useRef } from "react";
import type { HexCoord } from "@18xx/shared";
import { GAME_1830 } from "@18xx/games";
import { hexKey } from "@18xx/engine";
import { EditorMap } from "../editor/EditorMap.js";
import { HexPropsPanel } from "../editor/HexPropsPanel.js";
import { useEditorStore } from "../editor/editor-store.js";

type Props = {
  onBack: () => void;
};

const TOOLS = [
  { id: "add",    icon: "✚", label: "Add hex",    shortcut: "A" },
  { id: "erase",  icon: "✕", label: "Erase hex",  shortcut: "E" },
  { id: "select", icon: "↖", label: "Select hex",  shortcut: "S" },
] as const;

export function EditorPage({ onBack }: Props) {
  const { name, author, hexes, selectedCoord, tool, viewBox, setMeta, setTool, clickHex, selectHex, updateHex, setViewBox, loadFromJson, exportJson } = useEditorStore();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const selectedHex = selectedCoord ? hexes.get(hexKey(selectedCoord)) : null;

  const onClickHex = useCallback((coord: HexCoord) => {
    clickHex(coord);
  }, [clickHex]);

  function handleExport() {
    const json = exportJson();
    const blob = new Blob([JSON.stringify(json, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${(name || "game").toLowerCase().replace(/\s+/g, "_")}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function handleImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const json = JSON.parse(ev.target?.result as string);
        loadFromJson(json);
      } catch {
        alert("Invalid JSON file");
      }
    };
    reader.readAsText(file);
    e.target.value = "";
  }

  function handleLoad1830() {
    // Load the 1830 map as a starting point
    loadFromJson(GAME_1830 as unknown as object);
  }

  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 300px", gridTemplateRows: "44px 1fr", height: "100vh", overflow: "hidden" }}>

      {/* ── Header ── */}
      <div style={{
        gridColumn: "1 / -1",
        background: "#0d0d20",
        borderBottom: "1px solid #2a2a50",
        padding: "0 12px",
        display: "flex",
        alignItems: "center",
        gap: 10,
        fontSize: 13,
      }}>
        <button onClick={onBack} style={{ padding: "4px 10px", background: "#1e2040", border: "1px solid #444", borderRadius: 4, color: "#aaa", cursor: "pointer", fontSize: 12 }}>
          ← Back
        </button>
        <span style={{ color: "#555" }}>|</span>
        <span style={{ fontWeight: "bold", fontSize: 15 }}>Map Editor</span>
        <input
          value={name}
          onChange={(e) => setMeta(e.target.value, author)}
          style={{ padding: "4px 10px", background: "#1e2040", border: "1px solid #444", borderRadius: 4, color: "#fff", fontSize: 13, width: 220 }}
        />

        <div style={{ display: "flex", gap: 4, marginLeft: 8 }}>
          {TOOLS.map((t) => (
            <button
              key={t.id}
              onClick={() => setTool(t.id)}
              title={`${t.label} (${t.shortcut})`}
              style={{
                padding: "4px 12px",
                background: tool === t.id ? "#4040c0" : "#1e2040",
                border: `1px solid ${tool === t.id ? "#6060e0" : "#444"}`,
                borderRadius: 4, color: "#fff", cursor: "pointer", fontSize: 13, fontWeight: tool === t.id ? "bold" : "normal",
              }}
            >
              {t.icon} {t.label}
            </button>
          ))}
        </div>

        <div style={{ marginLeft: "auto", display: "flex", gap: 6, alignItems: "center" }}>
          <span style={{ fontSize: 12, color: "#555" }}>{hexes.size} hexes</span>
          <button onClick={handleLoad1830} style={{ padding: "4px 10px", background: "#1a3a1a", border: "1px solid #3a7a3a", borderRadius: 4, color: "#70d070", cursor: "pointer", fontSize: 12 }}>
            Load 1830
          </button>
          <button onClick={() => fileInputRef.current?.click()} style={{ padding: "4px 10px", background: "#1e2040", border: "1px solid #444", borderRadius: 4, color: "#aaa", cursor: "pointer", fontSize: 12 }}>
            Import JSON
          </button>
          <button onClick={handleExport} style={{ padding: "4px 12px", background: "#4040c0", border: "none", borderRadius: 4, color: "#fff", cursor: "pointer", fontSize: 12, fontWeight: "bold" }}>
            Export JSON
          </button>
          <input ref={fileInputRef} type="file" accept=".json" style={{ display: "none" }} onChange={handleImport} />
        </div>
      </div>

      {/* ── Map canvas ── */}
      <div style={{ overflow: "hidden", position: "relative" }}>
        <EditorMap
          hexes={hexes}
          selectedCoord={selectedCoord}
          tool={tool}
          viewBox={viewBox}
          onClickHex={onClickHex}
          onViewBoxChange={setViewBox}
        />

        {/* Keyboard shortcuts hint */}
        <div style={{
          position: "absolute", bottom: 12, left: 12,
          background: "rgba(0,0,0,0.6)", borderRadius: 6, padding: "6px 10px",
          fontSize: 11, color: "#666", lineHeight: 1.6,
        }}>
          <div>Left-click: {tool === "add" ? "Add hex" : tool === "erase" ? "Erase hex" : "Select hex"}</div>
          <div>Alt+drag / Middle-drag: Pan</div>
          <div>Scroll: Zoom</div>
        </div>

        {/* Hex count overlay */}
        <div style={{
          position: "absolute", top: 12, left: 12,
          background: "rgba(0,0,0,0.5)", borderRadius: 4, padding: "4px 8px",
          fontSize: 11, color: "#78c0f0",
        }}>
          {hexes.size} hex{hexes.size !== 1 ? "es" : ""}
        </div>
      </div>

      {/* ── Right panel ── */}
      <div style={{ borderLeft: "1px solid #2a2a50", overflowY: "auto", display: "flex", flexDirection: "column" }}>

        {selectedHex && selectedCoord ? (
          <div style={{ padding: 16 }}>
            <HexPropsPanel
              coord={selectedCoord}
              hex={selectedHex}
              onChange={(patch) => updateHex(selectedCoord, patch)}
              onDelete={() => {
                const next = new Map(hexes);
                next.delete(hexKey(selectedCoord));
                useEditorStore.setState({ hexes: next, selectedCoord: null });
              }}
            />
          </div>
        ) : (
          <div style={{ padding: 16 }}>
            <div style={{ fontSize: 13, color: "#aaa", marginBottom: 16 }}>
              {tool === "add" ? "Click anywhere on the map to add a hex" : tool === "erase" ? "Click a hex to remove it" : "Click a hex to select it"}
            </div>

            <div style={{ fontSize: 11, color: "#555", fontWeight: 600, marginBottom: 8, letterSpacing: 1 }}>HOW TO USE</div>
            <div style={{ fontSize: 12, color: "#666", lineHeight: 1.8 }}>
              <div>1. Use <strong style={{ color: "#aaa" }}>✚ Add</strong> to place hexes</div>
              <div>2. Select a hex to set its type</div>
              <div>3. Mark cities, towns, off-board areas</div>
              <div>4. Add labels to cities</div>
              <div>5. Export to JSON when done</div>
            </div>

            <div style={{ marginTop: 20, fontSize: 11, color: "#555", fontWeight: 600, marginBottom: 8, letterSpacing: 1 }}>HEX TYPES</div>
            {[
              ["blank", "#f5f0e8", "Playable (players can build track)"],
              ["city", "#f5d442", "City (has token slots)"],
              ["town", "#f5d442", "Town (small revenue boost)"],
              ["offboard", "#c0392b", "Off-board (fixed revenue)"],
              ["mountain", "#c8b880", "Mountain (extra build cost)"],
              ["water", "#5090c0", "Water (usually unbuildable)"],
            ].map(([type, color, desc]) => (
              <div key={type} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                <div style={{ width: 16, height: 16, background: color, borderRadius: 2, border: "1px solid #555", flexShrink: 0 }} />
                <div>
                  <div style={{ fontSize: 12, fontWeight: 600 }}>{type}</div>
                  <div style={{ fontSize: 11, color: "#555" }}>{desc}</div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Game metadata at bottom */}
        <div style={{ marginTop: "auto", padding: 16, borderTop: "1px solid #2a2a50" }}>
          <div style={{ fontSize: 11, color: "#555", fontWeight: 600, marginBottom: 8, letterSpacing: 1 }}>GAME INFO</div>
          <label style={{ fontSize: 11, color: "#aaa", display: "block", marginBottom: 4 }}>Author</label>
          <input
            value={author}
            onChange={(e) => setMeta(name, e.target.value)}
            placeholder="Your name"
            style={{ width: "100%", padding: "6px 10px", background: "#12122a", border: "1px solid #444", borderRadius: 6, color: "#fff", fontSize: 12 }}
          />
        </div>
      </div>
    </div>
  );
}
