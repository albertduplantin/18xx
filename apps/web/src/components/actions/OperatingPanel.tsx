import React, { useState } from "react";
import type { GameState, GameDef, OperatingContext, HexCoord } from "@18xx/shared";
import { priceAt } from "@18xx/engine";

type Props = {
  state: GameState;
  def: GameDef;
  myPlayerId: string;
  selectedHex: HexCoord | null;
  onAction: (action: object) => void;
  onRequestTilePicker: () => void;
};

export function OperatingPanel({ state, def, myPlayerId, selectedHex, onAction, onRequestTilePicker }: Props) {
  const ctx = state.turnContext as OperatingContext;
  const companyId = ctx.companyOrder[ctx.companyIdx] ?? "";
  const companyDef = def.companies.find((c) => c.id === companyId);
  const companyState = state.companies[companyId];
  const isPresident = state.players.find((p) => p.id === myPlayerId)?.shares.some((s) => s.companyId === companyId && s.president);

  const [revenue, setRevenue] = useState(0);
  const [dividend, setDividend] = useState<"pay" | "withhold" | "half">("pay");

  if (!companyDef || !companyState) return null;

  const canTile = !ctx.companyActions.includes("tile");
  const canToken = !ctx.companyActions.includes("token");
  const canRoutes = !ctx.companyActions.includes("routes");
  const hasTrains = companyState.trains.length > 0;

  const pos = state.stockMarket[companyId];
  const price = pos ? priceAt(def, pos) : 0;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {/* Company header */}
      <div style={{ background: companyDef.color, borderRadius: 6, padding: "8px 12px", display: "flex", alignItems: "center", gap: 10 }}>
        <div style={{ fontWeight: "bold", fontSize: 15, color: companyDef.textColor ?? "#fff" }}>{companyDef.shortName}</div>
        <div style={{ fontSize: 12, color: companyDef.textColor ?? "#fff", opacity: 0.9 }}>{companyDef.name}</div>
        <div style={{ marginLeft: "auto", fontSize: 12, color: companyDef.textColor ?? "#fff" }}>
          ${companyState.cash} · ${price}/share
        </div>
      </div>

      <div style={{ fontSize: 11, color: "#aaa", fontWeight: 600, letterSpacing: 1 }}>
        OPERATING ROUND {state.roundNumber}.{ctx.orRound}
        &nbsp;·&nbsp;Company {ctx.companyIdx + 1}/{ctx.companyOrder.length}
      </div>

      {companyState.trains.length > 0 && (
        <div style={{ fontSize: 12, color: "#aaa" }}>
          Trains: <strong style={{ color: "#fff" }}>{companyState.trains.join(", ")}</strong>
        </div>
      )}

      {!isPresident && (
        <div style={{ background: "#2a1010", border: "1px solid #c0392b", borderRadius: 6, padding: "8px 12px", fontSize: 12, color: "#e07070" }}>
          You are not the president of {companyDef.shortName}. Watching the president operate.
        </div>
      )}

      {isPresident && (
        <>
          {/* 1. Lay tile */}
          <ActionSection
            title="1. LAY TRACK TILE"
            done={!canTile}
            optional
          >
            <button
              onClick={onRequestTilePicker}
              disabled={!canTile}
              style={btnStyle(!canTile, "#1a3a50")}
            >
              {selectedHex
                ? `Place tile at (${selectedHex.q},${selectedHex.r})`
                : "Click a hex on the map, then choose a tile"}
            </button>
          </ActionSection>

          {/* 2. Place token */}
          <ActionSection title="2. PLACE STATION TOKEN" done={!canToken} optional>
            {selectedHex && canToken ? (
              <button
                onClick={() => onAction({ type: "place_token", companyId, coord: selectedHex, cityIndex: 0 })}
                style={btnStyle(false, "#1a3a20")}
              >
                Place token at ({selectedHex.q},{selectedHex.r})
              </button>
            ) : (
              <div style={{ fontSize: 12, color: "#555" }}>Click a city on the map to place a token</div>
            )}
          </ActionSection>

          {/* 3. Buy trains */}
          <ActionSection title="3. BUY TRAINS" done={false} optional>
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              {def.trains.map((t) => {
                const available = state.trainBank[t.id] ?? 0;
                const canBuy = available > 0 && companyState.cash >= t.price;
                return (
                  <div key={t.id} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ fontSize: 13, flex: 1 }}>
                      <strong>{t.name}-train</strong>
                      <span style={{ color: "#aaa", fontSize: 11, marginLeft: 6 }}>
                        ${t.price} · {available} left · runs {typeof t.distance === "number" ? t.distance : "?"} stops
                      </span>
                    </span>
                    <button
                      onClick={() => onAction({ type: "buy_train", companyId, trainTypeId: t.id, from: "bank" })}
                      disabled={!canBuy}
                      style={btnStyle(!canBuy, "#1a3a20")}
                    >
                      Buy ${t.price}
                    </button>
                  </div>
                );
              })}
            </div>
          </ActionSection>

          {/* 4. Run routes */}
          {hasTrains && canRoutes && (
            <ActionSection title="4. RUN ROUTES & PAY DIVIDENDS" done={!canRoutes}>
              <div style={{ marginBottom: 8 }}>
                <label style={{ fontSize: 12, color: "#aaa", display: "block", marginBottom: 4 }}>
                  Total revenue ($)
                </label>
                <input
                  type="number"
                  min={0}
                  step={10}
                  value={revenue}
                  onChange={(e) => setRevenue(Number(e.target.value))}
                  style={{ width: "100%", padding: "6px 10px", background: "#12122a", border: "1px solid #555", borderRadius: 6, color: "#fff", fontSize: 14 }}
                />
              </div>
              <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
                {(["pay", "withhold", "half"] as const).map((d) => (
                  <button key={d} onClick={() => setDividend(d)}
                    style={{ flex: 1, padding: "6px", background: dividend === d ? "#3a3080" : "#222", border: `1px solid ${dividend === d ? "#6060e0" : "#444"}`, borderRadius: 4, color: "#fff", cursor: "pointer", fontSize: 12, fontWeight: dividend === d ? "bold" : "normal" }}>
                    {d === "pay" ? "Pay Full" : d === "withhold" ? "Withhold" : "Half Div."}
                  </button>
                ))}
              </div>
              <button
                onClick={() => onAction({ type: "run_routes", companyId, routes: [{ trainTypeId: companyState.trains[0] ?? "", hexes: [], revenue }], dividend })}
                style={btnStyle(revenue === 0 && dividend !== "withhold", "#3a3080")}
              >
                Declare ${revenue} — {dividend}
              </button>
            </ActionSection>
          )}

          {!hasTrains && (
            <div style={{ background: "#3a2010", border: "1px solid #e07030", borderRadius: 6, padding: "8px 12px", fontSize: 12, color: "#f0a060" }}>
              ⚠ No trains — must buy at least one train before operating routes
            </div>
          )}

          {/* Done */}
          <button
            onClick={() => onAction({ type: "pass_operate", companyId })}
            style={{ marginTop: 4, padding: "10px", background: "#2a2040", border: "1px solid #6060e0", borderRadius: 6, color: "#fff", cursor: "pointer", fontSize: 13, fontWeight: "bold" }}
          >
            Done Operating {companyDef.shortName}
          </button>
        </>
      )}
    </div>
  );
}

function ActionSection({ title, done, optional = false, children }: {
  title: string;
  done: boolean;
  optional?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div style={{ background: "#12122a", border: `1px solid ${done ? "#1a4a1a" : "#333"}`, borderRadius: 6, padding: 10 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8 }}>
        <span style={{ fontSize: 11, fontWeight: 600, color: done ? "#4caf50" : "#aaa", letterSpacing: 0.5 }}>{title}</span>
        {done && <span style={{ fontSize: 11, color: "#4caf50" }}>✓ done</span>}
        {optional && !done && <span style={{ fontSize: 10, color: "#666" }}>optional</span>}
      </div>
      {!done && children}
    </div>
  );
}

function btnStyle(disabled: boolean, activeColor: string): React.CSSProperties {
  return {
    width: "100%",
    padding: "7px 12px",
    background: disabled ? "#1a1a2e" : activeColor,
    border: `1px solid ${disabled ? "#333" : "#5580aa"}`,
    borderRadius: 5,
    color: disabled ? "#444" : "#fff",
    cursor: disabled ? "not-allowed" : "pointer",
    fontSize: 12,
    textAlign: "left",
  };
}
