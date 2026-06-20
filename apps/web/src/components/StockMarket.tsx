import React from "react";
import type { GameState, GameDef } from "@18xx/shared";

type Props = {
  state: GameState;
  def: GameDef;
};

const CELL_W = 54;
const CELL_H = 40;

// Physical 1830 stock market: the grid uses zone colors to indicate
// the "health" of a share price — yellow = par/start zone,
// cream = normal trading, light tan = higher prices.
// Leftmost column (bankrupt) is black; par cells have a visible border.
function cellZoneColor(price: number, isBankrupt: boolean): string {
  if (isBankrupt) return "#1a0808";
  if (price <= 60)  return "#f5d8c0";  // danger zone — salmon/light red
  if (price <= 100) return "#f5f0d8";  // par zone — warm yellow-cream
  if (price <= 165) return "#e8f0e0";  // profit zone — light green tint
  return "#d8e8f5";                    // high value — light blue
}

export function StockMarket({ state, def }: Props) {
  const market = def.stockMarket.market;

  const companyAtPos = new Map<string, string[]>();
  for (const [companyId, pos] of Object.entries(state.stockMarket)) {
    const key = `${pos.row},${pos.col}`;
    if (!companyAtPos.has(key)) companyAtPos.set(key, []);
    companyAtPos.get(key)!.push(companyId);
  }

  const companyColors: Record<string, string> = {};
  const companyShortNames: Record<string, string> = {};
  for (const c of def.companies) {
    companyColors[c.id] = c.color;
    companyShortNames[c.id] = c.shortName;
  }

  const maxCols = Math.max(...market.map((r) => r.length));

  return (
    <div style={{ overflowX: "auto" }}>
      <svg
        width={maxCols * CELL_W + 4}
        height={market.length * CELL_H + 4}
        style={{ display: "block" }}
      >
        <defs>
          {/* Subtle drop shadow for token discs */}
          <filter id="token-shadow" x="-20%" y="-20%" width="140%" height="140%">
            <feDropShadow dx="1" dy="1" stdDeviation="1" floodOpacity="0.4" />
          </filter>
        </defs>

        {market.map((row, ri) =>
          row.map((cell, ci) => {
            const cellKey = `${ri},${ci}`;
            const tokens = companyAtPos.get(cellKey) ?? [];
            const isPar = cell.type === "par";
            const isBankrupt = cell.type === "bankrupt";
            const bg = cellZoneColor(cell.price, isBankrupt);

            return (
              <g key={cellKey} transform={`translate(${ci * CELL_W + 2}, ${ri * CELL_H + 2})`}>
                {/* Cell background */}
                <rect
                  width={CELL_W - 2}
                  height={CELL_H - 2}
                  fill={bg}
                  stroke={isPar ? "#8b6020" : "#bba880"}
                  strokeWidth={isPar ? 2 : 0.8}
                  rx={2}
                />

                {/* Par value indicator (small dot in corner) */}
                {isPar && (
                  <circle cx={CELL_W - 8} cy={8} r={4} fill="#8b6020" />
                )}

                {/* Price label */}
                <text
                  x={(CELL_W - 2) / 2}
                  y={isBankrupt ? CELL_H * 0.5 : CELL_H * 0.38}
                  textAnchor="middle"
                  dominantBaseline="middle"
                  fontSize={isBankrupt ? 10 : 12}
                  fontWeight="700"
                  fontFamily="'Palatino Linotype', Palatino, Georgia, serif"
                  fill={isBankrupt ? "#cc4040" : "#2a1a00"}
                >
                  {isBankrupt ? "BK" : `$${cell.price}`}
                </text>

                {/* Company token discs */}
                {tokens.map((cid, ti) => {
                  const color = companyColors[cid] ?? "#888";
                  const cx = 10 + ti * 18;
                  const cy = CELL_H - 10;
                  return (
                    <g key={cid} filter="url(#token-shadow)">
                      <circle cx={cx} cy={cy} r={8} fill={color} stroke="#1a1a1a" strokeWidth={1.2} />
                      <text x={cx} y={cy} textAnchor="middle" dominantBaseline="middle"
                        fontSize={6} fontWeight="bold" fill="#ffffff"
                        fontFamily="'Copperplate Gothic', Copperplate, serif">
                        {(companyShortNames[cid] ?? cid).slice(0, 3)}
                      </text>
                    </g>
                  );
                })}
              </g>
            );
          })
        )}

        {/* Zone legend row at top-right */}
        <g transform={`translate(${maxCols * CELL_W - 200}, ${market.length * CELL_H + 8})`}>
          {[
            { color: "#f5d8c0", label: "Danger" },
            { color: "#f5f0d8", label: "Par zone" },
            { color: "#e8f0e0", label: "Profit" },
            { color: "#d8e8f5", label: "High" },
          ].map(({ color, label }, i) => (
            <g key={i} transform={`translate(${i * 50}, 0)`}>
              <rect x={0} y={0} width={12} height={12} fill={color} stroke="#bba880" strokeWidth={0.8} rx={2} />
              <text x={15} y={9} fontSize={9} fill="#6b5a3a"
                fontFamily="'Palatino Linotype', Palatino, Georgia, serif">
                {label}
              </text>
            </g>
          ))}
        </g>
      </svg>
    </div>
  );
}
