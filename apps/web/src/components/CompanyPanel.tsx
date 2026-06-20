import React from "react";
import type { GameState, GameDef, CompanyState } from "@18xx/shared";
import { priceAt } from "@18xx/engine";

type Props = {
  state: GameState;
  def: GameDef;
};

export function CompanyPanel({ state, def }: Props) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      {def.companies.map((companyDef) => {
        const companyState = state.companies[companyDef.id];
        if (!companyState || companyState.status === "unstarted") return null;

        const stockPos = state.stockMarket[companyDef.id];
        const price = stockPos ? priceAt(def, stockPos) : 0;
        const lastRevenue = companyState.revenue[companyState.revenue.length - 1];

        return (
          <div
            key={companyDef.id}
            style={{
              background: "#1e2040",
              border: `2px solid ${companyDef.color}`,
              borderRadius: 6,
              padding: "8px 10px",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
              <div
                style={{
                  width: 32,
                  height: 20,
                  background: companyDef.color,
                  borderRadius: 3,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 10,
                  fontWeight: "bold",
                  color: companyDef.textColor ?? "#fff",
                }}
              >
                {companyDef.shortName}
              </div>
              <span style={{ fontWeight: 600, fontSize: 13 }}>{companyDef.name}</span>
              <span
                style={{
                  marginLeft: "auto",
                  fontSize: 12,
                  color: companyState.status === "floated" ? "#4caf50" : "#ff9800",
                }}
              >
                {companyState.status}
              </span>
            </div>

            <div style={{ display: "flex", gap: 16, fontSize: 12, color: "#aaa" }}>
              <span>Treasury: <strong style={{ color: "#fff" }}>${companyState.cash}</strong></span>
              <span>Stock: <strong style={{ color: "#fff" }}>${price}</strong></span>
              <span>Trains: <strong style={{ color: "#fff" }}>{companyState.trains.join(", ") || "—"}</strong></span>
              {lastRevenue !== undefined && (
                <span>Last rev: <strong style={{ color: "#4caf50" }}>${lastRevenue}</strong></span>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
