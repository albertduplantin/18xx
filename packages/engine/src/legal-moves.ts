/**
 * Enumerates all concrete legal GameAction objects from a given state.
 * Used by MCTS to expand the search tree.
 *
 * Branching factor is intentionally capped to keep MCTS tractable:
 * - Tile laying: at most 8 candidate positions × 1 tile each
 * - Stock: 1 par value per company (cheapest affordable), 1 sell per holding
 * - Operating: cheapest train, optimal routes only (pay + withhold)
 */

import type { GameState, GameDef, GameAction, AuctionContext, StockContext, OperatingContext } from "@18xx/shared";
import { hexKey, hexNeighbor } from "./hex-grid.js";
import { priceAt } from "./stock-market.js";
import { calculateOptimalRoutes } from "./route-calculator.js";

export function getLegalMoves(state: GameState, def: GameDef): GameAction[] {
  if (state.status !== "active") return [];
  const ctx = state.turnContext;
  if (ctx.type === "auction")   return auctionMoves(state, def, ctx);
  if (ctx.type === "stock")     return stockMoves(state, def, ctx);
  if (ctx.type === "operating") return operatingMoves(state, def, ctx);
  return [];
}

// ─── Auction ────────────────────────────────────────────────────────────────

function auctionMoves(state: GameState, def: GameDef, ctx: AuctionContext): GameAction[] {
  const playerId = state.currentPlayerId;
  const player = state.players.find((p) => p.id === playerId);
  if (!player) return [];

  const moves: GameAction[] = [{ type: "pass_bid", playerId }];
  const priv = def.privates[ctx.privateIdx];
  if (priv && player.cash >= ctx.currentPrice) {
    moves.push({ type: "bid", playerId, privateId: priv.id, amount: ctx.currentPrice });
  }
  return moves;
}

// ─── Stock Round ─────────────────────────────────────────────────────────────

function stockMoves(state: GameState, def: GameDef, ctx: StockContext): GameAction[] {
  const playerId = state.currentPlayerId;
  const player = state.players.find((p) => p.id === playerId);
  if (!player) return [];

  const moves: GameAction[] = [{ type: "pass_stock", playerId }];
  const alreadyBought = ctx.boughtThisTurn.includes(playerId);

  if (!alreadyBought) {
    // Start a company — only cheapest affordable par per company to limit branching
    for (const company of def.companies) {
      const cs = state.companies[company.id];
      if (cs?.status !== "unstarted") continue;
      const parValues = [67, 71, 76, 82, 90, 100] as const;
      for (const par of parValues) {
        if (player.cash >= par * 2) {
          moves.push({ type: "buy_share", playerId, companyId: company.id, from: "ipo", parValue: par });
          break; // cheapest only — prevents O(companies × pars) explosion
        }
      }
    }

    // Buy 10% share in a started company
    for (const company of def.companies) {
      const cs = state.companies[company.id];
      if (!cs || (cs.status !== "in_progress" && cs.status !== "floated")) continue;
      const pos = state.stockMarket[company.id];
      if (!pos) continue;
      const price = priceAt(def, pos);
      if (player.cash >= price) {
        moves.push({ type: "buy_share", playerId, companyId: company.id, from: "ipo" });
      }
    }
  }

  // Sell non-president shares
  const soldCompanies = new Set<string>();
  for (const share of player.shares) {
    if (!share.president && !soldCompanies.has(share.companyId)) {
      moves.push({ type: "sell_shares", playerId, companyId: share.companyId, count: 1 });
      soldCompanies.add(share.companyId);
    }
  }

  return moves;
}

// ─── Operating Round ─────────────────────────────────────────────────────────

function operatingMoves(state: GameState, def: GameDef, ctx: OperatingContext): GameAction[] {
  const companyId = ctx.companyOrder[ctx.companyIdx] ?? "";
  const company = state.companies[companyId];
  if (!company) return [{ type: "pass_operate", companyId }];

  const done = new Set(ctx.companyActions);
  const moves: GameAction[] = [];

  // Tile laying (up to 8 positions, 1 tile each)
  if (!done.has("tile")) {
    for (const m of tileMoves(state, def, companyId).slice(0, 8)) moves.push(m);
  }

  // Train purchase — only cheapest affordable
  if (!done.has("trains")) {
    const train = def.trains
      .filter((t) => (state.trainBank[t.id] ?? 0) > 0 && company.cash >= t.price)
      .sort((a, b) => a.price - b.price)[0];
    if (train) {
      moves.push({ type: "buy_train", companyId, trainTypeId: train.id, from: "bank" });
    }
  }

  // Route running — pay or withhold on optimal routes
  if (!done.has("routes") && company.trains.length > 0) {
    const routes = calculateOptimalRoutes(state, def, companyId);
    const revenue = routes.reduce((s, r) => s + r.revenue, 0);
    if (revenue > 0) {
      moves.push({ type: "run_routes", companyId, routes, dividend: "pay" });
    }
    moves.push({ type: "run_routes", companyId, routes: [], dividend: "withhold" });
  }

  // Always available: end this company's turn
  moves.push({ type: "pass_operate", companyId });

  return moves;
}

function tileMoves(state: GameState, def: GameDef, companyId: string): GameAction[] {
  const phase = def.phases.find((p) => p.id === state.phaseId);
  const allowedColors = phase?.tiles ?? ["yellow"];

  // Collect hexes adjacent to any placed tile (proxy for network reach)
  const candidates = new Set<string>();
  for (const key of Object.keys(state.map)) {
    const [qs, rs] = key.split(",");
    const q = Number(qs), r = Number(rs);
    for (let dir = 0 as 0; dir < 6; dir++) {
      const n = hexNeighbor({ q, r }, dir);
      const nk = hexKey(n);
      if (state.map[nk]) continue;
      const hexDef = def.map.find((h) => h.coord.q === n.q && h.coord.r === n.r);
      if (hexDef && !hexDef.offboard) candidates.add(nk);
    }
  }

  const moves: GameAction[] = [];
  const tiles = def.tiles.filter((t) => allowedColors.includes(t.color) && t.cities.length === 0 && t.towns.length === 0);

  for (const key of candidates) {
    const [qs, rs] = key.split(",");
    const coord = { q: Number(qs), r: Number(rs) };
    const tile = tiles[0]; // one tile option per candidate hex to keep branching low
    if (tile) moves.push({ type: "lay_tile", companyId, coord, tileId: tile.id, rotation: 0 });
  }

  return moves;
}
