import type { HexDef, PlacedTile, TileDef, HexCoord } from "./hex.js";
import type { PublicCompanyDef, PrivateCompanyDef, CompanyState } from "./company.js";
import type { StockMarketDef, StockPosition, Share } from "./stock.js";
import type { TrainDef, OwnedTrain } from "./train.js";
import type { PhaseDef } from "./phase.js";
import type { PlayerState, PlayerId } from "./player.js";

/** Static game definition — everything needed to define an 18xx game */
export type GameDef = {
  readonly id: string;
  readonly name: string;
  readonly minPlayers: number;
  readonly maxPlayers: number;
  readonly bankCash: number;
  readonly certLimit: Record<number, number>;
  readonly startingCash: Record<number, number>;
  readonly tiles: readonly TileDef[];
  readonly map: readonly HexDef[];
  readonly companies: readonly PublicCompanyDef[];
  readonly privates: readonly PrivateCompanyDef[];
  readonly trains: readonly TrainDef[];
  readonly phases: readonly PhaseDef[];
  readonly stockMarket: StockMarketDef;
  readonly floatPercent: number;
  readonly sellAfterBuy?: "first_or" | "not_current_or" | "any_time";
  readonly endGame?: "bankrupt" | "bank_broken" | "stock_market_cap";
  readonly layout?: "flat" | "pointy";
};

export type RoundType = "stock" | "operating" | "auction" | "initial_auction";

export type GamePhaseId = string;

export type TurnContext =
  | { readonly type: "stock"; readonly playerOrder: readonly PlayerId[] }
  | { readonly type: "operating"; readonly companyOrder: readonly string[] }
  | { readonly type: "auction"; readonly order: readonly PlayerId[] };

/** Complete runtime game state — a plain serializable object */
export type GameState = {
  readonly id: string;
  readonly gameDefId: string;
  readonly players: readonly PlayerState[];
  readonly bank: number;
  readonly currentPlayerId: PlayerId;
  readonly round: RoundType;
  readonly roundNumber: number;
  readonly operatingRoundNumber: number;
  readonly phaseId: GamePhaseId;
  readonly turnContext: TurnContext;
  readonly map: Record<string, PlacedTile>;
  readonly companies: Record<string, CompanyState>;
  readonly privateCompanies: Record<string, PrivateOwnership>;
  readonly stockMarket: Record<string, StockPosition>;
  readonly bankPool: readonly Share[];
  readonly trainBank: Record<string, number>;
  readonly log: readonly LogEntry[];
  readonly status: "waiting" | "active" | "finished";
  readonly winner?: PlayerId;
  readonly actionsHistory: readonly GameAction[];
};

export type PrivateOwnership = {
  readonly ownerId: string;
  readonly revenue: number;
  readonly closed: boolean;
};

export type LogEntry = {
  readonly timestamp: number;
  readonly playerId?: PlayerId;
  readonly message: string;
  readonly type: "action" | "system" | "phase";
};

/** Union of all possible player actions */
export type GameAction =
  | { readonly type: "bid"; readonly playerId: PlayerId; readonly privateId: string; readonly amount: number }
  | { readonly type: "pass_bid"; readonly playerId: PlayerId }
  | { readonly type: "buy_share"; readonly playerId: PlayerId; readonly companyId: string; readonly from: "ipo" | "bank_pool" | "player"; readonly fromPlayerId?: PlayerId; readonly parValue?: number }
  | { readonly type: "sell_shares"; readonly playerId: PlayerId; readonly companyId: string; readonly count: number }
  | { readonly type: "pass_stock"; readonly playerId: PlayerId }
  | { readonly type: "lay_tile"; readonly companyId: string; readonly coord: HexCoord; readonly tileId: string; readonly rotation: number }
  | { readonly type: "place_token"; readonly companyId: string; readonly coord: HexCoord; readonly cityIndex: number }
  | { readonly type: "buy_train"; readonly companyId: string; readonly trainTypeId: string; readonly from: "bank" | "company"; readonly fromCompanyId?: string; readonly price?: number }
  | { readonly type: "run_routes"; readonly companyId: string; readonly routes: readonly Route[]; readonly dividend: "pay" | "withhold" | "half" }
  | { readonly type: "buy_private"; readonly companyId: string; readonly privateId: string; readonly price: number }
  | { readonly type: "pass_operate"; readonly companyId: string };

export type Route = {
  readonly trainTypeId: string;
  readonly hexes: readonly HexCoord[];
  readonly revenue: number;
};
