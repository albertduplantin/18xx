import React from "react";
import type { GameState, GameDef, AuctionContext, StockContext, OperatingContext } from "@18xx/shared";
import { priceAt } from "@18xx/engine";

type Props = {
  state: GameState;
  def: GameDef;
};

function phaseLabel(state: GameState): string {
  const ctx = state.turnContext;
  if (state.round === "auction") return "Enchères initiales";
  if (state.round === "stock") return `Bourse — manche ${state.roundNumber}`;
  if (state.round === "operating") {
    const opCtx = ctx as OperatingContext;
    return `Exploitation ${state.roundNumber}.${opCtx.orRound ?? 1}`;
  }
  return "";
}

function currentActionDesc(state: GameState, def: GameDef): string {
  const ctx = state.turnContext;
  const player = state.players.find((p) => p.id === state.currentPlayerId);
  const who = player?.name ?? state.currentPlayerId;

  if (ctx.type === "auction") {
    const aCtx = ctx as AuctionContext;
    const priv = def.privates[aCtx.privateIdx];
    return `${who} doit enchérir sur ${priv?.name ?? "—"} ($${aCtx.currentPrice})`;
  }
  if (ctx.type === "stock") {
    return `${who} choisit une action boursière`;
  }
  if (ctx.type === "operating") {
    const opCtx = ctx as OperatingContext;
    const companyId = opCtx.companyOrder[opCtx.companyIdx] ?? "";
    const company = def.companies.find((c) => c.id === companyId);
    const done = new Set(opCtx.companyActions as readonly string[]);
    const remaining = ["tile", "trains", "routes"].filter((a) => !done.has(a));
    return `${company?.name ?? companyId} : ${remaining.join(" → ") || "fin de tour"}`;
  }
  return "";
}

export function ObserverPanel({ state, def }: Props) {
  const recentLog = [...state.log].slice(-10).reverse();

  const LOG_COLOR: Record<string, string> = {
    action: "#d0d0d0",
    system: "#78c2f0",
    phase: "#f0a020",
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10, padding: "10px 0" }}>

      {/* Current actor */}
      <div style={{ background: "#0d0d20", border: "1px solid #4a20a0", borderRadius: 8, padding: "10px 12px" }}>
        <div style={{ fontSize: 10, color: "#7040c0", fontWeight: 700, letterSpacing: 1, marginBottom: 6 }}>
          👁 EN DIRECT — {phaseLabel(state).toUpperCase()}
        </div>
        <div style={{ fontSize: 12, color: "#c0a0f0", lineHeight: 1.5 }}>
          {currentActionDesc(state, def)}
        </div>
      </div>

      {/* Recent log */}
      <div>
        <div style={{ fontSize: 10, color: "#555", fontWeight: 700, letterSpacing: 1, marginBottom: 6 }}>
          DERNIÈRES ACTIONS
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
          {recentLog.map((entry, i) => (
            <div key={i} style={{
              fontSize: 11, fontFamily: "monospace", lineHeight: 1.4,
              color: i === 0 ? (LOG_COLOR[entry.type] ?? "#aaa") : "#555",
              opacity: 1 - i * 0.07,
            }}>
              {entry.message}
            </div>
          ))}
        </div>
      </div>

      {/* Companies — full detail */}
      <div>
        <div style={{ fontSize: 10, color: "#555", fontWeight: 700, letterSpacing: 1, marginBottom: 6 }}>
          COMPAGNIES
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {def.companies.map((companyDef) => {
            const cs = state.companies[companyDef.id];
            if (!cs || cs.status === "unstarted") {
              return (
                <div key={companyDef.id} style={{ display: "flex", alignItems: "center", gap: 8, opacity: 0.3 }}>
                  <div style={{ width: 28, height: 16, background: companyDef.color, borderRadius: 2,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: 9, fontWeight: 700, color: companyDef.textColor ?? "#fff" }}>
                    {companyDef.shortName}
                  </div>
                  <span style={{ fontSize: 11, color: "#555" }}>{companyDef.name} — non démarrée</span>
                </div>
              );
            }

            const stockPos = state.stockMarket[companyDef.id];
            const price = stockPos ? priceAt(def, stockPos) : 0;
            const lastRev = cs.revenue[cs.revenue.length - 1];
            const president = state.players.find((p) =>
              p.shares.some((s) => s.companyId === companyDef.id && s.president)
            );
            const ctx = state.turnContext;
            const isOperating = ctx.type === "operating" &&
              (ctx as OperatingContext).companyOrder[(ctx as OperatingContext).companyIdx] === companyDef.id;

            return (
              <div key={companyDef.id} style={{
                background: "#1a1a30", border: `2px solid ${isOperating ? "#f0e020" : companyDef.color}`,
                borderRadius: 6, padding: "8px 10px",
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                  <div style={{ width: 32, height: 18, background: companyDef.color, borderRadius: 2,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: 10, fontWeight: 700, color: companyDef.textColor ?? "#fff" }}>
                    {companyDef.shortName}
                  </div>
                  <span style={{ fontWeight: 600, fontSize: 12 }}>{companyDef.name}</span>
                  {isOperating && <span style={{ fontSize: 10, color: "#f0e020" }}>▶ EN JEUX</span>}
                  <span style={{ marginLeft: "auto", fontSize: 11,
                    color: cs.status === "floated" ? "#4caf50" : "#ff9800" }}>
                    {cs.status === "floated" ? "flottée" : "en cours"}
                  </span>
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "3px 12px", fontSize: 11, color: "#888" }}>
                  <span>Trésorerie: <strong style={{ color: "#ffd700" }}>${cs.cash}</strong></span>
                  <span>Cours: <strong style={{ color: "#78c2f0" }}>${price}</strong></span>
                  <span>Trains: <strong style={{ color: "#fff" }}>{cs.trains.length > 0 ? cs.trains.join(", ") : "—"}</strong></span>
                  {lastRev !== undefined && (
                    <span>Dernier rev: <strong style={{ color: "#4caf50" }}>${lastRev}</strong></span>
                  )}
                </div>

                {president && (
                  <div style={{ fontSize: 10, color: "#666", marginTop: 4 }}>
                    Président: <span style={{ color: "#aaa" }}>{president.name}</span>
                  </div>
                )}

                {/* Revenue history sparkline */}
                {cs.revenue.length > 1 && (
                  <div style={{ display: "flex", gap: 2, marginTop: 6, alignItems: "flex-end", height: 20 }}>
                    {cs.revenue.slice(-8).map((rev, i) => {
                      const max = Math.max(...cs.revenue.slice(-8), 1);
                      return (
                        <div key={i} style={{
                          flex: 1, background: rev > 0 ? "#2a6040" : "#402020",
                          height: `${Math.max(3, (rev / max) * 20)}px`,
                          borderRadius: 1,
                        }} title={`$${rev}`} />
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Players — full detail */}
      <div>
        <div style={{ fontSize: 10, color: "#555", fontWeight: 700, letterSpacing: 1, marginBottom: 6 }}>
          JOUEURS
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {state.players.map((player) => {
            const isCurrent = player.id === state.currentPlayerId;
            const portfolioValue = player.shares.reduce((sum, share) => {
              const pos = state.stockMarket[share.companyId];
              if (!pos) return sum;
              return sum + priceAt(def, pos);
            }, player.cash);

            // Group shares by company
            const byCompany = player.shares.reduce<Record<string, { pct: number; president: boolean }>>((acc, s) => {
              if (!acc[s.companyId]) acc[s.companyId] = { pct: 0, president: false };
              acc[s.companyId]!.pct += s.percent;
              if (s.president) acc[s.companyId]!.president = true;
              return acc;
            }, {});

            return (
              <div key={player.id} style={{
                background: "#1a1a30",
                border: `2px solid ${isCurrent ? "#f0e020" : "#2a2a50"}`,
                borderRadius: 6, padding: "8px 10px",
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
                  {isCurrent && <span style={{ color: "#f0e020", fontSize: 12 }}>▶</span>}
                  <strong style={{ fontSize: 13 }}>{player.name}</strong>
                  <span style={{ marginLeft: "auto", color: "#ffd700", fontWeight: 700 }}>${player.cash}</span>
                </div>

                <div style={{ display: "flex", flexWrap: "wrap", gap: 3, marginBottom: 4 }}>
                  {Object.entries(byCompany).map(([cId, info]) => {
                    const cDef = def.companies.find((c) => c.id === cId);
                    return (
                      <div key={cId} style={{
                        background: cDef?.color ?? "#555",
                        color: cDef?.textColor ?? "#fff",
                        padding: "1px 7px", borderRadius: 3, fontSize: 11, fontWeight: 600,
                      }}>
                        {info.president ? "★ " : ""}{cDef?.shortName ?? cId} {info.pct}%
                      </div>
                    );
                  })}
                  {player.privates.map((privId) => {
                    const priv = def.privates.find((p) => p.id === privId);
                    return (
                      <div key={privId} style={{
                        background: "#2a2a20", border: "1px solid #555",
                        color: "#cc0", padding: "1px 6px", borderRadius: 3, fontSize: 10,
                      }}>
                        {priv?.name ?? privId} (${priv?.revenue ?? 0}/OR)
                      </div>
                    );
                  })}
                </div>

                <div style={{ fontSize: 11, color: "#666" }}>
                  Valeur nette: <strong style={{ color: "#c0d0ff" }}>${portfolioValue}</strong>
                  &nbsp;·&nbsp;{player.shares.length} certificats
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
