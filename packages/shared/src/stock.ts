import type { CompanyId } from "./company.js";

/** A cell in the stock market grid */
export type StockCell = {
  readonly price: number;
  readonly type?: "par" | "bankrupt" | "ledge" | "max";
};

/** The full stock market definition */
export type StockMarketDef = {
  readonly market: readonly (readonly StockCell[])[];
};

/** Where a company's stock token sits on the market */
export type StockPosition = {
  readonly row: number;
  readonly col: number;
};

/** Movement rules after dividends or withhold */
export type StockMovement = {
  readonly leftOnWithhold: number;
  readonly rightOnDividend: number;
  readonly upOnSell?: number;
};

/** A share owned by a player or the bank pool */
export type Share = {
  readonly companyId: CompanyId;
  readonly percent: number;
  readonly president: boolean;
};

export type ParValue = 100 | 90 | 82 | 76 | 71 | 67;
