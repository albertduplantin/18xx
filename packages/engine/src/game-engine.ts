import type {
  GameDef,
  GameState,
  GameAction,
  PlayerState,
  CompanyState,
  Share,
  LogEntry,
  PrivateOwnership,
  PlayerId,
  AuctionContext,
  StockContext,
  OperatingContext,
  ORAction,
} from "@18xx/shared";
import { priceAt, findParPosition, moveStock } from "./stock-market.js";
import { totalRevenue } from "./route-calculator.js";
import { hexKey, hexNeighbor } from "./hex-grid.js";

export type ActionResult =
  | { ok: true; state: GameState }
  | { ok: false; error: string };

// ─── Helpers ────────────────────────────────────────────────────────────────

function log(
  state: GameState,
  message: string,
  playerId?: PlayerId,
  type: LogEntry["type"] = "action",
): GameState {
  const entry: LogEntry =
    playerId !== undefined
      ? { timestamp: Date.now(), playerId, message, type }
      : { timestamp: Date.now(), message, type };
  return { ...state, log: [...state.log, entry] };
}

function getPlayer(state: GameState, id: PlayerId): PlayerState {
  const p = state.players.find((p) => p.id === id);
  if (!p) throw new Error(`Player ${id} not found`);
  return p;
}

function updatePlayer(state: GameState, updated: PlayerState): GameState {
  return { ...state, players: state.players.map((p) => (p.id === updated.id ? updated : p)) };
}

function updateCompany(state: GameState, updated: CompanyState): GameState {
  return { ...state, companies: { ...state.companies, [updated.id]: updated } };
}

function auctionCtx(state: GameState): AuctionContext {
  return state.turnContext as AuctionContext;
}

function stockCtx(state: GameState): StockContext {
  return state.turnContext as StockContext;
}

function orCtx(state: GameState): OperatingContext {
  return state.turnContext as OperatingContext;
}

function currentCompanyId(state: GameState): string {
  const ctx = orCtx(state);
  return ctx.companyOrder[ctx.companyIdx] ?? "";
}

// ─── GAME END ───────────────────────────────────────────────────────────────

function checkGameEnd(state: GameState, def: GameDef): GameState {
  if (def.endGame === "bank_broken" && state.bank <= 0) {
    const winner = [...state.players].sort((a, b) => netWorth(b, state, def) - netWorth(a, state, def))[0];
    const finished: GameState = winner
      ? { ...state, status: "finished", winner: winner.id }
      : { ...state, status: "finished" };
    return log(
      finished,
      `Game over — bank is broken! ${winner?.name ?? "?"} wins with $${winner ? netWorth(winner, state, def) : 0}`,
      undefined,
      "phase",
    );
  }
  return state;
}

function netWorth(player: PlayerState, state: GameState, def: GameDef): number {
  const shareValue = player.shares.reduce((sum, share) => {
    const pos = state.stockMarket[share.companyId];
    return sum + (pos ? priceAt(def, pos) : 0);
  }, 0);
  return player.cash + shareValue;
}

// ─── AUCTION ROUND ──────────────────────────────────────────────────────────

function applyBid(
  state: GameState,
  def: GameDef,
  action: Extract<GameAction, { type: "bid" }>,
): ActionResult {
  const ctx = auctionCtx(state);
  const currentPriv = def.privates[ctx.privateIdx];
  if (!currentPriv) return { ok: false, error: "No private to bid on" };
  if (action.privateId !== currentPriv.id) return { ok: false, error: "Wrong private" };

  const player = getPlayer(state, action.playerId);
  if (action.amount < ctx.currentPrice) return { ok: false, error: `Minimum bid is $${ctx.currentPrice}` };
  if (player.cash < action.amount) return { ok: false, error: "Insufficient funds" };

  // Award private to player
  const updatedPlayer: PlayerState = {
    ...player,
    cash: player.cash - action.amount,
    privates: [...player.privates, currentPriv.id],
  };
  let newState = updatePlayer(state, player.id === updatedPlayer.id ? updatedPlayer : player);
  newState = updatePlayer(newState, updatedPlayer);
  newState = {
    ...newState,
    bank: newState.bank + action.amount,
    privateCompanies: {
      ...newState.privateCompanies,
      [currentPriv.id]: { ownerId: player.id, revenue: currentPriv.revenue, closed: false },
    },
  };
  newState = log(
    newState,
    `${player.name} buys ${currentPriv.name} for $${action.amount}`,
    player.id,
  );

  return { ok: true, state: advanceAuction(newState, def) };
}

function applyPassBid(
  state: GameState,
  def: GameDef,
  action: Extract<GameAction, { type: "pass_bid" }>,
): ActionResult {
  const ctx = auctionCtx(state);
  const currentPriv = def.privates[ctx.privateIdx];
  if (!currentPriv) return { ok: false, error: "No private to pass on" };

  const player = getPlayer(state, action.playerId);
  const nextPlayerIdx = (ctx.playerIdx + 1) % ctx.order.length;
  const newPassCount = ctx.passCount + 1;

  let newState: GameState = log(state, `${player.name} passes on ${currentPriv.name}`, player.id);

  // All players passed → reduce price or force-give if at minimum
  if (newPassCount >= ctx.order.length) {
    const minPrice = Math.max(0, ctx.currentPrice - 5);
    if (minPrice <= 0) {
      // Give to the current player for free
      const forcedPlayer = getPlayer(newState, ctx.order[ctx.playerIdx]!);
      const updatedPlayer: PlayerState = {
        ...forcedPlayer,
        privates: [...forcedPlayer.privates, currentPriv.id],
      };
      newState = updatePlayer(newState, updatedPlayer);
      newState = {
        ...newState,
        privateCompanies: {
          ...newState.privateCompanies,
          [currentPriv.id]: { ownerId: forcedPlayer.id, revenue: currentPriv.revenue, closed: false },
        },
      };
      newState = log(newState, `${currentPriv.name} goes to ${forcedPlayer.name} for free`, undefined, "system");
      return { ok: true, state: advanceAuction(newState, def) };
    }

    // Reduce price by $5, reset pass count
    newState = {
      ...newState,
      turnContext: {
        ...ctx,
        currentPrice: minPrice,
        passCount: 0,
        playerIdx: ctx.playerIdx,
      } as AuctionContext,
    };
    newState = log(newState, `${currentPriv.name} price drops to $${minPrice}`, undefined, "system");
    return { ok: true, state: newState };
  }

  // Move to next player
  newState = {
    ...newState,
    currentPlayerId: ctx.order[nextPlayerIdx]!,
    turnContext: {
      ...ctx,
      playerIdx: nextPlayerIdx,
      passCount: newPassCount,
    } as AuctionContext,
  };
  newState = log(newState, `${player.name} passes on ${currentPriv.name}`, player.id);
  return { ok: true, state: newState };
}

function advanceAuction(state: GameState, def: GameDef): GameState {
  const ctx = auctionCtx(state);
  const nextPrivIdx = ctx.privateIdx + 1;

  if (nextPrivIdx >= def.privates.length) {
    // All privates sold — start first Stock Round
    return startStockRound(state, def);
  }

  const nextPriv = def.privates[nextPrivIdx]!;
  const nextCtx: AuctionContext = {
    type: "auction",
    order: ctx.order,
    playerIdx: ctx.playerIdx,
    privateIdx: nextPrivIdx,
    currentPrice: nextPriv.value,
    passCount: 0,
    bids: {},
  };

  let newState: GameState = {
    ...state,
    currentPlayerId: ctx.order[ctx.playerIdx]!,
    turnContext: nextCtx,
  };
  newState = log(newState, `${nextPriv.name} ($${nextPriv.value}) is now for sale`, undefined, "system");
  return newState;
}

// ─── STOCK ROUND ────────────────────────────────────────────────────────────

function startStockRound(state: GameState, def: GameDef): GameState {
  const playerOrder = state.players.map((p) => p.id);
  const ctx: StockContext = {
    type: "stock",
    playerOrder,
    consecutivePasses: 0,
    boughtThisTurn: [],
  };
  return log(
    { ...state, round: "stock", currentPlayerId: playerOrder[0]!, turnContext: ctx },
    `Stock Round ${state.roundNumber} begins`,
    undefined,
    "phase",
  );
}

function applyBuyShare(
  state: GameState,
  def: GameDef,
  action: Extract<GameAction, { type: "buy_share" }>,
): ActionResult {
  const ctx = stockCtx(state);
  const player = getPlayer(state, action.playerId);
  const companyDef = def.companies.find((c) => c.id === action.companyId);
  if (!companyDef) return { ok: false, error: "Company not found" };

  if (ctx.boughtThisTurn.includes(action.playerId)) {
    return { ok: false, error: "Already bought a share this turn" };
  }

  const isIPO = action.from === "ipo";
  const companyState = state.companies[action.companyId];

  // Buying president's cert (first purchase from IPO)
  const isPresidentBuy = isIPO && companyState?.status === "unstarted";
  const sharePercent = isPresidentBuy ? 20 : 10;

  const parValue = isPresidentBuy && action.parValue ? action.parValue : null;
  const existingPos = state.stockMarket[action.companyId];
  const stockPrice = parValue ?? (existingPos ? priceAt(def, existingPos) : 0);

  if (stockPrice === 0) return { ok: false, error: "Set a par value to start this company" };
  if (player.cash < stockPrice) return { ok: false, error: "Insufficient funds" };

  const certLimit = def.certLimit[state.players.length] ?? 99;
  const playerCerts = player.shares.filter((s) => s.companyId !== action.companyId).length
    + player.privates.length
    + (isPresidentBuy ? 1 : 1);
  if (playerCerts > certLimit) return { ok: false, error: "Certificate limit reached" };

  const newShare: Share = {
    companyId: action.companyId,
    percent: sharePercent,
    president: isPresidentBuy,
  };

  const updatedPlayer: PlayerState = {
    ...player,
    cash: player.cash - stockPrice,
    shares: [...player.shares, newShare],
  };

  let newState = updatePlayer(state, updatedPlayer);
  newState = { ...newState, bank: newState.bank + stockPrice };

  // Set par value on first purchase
  if (parValue && isPresidentBuy) {
    const parPos = findParPosition(def, parValue);
    if (parPos) {
      newState = { ...newState, stockMarket: { ...newState.stockMarket, [action.companyId]: parPos } };
    }
    const updated: CompanyState = { ...companyState!, status: "in_progress" };
    newState = updateCompany(newState, updated);
  }

  // Check float threshold
  newState = checkFloatCompany(newState, def, action.companyId);

  // Mark bought this turn
  const updatedCtx: StockContext = {
    ...ctx,
    consecutivePasses: 0,
    boughtThisTurn: [...ctx.boughtThisTurn, action.playerId],
  };
  newState = { ...newState, turnContext: updatedCtx };
  newState = log(
    newState,
    `${player.name} buys ${sharePercent}% of ${companyDef.name} for $${stockPrice}`,
    player.id,
  );

  return { ok: true, state: advanceStockTurn(newState, def) };
}

function checkFloatCompany(state: GameState, def: GameDef, companyId: string): GameState {
  const companyDef = def.companies.find((c) => c.id === companyId);
  const companyState = state.companies[companyId];
  if (!companyDef || !companyState || companyState.status === "floated") return state;

  const soldPercent = state.players
    .flatMap((p) => p.shares)
    .filter((s) => s.companyId === companyId)
    .reduce((sum, s) => sum + s.percent, 0);

  const floatThreshold = companyDef.floatPercent ?? def.floatPercent;
  if (soldPercent < floatThreshold) return state;

  const pos = state.stockMarket[companyId];
  const parValue = pos ? priceAt(def, pos) : 0;
  const treasuryCash = parValue * (soldPercent / 10);

  const updated: CompanyState = { ...companyState, status: "floated", cash: treasuryCash };
  let newState = updateCompany(state, updated);
  newState = { ...newState, bank: newState.bank - treasuryCash };
  return log(
    newState,
    `${companyDef.name} floats with $${treasuryCash} in treasury!`,
    undefined,
    "phase",
  );
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

  const pos = state.stockMarket[action.companyId] ?? { row: 0, col: 0 };
  const price = priceAt(def, pos);
  const proceeds = price * action.count;
  const sold = playerShares.slice(0, action.count);
  const remaining = player.shares.filter((s) => !sold.includes(s));

  const updatedPlayer: PlayerState = { ...player, cash: player.cash + proceeds, shares: remaining };
  let newState = updatePlayer(state, updatedPlayer);
  newState = { ...newState, bank: newState.bank - proceeds, bankPool: [...newState.bankPool, ...sold] };

  // Stock drops one left per share sold
  let stockPos = pos;
  for (let i = 0; i < action.count; i++) stockPos = moveStock(def, stockPos, "left");
  newState = { ...newState, stockMarket: { ...newState.stockMarket, [action.companyId]: stockPos } };

  // Selling breaks the consecutive-pass chain (like buying does)
  const stockCtxSell = stockCtx(newState);
  newState = { ...newState, turnContext: { ...stockCtxSell, consecutivePasses: 0 } };
  newState = log(newState, `${player.name} sells ${action.count}×10% of ${companyDef.name} for $${proceeds}`, player.id);
  return { ok: true, state: newState };
}

function applyPassStock(
  state: GameState,
  def: GameDef,
  action: Extract<GameAction, { type: "pass_stock" }>,
): ActionResult {
  const ctx = stockCtx(state);
  const player = getPlayer(state, action.playerId);
  const newPasses = ctx.consecutivePasses + 1;

  let newState: GameState = {
    ...state,
    turnContext: { ...ctx, consecutivePasses: newPasses } as StockContext,
  };
  newState = log(newState, `${player.name} passes`, player.id);

  // All players passed consecutively → end SR
  if (newPasses >= ctx.playerOrder.length) {
    return { ok: true, state: startOperatingRound(newState, def, 1) };
  }

  return { ok: true, state: advanceStockTurn(newState, def) };
}

function advanceStockTurn(state: GameState, def: GameDef): GameState {
  const ctx = stockCtx(state);
  const idx = ctx.playerOrder.indexOf(state.currentPlayerId);
  const nextIdx = (idx + 1) % ctx.playerOrder.length;
  const nextPlayer = ctx.playerOrder[nextIdx]!;

  // Reset boughtThisTurn for the new player's turn
  const updatedCtx: StockContext = { ...ctx, boughtThisTurn: [] };
  return { ...state, currentPlayerId: nextPlayer, turnContext: updatedCtx };
}

// ─── OPERATING ROUND ────────────────────────────────────────────────────────

function startOperatingRound(state: GameState, def: GameDef, orRound: number): GameState {
  // Sort floated companies by stock price descending
  const floated = Object.entries(state.companies)
    .filter(([, c]) => c.status === "floated")
    .map(([id]) => id)
    .sort((a, b) => {
      const pa = priceAt(def, state.stockMarket[a] ?? { row: 0, col: 0 });
      const pb = priceAt(def, state.stockMarket[b] ?? { row: 0, col: 0 });
      return pb - pa;
    });

  if (floated.length === 0) {
    // No companies floated yet — skip OR and start next SR (don't increment roundNumber)
    return log(
      startStockRound({ ...state }, def),
      "No floated companies — Operating Round skipped",
      undefined,
      "system",
    );
  }

  const ctx: OperatingContext = {
    type: "operating",
    companyOrder: floated,
    companyIdx: 0,
    companyActions: [],
    orRound,
  };

  const firstCompany = floated[0]!;
  const presidentId = presidentOf(state, firstCompany);

  return log(
    {
      ...state,
      round: "operating",
      currentPlayerId: presidentId ?? state.players[0]!.id,
      turnContext: ctx,
    },
    `Operating Round ${state.roundNumber}.${orRound} begins — ${firstCompany} operates first`,
    undefined,
    "phase",
  );
}

function presidentOf(state: GameState, companyId: string): PlayerId | undefined {
  for (const player of state.players) {
    if (player.shares.some((s) => s.companyId === companyId && s.president)) {
      return player.id;
    }
  }
  return undefined;
}

function applyLayTile(
  state: GameState,
  def: GameDef,
  action: Extract<GameAction, { type: "lay_tile" }>,
): ActionResult {
  const ctx = orCtx(state);
  const compId = currentCompanyId(state);
  if (compId !== action.companyId) return { ok: false, error: "Not your company's turn" };
  if (ctx.companyActions.includes("tile")) return { ok: false, error: "Already laid a tile this turn" };

  // Hex must exist on the map and not be an off-board destination
  const hexDef = def.map.find((h) => h.coord.q === action.coord.q && h.coord.r === action.coord.r);
  if (!hexDef) return { ok: false, error: "Hex is not on the board" };
  if (hexDef.offboard) return { ok: false, error: "Cannot place tiles on off-board hexes" };

  const key = hexKey(action.coord);
  const existing = state.map[key];

  // Inline (pre-printed) tiles cannot be overwritten — only standard tile upgrades allowed
  const isPrinted = !!hexDef.tile;
  const tile = def.tiles.find((t) => t.id === action.tileId);
  if (!tile) return { ok: false, error: "Tile not found in tile set" };

  const phase = def.phases.find((p) => p.id === state.phaseId);
  if (!phase?.tiles.includes(tile.color)) {
    return { ok: false, error: `Color ${tile.color} not available in phase ${state.phaseId}` };
  }

  if (existing) {
    if (isPrinted) return { ok: false, error: "Pre-printed city tiles cannot be replaced yet" };
    // Upgrade: new tile must be a higher color than the existing one
    const colorRank: Record<string, number> = { white: 0, yellow: 1, green: 2, brown: 3, gray: 4 };
    const existingTile = def.tiles.find((t) => t.id === existing.tileId);
    if (existingTile && (colorRank[tile.color] ?? 0) <= (colorRank[existingTile.color] ?? 0)) {
      return { ok: false, error: `Must upgrade to a higher-color tile (current: ${existingTile.color})` };
    }
  }

  // Tile must be adjacent to at least one already-placed tile (network connectivity)
  const adjacentToNetwork = ([0, 1, 2, 3, 4, 5] as const).some((dir) => {
    const n = hexNeighbor(action.coord, dir);
    return !!state.map[hexKey(n)];
  });
  if (!adjacentToNetwork) {
    return { ok: false, error: "Tile must be adjacent to existing track or a city" };
  }

  // Terrain surcharge: deducted from company treasury (mountain $120, water $80)
  const terrainCost = hexDef.terrain?.cost ?? 0;
  const company = state.companies[compId];
  if (!company) return { ok: false, error: "Company not found" };
  if (terrainCost > 0 && company.cash < terrainCost) {
    return {
      ok: false,
      error: `Need $${terrainCost} for ${hexDef.terrain!.type} terrain surcharge (company has $${company.cash})`,
    };
  }

  const newMap = {
    ...state.map,
    [key]: {
      tileId: action.tileId,
      rotation: (action.rotation % 6) as import("@18xx/shared").Direction,
      tokenSlots: tile.cities.flatMap((c) => Array((c as { slots?: number }).slots ?? 1).fill(null)) as null[],
    },
  };

  const updatedCtx: OperatingContext = { ...ctx, companyActions: [...ctx.companyActions, "tile"] };
  let newState: GameState = { ...state, map: newMap, turnContext: updatedCtx };
  if (terrainCost > 0) {
    newState = updateCompany(newState, { ...company, cash: company.cash - terrainCost });
  }
  newState = log(
    newState,
    `${compId} lays tile #${action.tileId} at (${action.coord.q},${action.coord.r}) rot.${action.rotation}${terrainCost > 0 ? ` ($${terrainCost} terrain)` : ""}`,
    state.currentPlayerId,
  );
  return { ok: true, state: newState };
}

function applyPlaceToken(
  state: GameState,
  def: GameDef,
  action: Extract<GameAction, { type: "place_token" }>,
): ActionResult {
  const ctx = orCtx(state);
  const compId = currentCompanyId(state);
  if (compId !== action.companyId) return { ok: false, error: "Not your company's turn" };
  if (ctx.companyActions.includes("token")) return { ok: false, error: "Already placed a token this turn" };

  const key = hexKey(action.coord);
  const placed = state.map[key];
  if (!placed) return { ok: false, error: "No tile at this location" };

  const company = state.companies[action.companyId];
  if (!company) return { ok: false, error: "Company not found" };

  const slots = [...placed.tokenSlots];
  if (slots[action.cityIndex] !== null) return { ok: false, error: "City slot already occupied" };
  slots[action.cityIndex] = action.companyId;

  const tokenIndex = company.tokens.filter(Boolean).length;
  const tokenCost = def.companies.find((c) => c.id === action.companyId)?.tokens[tokenIndex] ?? 0;
  if (company.cash < tokenCost) return { ok: false, error: `Need $${tokenCost} for token` };

  const updatedCompany: CompanyState = {
    ...company,
    cash: company.cash - tokenCost,
    tokens: [...company.tokens, true],
  };
  const updatedCtx: OperatingContext = { ...ctx, companyActions: [...ctx.companyActions, "token"] };

  let newState: GameState = {
    ...state,
    map: { ...state.map, [key]: { ...placed, tokenSlots: slots } },
    turnContext: updatedCtx,
  };
  newState = updateCompany(newState, updatedCompany);
  newState = log(newState, `${compId} places a token at (${action.coord.q},${action.coord.r}) for $${tokenCost}`, state.currentPlayerId);
  return { ok: true, state: newState };
}

function applyBuyTrain(
  state: GameState,
  def: GameDef,
  action: Extract<GameAction, { type: "buy_train" }>,
): ActionResult {
  const compId = currentCompanyId(state);
  if (compId !== action.companyId) return { ok: false, error: "Not your company's turn" };

  const company = state.companies[action.companyId];
  if (!company) return { ok: false, error: "Company not found" };

  const trainDef = def.trains.find((t) => t.id === action.trainTypeId);
  if (!trainDef) return { ok: false, error: "Train not found" };

  const available = state.trainBank[action.trainTypeId] ?? 0;
  if (available <= 0) return { ok: false, error: "No trains of this type available" };

  const phase = def.phases.find((p) => p.id === state.phaseId);
  const trainLimit = phase?.trainLimit ?? 4;
  if (company.trains.length >= trainLimit) return { ok: false, error: "Train limit reached" };

  const price = action.price ?? trainDef.price;
  if (company.cash < price) return { ok: false, error: `Need $${price} (company has $${company.cash})` };

  const updatedCompany: CompanyState = {
    ...company,
    cash: company.cash - price,
    trains: [...company.trains, action.trainTypeId],
  };
  const ctx = orCtx(state);
  const updatedCtx: OperatingContext = {
    ...ctx,
    companyActions: ctx.companyActions.includes("trains") ? ctx.companyActions : [...ctx.companyActions, "trains"],
  };

  let newState = updateCompany(state, updatedCompany);
  newState = {
    ...newState,
    bank: newState.bank + price,
    trainBank: { ...newState.trainBank, [action.trainTypeId]: available - 1 },
    turnContext: updatedCtx,
  };
  newState = checkPhaseTransition(newState, def, action.trainTypeId);
  newState = rustObsoleteTrains(newState, def);
  newState = log(newState, `${compId} buys a ${trainDef.name} train for $${price}`, state.currentPlayerId);
  return { ok: true, state: newState };
}

function applyRunRoutes(
  state: GameState,
  def: GameDef,
  action: Extract<GameAction, { type: "run_routes" }>,
): ActionResult {
  const compId = currentCompanyId(state);
  if (compId !== action.companyId) return { ok: false, error: "Not your company's turn" };

  const company = state.companies[action.companyId];
  const companyDef = def.companies.find((c) => c.id === action.companyId);
  if (!company || !companyDef) return { ok: false, error: "Company not found" };

  const revenue = totalRevenue(action.routes);
  const totalShares = companyDef.shares.reduce((s, p) => s + p, 0) / 10;
  const perShare = revenue > 0 ? Math.floor(revenue / totalShares) : 0;

  let newState = state;

  if (action.dividend === "pay") {
    for (const player of state.players) {
      const owned = player.shares.filter((s) => s.companyId === action.companyId).length;
      if (owned > 0) {
        const div = perShare * owned;
        newState = updatePlayer(newState, { ...getPlayer(newState, player.id), cash: player.cash + div });
      }
    }
    const poolShares = state.bankPool.filter((s) => s.companyId === action.companyId).length;
    newState = { ...newState, bank: newState.bank + poolShares * perShare };

    const pos = newState.stockMarket[action.companyId];
    if (pos) newState = { ...newState, stockMarket: { ...newState.stockMarket, [action.companyId]: moveStock(def, pos, "right") } };
    newState = log(newState, `${compId} pays $${perShare}/share dividend (revenue $${revenue})`, state.currentPlayerId);
  } else if (action.dividend === "withhold") {
    newState = updateCompany(newState, { ...company, cash: company.cash + revenue });
    const pos = newState.stockMarket[action.companyId];
    if (pos) newState = { ...newState, stockMarket: { ...newState.stockMarket, [action.companyId]: moveStock(def, pos, "left") } };
    newState = log(newState, `${compId} withholds $${revenue}`, state.currentPlayerId);
  } else {
    // Half dividend
    const half = Math.floor(revenue / 2);
    const halfPerShare = Math.floor(half / totalShares);
    for (const player of state.players) {
      const owned = player.shares.filter((s) => s.companyId === action.companyId).length;
      if (owned > 0) newState = updatePlayer(newState, { ...getPlayer(newState, player.id), cash: player.cash + halfPerShare * owned });
    }
    newState = updateCompany(newState, { ...company, cash: company.cash + half });
    newState = log(newState, `${compId} pays half dividend $${halfPerShare}/share`, state.currentPlayerId);
  }

  const updatedCtx: OperatingContext = {
    ...orCtx(newState),
    companyActions: [...orCtx(newState).companyActions.filter((a): a is ORAction => a !== "routes"), "routes"],
  };
  newState = {
    ...newState,
    companies: {
      ...newState.companies,
      [action.companyId]: { ...newState.companies[action.companyId]!, revenue: [...(newState.companies[action.companyId]?.revenue ?? []), revenue] },
    },
    turnContext: updatedCtx,
  };

  return { ok: true, state: newState };
}

function applyPassOperate(
  state: GameState,
  def: GameDef,
  action: Extract<GameAction, { type: "pass_operate" }>,
): ActionResult {
  const ctx = orCtx(state);
  const compId = currentCompanyId(state);
  if (compId !== action.companyId) return { ok: false, error: "Not your company's turn" };

  const nextIdx = ctx.companyIdx + 1;

  // Check if all companies have operated
  if (nextIdx >= ctx.companyOrder.length) {
    return { ok: true, state: endOperatingRound(state, def, ctx) };
  }

  // Next company operates
  const nextCompanyId = ctx.companyOrder[nextIdx]!;
  const nextPresidentId = presidentOf(state, nextCompanyId) ?? state.players[0]!.id;
  const updatedCtx: OperatingContext = { ...ctx, companyIdx: nextIdx, companyActions: [] };

  let newState: GameState = {
    ...state,
    currentPlayerId: nextPresidentId,
    turnContext: updatedCtx,
  };
  newState = log(newState, `${nextCompanyId} now operates`, undefined, "system");
  return { ok: true, state: newState };
}

function endOperatingRound(state: GameState, def: GameDef, ctx: OperatingContext): GameState {
  const phase = def.phases.find((p) => p.id === state.phaseId);
  const totalORs = phase?.operatingRounds ?? 1;

  // Pay private company revenues
  let newState = payPrivateRevenues(state, def);

  if (ctx.orRound < totalORs) {
    // More OR sub-rounds in this game round
    return startOperatingRound(newState, def, ctx.orRound + 1);
  }

  // All ORs done → start new Stock Round
  newState = checkGameEnd(newState, def);
  if (newState.status === "finished") return newState;

  return startStockRound({ ...newState, roundNumber: state.roundNumber + 1 }, def);
}

function payPrivateRevenues(state: GameState, def: GameDef): GameState {
  let newState = state;
  for (const [privId, ownership] of Object.entries(state.privateCompanies)) {
    if (ownership.closed || ownership.ownerId === "bank") continue;
    const player = state.players.find((p) => p.id === ownership.ownerId);
    if (!player) continue;
    newState = updatePlayer(newState, { ...player, cash: player.cash + ownership.revenue });
    newState = { ...newState, bank: newState.bank - ownership.revenue };
    const privDef = def.privates.find((p) => p.id === privId);
    if (privDef) {
      newState = log(newState, `${player.name} receives $${ownership.revenue} from ${privDef.name}`, undefined, "system");
    }
  }
  return newState;
}

// ─── PHASE TRANSITIONS ──────────────────────────────────────────────────────

function checkPhaseTransition(state: GameState, def: GameDef, purchasedTrainId: string): GameState {
  for (let i = 0; i < def.phases.length; i++) {
    const phase = def.phases[i]!;
    if (phase.id === state.phaseId && phase.triggers?.includes(purchasedTrainId)) {
      const next = def.phases[i + 1];
      if (next) {
        return log(
          { ...state, phaseId: next.id },
          `Phase ${next.name} begins!`,
          undefined,
          "phase",
        );
      }
    }
  }
  return state;
}

function rustObsoleteTrains(state: GameState, def: GameDef): GameState {
  const phaseIdx = def.phases.findIndex((p) => p.id === state.phaseId);
  let newState = state;

  for (const [companyId, company] of Object.entries(state.companies)) {
    const rusted = company.trains.filter((trainId) => {
      const t = def.trains.find((d) => d.id === trainId);
      if (!t?.rusts) return false;
      const rustTriggerPhaseIdx = def.phases.findIndex((p) => p.triggers?.includes(t.rusts!));
      return rustTriggerPhaseIdx !== -1 && rustTriggerPhaseIdx <= phaseIdx;
    });
    if (rusted.length > 0) {
      newState = updateCompany(newState, { ...company, trains: company.trains.filter((t) => !rusted.includes(t)) });
      newState = log(newState, `${companyId}: ${rusted.join(", ")} train(s) rusted`, undefined, "system");
    }
  }
  return newState;
}

// ─── MAIN DISPATCH ──────────────────────────────────────────────────────────

export function applyAction(state: GameState, def: GameDef, action: GameAction): ActionResult {
  if (state.status === "finished") return { ok: false, error: "Game is over" };

  try {
    switch (action.type) {
      case "bid":         return applyBid(state, def, action);
      case "pass_bid":    return applyPassBid(state, def, action);
      case "buy_share":   return applyBuyShare(state, def, action);
      case "sell_shares": return applySellShares(state, def, action);
      case "pass_stock":  return applyPassStock(state, def, action);
      case "lay_tile":    return applyLayTile(state, def, action);
      case "place_token": return applyPlaceToken(state, def, action);
      case "buy_train":   return applyBuyTrain(state, def, action);
      case "run_routes":  return applyRunRoutes(state, def, action);
      case "pass_operate":return applyPassOperate(state, def, action);
      default:            return { ok: false, error: "Unknown action type" };
    }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/** Create the initial game state */
export function createInitialState(
  def: GameDef,
  players: readonly { id: PlayerId; name: string }[],
): GameState {
  const startCash = def.startingCash[players.length] ?? 0;

  const playerStates: PlayerState[] = players.map((p) => ({
    id: p.id,
    name: p.name,
    cash: startCash,
    shares: [],
    privates: [],
  }));

  const companies: Record<string, CompanyState> = {};
  for (const c of def.companies) {
    companies[c.id] = { id: c.id, status: "unstarted", cash: 0, trains: [], tokens: [], revenue: [] };
  }

  const trainBank: Record<string, number> = {};
  for (const t of def.trains) trainBank[t.id] = t.available;

  const privateCompanies: Record<string, PrivateOwnership> = {};
  for (const p of def.privates) {
    privateCompanies[p.id] = { ownerId: "bank", revenue: p.revenue, closed: false };
  }

  const firstPriv = def.privates[0]!;
  const ctx: AuctionContext = {
    type: "auction",
    order: playerStates.map((p) => p.id),
    playerIdx: 0,
    privateIdx: 0,
    currentPrice: firstPriv.value,
    passCount: 0,
    bids: {},
  };

  // Pre-populate the map with all pre-printed tiles (inline city/town tiles on specific hexes).
  // Without this, the route calculator and tile validator can't see the starting cities.
  const initialMap: Record<string, import("@18xx/shared").PlacedTile> = {};
  for (const hexDef of def.map) {
    if (hexDef.tile && !hexDef.offboard) {
      const k = hexKey(hexDef.coord);
      initialMap[k] = {
        tileId: hexDef.tile.id,
        rotation: 0 as import("@18xx/shared").Direction,
        tokenSlots: hexDef.tile.cities.flatMap((c: { slots?: number }) =>
          Array(c.slots ?? 1).fill(null)
        ) as null[],
      };
    }
  }

  return {
    id: `game-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    gameDefId: def.id,
    players: playerStates,
    bank: def.bankCash,
    currentPlayerId: playerStates[0]!.id,
    round: "auction",
    roundNumber: 1,
    phaseId: def.phases[0]!.id,
    turnContext: ctx,
    map: initialMap,
    companies,
    privateCompanies,
    stockMarket: {},
    bankPool: [],
    trainBank,
    log: [
      { timestamp: Date.now(), message: `Game started: ${def.name} (${players.length} players)`, type: "system" },
      { timestamp: Date.now(), message: `${firstPriv.name} ($${firstPriv.value}) is up for auction`, type: "system" },
    ],
    status: "active",
    actionsHistory: [],
  };
}

/** Get the list of legal actions for the current player/company */
export function getLegalActions(state: GameState, def: GameDef): string[] {
  const ctx = state.turnContext;

  if (ctx.type === "auction") {
    const priv = def.privates[ctx.privateIdx];
    if (!priv) return [];
    return [`buy_private_${priv.id}_at_${ctx.currentPrice}`, `pass_bid`];
  }

  if (ctx.type === "stock") {
    const actions: string[] = ["pass_stock", "sell_shares"];
    if (!ctx.boughtThisTurn.includes(state.currentPlayerId)) {
      actions.push("buy_share_ipo", "buy_share_pool");
    }
    return actions;
  }

  if (ctx.type === "operating") {
    const actions: string[] = ["pass_operate"];
    if (!ctx.companyActions.includes("tile")) actions.push("lay_tile");
    if (!ctx.companyActions.includes("token")) actions.push("place_token");
    if (!ctx.companyActions.includes("routes")) actions.push("buy_train", "run_routes");
    return actions;
  }

  return [];
}
