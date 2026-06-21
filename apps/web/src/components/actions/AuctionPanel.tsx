import React, { useState, useEffect } from "react";
import type { GameState, GameDef, AuctionContext } from "@18xx/shared";
import { TurnGuide } from "../TurnGuide.js";
import { Advisor } from "../Advisor.js";

type Props = {
  state: GameState;
  def: GameDef;
  myPlayerId: string;
  onAction: (action: object) => void;
};

export function AuctionPanel({ state, def, myPlayerId, onAction }: Props) {
  const ctx = state.turnContext as AuctionContext;
  const isMyTurn = state.currentPlayerId === myPlayerId;
  const currentPriv = def.privates[ctx.privateIdx];
  const [bidAmount, setBidAmount] = useState<number>(ctx.currentPrice);

  // Reset bid amount whenever the current private or its price changes
  useEffect(() => {
    setBidAmount(ctx.currentPrice);
  }, [ctx.privateIdx, ctx.currentPrice]);

  if (!currentPriv) return null;

  const myPlayer = state.players.find((p) => p.id === myPlayerId)!;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <Advisor state={state} def={def} myPlayerId={myPlayerId} />
      <TurnGuide state={state} def={def} myPlayerId={myPlayerId} />

      <div style={{ background: "#12122a", border: "1px solid #555", borderRadius: 8, padding: 12 }}>
        <div style={{ fontSize: 11, color: "#aaa", marginBottom: 6, fontWeight: 600, letterSpacing: 1 }}>
          PRIVATE COMPANY AUCTION
        </div>
        <div style={{ fontWeight: "bold", fontSize: 16, marginBottom: 4 }}>{currentPriv.name}</div>
        <div style={{ fontSize: 12, color: "#aaa", marginBottom: 8 }}>{currentPriv.description}</div>

        <div style={{ display: "flex", gap: 16, fontSize: 13, marginBottom: 8 }}>
          <span>Face value: <strong style={{ color: "#ffd700" }}>${currentPriv.value}</strong></span>
          <span>Revenue: <strong style={{ color: "#4caf50" }}>${currentPriv.revenue}</strong></span>
          <span>Current price: <strong style={{ color: "#fff" }}>${ctx.currentPrice}</strong></span>
        </div>

        <div style={{ fontSize: 12, color: "#aaa" }}>
          Waiting for: <strong style={{ color: "#fff" }}>
            {state.players.find((p) => p.id === ctx.order[ctx.playerIdx])?.name ?? "?"}
          </strong>
        </div>
      </div>

      {/* Privates already sold */}
      {def.privates.slice(0, ctx.privateIdx).map((priv) => {
        const ownership = state.privateCompanies[priv.id];
        const owner = state.players.find((p) => p.id === ownership?.ownerId);
        return (
          <div key={priv.id} style={{ fontSize: 12, color: "#666", padding: "4px 8px", background: "#12122a", borderRadius: 4 }}>
            {priv.name} → <span style={{ color: "#aaa" }}>{owner?.name ?? "?"}</span>
          </div>
        );
      })}

      {/* Actions */}
      {isMyTurn && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <input
              type="number"
              min={ctx.currentPrice}
              step={5}
              value={bidAmount}
              onChange={(e) => setBidAmount(Number(e.target.value))}
              style={{
                flex: 1,
                padding: "8px 10px",
                background: "#12122a",
                border: "1px solid #555",
                borderRadius: 6,
                color: "#fff",
                fontSize: 14,
              }}
            />
            <button
              onClick={() => onAction({ type: "bid", playerId: myPlayerId, privateId: currentPriv.id, amount: bidAmount })}
              disabled={bidAmount < ctx.currentPrice || myPlayer.cash < bidAmount}
              style={{
                padding: "8px 16px",
                background: bidAmount < ctx.currentPrice || myPlayer.cash < bidAmount ? "#333" : "#4040c0",
                border: "none",
                borderRadius: 6,
                color: "#fff",
                cursor: bidAmount < ctx.currentPrice || myPlayer.cash < bidAmount ? "not-allowed" : "pointer",
                fontWeight: "bold",
                fontSize: 13,
              }}
            >
              Buy for ${bidAmount}
            </button>
          </div>
          <button
            onClick={() => onAction({ type: "pass_bid", playerId: myPlayerId })}
            style={{
              padding: "8px",
              background: "#2a2040",
              border: "1px solid #555",
              borderRadius: 6,
              color: "#aaa",
              cursor: "pointer",
              fontSize: 13,
            }}
          >
            Pass
          </button>
        </div>
      )}
    </div>
  );
}
