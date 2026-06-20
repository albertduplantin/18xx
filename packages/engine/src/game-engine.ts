import type {
  GameDef,
  GameState,
  GameAction,
  PlayerState,
  CompanyState,
  StockPosition,
  Share,
  LogEntry,
  PrivateOwnership,
  Route,
  PlayerId,
} from "@18xx/shared";
import { applyDividendMovement, findParPosition, priceAt, moveStock } from "./stock-market.js";
import { calculateOptimalRoutes, totalRevenue } from "./route-calculator.js";
import { hexKey } from "./hex-grid.js";

export type ActionResult =
  | { ok: true; state: GameState }
  | { ok: false; error: string };

function log(state: GameState, message: string, playerId?: PlayerId, type: LogEntry["type"] = "action"): GameState {
  const entry: LogEntry = playerId !== undefined
    ? { timestamp: Date.now(), playerId, message, type }
    : { timestamp: Date.now(), message, type };
  return { ...state, log: [...state.log, entry] };
}

function getPlayer(state: GameState, playerId: PlayerId): PlayerState {
  const p = state.players.find((p) => p.id === playerId);
  if (!p) throw new Error(`Player ${playerId} not found`);
  return p;
}

function updatePlayer(state: GameState, updated: PlayerState): GameState {
  return {
    ...state,
    players: state.players.map((p) => (p.id === updated.id ? updated : p)),
  };
}

function updateCompany(state: GameState, updated: CompanyState): GameState {
  return {
    ...state,
    companies: { ...state.companies, [updated.id]: updated },
  };
}

// ─── INITIAL AUCTION ────────────────────────────────────────────────────────

function applyBid(state: GameState, def: GameDef, action: Extract<GameAction, { type: "bid" }>): ActionResult {
  const player = getPlayer(state, action.playerId);
  const priv = def.privates.find((p) => p.id === action.privateId);
  if (!priv) return { ok: false, error: "Private company not found" };
  if (player.cash < action.amount) return { ok: false, error: "Insufficient funds" };
  if (action.amount < priv.value) return { ok: false, error: `Minimum bid is ${priv.value}` };

  const newState = log(state, `${player.name} bids $${action.amount} on ${priv.name}`, action.playerId);
  return { ok: true, state: newState };
}

// ─── STOCK ROUND ────────────────────────────────────────────────────────────

function applyBuyShare(
  state: GameState,
  def: GameDef,
  action: Extract<GameAction, { type: "buy_share" }>,
): ActionResult {
  const player = getPlayer(state, action.playerId);
  const companyDef = def.companies.find((c) => c.id === action.companyId);
  if (!companyDef) return { ok: false, error: "Company not found" };

  const isIPO = action.from === "ipo";
  const stockPrice = isIPO && action.parValue
    ? action.parValue
    : priceAt(def, state.stockMarket[action.companyId] ?? { row: 0, col: 0 });

  const sharePercent = companyDef.shares.find((s) => s === 10) ?? 10;
  const cost = stockPrice;

  if (player.cash < cost) return { ok: false, error: "Insufficient funds" };

  const certLimit = def.certLimit[state.players.length] ?? 99;
  const playerCerts = player.shares.length + player.privates.length;
  if (playerCerts >= certLimit) return { ok: false, error: "Certificate limit reached" };

  const newShare: Share = {
    companyId: action.companyId,
    percent: sharePercent,
    president: false,
  };

  const updatedPlayer: PlayerState = {
    ...player,
    cash: player.cash - cost,
    shares: [...player.shares, newShare],
  };

  let newState = updatePlayer(state, updatedPlayer);
  newState = { ...newState, bank: newState.bank + cost };

  // Float the company if enough shares are sold
  const companyState = newState.companies[action.companyId];
  if (companyState?.status === "unstarted" && action.parValue) {
    const parPos = findParPosition(def, action.parValue);
    if (parPos) {
      newState = {
        ...newState,
        stockMarket: { ...newState.stockMarket, [action.companyId]: parPos },
      };
    }

    const playerSharesInCompany = newState.players
      .flatMap((p) => p.shares)
      .filter((s) => s.companyId === action.companyId)
      .reduce((sum, s) => sum + s.percent, 0);

    const floatThreshold = companyDef.floatPercent ?? def.floatPercent;
    if (playerSharesInCompany >= floatThreshold) {
      const ipoShares = companyDef.shares.reduce((sum, s) => sum + s, 0);
      const soldShares = playerSharesInCompany;
      const treasuryCash = action.parValue * (soldShares / 10);
      const updatedCompany: CompanyState = {
        ...companyState,
        status: "floated",
        cash: treasuryCash,
      };
      newState = updateCompany(newState, updatedCompany);
      newState = log(newState, `${companyDef.name} floated with $${treasuryCash} in treasury`, undefined, "system");
    }
  }

  newState = log(newState, `${player.name} buys a share of ${companyDef.name} for $${cost}`, action.playerId);
  return { ok: true, state: advanceTurn(newState, def) };
}

function applySellShares(
  state: GameState,
  def: GameDef,
  action: Extract<GameAction, { type: "sell_shares" }>,
): ActionResult {
  const player = getPlayer(state, action.playerId);
  const companyDef = def.companies.find((c) => c.id === action.companyId);
  if (!companyDef) return { ok: false, error: "Company not found" };

  const playerShares = player.shares.filter((s) => s.companyId === action.companyId);
  if (playerShares.length < action.count) return { ok: false, error: "Not enough shares to sell" };

  const price = priceAt(def, state.stockMarket[action.companyId] ?? { row: 0, col: 0 });
  const proceeds = price * action.count;
  const sharesToSell = playerShares.slice(0, action.count);
  const remainingShares = player.shares.filter((s) => !sharesToSell.includes(s));

  const updatedPlayer: PlayerState = {
    ...player,
    cash: player.cash + proceeds,
    shares: remainingShares,
  };

  let newState = updatePlayer(state, updatedPlayer);
  newState = { ...newState, bank: newState.bank - proceeds };
  newState = {
    ...newState,
    bankPool: [...newState.bankPool, ...sharesToSell],
  };

  // Move stock price down for each share sold
  let stockPos = newState.stockMarket[action.companyId] ?? { row: 0, col: 0 };
  for (let i = 0; i < action.count; i++) {
    stockPos = moveStock(def, stockPos, "left");
  }
  newState = { ...newState, stockMarket: { ...newState.stockMarket, [action.companyId]: stockPos } };

  newState = log(newState, `${player.name} sells ${action.count} share(s) of ${companyDef.name} for $${proceeds}`, action.playerId);
  return { ok: true, state: newState };
}

// ─── OPERATING ROUND ────────────────────────────────────────────────────────

function applyLayTile(
  state: GameState,
  def: GameDef,
  action: Extract<GameAction, { type: "lay_tile" }>,
): ActionResult {
  const key = hexKey(action.coord);
  const tile = def.tiles.find((t) => t.id === action.tileId);
  if (!tile) return { ok: false, error: "Tile not found" };

  const phase = def.phases.find((p) => p.id === state.phaseId);
  if (!phase?.tiles.includes(tile.color)) {
    return { ok: false, error: `Tile color ${tile.color} not available in current phase` };
  }

  const newMap = {
    ...state.map,
    [key]: {
      tileId: action.tileId,
      rotation: (action.rotation % 6) as import("@18xx/shared").Direction,
      tokenSlots: Array(tile.cities.length).fill(null) as null[],
    },
  };

  let newState: GameState = { ...state, map: newMap };
  newState = log(newState, `${action.companyId} lays tile ${action.tileId} at (${action.coord.q},${action.coord.r})`);
  return { ok: true, state: newState };
}

function applyPlaceToken(
  state: GameState,
  def: GameDef,
  action: Extract<GameAction, { type: "place_token" }>,
): ActionResult {
  const key = hexKey(action.coord);
  const placed = state.map[key];
  if (!placed) return { ok: false, error: "No tile at this location" };

  const slots = [...placed.tokenSlots];
  if (slots[action.cityIndex] !== null) return { ok: false, error: "City slot already occupied" };

  slots[action.cityIndex] = action.companyId;
  const newMap = { ...state.map, [key]: { ...placed, tokenSlots: slots } };

  const company = state.companies[action.companyId];
  if (!company) return { ok: false, error: "Company not found" };

  const tokenCost = def.companies.find((c) => c.id === action.companyId)?.tokens[company.tokens.filter(Boolean).length] ?? 0;
  if (company.cash < tokenCost) return { ok: false, error: "Insufficient funds for token" };

  const updatedCompany: CompanyState = {
    ...company,
    cash: company.cash - tokenCost,
    tokens: [...company.tokens, true],
  };

  let newState: GameState = { ...state, map: newMap };
  newState = updateCompany(newState, updatedCompany);
  newState = log(newState, `${action.companyId} places a token at (${action.coord.q},${action.coord.r})`);
  return { ok: true, state: newState };
}

function applyBuyTrain(
  state: GameState,
  def: GameDef,
  action: Extract<GameAction, { type: "buy_train" }>,
): ActionResult {
  const company = state.companies[action.companyId];
  if (!company) return { ok: false, error: "Company not found" };

  const trainDef = def.trains.find((t) => t.id === action.trainTypeId);
  if (!trainDef) return { ok: false, error: "Train not found" };

  const price = action.price ?? trainDef.price;
  if (company.cash < price) return { ok: false, error: "Insufficient funds for train" };

  const phase = def.phases.find((p) => p.id === state.phaseId);
  const trainLimit = phase?.trainLimit ?? 4;
  if (company.trains.length >= trainLimit) return { ok: false, error: "Train limit reached" };

  const updatedCompany: CompanyState = {
    ...company,
    cash: company.cash - price,
    trains: [...company.trains, action.trainTypeId],
  };

  let newState = updateCompany(state, updatedCompany);
  newState = { ...newState, bank: newState.bank + price };

  // Check for new train phase trigger
  newState = checkPhaseTransition(newState, def, action.trainTypeId);

  // Rust old trains if needed
  newState = rustObsoleteTrains(newState, def);

  newState = log(newState, `${action.companyId} buys a ${trainDef.name} train for $${price}`);
  return { ok: true, state: newState };
}

function applyRunRoutes(
  state: GameState,
  def: GameDef,
  action: Extract<GameAction, { type: "run_routes" }>,
): ActionResult {
  const company = state.companies[action.companyId];
  const companyDef = def.companies.find((c) => c.id === action.companyId);
  if (!company || !companyDef) return { ok: false, error: "Company not found" };

  const revenue = totalRevenue(action.routes);

  let newState = state;

  if (action.dividend === "pay") {
    // Pay dividends: distribute to shareholders, move stock right
    const totalShares = companyDef.shares.reduce((s, p) => s + p, 0) / 10;
    const perShare = Math.floor(revenue / totalShares);

    for (const player of state.players) {
      const sharesOwned = player.shares.filter((s) => s.companyId === action.companyId).length;
      if (sharesOwned > 0) {
        const dividend = perShare * sharesOwned;
        const updated: PlayerState = { ...player, cash: player.cash + dividend };
        newState = updatePlayer(newState, updated);
      }
    }

    const bankPoolShares = state.bankPool.filter((s) => s.companyId === action.companyId).length;
    newState = { ...newState, bank: newState.bank - revenue + perShare * bankPoolShares };

    const pos = newState.stockMarket[action.companyId];
    if (pos) {
      const newPos = moveStock(def, pos, "right");
      newState = { ...newState, stockMarket: { ...newState.stockMarket, [action.companyId]: newPos } };
    }

    newState = log(newState, `${companyDef.name} pays $${perShare}/share dividend (total $${revenue})`, undefined, "action");
  } else if (action.dividend === "withhold") {
    // Withhold: money stays in company treasury, stock moves left
    const updatedCompany: CompanyState = { ...company, cash: company.cash + revenue };
    newState = updateCompany(newState, updatedCompany);

    const pos = newState.stockMarket[action.companyId];
    if (pos) {
      const newPos = moveStock(def, pos, "left");
      newState = { ...newState, stockMarket: { ...newState.stockMarket, [action.companyId]: newPos } };
    }

    newState = log(newState, `${companyDef.name} withholds $${revenue}`, undefined, "action");
  } else {
    // Half dividend
    const halfRevenue = Math.floor(revenue / 2);
    const totalShares = companyDef.shares.reduce((s, p) => s + p, 0) / 10;
    const perShare = Math.floor(halfRevenue / totalShares);

    for (const player of state.players) {
      const sharesOwned = player.shares.filter((s) => s.companyId === action.companyId).length;
      if (sharesOwned > 0) {
        const dividend = perShare * sharesOwned;
        const updated: PlayerState = { ...player, cash: player.cash + dividend };
        newState = updatePlayer(newState, updated);
      }
    }

    const updatedCompany: CompanyState = { ...company, cash: company.cash + halfRevenue };
    newState = updateCompany(newState, updatedCompany);

    newState = log(newState, `${companyDef.name} pays half dividend ($${perShare}/share)`, undefined, "action");
  }

  newState = {
    ...newState,
    companies: {
      ...newState.companies,
      [action.companyId]: {
        ...newState.companies[action.companyId]!,
        revenue: [...(newState.companies[action.companyId]?.revenue ?? []), revenue],
      },
    },
  };

  return { ok: true, state: newState };
}

// ─── PHASE TRANSITIONS ──────────────────────────────────────────────────────

function checkPhaseTransition(state: GameState, def: GameDef, purchasedTrainId: string): GameState {
  const phases = def.phases;
  let newPhaseId = state.phaseId;

  for (let i = 0; i < phases.length; i++) {
    const phase = phases[i]!;
    if (phase.triggers?.includes(purchasedTrainId)) {
      const nextPhase = phases[i + 1];
      if (nextPhase) {
        newPhaseId = nextPhase.id;
        return log(
          { ...state, phaseId: newPhaseId, operatingRoundNumber: 0 },
          `Phase ${nextPhase.name} begins!`,
          undefined,
          "phase",
        );
      }
    }
  }

  return state;
}

function rustObsoleteTrains(state: GameState, def: GameDef): GameState {
  const phase = def.phases.find((p) => p.id === state.phaseId);
  if (!phase) return state;

  let newState = state;

  for (const [companyId, company] of Object.entries(state.companies)) {
    const rusted = company.trains.filter((trainId) => {
      const t = def.trains.find((d) => d.id === trainId);
      const rustsOn = t?.rusts;
      if (!rustsOn) return false;
      const rustPhase = def.phases.find((p) => p.triggers?.includes(rustsOn));
      return rustPhase && def.phases.indexOf(rustPhase) <= def.phases.findIndex((p) => p.id === state.phaseId);
    });

    if (rusted.length > 0) {
      const updatedCompany: CompanyState = {
        ...company,
        trains: company.trains.filter((t) => !rusted.includes(t)),
      };
      newState = updateCompany(newState, updatedCompany);
      newState = log(newState, `${companyId}'s ${rusted.join(", ")} train(s) rusted`, undefined, "system");
    }
  }

  return newState;
}

// ─── TURN ADVANCEMENT ───────────────────────────────────────────────────────

function advanceTurn(state: GameState, def: GameDef): GameState {
  if (state.round === "stock") {
    return advanceStockRound(state, def);
  }
  return state;
}

function advanceStockRound(state: GameState, def: GameDef): GameState {
  if (state.turnContext.type !== "stock") return state;
  const order = state.turnContext.playerOrder;
  const currentIdx = order.indexOf(state.currentPlayerId);
  const nextIdx = (currentIdx + 1) % order.length;

  if (nextIdx === 0) {
    return startOperatingRound(state, def);
  }

  return { ...state, currentPlayerId: order[nextIdx]! };
}

function startOperatingRound(state: GameState, def: GameDef): GameState {
  const floatedCompanies = Object.entries(state.companies)
    .filter(([, c]) => c.status === "floated")
    .map(([id]) => id)
    .sort((a, b) => {
      const priceA = priceAt(def, state.stockMarket[a] ?? { row: 0, col: 0 });
      const priceB = priceAt(def, state.stockMarket[b] ?? { row: 0, col: 0 });
      return priceB - priceA;
    });

  return log(
    {
      ...state,
      round: "operating",
      operatingRoundNumber: state.operatingRoundNumber + 1,
      currentPlayerId: state.players[0]!.id,
      turnContext: { type: "operating", companyOrder: floatedCompanies },
    },
    `Operating Round ${state.roundNumber}.${state.operatingRoundNumber + 1} begins`,
    undefined,
    "phase",
  );
}

// ─── MAIN DISPATCH ──────────────────────────────────────────────────────────

export function applyAction(state: GameState, def: GameDef, action: GameAction): ActionResult {
  try {
    switch (action.type) {
      case "bid":
        return applyBid(state, def, action);
      case "buy_share":
        return applyBuyShare(state, def, action);
      case "sell_shares":
        return applySellShares(state, def, action);
      case "lay_tile":
        return applyLayTile(state, def, action);
      case "place_token":
        return applyPlaceToken(state, def, action);
      case "buy_train":
        return applyBuyTrain(state, def, action);
      case "run_routes":
        return applyRunRoutes(state, def, action);
      case "pass_stock":
      case "pass_operate":
        return { ok: true, state: advanceTurn(state, def) };
      default:
        return { ok: false, error: `Unknown action type` };
    }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Unknown error" };
  }
}

/** Create the initial game state for a given definition and player list */
export function createInitialState(
  def: GameDef,
  players: readonly { id: PlayerId; name: string }[],
): GameState {
  const startingCash = def.startingCash[players.length] ?? 0;

  const playerStates: PlayerState[] = players.map((p) => ({
    id: p.id,
    name: p.name,
    cash: startingCash,
    shares: [],
    privates: [],
  }));

  const companies: Record<string, CompanyState> = {};
  for (const c of def.companies) {
    companies[c.id] = {
      id: c.id,
      status: "unstarted",
      cash: 0,
      trains: [],
      tokens: [],
      revenue: [],
    };
  }

  const trainBank: Record<string, number> = {};
  for (const t of def.trains) {
    trainBank[t.id] = t.available;
  }

  const privateCompanies: Record<string, PrivateOwnership> = {};
  for (const p of def.privates) {
    privateCompanies[p.id] = { ownerId: "bank", revenue: p.revenue, closed: false };
  }

  const firstPhase = def.phases[0]!;

  return {
    id: `game-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    gameDefId: def.id,
    players: playerStates,
    bank: def.bankCash,
    currentPlayerId: playerStates[0]!.id,
    round: "auction",
    roundNumber: 1,
    operatingRoundNumber: 0,
    phaseId: firstPhase.id,
    turnContext: { type: "auction", order: playerStates.map((p) => p.id) },
    map: {},
    companies,
    privateCompanies,
    stockMarket: {},
    bankPool: [],
    trainBank,
    log: [{ timestamp: Date.now(), message: `Game started: ${def.name}`, type: "system" }],
    status: "active",
    actionsHistory: [],
  };
}
