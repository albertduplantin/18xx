/**
 * AI player module — heuristic-based bot for 18xx games.
 *
 * Strategy overview:
 * - Auction: always buy at face value, pass if can't afford
 * - Stock round: buy cheapest available president cert if possible, otherwise pass
 * - Operating round: lay a tile on an adjacent hex, buy a train if needed, run routes optimally
 *
 * This is intentionally simple — a reasonable opponent for solo play.
 * A competitive AI would require Monte Carlo tree search or RL, which is out of scope here.
 */

import type { GameState, GameDef, GameAction, AuctionContext, StockContext, OperatingContext } from "@18xx/shared";
import { priceAt } from "./stock-market.js";
import { calculateOptimalRoutes } from "./route-calculator.js";
import { hexKey, hexNeighbor } from "./hex-grid.js";

export function getAIAction(state: GameState, def: GameDef, botPlayerId: string): GameAction | null {
  if (state.status === "finished") return null;
  if (state.currentPlayerId !== botPlayerId) return null;

  const ctx = state.turnContext;

  if (ctx.type === "auction") return aiAuction(state, def, botPlayerId, ctx);
  if (ctx.type === "stock")   return aiStock(state, def, botPlayerId, ctx);
  if (ctx.type === "operating") return aiOperate(state, def, botPlayerId, ctx);

  return null;
}

// ─── AUCTION ────────────────────────────────────────────────────────────────

function aiAuction(state: GameState, def: GameDef, botId: string, ctx: AuctionContext): GameAction {
  const priv = def.privates[ctx.privateIdx];
  if (!priv) return { type: "pass_bid", playerId: botId };

  const bot = state.players.find((p) => p.id === botId)!;
  // Buy at face value if affordable and the private is cheap relative to its revenue
  const revenueRatio = priv.revenue / ctx.currentPrice;
  if (bot.cash >= ctx.currentPrice && (revenueRatio >= 0.12 || ctx.currentPrice <= priv.value * 0.6)) {
    return { type: "bid", playerId: botId, privateId: priv.id, amount: ctx.currentPrice };
  }
  return { type: "pass_bid", playerId: botId };
}

// ─── STOCK ROUND ────────────────────────────────────────────────────────────

function aiStock(state: GameState, def: GameDef, botId: string, ctx: StockContext): GameAction {
  const bot = state.players.find((p) => p.id === botId)!;
  const alreadyBought = ctx.boughtThisTurn.includes(botId);

  // Sell shares in companies with falling prices (stock went left twice recently) — simplified: never sell unless broke
  // This is intentionally simple; a real bot would have more sophisticated portfolio management

  if (!alreadyBought) {
    // 1. Try to start a company (buy president's cert) if we have enough cash
    for (const company of def.companies) {
      const compState = state.companies[company.id];
      if (compState?.status !== "unstarted") continue;

      // Pick lowest par value we can afford (conservative strategy)
      const parValues = [67, 71, 76, 82, 90, 100] as const;
      for (const par of parValues) {
        const cost = par * 2; // 20% president cert
        if (bot.cash >= cost) {
          return { type: "buy_share", playerId: botId, companyId: company.id, from: "ipo", parValue: par };
        }
      }
    }

    // 2. Buy a 10% share in the cheapest started company we don't already control
    const candidates = def.companies
      .filter((c) => {
        const cs = state.companies[c.id];
        return cs && (cs.status === "in_progress" || cs.status === "floated");
      })
      .map((c) => {
        const pos = state.stockMarket[c.id];
        const price = pos ? priceAt(def, pos) : 0;
        return { id: c.id, price };
      })
      .filter((c) => bot.cash >= c.price && c.price > 0)
      .sort((a, b) => a.price - b.price);

    if (candidates.length > 0 && candidates[0]) {
      return { type: "buy_share", playerId: botId, companyId: candidates[0].id, from: "ipo" };
    }
  }

  return { type: "pass_stock", playerId: botId };
}

// ─── OPERATING ROUND ────────────────────────────────────────────────────────

function aiOperate(state: GameState, def: GameDef, botId: string, ctx: OperatingContext): GameAction {
  const companyId = ctx.companyOrder[ctx.companyIdx] ?? "";
  const company = state.companies[companyId];
  if (!company) return { type: "pass_operate", companyId };

  // 1. Buy a train if we have none
  if (company.trains.length === 0 && !ctx.companyActions.includes("trains")) {
    const cheapestTrain = def.trains
      .filter((t) => (state.trainBank[t.id] ?? 0) > 0 && company.cash >= t.price)
      .sort((a, b) => a.price - b.price)[0];
    if (cheapestTrain) {
      return { type: "buy_train", companyId, trainTypeId: cheapestTrain.id, from: "bank" };
    }
    // Can't afford — withhold with no routes
    if (!ctx.companyActions.includes("routes")) {
      return { type: "run_routes", companyId, routes: [], dividend: "withhold" };
    }
    return { type: "pass_operate", companyId };
  }

  // 2. Lay a tile (if not done)
  if (!ctx.companyActions.includes("tile")) {
    const tile = findBestTileLay(state, def, companyId);
    if (tile) return tile;
  }

  // 3. Run routes and pay dividends
  if (!ctx.companyActions.includes("routes") && company.trains.length > 0) {
    const routes = calculateOptimalRoutes(state, def, companyId);
    const revenue = routes.reduce((s, r) => s + r.revenue, 0);
    // Pay dividends if revenue is positive, withhold if 0
    return { type: "run_routes", companyId, routes, dividend: revenue > 0 ? "pay" : "withhold" };
  }

  return { type: "pass_operate", companyId };
}

function findBestTileLay(state: GameState, def: GameDef, companyId: string): GameAction | null {
  // Find hexes adjacent to existing company network that are blank
  const companyTokens = Object.entries(state.map)
    .filter(([, placed]) => placed.tokenSlots.includes(companyId))
    .map(([key]) => {
      const [q, r] = key.split(",").map(Number);
      return { q: q ?? 0, r: r ?? 0 };
    });

  const phase = def.phases.find((p) => p.id === state.phaseId);
  const availableColors = phase?.tiles ?? ["yellow"];

  // Look for adjacent empty (but buildable) hexes
  for (const token of companyTokens) {
    for (let dir = 0; dir < 6; dir++) {
      const neighbor = hexNeighbor(token, dir as 0);
      const key = hexKey(neighbor);
      if (state.map[key]) continue; // already has a tile

      // Check if this hex is on the map def
      const hexDef = def.map.find((h) => h.coord.q === neighbor.q && h.coord.r === neighbor.r);
      if (!hexDef || hexDef.offboard) continue;

      // Find a suitable yellow straight tile
      const tile = def.tiles.find(
        (t) => availableColors.includes(t.color) && t.paths.length === 1 && t.cities.length === 0 && t.towns.length === 0,
      );
      if (tile) {
        return { type: "lay_tile", companyId, coord: neighbor, tileId: tile.id, rotation: 0 };
      }
    }
  }
  return null;
}
