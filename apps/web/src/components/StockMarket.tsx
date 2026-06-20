import React from "react";
import type { GameState, GameDef } from "@18xx/shared";

type Props = {
  state: GameState;
  def: GameDef;
};

const CELL_W = 52;
const CELL_H = 38;

export function StockMarket({ state, def }: Props) {
  const market = def.stockMarket.market;

  const companyAtPos = new Map<string, string[]>();
  for (const [companyId, pos] of Object.entries(state.stockMarket)) {
    const key = `${pos.row},${pos.col}`;
    if (!companyAtPos.has(key)) companyAtPos.set(key, []);
    companyAtPos.get(key)!.push(companyId);
  }

  const companyColors: Record<string, string> = {};
  for (const c of def.companies) companyColors[c.id] = c.color;

  const rowColors = ["#f5d442", "#3a9e4e", "#8b5e3c", "#e67e22"];

  return (
    <div style={{ overflowX: "auto" }}>
      <svg
        width={market[0]!.length * CELL_W + 4}
        height={market.length * CELL_H + 4}
        style={{ display: "block" }}
      >
        {market.map((row, ri) =>
          row.map((cell, ci) => {
            const cellKey = `${ri},${ci}`;
            const tokens = companyAtPos.get(cellKey) ?? [];
            const isPar = cell.type === "par";
            const isBankrupt = cell.type === "bankrupt";

            return (
              <g key={cellKey} transform={`translate(${ci * CELL_W + 2}, ${ri * CELL_H + 2})`}>
                <rect
                  width={CELL_W - 2}
                  height={CELL_H - 2}
                  fill={isBankrupt ? "#111" : rowColors[ri] ?? "#888"}
                  stroke={isPar ? "#fff" : "#222"}
                  strokeWidth={isPar ? 2 : 1}
                  rx={3}
                  opacity={0.85}
                />
                <text
                  x={(CELL_W - 2) / 2}
                  y={CELL_H * 0.4}
                  textAnchor="middle"
                  dominantBaseline="middle"
                  fontSize={12}
                  fontWeight="600"
                  fill={ri === 0 ? "#333" : "#fff"}
                >
                  {isBankrupt ? "BK" : `$${cell.price}`}
                </text>

                {tokens.map((cid, ti) => (
                  <circle
                    key={cid}
                    cx={8 + ti * 16}
                    cy={CELL_H - 10}
                    r={7}
                    fill={companyColors[cid] ?? "#888"}
                    stroke="#fff"
                    strokeWidth={1.5}
                  >
                    <title>{cid}</title>
                  </circle>
                ))}
              </g>
            );
          })
        )}
      </svg>
    </div>
  );
}
