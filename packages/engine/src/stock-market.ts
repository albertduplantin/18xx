import type { GameDef, GameState, StockPosition } from "@18xx/shared";

export type PriceMovement = "left" | "right" | "up" | "down" | "left_left";

/** Get the price at a given market position */
export function priceAt(def: GameDef, pos: StockPosition): number {
  return def.stockMarket.market[pos.row]?.[pos.col]?.price ?? 0;
}

/** Move a stock token and return the new position */
export function moveStock(
  def: GameDef,
  pos: StockPosition,
  movement: PriceMovement,
): StockPosition {
  const market = def.stockMarket.market;
  let { row, col } = pos;

  switch (movement) {
    case "right":
      col = Math.min(col + 1, (market[row]?.length ?? 1) - 1);
      break;
    case "left":
      col = Math.max(col - 1, 0);
      break;
    case "left_left":
      col = Math.max(col - 2, 0);
      break;
    case "up":
      row = Math.max(row - 1, 0);
      break;
    case "down":
      row = Math.min(row + 1, market.length - 1);
      break;
  }

  return { row, col };
}

/** Move stock after a dividend or withhold decision */
export function applyDividendMovement(
  def: GameDef,
  pos: StockPosition,
  paidDividend: boolean,
  soldShares: number,
): StockPosition {
  let current = pos;
  if (paidDividend) {
    current = moveStock(def, current, "right");
  } else {
    current = moveStock(def, current, "left");
  }
  for (let i = 0; i < soldShares; i++) {
    current = moveStock(def, current, "left");
  }
  return current;
}

/** Get current stock price for a company */
export function companyStockPrice(state: GameState, def: GameDef, companyId: string): number {
  const pos = state.stockMarket[companyId];
  if (!pos) return 0;
  return priceAt(def, pos);
}

/** Find cell position for a given par value */
export function findParPosition(def: GameDef, parValue: number): StockPosition | null {
  for (let row = 0; row < def.stockMarket.market.length; row++) {
    const rowCells = def.stockMarket.market[row] ?? [];
    for (let col = 0; col < rowCells.length; col++) {
      const cell = rowCells[col];
      if (cell?.price === parValue && cell.type === "par") {
        return { row, col };
      }
    }
  }
  return null;
}

/** Check if a company is bankrupt (price at 0 or bankrupt cell) */
export function isCompanyBankrupt(def: GameDef, pos: StockPosition): boolean {
  const cell = def.stockMarket.market[pos.row]?.[pos.col];
  return !cell || cell.price === 0 || cell.type === "bankrupt";
}

/** Calculate total market capitalization of all companies */
export function totalMarketCap(state: GameState, def: GameDef): number {
  let total = 0;
  for (const [companyId, companyState] of Object.entries(state.companies)) {
    if (companyState.status === "floated") {
      const price = companyStockPrice(state, def, companyId);
      const companyDef = def.companies.find((c) => c.id === companyId);
      if (companyDef) {
        const totalShares = companyDef.shares.reduce((s, p) => s + p, 0) / 10;
        total += price * totalShares;
      }
    }
  }
  return total;
}
