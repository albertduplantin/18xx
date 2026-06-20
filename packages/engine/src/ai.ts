/**
 * AI player entry point.
 *
 * Uses MCTS as primary strategy. Falls back to the heuristic if MCTS
 * returns null (e.g. finished game, wrong player turn).
 *
 * MCTS iterations can be tuned via the second argument; default is 600.
 * On a shared CPU (Render free tier) 600 iterations ≈ 200–400ms per move.
 */

import type { GameState, GameDef, GameAction, AuctionContext, StockContext, OperatingContext } from "@18xx/shared";
import { mctsGetAction } from "./mcts.js";
import { priceAt } from "./stock-market.js";
import { calculateOptimalRoutes } from "./route-calculator.js";
import { hexKey, hexNeighbor } from "./hex-grid.js";

export { mctsGetAction };

export function getAIAction(
  state: GameState,
  def: GameDef,
  botPlayerId: string,
  iterations = 1500,
): GameAction | null {
  if (state.status !== "active") return null;
  if (state.currentPlayerId !== botPlayerId) return null;

  // MCTS primary
  const mcts = mctsGetAction(state, def, botPlayerId, iterations);
  if (mcts) return mcts;

  // Heuristic fallback (should rarely trigger)
  const ctx = state.turnContext;
  if (ctx.type === "auction") return heuristicAuction(state, def, botPlayerId, ctx);
  if (ctx.type === "stock")   return heuristicStock(state, def, botPlayerId, ctx);
  if (ctx.type === "operating") return heuristicOperate(state, def, botPlayerId, ctx);
  return null;
}

// ─── Heuristic fallback ───────────────────────────────────────────────────────

function heuristicAuction(state: GameState, def: GameDef, botId: string, ctx: AuctionContext): GameAction {
  const priv = def.privates[ctx.privateIdx];
  if (!priv) return { type: "pass_bid", playerId: botId };
  const bot = state.players.find((p) => p.id === botId)!;
  const ratio = priv.revenue / ctx.currentPrice;
  if (bot.cash >= ctx.currentPrice && (ratio >= 0.12 || ctx.currentPrice <= priv.value * 0.6)) {
    return { type: "bid", playerId: botId, privateId: priv.id, amount: ctx.currentPrice };
  }
  return { type: "pass_bid", playerId: botId };
}

function heuristicStock(state: GameState, def: GameDef, botId: string, ctx: StockContext): GameAction {
  const bot = state.players.find((p) => p.id === botId)!;
  const alreadyBought = ctx.boughtThisTurn.includes(botId);

  if (!alreadyBought) {
    for (const company of def.companies) {
      const cs = state.companies[company.id];
      if (cs?.status !== "unstarted") continue;
      for (const par of [67, 71, 76, 82, 90, 100] as const) {
        if (bot.cash >= par * 2) {
          return { type: "buy_share", playerId: botId, companyId: company.id, from: "ipo", parValue: par };
        }
      }
    }
    const candidates = def.companies
      .filter((c) => { const cs = state.companies[c.id]; return cs && (cs.status === "in_progress" || cs.status === "floated"); })
      .map((c) => { const pos = state.stockMarket[c.id]; return { id: c.id, price: pos ? priceAt(def, pos) : 0 }; })
      .filter((c) => bot.cash >= c.price && c.price > 0)
      .sort((a, b) => a.price - b.price);
    if (candidates[0]) return { type: "buy_share", playerId: botId, companyId: candidates[0].id, from: "ipo" };
  }
  return { type: "pass_stock", playerId: botId };
}

function heuristicOperate(state: GameState, def: GameDef, _botId: string, ctx: OperatingContext): GameAction {
  const companyId = ctx.companyOrder[ctx.companyIdx] ?? "";
  const company = state.companies[companyId];
  if (!company) return { type: "pass_operate", companyId };

  if (company.trains.length === 0 && !ctx.companyActions.includes("trains")) {
    const train = def.trains.filter((t) => (state.trainBank[t.id] ?? 0) > 0 && company.cash >= t.price).sort((a, b) => a.price - b.price)[0];
    if (train) return { type: "buy_train", companyId, trainTypeId: train.id, from: "bank" };
    if (!ctx.companyActions.includes("routes")) return { type: "run_routes", companyId, routes: [], dividend: "withhold" };
    return { type: "pass_operate", companyId };
  }

  if (!ctx.companyActions.includes("tile")) {
    const tile = findTileLay(state, def, companyId);
    if (tile) return tile;
  }

  if (!ctx.companyActions.includes("routes") && company.trains.length > 0) {
    const routes = calculateOptimalRoutes(state, def, companyId);
    return { type: "run_routes", companyId, routes, dividend: routes.reduce((s, r) => s + r.revenue, 0) > 0 ? "pay" : "withhold" };
  }

  return { type: "pass_operate", companyId };
}

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
