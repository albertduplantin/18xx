import React, { useState } from "react";
import type { GameState, GameDef, StockContext } from "@18xx/shared";
import { priceAt } from "@18xx/engine";
import { TurnGuide } from "../TurnGuide.js";

type Props = {
  state: GameState;
  def: GameDef;
  myPlayerId: string;
  onAction: (action: object) => void;
};

const PAR_VALUES = [100, 90, 82, 76, 71, 67] as const;

export function StockPanel({ state, def, myPlayerId, onAction }: Props) {
  const ctx = state.turnContext as StockContext;
  const isMyTurn = state.currentPlayerId === myPlayerId;
  const [selectedCompany, setSelectedCompany] = useState<string | null>(null);
  const [parValue, setParValue] = useState<number>(100);
  const [sellCompany, setSellCompany] = useState<string | null>(null);
  const [sellCount, setSellCount] = useState(1);

  const myPlayer = state.players.find((p) => p.id === myPlayerId)!;
  const alreadyBought = ctx.boughtThisTurn.includes(myPlayerId);

  const myShares = (companyId: string) =>
    myPlayer.shares.filter((s) => s.companyId === companyId);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <TurnGuide state={state} def={def} myPlayerId={myPlayerId} />
      <div style={{ fontSize: 11, color: "#aaa", fontWeight: 600, letterSpacing: 1 }}>STOCK ROUND</div>

      {/* SELL section */}
      <section>
        <div style={{ fontSize: 12, color: "#e07070", marginBottom: 6, fontWeight: 600 }}>SELL SHARES</div>
        {def.companies.map((c) => {
          const owned = myShares(c.id);
          if (owned.length === 0) return null;
          const pos = state.stockMarket[c.id];
          const price = pos ? priceAt(def, pos) : 0;
          return (
            <div key={c.id} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
              <div style={{ width: 40, height: 22, background: c.color, borderRadius: 3, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: "bold", color: c.textColor ?? "#fff" }}>
                {c.shortName}
              </div>
              <span style={{ flex: 1, fontSize: 12 }}>{owned.length} × 10% @ ${price}</span>
              {sellCompany === c.id ? (
                <div style={{ display: "flex", gap: 4 }}>
                  <input type="number" min={1} max={owned.length} value={sellCount}
                    onChange={(e) => setSellCount(Number(e.target.value))}
                    style={{ width: 40, padding: "2px 4px", background: "#12122a", border: "1px solid #555", color: "#fff", borderRadius: 3, fontSize: 12 }} />
                  <button onClick={() => { onAction({ type: "sell_shares", playerId: myPlayerId, companyId: c.id, count: sellCount }); setSellCompany(null); }}
                    style={{ padding: "2px 8px", background: "#c0392b", border: "none", borderRadius: 3, color: "#fff", cursor: "pointer", fontSize: 12 }}>
                    Sell
                  </button>
                  <button onClick={() => setSellCompany(null)} style={{ padding: "2px 8px", background: "#333", border: "none", borderRadius: 3, color: "#aaa", cursor: "pointer", fontSize: 12 }}>✕</button>
                </div>
              ) : (
                <button onClick={() => { setSellCompany(c.id); setSellCount(1); }} disabled={!isMyTurn}
                  style={{ padding: "2px 10px", background: "#3a1010", border: "1px solid #c0392b", borderRadius: 3, color: "#e07070", cursor: isMyTurn ? "pointer" : "not-allowed", fontSize: 12 }}>
                  Sell
                </button>
              )}
            </div>
          );
        })}
        {myPlayer.shares.length === 0 && <div style={{ fontSize: 12, color: "#555" }}>No shares to sell</div>}
      </section>

      <hr style={{ border: "none", borderTop: "1px solid #333" }} />

      {/* BUY section */}
      <section>
        <div style={{ fontSize: 12, color: "#70e070", marginBottom: 6, fontWeight: 600 }}>
          BUY SHARES {alreadyBought && <span style={{ color: "#666", fontWeight: "normal" }}>(done for this turn)</span>}
        </div>
        {def.companies.map((c) => {
          const compState = state.companies[c.id];
          if (!compState) return null;
          const pos = state.stockMarket[c.id];
          const price = pos ? priceAt(def, pos) : 0;
          const isUnstarted = compState.status === "unstarted";

          // Count available shares
          const soldPercent = state.players.flatMap((p) => p.shares).filter((s) => s.companyId === c.id).reduce((s, sh) => s + sh.percent, 0);
          const poolShares = state.bankPool.filter((s) => s.companyId === c.id).length;
          const ipoAvailable = isUnstarted ? 1 : Math.max(0, Math.floor((100 - soldPercent) / 10));
          const canBuy = isMyTurn && !alreadyBought && myPlayer.cash >= (isUnstarted ? parValue : price);

          return (
            <div key={c.id} style={{ marginBottom: 8 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <div style={{ width: 40, height: 22, background: c.color, borderRadius: 3, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: "bold", color: c.textColor ?? "#fff" }}>
                  {c.shortName}
                </div>
                <span style={{ fontSize: 12, flex: 1 }}>
                  {isUnstarted ? "Not started" : `$${price}`}
                  {compState.status === "floated" && <span style={{ color: "#4caf50", marginLeft: 6, fontSize: 11 }}>●floated</span>}
                </span>
                {ipoAvailable > 0 && (
                  <button
                    onClick={() => {
                      if (isUnstarted) {
                        // Show par picker to start a new company
                        setSelectedCompany(selectedCompany === c.id ? null : c.id);
                      } else {
                        // Company already started — buy a 10% share directly at current price
                        onAction({ type: "buy_share", playerId: myPlayerId, companyId: c.id, from: "ipo" });
                      }
                    }}
                    disabled={!canBuy}
                    style={{ padding: "2px 10px", background: selectedCompany === c.id ? "#4040c0" : "#1a2a40", border: "1px solid #4040c0", borderRadius: 3, color: canBuy ? "#78c0f0" : "#555", cursor: canBuy ? "pointer" : "not-allowed", fontSize: 12 }}>
                    {isUnstarted ? `IPO (démarrer)` : `IPO (${ipoAvailable}) $${price}`}
                  </button>
                )}
                {poolShares > 0 && (
                  <button
                    onClick={() => onAction({ type: "buy_share", playerId: myPlayerId, companyId: c.id, from: "bank_pool" })}
                    disabled={!canBuy || myPlayer.cash < price}
                    style={{ padding: "2px 10px", background: "#1a3a20", border: "1px solid #40a040", borderRadius: 3, color: canBuy ? "#70e070" : "#555", cursor: canBuy ? "pointer" : "not-allowed", fontSize: 12 }}>
                    Pool ({poolShares}) @ ${price}
                  </button>
                )}
              </div>

              {/* Par value picker for new company */}
              {selectedCompany === c.id && isUnstarted && (
                <div style={{ marginTop: 8, padding: 10, background: "#12122a", borderRadius: 6, border: "1px solid #4040c0" }}>
                  <div style={{ fontSize: 11, color: "#aaa", marginBottom: 6 }}>CHOOSE PAR VALUE (20% president cert)</div>
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 8 }}>
                    {PAR_VALUES.map((v) => (
                      <button key={v} onClick={() => setParValue(v)}
                        style={{ padding: "4px 10px", background: parValue === v ? "#4040c0" : "#333", border: "none", borderRadius: 4, color: "#fff", cursor: "pointer", fontSize: 13, fontWeight: parValue === v ? "bold" : "normal" }}>
                        ${v}
                      </button>
                    ))}
                  </div>
                  <div style={{ fontSize: 12, color: "#aaa", marginBottom: 8 }}>
                    Cost: <strong style={{ color: "#ffd700" }}>${parValue * 2}</strong> (20% cert)
                    &nbsp;·&nbsp;Floats at ${parValue * 6} raised
                  </div>
                  <button
                    onClick={() => { onAction({ type: "buy_share", playerId: myPlayerId, companyId: c.id, from: "ipo", parValue }); setSelectedCompany(null); }}
                    disabled={myPlayer.cash < parValue * 2}
                    style={{ padding: "6px 16px", background: myPlayer.cash >= parValue * 2 ? "#4040c0" : "#333", border: "none", borderRadius: 6, color: "#fff", cursor: myPlayer.cash >= parValue * 2 ? "pointer" : "not-allowed", fontWeight: "bold", fontSize: 13 }}>
                    Start {c.shortName} at ${parValue}
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </section>

      <hr style={{ border: "none", borderTop: "1px solid #333" }} />

      {isMyTurn && (
        <button
          onClick={() => onAction({ type: "pass_stock", playerId: myPlayerId })}
          style={{ padding: "10px", background: "#2a2040", border: "1px solid #555", borderRadius: 6, color: "#aaa", cursor: "pointer", fontSize: 13, fontWeight: "bold" }}>
          Pass
        </button>
      )}

      <div style={{ fontSize: 11, color: "#555", textAlign: "center" }}>
        {ctx.consecutivePasses} consecutive pass{ctx.consecutivePasses !== 1 ? "es" : ""} / {state.players.length} needed to end SR
      </div>
    </div>
  );
}
