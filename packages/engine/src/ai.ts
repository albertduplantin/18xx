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

  // balanced: full MCTS capped at 800ms so it never blocks the server event loop
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

function aggOperate(state: GameState, def: GameDef, ctx: OperatingContext): GameAction {
  const companyId = ctx.companyOrder[ctx.companyIdx] ?? "";
  const company = state.companies[companyId];
  if (!company) return { type: "pass_operate", companyId };

  const done = new Set(ctx.companyActions);

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

  // Very conservative: only buy if revenue/price ≥ 15% AND we keep $200 in reserve
  const cashAfter = player.cash - ctx.currentPrice;
  if (cashAfter < 200) return { type: "pass_bid", playerId: botId };
  const ratio = priv.revenue / ctx.currentPrice;
  if (ratio >= 0.15) return { type: "bid", playerId: botId, privateId: priv.id, amount: ctx.currentPrice };

  return { type: "pass_bid", playerId: botId };
}

function conStock(state: GameState, def: GameDef, botId: string, ctx: StockContext): GameAction {
  const player = state.players.find((p) => p.id === botId)!;
  if (ctx.boughtThisTurn.includes(botId)) return { type: "pass_stock", playerId: botId };

  // Conservative: prefer cheapest par value
  for (const company of def.companies) {
    const cs = state.companies[company.id];
    if (cs?.status !== "unstarted") continue;
    for (const par of [67, 71, 76, 82, 90, 100] as const) {
      if (player.cash >= par * 2 + 200) { // keep extra $200 buffer
        return { type: "buy_share", playerId: botId, companyId: company.id, from: "ipo", parValue: par };
      }
    }
  }
  return { type: "pass_stock", playerId: botId };
}

function conOperate(state: GameState, def: GameDef, ctx: OperatingContext): GameAction {
  const companyId = ctx.companyOrder[ctx.companyIdx] ?? "";
  const company = state.companies[companyId];
  if (!company) return { type: "pass_operate", companyId };

  const done = new Set(ctx.companyActions);

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

function findTileLay(state: GameState, def: GameDef, companyId: string): GameAction | null {
  const phase = def.phases.find((p) => p.id === state.phaseId);
  const colors = phase?.tiles ?? ["yellow"];
  for (const key of Object.keys(state.map)) {
    const [qs, rs] = key.split(",");
    const q = Number(qs), r = Number(rs);
    for (let dir = 0 as 0; dir < 6; dir++) {
      const n = hexNeighbor({ q, r }, dir);
      const nk = hexKey(n);
      if (state.map[nk]) continue;
      const hexDef = def.map.find((h) => h.coord.q === n.q && h.coord.r === n.r);
      if (!hexDef || hexDef.offboard) continue;
      const tile = def.tiles.find((t) => colors.includes(t.color) && t.paths.length === 1 && t.cities.length === 0 && t.towns.length === 0);
      if (tile) return { type: "lay_tile", companyId, coord: n, tileId: tile.id, rotation: 0 };
    }
  }
  return null;
}
