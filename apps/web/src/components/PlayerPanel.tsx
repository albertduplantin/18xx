import React from "react";
import type { GameState, GameDef } from "@18xx/shared";

type Props = {
  state: GameState;
  def: GameDef;
  myPlayerId: string;
};

export function PlayerPanel({ state, def, myPlayerId }: Props) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      {state.players.map((player) => {
        const isMe = player.id === myPlayerId;
        const isCurrent = player.id === state.currentPlayerId;

        const portfolioValue = player.shares.reduce((sum, share) => {
          const pos = state.stockMarket[share.companyId];
          if (!pos) return sum;
          const price = def.stockMarket.market[pos.row]?.[pos.col]?.price ?? 0;
          return sum + price;
        }, player.cash);

        return (
          <div
            key={player.id}
            style={{
              background: isMe ? "#2a2060" : "#1e2040",
              border: `2px solid ${isCurrent ? "#f0e020" : "#333"}`,
              borderRadius: 6,
              padding: "8px 10px",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
              {isCurrent && <span style={{ fontSize: 14 }}>▶</span>}
              <strong style={{ fontSize: 13 }}>{player.name}</strong>
              {isMe && <span style={{ fontSize: 11, color: "#aaa" }}>(you)</span>}
              <span style={{ marginLeft: "auto", fontWeight: "bold", color: "#ffd700" }}>
                ${player.cash}
              </span>
            </div>

            <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
              {player.shares.map((share, i) => {
                const company = def.companies.find((c) => c.id === share.companyId);
                return (
                  <div
                    key={i}
                    style={{
                      background: company?.color ?? "#888",
                      color: company?.textColor ?? "#fff",
                      padding: "1px 6px",
                      borderRadius: 3,
                      fontSize: 11,
                      fontWeight: 600,
                    }}
                  >
                    {share.president ? "★" : ""}{company?.shortName ?? share.companyId} {share.percent}%
                  </div>
                );
              })}
            </div>

            <div style={{ fontSize: 11, color: "#aaa", marginTop: 4 }}>
              Net worth: <strong style={{ color: "#fff" }}>${portfolioValue}</strong>
              &nbsp;·&nbsp;{player.shares.length} certs
            </div>
          </div>
        );
      })}
    </div>
  );
}
