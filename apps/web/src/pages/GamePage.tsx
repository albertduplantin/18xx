import React, { useEffect, useState, useCallback, useMemo } from "react";
import type { HexCoord, OperatingContext, Route } from "@18xx/shared";
import { GAME_1830 } from "@18xx/games";
import { calculateOptimalRoutes, hexKey, hexNeighbor } from "@18xx/engine";
import { HexMap } from "../components/HexMap.js";
import { StockMarket } from "../components/StockMarket.js";
import { CompanyPanel } from "../components/CompanyPanel.js";
import { PlayerPanel } from "../components/PlayerPanel.js";
import { GameLog } from "../components/GameLog.js";
import { AuctionPanel } from "../components/actions/AuctionPanel.js";
import { StockPanel } from "../components/actions/StockPanel.js";
import { OperatingPanel } from "../components/actions/OperatingPanel.js";
import { TilePicker } from "../components/actions/TilePicker.js";
import { useGameStore } from "../store/game-store.js";
import { RulesButton } from "../components/RulesModal.js";

type Tab = "map" | "market" | "log";

export function GamePage({ gameId, playerId }: { gameId: string; playerId: string }) {
  const { state, def, connectWs, sendAction, error, clearError } = useGameStore();
  const [selectedHex, setSelectedHex] = useState<HexCoord | null>(null);
  const [activeTab, setActiveTab] = useState<Tab>("map");
  const [showTilePicker, setShowTilePicker] = useState(false);

  useEffect(() => {
    connectWs(gameId, playerId);
  }, [gameId, playerId, connectWs]);

  const onAction = useCallback((action: object) => {
    sendAction(action as never);
  }, [sendAction]);

  const onHexClick = useCallback((coord: HexCoord) => {
    setSelectedHex((prev) =>
      prev?.q === coord.q && prev?.r === coord.r ? null : coord,
    );
    setActiveTab("map");
  }, []);

  // Compute optimal routes for the current operating company (shown on the map)
  const activeRoutes = useMemo((): readonly Route[] => {
    if (!state || !def) return [];
    const ctx = state.turnContext;
    if (ctx.type !== "operating") return [];
    const companyId = ctx.companyOrder[ctx.companyIdx] ?? "";
    const company = state.companies[companyId];
    if (!company || company.trains.length === 0) return [];
    return calculateOptimalRoutes(state, def, companyId);
  }, [state, def]);

  // Hexes where tile placement is currently valid (adjacent to placed tiles, empty, on-board)
  const validTileHexes = useMemo((): ReadonlySet<string> => {
    if (!state || !def) return new Set();
    const ctx = state.turnContext;
    if (ctx.type !== "operating") return new Set();
    if (ctx.companyActions.includes("tile")) return new Set();

    const placed = new Set(Object.keys(state.map));
    const result = new Set<string>();
    for (const key of placed) {
      const parts = key.split(",");
      const q = Number(parts[0]), r = Number(parts[1]);
      for (let dir = 0; dir < 6; dir++) {
        const n = hexNeighbor({ q, r }, dir as 0);
        const nk = hexKey(n);
        if (placed.has(nk)) continue;
        const hexDef = def.map.find((h) => h.coord.q === n.q && h.coord.r === n.r);
        if (hexDef && !hexDef.offboard) result.add(nk);
      }
    }
    return result;
  }, [state, def]);

  if (!state || !def) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%" }}>
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: 32, marginBottom: 12 }}>⚙</div>
          <p style={{ color: "#aaa" }}>Connecting to game…</p>
        </div>
      </div>
    );
  }

  const ctx = state.turnContext;
  const isMyTurn = state.currentPlayerId === playerId;
  const roundLabel = state.round === "auction"
    ? "Initial Auction"
    : state.round === "stock"
    ? `Stock Round ${state.roundNumber}`
    : `OR ${state.roundNumber}.${(ctx as OperatingContext).orRound}`;

  const currentCompany = ctx.type === "operating"
    ? (ctx as OperatingContext).companyOrder[(ctx as OperatingContext).companyIdx]
    : null;

  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 300px", gridTemplateRows: "44px 1fr", height: "100vh", overflow: "hidden" }}>

      {/* ── Header ── */}
      <div style={{
        gridColumn: "1 / -1",
        background: "#0d0d20",
        borderBottom: "1px solid #2a2a50",
        padding: "0 16px",
        display: "flex",
        alignItems: "center",
        gap: 14,
        fontSize: 13,
      }}>
        <span style={{ fontWeight: "bold", fontSize: 15 }}>18xx</span>
        <span style={{ color: "#555" }}>|</span>
        <span style={{ color: "#aaa" }}>{def.name}</span>
        <span style={{ color: "#555" }}>|</span>
        <span style={{ color: "#78c0f0" }}>{roundLabel}</span>
        {currentCompany && (
          <>
            <span style={{ color: "#555" }}>·</span>
            <span style={{ color: "#aaa" }}>{currentCompany} operating</span>
          </>
        )}
        <span style={{ color: "#555" }}>·</span>
        <span style={{ color: "#aaa" }}>Phase {state.phaseId}</span>
        <span style={{ color: "#555" }}>·</span>
        <span>Bank: <strong style={{ color: "#ffd700" }}>${state.bank.toLocaleString()}</strong></span>
        <RulesButton />

        {isMyTurn && state.round !== "operating" && (
          <span style={{ marginLeft: "auto", background: "#2a5020", color: "#80e060", padding: "2px 10px", borderRadius: 10, fontSize: 12, fontWeight: "bold" }}>
            YOUR TURN
          </span>
        )}
        {state.status === "finished" && (
          <span style={{ marginLeft: "auto", background: "#5a0020", color: "#ff8080", padding: "2px 10px", borderRadius: 10, fontSize: 12, fontWeight: "bold" }}>
            GAME OVER
          </span>
        )}

        {error && (
          <div style={{ marginLeft: "auto", background: "#3a1010", border: "1px solid #c0392b", color: "#e07070", padding: "2px 10px", borderRadius: 4, fontSize: 12, cursor: "pointer" }}
            onClick={clearError}>
            {error} ✕
          </div>
        )}
      </div>

      {/* ── Main area ── */}
      <div style={{ overflow: "hidden", display: "flex", flexDirection: "column", position: "relative" }}>
        <div style={{ display: "flex", background: "#0d0d20", borderBottom: "1px solid #2a2a50", flexShrink: 0 }}>
          {(["map", "market", "log"] as Tab[]).map((tab) => (
            <button key={tab} onClick={() => setActiveTab(tab)}
              style={{
                padding: "7px 18px", background: "transparent", border: "none",
                borderBottom: `2px solid ${activeTab === tab ? "#6060e0" : "transparent"}`,
                color: activeTab === tab ? "#fff" : "#666", cursor: "pointer", fontSize: 12, fontWeight: activeTab === tab ? "bold" : "normal",
              }}>
              {tab === "map" ? "Map" : tab === "market" ? "Stock Market" : "Game Log"}
            </button>
          ))}
          {selectedHex && (
            <span style={{ padding: "7px 12px", fontSize: 11, color: "#78c0f0", alignSelf: "center" }}>
              Selected: ({selectedHex.q},{selectedHex.r})
            </span>
          )}
        </div>

        <div style={{ flex: 1, overflow: "hidden", position: "relative" }}>
          <div style={{ display: activeTab === "map" ? "block" : "none", height: "100%" }}>
            <HexMap
              mapDef={def.map}
              state={state}
              def={def}
              tiles={def.tiles}
              selectedHex={selectedHex}
              onHexClick={onHexClick}
              validTileHexes={validTileHexes}
              activeRoutes={activeRoutes}
            />
          </div>
          {activeTab === "market" && (
            <div style={{ padding: 16, overflowY: "auto", height: "100%" }}>
              <div style={{ fontSize: 11, color: "#aaa", marginBottom: 12, fontWeight: 600, letterSpacing: 1 }}>STOCK MARKET</div>
              <StockMarket state={state} def={def} />
            </div>
          )}
          {activeTab === "log" && (
            <div style={{ height: "100%", overflowY: "auto" }}>
              <GameLog log={state.log} />
            </div>
          )}
        </div>
      </div>

      {/* ── Right sidebar ── */}
      <div style={{ borderLeft: "1px solid #2a2a50", display: "flex", flexDirection: "column", overflow: "hidden" }}>
        <div style={{ flex: 1, overflowY: "auto", padding: 12, borderBottom: "1px solid #2a2a50" }}>
          {ctx.type === "auction" && (
            <AuctionPanel state={state} def={def} myPlayerId={playerId} onAction={onAction} />
          )}
          {ctx.type === "stock" && (
            <StockPanel state={state} def={def} myPlayerId={playerId} onAction={onAction} />
          )}
          {ctx.type === "operating" && (
            <OperatingPanel
              state={state}
              def={def}
              myPlayerId={playerId}
              selectedHex={selectedHex}
              calculatedRoutes={activeRoutes}
              onAction={onAction}
              onRequestTilePicker={() => {
                if (selectedHex) setShowTilePicker(true);
                else setActiveTab("map");
              }}
            />
          )}
        </div>

        <div style={{ padding: 10, borderBottom: "1px solid #2a2a50", flexShrink: 0 }}>
          <div style={{ fontSize: 10, color: "#555", fontWeight: 600, letterSpacing: 1, marginBottom: 6 }}>PLAYERS</div>
          <PlayerPanel state={state} def={def} myPlayerId={playerId} />
        </div>

        <div style={{ padding: 10, overflowY: "auto", maxHeight: 220 }}>
          <div style={{ fontSize: 10, color: "#555", fontWeight: 600, letterSpacing: 1, marginBottom: 6 }}>COMPANIES</div>
          <CompanyPanel state={state} def={def} />
        </div>
      </div>

      {/* ── Tile picker modal ── */}
      {showTilePicker && selectedHex && (() => {
        const opCtx = ctx as OperatingContext;
        const companyId = opCtx.companyOrder[opCtx.companyIdx] ?? "";
        const allowedColors = def.phases.find((p) => p.id === state.phaseId)?.tiles ?? ["yellow"];
        return (
          <TilePicker
            tiles={def.tiles}
            state={state}
            allowedColors={allowedColors}
            coord={selectedHex}
            companyId={companyId}
            onPlace={(tileId, rotation) => {
              onAction({ type: "lay_tile", companyId, coord: selectedHex, tileId, rotation });
              setShowTilePicker(false);
            }}
            onClose={() => setShowTilePicker(false)}
          />
        );
      })()}
    </div>
  );
}
