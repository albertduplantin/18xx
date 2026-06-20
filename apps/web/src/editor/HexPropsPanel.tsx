import React from "react";
import type { HexCoord } from "@18xx/shared";
import type { EditorHex, HexType } from "./editor-store.js";

type Props = {
  coord: HexCoord;
  hex: EditorHex;
  onChange: (patch: Partial<EditorHex>) => void;
  onDelete: () => void;
};

const HEX_TYPES: { value: HexType; label: string; desc: string }[] = [
  { value: "blank",    label: "Blank",     desc: "Playable empty hex" },
  { value: "city",     label: "City",      desc: "City with token slots" },
  { value: "town",     label: "Town",      desc: "Small town" },
  { value: "offboard", label: "Off-board", desc: "Fixed revenue, no tiles" },
  { value: "mountain", label: "Mountain",  desc: "Extra cost to build through" },
  { value: "water",    label: "Water",     desc: "River/lake — usually unbuildable" },
];

export function HexPropsPanel({ coord, hex, onChange, onDelete }: Props) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{ fontWeight: "bold", fontSize: 14 }}>Hex ({coord.q},{coord.r})</span>
        <button
          onClick={onDelete}
          style={{ marginLeft: "auto", padding: "2px 8px", background: "#3a1010", border: "1px solid #c0392b", borderRadius: 4, color: "#e07070", cursor: "pointer", fontSize: 12 }}
        >
          Delete
        </button>
      </div>

      {/* Type */}
      <div>
        <label style={{ fontSize: 11, color: "#aaa", display: "block", marginBottom: 6, fontWeight: 600 }}>TYPE</label>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
          {HEX_TYPES.map((t) => (
            <button
              key={t.value}
              onClick={() => onChange({ type: t.value })}
              title={t.desc}
              style={{
                padding: "4px 10px",
                background: hex.type === t.value ? "#4040c0" : "#1e2040",
                border: `1px solid ${hex.type === t.value ? "#6060e0" : "#444"}`,
                borderRadius: 4,
                color: "#fff",
                cursor: "pointer",
                fontSize: 12,
                fontWeight: hex.type === t.value ? "bold" : "normal",
              }}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* Label */}
      <div>
        <label style={{ fontSize: 11, color: "#aaa", display: "block", marginBottom: 4, fontWeight: 600 }}>LABEL</label>
        <input
          value={hex.label}
          onChange={(e) => onChange({ label: e.target.value })}
          placeholder="e.g. New York, Boston..."
          style={{ width: "100%", padding: "6px 10px", background: "#12122a", border: "1px solid #444", borderRadius: 6, color: "#fff", fontSize: 13 }}
        />
      </div>

      {/* City slots */}
      {hex.type === "city" && (
        <div>
          <label style={{ fontSize: 11, color: "#aaa", display: "block", marginBottom: 4, fontWeight: 600 }}>CITY TOKEN SLOTS</label>
          <div style={{ display: "flex", gap: 6 }}>
            {[1, 2, 3, 4].map((n) => (
              <button
                key={n}
                onClick={() => onChange({ citySlots: n })}
                style={{
                  width: 36, height: 36,
                  background: hex.citySlots === n ? "#4040c0" : "#1e2040",
                  border: `1px solid ${hex.citySlots === n ? "#6060e0" : "#444"}`,
                  borderRadius: 4, color: "#fff", cursor: "pointer", fontSize: 14, fontWeight: "bold",
                }}
              >
                {n}
              </button>
            ))}
          </div>
          <div style={{ fontSize: 11, color: "#555", marginTop: 4 }}>
            {hex.citySlots === 1 ? "Single city (most common)" : hex.citySlots === 2 ? "Double city (e.g. NYC)" : hex.citySlots === 3 ? "Triple city" : "Quadruple city"}
          </div>
        </div>
      )}

      {/* Off-board revenue */}
      {hex.type === "offboard" && (
        <div>
          <label style={{ fontSize: 11, color: "#aaa", display: "block", marginBottom: 4, fontWeight: 600 }}>OFF-BOARD REVENUE ($)</label>
          <input
            type="number"
            min={0}
            step={10}
            value={hex.offboardRevenue}
            onChange={(e) => onChange({ offboardRevenue: Number(e.target.value) })}
            style={{ width: "100%", padding: "6px 10px", background: "#12122a", border: "1px solid #444", borderRadius: 6, color: "#fff", fontSize: 13 }}
          />
          <div style={{ fontSize: 11, color: "#555", marginTop: 4 }}>Fixed revenue for trains reaching this hex</div>
        </div>
      )}

      {/* Pre-printed */}
      {(hex.type === "city" || hex.type === "town") && (
        <div>
          <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
            <input
              type="checkbox"
              checked={hex.preprinted}
              onChange={(e) => onChange({ preprinted: e.target.checked })}
              style={{ width: 16, height: 16 }}
            />
            <span style={{ fontSize: 12 }}>Pre-printed yellow tile (city/town exists from game start)</span>
          </label>
        </div>
      )}
    </div>
  );
}
