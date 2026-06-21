/**
 * AI player entry point — supports multiple bot personalities.
 *
 *  balanced    – Full MCTS (1500 iterations). Best overall strategy.
 *  aggressive  – Heuristic: always bids on privates, high par values, buys trains ASAP.
 *  conservative– Heuristic: passes in auctions often, low par, withholds frequently.
 *  random      – Uniform random from legal moves (baseline for comparison).
 *
 * Comparing personalities in spectator mode reveals which strategies win in 1830.
 * The "balanced" MCTS is the current gold standard; others are intentional foils.
 */

import type { GameState, GameDef, GameAction, AuctionContext, StockContext, OperatingContext } from "@18xx/shared";
import { mctsGetAction } from "./mcts.js";
import { getLegalMoves } from "./legal-moves.js";
import { priceAt } from "./stock-market.js";
import { calculateOptimalRoutes } from "./route-calculator.js";
import { hexKey, hexNeighbor } from "./hex-grid.js";

export type BotPersonality = "balanced" | "aggressive" | "conservative" | "random";

export { mctsGetAction };

export function getAIAction(
  state: GameState,
  def: GameDef,
  botPlayerId: string,
  iterations = 1500,
  personality: BotPersonality = "balanced",
): GameAction | null {
  if (state.status !== "active") return null;
  if (state.currentPlayerId !== botPlayerId) return null;

  if (personality === "random") {
    const moves = getLegalMoves(state, def);
    return moves.length > 0 ? (moves[Math.floor(Math.random() * moves.length)] ?? null) : null;
  }

  if (personality === "aggressive") {
    const ctx = state.turnContext;
    if (ctx.type === "auction")    return aggAuction(state, def, botPlayerId, ctx);
    if (ctx.type === "stock")      return aggStock(state, def, botPlayerId, ctx);
    if (ctx.type === "operating")  return aggOperate(state, def, ctx);
    return null;
  }

  if (personality === "conservative") {
    const ctx = state.turnContext;
    if (ctx.type === "auction")    return conAuction(state, def, botPlayerId, ctx);
    if (ctx.type === "stock")      return conStock(state, def, botPlayerId, ctx);
    if (ctx.type === "operating")  return conOperate(state, def, ctx);
    return null;
  }

  // balanced: use heuristics for OR tile/token (MCTS only sees 1 tile at rot.0 due to branching cap)
  // MCTS handles auction, stock, train purchase, and route decisions.
  {
    const ctx = state.turnContext;
    if (ctx.type === "operating") {
      const opCtx = ctx as OperatingContext;
      const done = new Set(opCtx.companyActions);
      const companyId = opCtx.companyOrder[opCtx.companyIdx] ?? "";
      const company = state.companies[companyId];
      if (company) {
        if (!done.has("token") && company.tokens.length === 0) {
          const tok = placeHomeToken(state, def, companyId);
          if (tok) return tok;
        }
        if (!done.has("tile")) {
          const tile = findTileLay(state, def, companyId);
          if (tile) return tile;
        }
      }
    }
  }

  // Full MCTS capped at 800ms so it never blocks the server event loop
  const mcts = mctsGetAction(state, def, botPlayerId, iterations, 800);
  if (mcts) return mcts;

  // Heuristic fallback if MCTS returns null
  const ctx = state.turnContext;
  if (ctx.type === "auction")    return aggAuction(state, def, botPlayerId, ctx);
  if (ctx.type === "stock")      return aggStock(state, def, botPlayerId, ctx);
  if (ctx.type === "operating")  return aggOperate(state, def, ctx);
  return null;
}

// ─── Aggressive: always buy, high par, buy trains ASAP ───────────────────────

function aggAuction(state: GameState, _def: GameDef, botId: string, ctx: AuctionContext): GameAction {
  const player = state.players.find((p) => p.id === botId)!;
  // Buy everything if we can afford it (no reserve requirement)
  const priv = _def.privates[ctx.privateIdx];
  if (priv && player.cash >= ctx.currentPrice) {
    return { type: "bid", playerId: botId, privateId: priv.id, amount: ctx.currentPrice };
  }
  return { type: "pass_bid", playerId: botId };
}

function aggStock(state: GameState, def: GameDef, botId: string, ctx: StockContext): GameAction {
  const player = state.players.find((p) => p.id === botId)!;
  if (ctx.boughtThisTurn.includes(botId)) return { type: "pass_stock", playerId: botId };

  // Prefer expensive par values (high confidence, high capital)
  for (const company of def.companies) {
    const cs = state.companies[company.id];
    if (cs?.status !== "unstarted") continue;
    for (const par of [100, 90, 82, 76, 71, 67] as const) {
      if (player.cash >= par * 2) {
        return { type: "buy_share", playerId: botId, companyId: company.id, from: "ipo", parValue: par };
      }
    }
  }

  // Buy any affordable share
  const candidates = def.companies
    .filter((c) => { const cs = state.companies[c.id]; return cs && (cs.status === "in_progress" || cs.status === "floated"); })
    .map((c) => ({ id: c.id, price: state.stockMarket[c.id] ? priceAt(def, state.stockMarket[c.id]!) : 0 }))
    .filter((c) => player.cash >= c.price && c.price > 0)
    .sort((a, b) => b.price - a.price); // prefer expensive shares
  if (candidates[0]) return { type: "buy_share", playerId: botId, companyId: candidates[0].id, from: "ipo" };

  return { type: "pass_stock", playerId: botId };
}

function placeHomeToken(state: GameState, def: GameDef, companyId: string): GameAction | null {
  const companyDef = def.companies.find((c) => c.id === companyId);
  if (!companyDef || companyDef.coordinates.length < 2) return null;
  const q = companyDef.coordinates[0]!;
  const r = companyDef.coordinates[1]!;
  if (!state.map[`${q},${r}`]) return null; // home hex has no tile yet — can't place
  return { type: "place_token", companyId, coord: { q, r }, cityIndex: companyDef.city ?? 0 };
}

function aggOperate(state: GameState, def: GameDef, ctx: OperatingContext): GameAction {
  const companyId = ctx.companyOrder[ctx.companyIdx] ?? "";
  const company = state.companies[companyId];
  if (!company) return { type: "pass_operate", companyId };

  const done = new Set(ctx.companyActions);

  // Place home token if not yet placed (free on first OR turn)
  if (!done.has("token") && company.tokens.length === 0) {
    const tok = placeHomeToken(state, def, companyId);
    if (tok) return tok;
  }

  // Tile first
  if (!done.has("tile")) {
    const tile = findTileLay(state, def, companyId);
    if (tile) return tile;
  }

  // Buy the most expensive affordable train (aggressive upgrade strategy)
  if (!done.has("trains")) {
    const train = def.trains
      .filter((t) => (state.trainBank[t.id] ?? 0) > 0 && company.cash >= t.price)
      .sort((a, b) => b.price - a.price)[0]; // most expensive first
    if (train) return { type: "buy_train", companyId, trainTypeId: train.id, from: "bank" };
  }

  // Run routes, always pay
  if (!done.has("routes") && company.trains.length > 0) {
    const routes = calculateOptimalRoutes(state, def, companyId);
    const revenue = routes.reduce((s, r) => s + r.revenue, 0);
    return { type: "run_routes", companyId, routes, dividend: revenue > 0 ? "pay" : "withhold" };
  }

  return { type: "pass_operate", companyId };
}

// ─── Conservative: save cash, low par, withhold often ────────────────────────

function conAuction(state: GameState, def: GameDef, botId: string, ctx: AuctionContext): GameAction {
  const player = state.players.find((p) => p.id === botId)!;
  const priv = def.privates[ctx.privateIdx];
  if (!priv || player.cash < ctx.currentPrice) return { type: "pass_bid", playerId: botId };

  const cashAfter = player.cash - ctx.currentPrice;
  const ratio = priv.revenue / ctx.currentPrice;

  // Deadlock prevention: if we're the only one who can afford this private, just buy it
  const canAfford = player.cash >= ctx.currentPrice;
  const othersCanAfford = state.players.some((p) => p.id !== botId && p.cash >= ctx.currentPrice);
  if (canAfford && !othersCanAfford) {
    return { type: "bid", playerId: botId, privateId: priv.id, amount: ctx.currentPrice };
  }

  // Normal conservative logic: buy if good value and keep $100 reserve
  if (cashAfter >= 100 && ratio >= 0.12) {
    return { type: "bid", playerId: botId, privateId: priv.id, amount: ctx.currentPrice };
  }

  return { type: "pass_bid", playerId: botId };
}

function conStock(state: GameState, def: GameDef, botId: string, ctx: StockContext): GameAction {
  const player = state.players.find((p) => p.id === botId)!;
  if (ctx.boughtThisTurn.includes(botId)) return { type: "pass_stock", playerId: botId };

  // Check if any company is already started — if not, we MUST start one to avoid deadlock
  const anyStarted = Object.values(state.companies).some(
    (c) => c.status === "in_progress" || c.status === "floated"
  );
  // Without any company, use a $50 buffer; otherwise keep $150 for future purchases
  const buffer = anyStarted ? 150 : 50;

  for (const company of def.companies) {
    const cs = state.companies[company.id];
    if (cs?.status !== "unstarted") continue;
    for (const par of [67, 71, 76, 82, 90, 100] as const) {
      if (player.cash >= par * 2 + buffer) {
        return { type: "buy_share", playerId: botId, companyId: company.id, from: "ipo", parValue: par };
      }
    }
  }

  // Also consider buying a share of an already-started company if cheap enough
  const candidates = def.companies
    .filter((c) => { const cs = state.companies[c.id]; return cs?.status === "in_progress" || cs?.status === "floated"; })
    .map((c) => ({ id: c.id, price: state.stockMarket[c.id] ? priceAt(def, state.stockMarket[c.id]!) : 0 }))
    .filter((c) => player.cash >= c.price + buffer && c.price > 0)
    .sort((a, b) => a.price - b.price); // prefer cheapest
  if (candidates[0]) return { type: "buy_share", playerId: botId, companyId: candidates[0].id, from: "ipo" };

  return { type: "pass_stock", playerId: botId };
}

function conOperate(state: GameState, def: GameDef, ctx: OperatingContext): GameAction {
  const companyId = ctx.companyOrder[ctx.companyIdx] ?? "";
  const company = state.companies[companyId];
  if (!company) return { type: "pass_operate", companyId };

  const done = new Set(ctx.companyActions);

  // Place home token if not yet placed (free on first OR turn)
  if (!done.has("token") && company.tokens.length === 0) {
    const tok = placeHomeToken(state, def, companyId);
    if (tok) return tok;
  }

  // Tile first
  if (!done.has("tile")) {
    const tile = findTileLay(state, def, companyId);
    if (tile) return tile;
  }

  // Only buy the cheapest train, and only if company has plenty of cash
  if (!done.has("trains") && company.trains.length === 0) {
    const train = def.trains
      .filter((t) => (state.trainBank[t.id] ?? 0) > 0 && company.cash >= t.price + 100) // keep $100 buffer
      .sort((a, b) => a.price - b.price)[0];
    if (train) return { type: "buy_train", companyId, trainTypeId: train.id, from: "bank" };
  }

  // Run routes — prefer to withhold and grow treasury
  if (!done.has("routes") && company.trains.length > 0) {
    const routes = calculateOptimalRoutes(state, def, companyId);
    const revenue = routes.reduce((s, r) => s + r.revenue, 0);
    // Withhold if company cash < $100 or revenue is small
    const shouldPay = revenue > 0 && company.cash >= 100;
    return { type: "run_routes", companyId, routes, dividend: shouldPay ? "pay" : "withhold" };
  }

  return { type: "pass_operate", companyId };
}

// ─── Shared utility ───────────────────────────────────────────────────────────

/**
 * Heuristic tile placement.
 * getLegalMoves() deliberately caps options (1 tile, rotation 0) for MCTS tractability.
 * Here we enumerate all (empty hex, tile, rotation) combos and pick the best by connectivity.
 */
function findTileLay(state: GameState, def: GameDef, companyId: string): GameAction | null {
  const phase = def.phases.find((p) => p.id === state.phaseId);
  const allowedColors = new Set(phase?.tiles ?? ["yellow"]);

  // Track tiles only (no pre-placed city/offboard tiles)
  const trackTiles = def.tiles.filter((t) => allowedColors.has(t.color) && t.cities.length === 0);
  if (trackTiles.length === 0) return null;

  // Pre-build lookups for O(1) access
  const hexDefByKey = new Map(def.map.map((h) => [hexKey(h.coord), h]));
  const tileById = new Map(def.tiles.map((t) => [t.id, t]));
  const companyCash = state.companies[companyId]?.cash ?? 0;

  // Hexes where this company already has tokens — bias tile placement toward them
  const companyTokenHexes = new Set<string>();
  for (const [key, tile] of Object.entries(state.map)) {
    if (tile?.tokenSlots.includes(companyId)) companyTokenHexes.add(key);
  }
  // Always include the home city hex so we build outward from it even before token is placed
  const compDef = def.companies.find((c) => c.id === companyId);
  if (compDef && compDef.coordinates.length >= 2) {
    companyTokenHexes.add(`${compDef.coordinates[0]},${compDef.coordinates[1]}`);
  }

  let bestScore = -1;
  let bestCoord = { q: 0, r: 0 };
  let bestTileId = trackTiles[0]!.id;
  let bestRot = 0;

  const seenCoords = new Set<string>();

  for (const key of Object.keys(state.map)) {
    const comma = key.indexOf(",");
    const q = Number(key.slice(0, comma)), r = Number(key.slice(comma + 1));

    for (let dir = 0; dir < 6; dir++) {
      const nb = hexNeighbor({ q, r }, dir as 0);
      const nk = hexKey(nb);
      if (state.map[nk] || seenCoords.has(nk)) continue;
      const hexDef = hexDefByKey.get(nk);
      // Skip: off-board, pre-placed city tile, outside map, or terrain too expensive
      if (!hexDef || hexDef.offboard || hexDef.tile) continue;
      if ((hexDef.terrain?.cost ?? 0) > companyCash) continue;
      seenCoords.add(nk);

      // Home-city proximity bonus: candidate hex adjacent to a company token/home hex
      let homeBonus = 0;
      for (const tokenKey of companyTokenHexes) {
        const tc = tokenKey.indexOf(",");
        const tq = Number(tokenKey.slice(0, tc)), tr = Number(tokenKey.slice(tc + 1));
        for (let d = 0; d < 6; d++) {
          const nbn = hexNeighbor({ q: tq, r: tr }, d as 0);
          if (hexKey(nbn) === nk) { homeBonus = 5; break; }
        }
        if (homeBonus) break;
      }

      for (const tile of trackTiles) {
        for (let rot = 0; rot < 6; rot++) {
          let s = homeBonus; // start with home-city bias

          for (const path of tile.paths) {
            for (const end of [path.from, path.to] as number[]) {
              const exitDir = (end + rot) % 6;
              const exit = hexNeighbor(nb, exitDir as 0);
              const ek = hexKey(exit);

              // Connects to an existing placed tile
              const placed = state.map[ek];
              if (placed) {
                s += 4;
                // Bidirectional link — the neighbour also has a path pointing back
                const placedTile = tileById.get(placed.tileId);
                const incoming = (exitDir + 3) % 6;
                if (placedTile?.paths.some(
                  (p) => (p.from + placed.rotation) % 6 === incoming || (p.to + placed.rotation) % 6 === incoming
                )) s += 3;
              }

              // Points toward a city hex on the map
              const exitHex = hexDefByKey.get(ek);
              if (exitHex && !exitHex.offboard && (exitHex.tile?.cities.length ?? 0) > 0) s += 2;
            }
          }

          s += tile.paths.length;      // Y-junctions > straights
          s += tile.towns.length * 2;  // towns generate revenue

          if (s > bestScore) {
            bestScore = s;
            bestCoord = nb;
            bestTileId = tile.id;
            bestRot = rot;
          }
        }
      }
    }
  }

  if (bestScore < 0) return null;
  return { type: "lay_tile", companyId, coord: bestCoord, tileId: bestTileId, rotation: bestRot };
}
