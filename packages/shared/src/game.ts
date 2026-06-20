import type { HexDef, PlacedTile, TileDef, HexCoord } from "./hex.js";
import type { PublicCompanyDef, PrivateCompanyDef, CompanyState } from "./company.js";
import type { StockMarketDef, StockPosition, Share } from "./stock.js";
import type { TrainDef } from "./train.js";
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

export type RoundType = "stock" | "operating" | "auction";

export type GamePhaseId = string;

/** Auction context: sequential bidding on private companies */
export type AuctionContext = {
  readonly type: "auction";
  readonly order: readonly PlayerId[];
  /** Index of current player in order[] */
  readonly playerIdx: number;
  /** Index of the current private being offered */
  readonly privateIdx: number;
  /** Current offer price (may be below face value after passes) */
  readonly currentPrice: number;
  /** How many consecutive passes on the current private */
  readonly passCount: number;
  /** Highest bids per private (for open-bid privates) */
  readonly bids: Record<string, { playerId: PlayerId; amount: number }>;
};

/** Stock round context */
export type StockContext = {
  readonly type: "stock";
  /** Turn order for this SR */
  readonly playerOrder: readonly PlayerId[];
  /** How many consecutive passes in a row (SR ends when all pass) */
  readonly consecutivePasses: number;
  /** Players who already bought a share this SR turn (can't buy twice in one turn) */
  readonly boughtThisTurn: readonly PlayerId[];
};

/** Operating round context */
export type OperatingContext = {
  readonly type: "operating";
  /** Companies in operation order (by stock price, descending) */
  readonly companyOrder: readonly string[];
  /** Index of the company currently operating */
  readonly companyIdx: number;
  /** Which sub-actions the current company has completed this OR turn */
  readonly companyActions: readonly ORAction[];
  /** Which OR sub-round this is within the current game round (1-indexed) */
  readonly orRound: number;
};

/** Sub-actions a company can take per OR turn */
export type ORAction = "tile" | "token" | "trains" | "routes";

export type TurnContext = AuctionContext | StockContext | OperatingContext;

/** Complete runtime game state — a plain serializable object */
export type GameState = {
  readonly id: string;
  readonly gameDefId: string;
  readonly players: readonly PlayerState[];
  readonly bank: number;
  readonly currentPlayerId: PlayerId;
  readonly round: RoundType;
  readonly roundNumber: number;
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
  | { readonly type: "buy_share"; readonly playerId: PlayerId; readonly companyId: string; readonly from: "ipo" | "bank_pool"; readonly parValue?: number }
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
