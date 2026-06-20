/**
 * Monte Carlo Tree Search for 18xx — UCT with guided rollouts.
 *
 * Key improvement over plain MCTS: the rollout policy replaces pure random
 * play with economically sensible moves (buy trains, run routes, pay
 * dividends). This drastically reduces the number of "dead" simulations
 * where companies never generate revenue and all states look identical.
 *
 * Rollout policy (in order of priority per phase):
 *   Auction   — bid when revenue/price ≥ 10%, else pass
 *   Stock     — start cheapest affordable company; buy share in floated one; else pass
 *   Operating — buy cheapest train if needed → run optimal routes (pay if +rev)
 *               → lay a random adjacent tile → pass
 *
 * With 10% epsilon-greedy randomisation to keep rollout diversity.
 *
 * Evaluation (end of rollout):
 *   net_worth = cash + share_value + company_treasury_share + private_NPV
 *   Normalised to a ratio [0,1] summing to 1 across all players.
 */

import type {
  GameState, GameDef, GameAction,
  AuctionContext, StockContext, OperatingContext,
} from "@18xx/shared";
import { applyAction } from "./game-engine.js";
import { getLegalMoves } from "./legal-moves.js";
import { calculateOptimalRoutes } from "./route-calculator.js";
import { priceAt } from "./stock-market.js";
import { hexKey, hexNeighbor } from "./hex-grid.js";

const EXPLORATION   = Math.SQRT2;
const ROLLOUT_DEPTH = 25;
const DEFAULT_ITERS = 1500;
const EPSILON       = 0.10; // probability of random move in rollout (diversity)

// ─── Node ─────────────────────────────────────────────────────────────────────

type Node = {
  action:       GameAction | null;
  state:        GameState;
  parent:       Node | null;
  children:     Node[];
  visits:       number;
  totalValue:   number;
  actingPlayer: string;
  untried:      GameAction[];
};

function makeNode(state: GameState, def: GameDef, parent: Node | null, action: GameAction | null): Node {
  return {
    action,
    state,
    parent,
    children: [],
    visits: 0,
    totalValue: 0,
    actingPlayer: parent?.state.currentPlayerId ?? state.currentPlayerId,
    untried: shuffle(getLegalMoves(state, def)),
  };
}

// ─── UCB1 ─────────────────────────────────────────────────────────────────────

function ucb1(node: Node, parentVisits: number): number {
  if (node.visits === 0) return Infinity;
  return node.totalValue / node.visits + EXPLORATION * Math.sqrt(Math.log(parentVisits) / node.visits);
}

// ─── Selection & Expansion ────────────────────────────────────────────────────

function select(root: Node): Node {
  let node = root;
  while (node.untried.length === 0 && node.children.length > 0) {
    let best = node.children[0]!;
    let bestScore = -Infinity;
    for (const child of node.children) {
      const s = ucb1(child, node.visits);
      if (s > bestScore) { bestScore = s; best = child; }
    }
    node = best;
  }
  return node;
}

function expand(node: Node, def: GameDef): Node {
  const action = node.untried.pop()!;
  const result = applyAction(node.state, def, action);
  if (!result.ok) return node;
  const child = makeNode(result.state, def, node, action);
  node.children.push(child);
  return child;
}

// ─── Guided Rollout Policy ────────────────────────────────────────────────────

function rolloutPolicy(state: GameState, def: GameDef): GameAction | null {
  const ctx = state.turnContext;
  const playerId = state.currentPlayerId;

  if (ctx.type === "auction") return auctionPolicy(state, def, ctx, playerId);
  if (ctx.type === "stock")   return stockPolicy(state, def, ctx, playerId);
  if (ctx.type === "operating") return operatingPolicy(state, def, ctx);
  return null;
}

function auctionPolicy(state: GameState, _def: GameDef, ctx: AuctionContext, playerId: string): GameAction {
  const priv = _def.privates[ctx.privateIdx];
  if (!priv) return { type: "pass_bid", playerId };
  const player = state.players.find((p) => p.id === playerId);
  if (!player) return { type: "pass_bid", playerId };
  // Bid when revenue-to-price ratio is attractive
  if (player.cash >= ctx.currentPrice && priv.revenue / ctx.currentPrice >= 0.10) {
    return { type: "bid", playerId, privateId: priv.id, amount: ctx.currentPrice };
  }
  return { type: "pass_bid", playerId };
}

function stockPolicy(state: GameState, def: GameDef, ctx: StockContext, playerId: string): GameAction {
  const player = state.players.find((p) => p.id === playerId);
  if (!player) return { type: "pass_stock", playerId };
  const alreadyBought = ctx.boughtThisTurn.includes(playerId);

  if (!alreadyBought) {
    // Start a company at the lowest affordable par value
    for (const company of def.companies) {
      const cs = state.companies[company.id];
      if (cs?.status !== "unstarted") continue;
      for (const par of [67, 71, 76, 82, 90, 100] as const) {
        if (player.cash >= par * 2) {
          return { type: "buy_share", playerId, companyId: company.id, from: "ipo", parValue: par };
        }
      }
    }
    // Buy into the cheapest floated/started company
    let cheapestPrice = Infinity;
    let cheapestId = "";
    for (const company of def.companies) {
      const cs = state.companies[company.id];
      if (!cs || (cs.status !== "in_progress" && cs.status !== "floated")) continue;
      const pos = state.stockMarket[company.id];
      if (!pos) continue;
      const price = priceAt(def, pos);
      if (price > 0 && price <= player.cash && price < cheapestPrice) {
        cheapestPrice = price;
        cheapestId = company.id;
      }
    }
    if (cheapestId) return { type: "buy_share", playerId, companyId: cheapestId, from: "ipo" };
  }

  return { type: "pass_stock", playerId };
}

function operatingPolicy(state: GameState, def: GameDef, ctx: OperatingContext): GameAction {
  const companyId = ctx.companyOrder[ctx.companyIdx] ?? "";
  const company = state.companies[companyId];
  if (!company) return { type: "pass_operate", companyId };
  const done = new Set(ctx.companyActions);

  // 1. Buy cheapest affordable train if the company has none
  if (!done.has("trains") && company.trains.length === 0) {
    const train = def.trains
      .filter((t) => (state.trainBank[t.id] ?? 0) > 0 && company.cash >= t.price)
      .sort((a, b) => a.price - b.price)[0];
    if (train) return { type: "buy_train", companyId, trainTypeId: train.id, from: "bank" };
  }

  // 2. Run routes if the company has trains (use optimal routes)
  if (!done.has("routes") && company.trains.length > 0) {
    const routes = calculateOptimalRoutes(state, def, companyId);
    const revenue = routes.reduce((s, r) => s + r.revenue, 0);
    return { type: "run_routes", companyId, routes, dividend: revenue > 0 ? "pay" : "withhold" };
  }

  // 3. Lay one simple track tile on a random adjacent empty hex
  if (!done.has("tile")) {
    const tileAction = quickTileLay(state, def, companyId);
    if (tileAction) return tileAction;
  }

  return { type: "pass_operate", companyId };
}

/** Lay the first available non-city tile on any hex adjacent to the placed network. */
function quickTileLay(state: GameState, def: GameDef, companyId: string): GameAction | null {
  const phase = def.phases.find((p) => p.id === state.phaseId);
  const colors = phase?.tiles ?? ["yellow"];
  const tile = def.tiles.find((t) => colors.includes(t.color) && t.cities.length === 0 && t.towns.length === 0 && t.paths.length > 0);
  if (!tile) return null;

  for (const key of Object.keys(state.map)) {
    const [qs, rs] = key.split(",");
    const q = Number(qs), r = Number(rs);
    for (let dir = 0 as 0; dir < 6; dir++) {
      const n = hexNeighbor({ q, r }, dir);
      const nk = hexKey(n);
      if (state.map[nk]) continue;
      const hexDef = def.map.find((h) => h.coord.q === n.q && h.coord.r === n.r);
      if (hexDef && !hexDef.offboard) {
        return { type: "lay_tile", companyId, coord: n, tileId: tile.id, rotation: 0 };
      }
    }
  }
  return null;
}

// ─── Rollout ──────────────────────────────────────────────────────────────────

function rollout(startState: GameState, def: GameDef): Record<string, number> {
  let state = startState;

  for (let d = 0; d < ROLLOUT_DEPTH && state.status === "active"; d++) {
    // Epsilon-greedy: occasionally pick a random legal move for diversity
    let action: GameAction | null = null;
    if (Math.random() < EPSILON) {
      const moves = getLegalMoves(state, def);
      action = moves.length > 0 ? (moves[Math.floor(Math.random() * moves.length)] ?? null) : null;
    } else {
      action = rolloutPolicy(state, def);
    }

    if (!action) break;

    const result = applyAction(state, def, action);
    if (!result.ok) {
      // Policy returned an invalid move — fall back to first legal move
      const moves = getLegalMoves(state, def);
      if (moves.length === 0) break;
      const fallback = applyAction(state, def, moves[0]!);
      if (!fallback.ok) break;
      state = fallback.state;
    } else {
      state = result.state;
    }
  }

  return evaluate(state, def);
}

// ─── Evaluation ───────────────────────────────────────────────────────────────

/**
 * Net worth per player, normalised to a ratio summing to 1.
 *
 * Components:
 *   + cash in hand
 *   + market value of shares (price × percent / 10)
 *   + proportional share of each company's treasury
 *   + private company NPV (revenue × 10 ≈ 10 turns of income)
 */
function evaluate(state: GameState, def: GameDef): Record<string, number> {
  const raw: Record<string, number> = {};
  let total = 0;

  for (const player of state.players) {
    let worth = player.cash;

    for (const share of player.shares) {
      // Market value of this share
      const pos = state.stockMarket[share.companyId];
      if (pos) worth += priceAt(def, pos) * (share.percent / 10);

      // Proportional share of the company's treasury
      const cs = state.companies[share.companyId];
      if (cs) worth += cs.cash * (share.percent / 100);
    }

    // Private companies: rough NPV = revenue × 10 turns
    for (const privId of player.privates) {
      const priv = def.privates.find((p) => p.id === privId);
      if (priv) worth += priv.revenue * 10;
    }

    raw[player.id] = Math.max(0, worth);
    total += raw[player.id]!;
  }

  const n = state.players.length;
  const result: Record<string, number> = {};
  for (const player of state.players) {
    result[player.id] = total > 0 ? (raw[player.id] ?? 0) / total : 1 / n;
  }
  return result;
}

// ─── Backpropagation ──────────────────────────────────────────────────────────

function backpropagate(node: Node | null, scores: Record<string, number>): void {
  while (node !== null) {
    node.visits++;
    node.totalValue += scores[node.actingPlayer] ?? 0;
    node = node.parent;
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

export function mctsGetAction(
  state: GameState,
  def: GameDef,
  botPlayerId: string,
  iterations: number = DEFAULT_ITERS,
): GameAction | null {
  if (state.status !== "active") return null;
  if (state.currentPlayerId !== botPlayerId) return null;

  const root = makeNode(state, def, null, null);
  if (root.untried.length === 0) return null;
  if (root.untried.length === 1) {
    const only = root.untried[0]!;
    return applyAction(state, def, only).ok ? only : null;
  }

  for (let i = 0; i < iterations; i++) {
    let node = select(root);
    if (node.untried.length > 0 && node.state.status === "active") node = expand(node, def);
    const scores = rollout(node.state, def);
    backpropagate(node, scores);
  }

  if (root.children.length === 0) return root.untried[0] ?? null;
  let best = root.children[0]!;
  for (const child of root.children) {
    if (child.visits > best.visits) best = child;
  }
  return best.action;
}

// ─── Util ─────────────────────────────────────────────────────────────────────

function shuffle<T>(arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j]!, arr[i]!];
  }
  return arr;
}
