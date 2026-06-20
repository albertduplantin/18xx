import React, { useEffect, useState } from "react";
import type { HexCoord } from "@18xx/shared";
import { GAME_1830 } from "@18xx/games";
import { HexMap } from "../components/HexMap.js";
import { StockMarket } from "../components/StockMarket.js";
import { CompanyPanel } from "../components/CompanyPanel.js";
import { PlayerPanel } from "../components/PlayerPanel.js";
import { GameLog } from "../components/GameLog.js";
import { useGameStore } from "../store/game-store.js";

export function GamePage({ gameId, playerId }: { gameId: string; playerId: string }) {
  const { state, def, connectWs, sendAction, error, clearError } = useGameStore();
  const [selectedHex, setSelectedHex] = useState<HexCoord | null>(null);
  const [activeTab, setActiveTab] = useState<"map" | "market" | "log">("map");

  useEffect(() => {
    connectWs(gameId, playerId);
  }, [gameId, playerId, connectWs]);

  if (!state || !def) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%" }}>
        <p style={{ color: "#aaa" }}>Connecting to game…</p>
      </div>
    );
  }

  const isMyTurn = state.currentPlayerId === playerId;

  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 280px", gridTemplateRows: "auto 1fr", height: "100vh", gap: 0 }}>
      {/* Header */}
      <div style={{
        gridColumn: "1 / -1",
        background: "#12122a",
        borderBottom: "1px solid #333",
        padding: "8px 16px",
        display: "flex",
        alignItems: "center",
        gap: 12,
      }}>
        <span style={{ fontWeight: "bold", fontSize: 16 }}>{def.name}</span>
        <span style={{ color: "#aaa", fontSize: 12 }}>
          Round {state.roundNumber} · {state.round === "stock" ? "Stock Round" : `OR ${state.operatingRoundNumber}`} · Phase {state.phaseId}
        </span>
        {isMyTurn && (
          <span style={{
            marginLeft: "auto",
            background: "#4caf50",
            color: "#fff",
            padding: "2px 10px",
            borderRadius: 12,
            fontSize: 12,
            fontWeight: "bold",
          }}>
            YOUR TURN
          </span>
        )}
        {error && (
          <div style={{
            marginLeft: "auto",
            background: "#c0392b",
            color: "#fff",
            padding: "2px 10px",
            borderRadius: 4,
            fontSize: 12,
            cursor: "pointer",
          }} onClick={clearError}>
            {error} ✕
          </div>
        )}
      </div>

      {/* Main area with tabs */}
      <div style={{ overflow: "hidden", display: "flex", flexDirection: "column" }}>
        <div style={{ display: "flex", borderBottom: "1px solid #333", background: "#12122a" }}>
          {(["map", "market", "log"] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              style={{
                padding: "6px 16px",
                background: activeTab === tab ? "#2a2060" : "transparent",
                border: "none",
                color: activeTab === tab ? "#fff" : "#aaa",
                cursor: "pointer",
                fontSize: 13,
                borderBottom: activeTab === tab ? "2px solid #6060e0" : "2px solid transparent",
              }}
            >
              {tab === "map" ? "🗺 Map" : tab === "market" ? "📈 Stock Market" : "📋 Log"}
            </button>
          ))}
        </div>

        <div style={{ flex: 1, overflow: "hidden" }}>
          {activeTab === "map" && (
            <HexMap
              mapDef={def.map}
              state={state}
              tiles={def.tiles}
              selectedHex={selectedHex}
              onHexClick={setSelectedHex}
            />
          )}
          {activeTab === "market" && (
            <div style={{ padding: 16, overflowY: "auto", height: "100%" }}>
              <h3 style={{ marginBottom: 12, color: "#aaa", fontSize: 13 }}>STOCK MARKET</h3>
              <StockMarket state={state} def={def} />
            </div>
          )}
          {activeTab === "log" && (
            <div style={{ height: "100%", overflow: "hidden" }}>
              <GameLog log={state.log} />
            </div>
          )}
        </div>
      </div>

      {/* Right sidebar */}
      <div style={{
        borderLeft: "1px solid #333",
        overflowY: "auto",
        display: "flex",
        flexDirection: "column",
        gap: 0,
      }}>
        <div style={{ padding: 12, borderBottom: "1px solid #333" }}>
          <div style={{ fontSize: 11, color: "#aaa", marginBottom: 8, fontWeight: 600 }}>PLAYERS</div>
          <PlayerPanel state={state} def={def} myPlayerId={playerId} />
        </div>

        <div style={{ padding: 12 }}>
          <div style={{ fontSize: 11, color: "#aaa", marginBottom: 8, fontWeight: 600 }}>COMPANIES</div>
          <CompanyPanel state={state} def={def} />
        </div>

        {/* Action zone */}
        {isMyTurn && state.round === "stock" && (
          <div style={{ padding: 12, borderTop: "1px solid #333", marginTop: "auto" }}>
            <div style={{ fontSize: 11, color: "#aaa", marginBottom: 8, fontWeight: 600 }}>ACTIONS</div>
            <button
              onClick={() => sendAction({ type: "pass_stock", playerId })}
              style={{
                width: "100%",
                padding: "8px",
                background: "#333",
                border: "1px solid #555",
                color: "#fff",
                borderRadius: 4,
                cursor: "pointer",
                fontSize: 13,
              }}
            >
              Pass
            </button>
          </div>
        )}
        {isMyTurn && state.round === "operating" && (
          <div style={{ padding: 12, borderTop: "1px solid #333", marginTop: "auto" }}>
            <div style={{ fontSize: 11, color: "#aaa", marginBottom: 8, fontWeight: 600 }}>ACTIONS</div>
            <button
              onClick={() => sendAction({ type: "pass_operate", companyId: state.currentPlayerId })}
              style={{
                width: "100%",
                padding: "8px",
                background: "#333",
                border: "1px solid #555",
                color: "#fff",
                borderRadius: 4,
                cursor: "pointer",
                fontSize: 13,
              }}
            >
              Done Operating
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
