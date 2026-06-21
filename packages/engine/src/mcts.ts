/**
 * Monte Carlo Tree Search for 18xx — UCT with guided rollouts.
 *
 * Strategy based on expert 1830 guides (blackwaterstation, tckroleplaying,
 * boardgamestrategy):
 *
 *  AUCTION  — bid on every private (all have ≥10% revenue/price), prioritise
 *              B&O ($30 + president cert) and C&A ($25 + 10% PRR share).
 *
 *  STOCK    — start ONE company at a good par ($76–90), help IT float first
 *              by buying 10% of it the following turn. Only start a second
 *              company after the first is floated. Rule: own your company
 *              aggressively, avoid buying >10% of an opponent's company.
 *
 *  OPERATING — correct 1830 order: lay tile FIRST (expands route options
 *              THIS turn), then buy trains, then run routes.
 *              ALWAYS PAY DIVIDENDS when revenue > 0 — expert consensus.
 *              Only withhold when company has 0 trains and 0 cash.
 *
 *  EVALUATION — net worth = cash + share market value + proportional treasury
 *               + private NPV + bonus for companies with trains (future revenue
 *               stream).
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

// Rough revenue estimate per train type (avoids expensive route calc in evaluate())
const TRAIN_REVENUE_ESTIMATE: Record<string, number> = {
  "2": 70, "3": 140, "4": 210, "5": 300, "6": 360, "D": 420,
};

const EXPLORATION   = Math.SQRT2;
const ROLLOUT_DEPTH = 40;           // increased from 25 — deeper lookahead
const DEFAULT_ITERS = 1500;
const EPSILON       = 0.08;         // slightly reduced — rely more on policy

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
  if (ctx.type === "auction")    return auctionPolicy(state, def, ctx);
  if (ctx.type === "stock")      return stockPolicy(state, def, ctx);
  if (ctx.type === "operating")  return operatingPolicy(state, def, ctx);
  return null;
}

// ── Auction ──────────────────────────────────────────────────────────────────

function auctionPolicy(state: GameState, def: GameDef, ctx: AuctionContext): GameAction {
  const playerId = state.currentPlayerId;
  const priv = def.privates[ctx.privateIdx];
  if (!priv) return { type: "pass_bid", playerId };

  const player = state.players.find((p) => p.id === playerId);
  if (!player || player.cash < ctx.currentPrice) return { type: "pass_bid", playerId };

  // Reserve enough cash to start at least one company ($67×2 = $134 minimum)
  // Strategy: buy every private that's at or below face value — all are good deals
  const cashAfterBid = player.cash - ctx.currentPrice;
  const minReserve = 134;
  if (cashAfterBid < minReserve) return { type: "pass_bid", playerId };

  // Revenue/price threshold — all privates comfortably exceed 10%
  const ratio = priv.revenue / ctx.currentPrice;
  if (ratio >= 0.08) {  // lowered threshold: even $30/$220 = 13.6% is fine
    return { type: "bid", playerId, privateId: priv.id, amount: ctx.currentPrice };
  }
  return { type: "pass_bid", playerId };
}

// ── Stock ────────────────────────────────────────────────────────────────────

/**
 * 1830 stock strategy:
 * - Start ONE company at a good par value ($76-90)
 * - Buy into YOUR OWN company next turn to help it float (60% threshold)
 * - Only start a second company after the first floats
 * - Never buy >20% of an opponent's company (dump risk)
 * - "Fast buck" strategy: prefer companies near high-revenue cities
 */
function stockPolicy(state: GameState, def: GameDef, ctx: StockContext): GameAction {
  const playerId = state.currentPlayerId;
  const player = state.players.find((p) => p.id === playerId);
  if (!player) return { type: "pass_stock", playerId };
  if (ctx.boughtThisTurn.includes(playerId)) return { type: "pass_stock", playerId };

  const certLimit = def.certLimit[state.players.length] ?? 28;
  const totalCerts = player.shares.length + player.privates.length;
  if (totalCerts >= certLimit) return { type: "pass_stock", playerId };

  // Identify own companies (president's cert holder)
  const ownCompanies = player.shares.filter((s) => s.president).map((s) => s.companyId);
  const numOwn = ownCompanies.length;

  // Count floated companies (that can operate and pay dividends)
  const numFloated = Object.values(state.companies).filter((c) => c.status === "floated").length;

  // ── Priority 1: buy into own in_progress company to push it to 60% float ──
  for (const compId of ownCompanies) {
    const cs = state.companies[compId];
    if (!cs || cs.status !== "in_progress") continue;
    const pos = state.stockMarket[compId];
    if (!pos) continue;
    const price = priceAt(def, pos);
    if (price <= 0 || price > player.cash) continue;

    // Check how many shares already sold
    const soldPercent = state.players.flatMap((p) => p.shares)
      .filter((s) => s.companyId === compId)
      .reduce((s, sh) => s + sh.percent, 0);

    // Only buy if still below float threshold (60%) and we don't own >60%
    const ownedPercent = player.shares.filter((s) => s.companyId === compId)
      .reduce((s, sh) => s + sh.percent, 0);
    if (soldPercent < 60 && ownedPercent < 60) {
      return { type: "buy_share", playerId, companyId: compId, from: "ipo" };
    }
  }

  // ── Priority 2: start a new company (only if < 2 own companies) ──
  if (numOwn < 2) {
    // Pick the best available company based on home city revenue potential
    const companyScore = (compId: string): number => {
      const cs = state.companies[compId];
      if (!cs || cs.status !== "unstarted") return -1;
      const compDef = def.companies.find((c) => c.id === compId);
      if (!compDef) return -1;
      // Approximate quality: companies with more tokens are generally more flexible
      return compDef.tokens.length;
    };

    const bestCompany = def.companies
      .filter((c) => state.companies[c.id]?.status === "unstarted")
      .sort((a, b) => companyScore(b.id) - companyScore(a.id))[0];

    if (bestCompany) {
      // Choose par value: $76-82 gives a good treasury without being too expensive
      // Rule: company treasury at float = par × 6 (we buy 20%, others buy 40%)
      // At par=$76: treasury ≈ $456. At par=$90: treasury ≈ $540.
      const preferredPars = [82, 76, 90, 71, 67] as const;
      for (const par of preferredPars) {
        if (player.cash >= par * 2 + 100) {  // keep $100 reserve after buying
          return { type: "buy_share", playerId, companyId: bestCompany.id, from: "ipo", parValue: par };
        }
      }
      // Fall back to any affordable par
      for (const par of [67, 71, 76, 82, 90, 100] as const) {
        if (player.cash >= par * 2) {
          return { type: "buy_share", playerId, companyId: bestCompany.id, from: "ipo", parValue: par };
        }
      }
    }
  }

  // ── Priority 3: buy into a floated company (if own company floated) ──
  if (numOwn > 0 && numFloated > 0) {
    // Only buy into own floated companies (for portfolio concentration)
    for (const compId of ownCompanies) {
      const cs = state.companies[compId];
      if (!cs || cs.status !== "floated") continue;
      const pos = state.stockMarket[compId];
      if (!pos) continue;
      const price = priceAt(def, pos);
      const ownedPercent = player.shares.filter((s) => s.companyId === compId)
        .reduce((s, sh) => s + sh.percent, 0);
      if (price <= player.cash && ownedPercent < 60) {
        return { type: "buy_share", playerId, companyId: compId, from: "ipo" };
      }
    }
  }

  return { type: "pass_stock", playerId };
}

// ── Operating ─────────────────────────────────────────────────────────────────

/**
 * 1830 operating order (from rulebook):
 * 1. Lay track tile (FIRST — expands route options for THIS turn)
 * 2. Place station marker
 * 3. Run trains (mandatory if owned)
 * 4. Buy trains (mandatory if none owned)
 *
 * Expert rule: ALWAYS PAY DIVIDENDS when revenue > 0.
 * Withholding is only useful for companies you plan to dump or when buying
 * an expensive train. Even then, paying is usually better for stock price.
 */
function operatingPolicy(state: GameState, def: GameDef, ctx: OperatingContext): GameAction {
  const companyId = ctx.companyOrder[ctx.companyIdx] ?? "";
  const company = state.companies[companyId];
  if (!company) return { type: "pass_operate", companyId };
  const done = new Set(ctx.companyActions);

  // Step 1: LAY TILE FIRST — expands route options for routes run this same turn
  if (!done.has("tile")) {
    const tileAction = smartTileLay(state, def, companyId);
    if (tileAction) return tileAction;
  }

  // Step 2: BUY TRAIN — must buy if company has none (forced purchase rule)
  if (!done.has("trains")) {
    const needsTrain = company.trains.length === 0;
    if (needsTrain) {
      const train = def.trains
        .filter((t) => (state.trainBank[t.id] ?? 0) > 0 && company.cash >= t.price)
        .sort((a, b) => a.price - b.price)[0];
      if (train) return { type: "buy_train", companyId, trainTypeId: train.id, from: "bank" };
    }
    // Optional: buy a better train if company is well-funded
    // 5-trains never rust — always worth buying when affordable
    const has5OrBetter = company.trains.some((t) => t === "5" || t === "6" || t === "D");
    if (!has5OrBetter && company.trains.length > 0) {
      const phase = def.phases.find((p) => p.id === state.phaseId);
      // In phase 5+, aggressively upgrade trains
      if (phase && parseInt(phase.id) >= 5) {
        const upgradeTrain = def.trains
          .filter((t) => (state.trainBank[t.id] ?? 0) > 0 && company.cash >= t.price
            && !["2", "3"].includes(t.id)) // don't buy old trains
          .sort((a, b) => a.price - b.price)[0];
        if (upgradeTrain) return { type: "buy_train", companyId, trainTypeId: upgradeTrain.id, from: "bank" };
      }
    }
  }

  // Step 3: RUN ROUTES AND PAY DIVIDENDS
  if (!done.has("routes") && company.trains.length > 0) {
    const routes = calculateOptimalRoutes(state, def, companyId);
    const revenue = routes.reduce((s, r) => s + r.revenue, 0);
    // ALWAYS PAY when revenue > 0 (expert consensus: never withhold)
    // Exception: withhold if about to buy an expensive train and treasury is low
    const phaseId = parseInt(state.phaseId) || 0;
    const needsExpensiveTrain = company.trains.length === 0 && phaseId >= 4;
    const dividend = (revenue > 0 && !needsExpensiveTrain) ? "pay" : "withhold";
    return { type: "run_routes", companyId, routes, dividend };
  }

  return { type: "pass_operate", companyId };
}

/**
 * Smarter tile placement: prefer tiles that extend routes toward
 * high-revenue destinations (offboard hexes) rather than random adjacency.
 */
function smartTileLay(state: GameState, def: GameDef, companyId: string): GameAction | null {
  const phase = def.phases.find((p) => p.id === state.phaseId);
  const colors = phase?.tiles ?? ["yellow"];

  // Find candidate tiles (track tiles, no cities — we can't build cities with tiles)
  const trackTiles = def.tiles.filter(
    (t) => colors.includes(t.color) && t.cities.length === 0 && t.paths.length > 0,
  );
  if (trackTiles.length === 0) return null;

  // Collect hexes adjacent to the placed network
  const candidates: Array<{ coord: { q: number; r: number }; score: number }> = [];

  for (const key of Object.keys(state.map)) {
    const [qs, rs] = key.split(",");
    const q = Number(qs), r = Number(rs);
    for (let dir = 0 as 0; dir < 6; dir++) {
      const n = hexNeighbor({ q, r }, dir);
      const nk = hexKey(n);
      if (state.map[nk]) continue;
      const hexDef = def.map.find((h) => h.coord.q === n.q && h.coord.r === n.r);
      if (!hexDef || hexDef.offboard || hexDef.tile) continue;

      // Score: prefer hexes closer to offboard revenue or cities
      let score = 0;
      for (let d2 = 0 as 0; d2 < 6; d2++) {
        const nn = hexNeighbor(n, d2);
        const nnDef = def.map.find((h) => h.coord.q === nn.q && h.coord.r === nn.r);
        if (nnDef?.offboard) {
          // Strongly prefer hexes adjacent to offboard revenue
          const rev = typeof nnDef.offboard.revenue === "number"
            ? nnDef.offboard.revenue
            : Object.values(nnDef.offboard.revenue)[0] ?? 0;
          score += rev;
        }
        if (nnDef?.tile && nnDef.tile.cities.length > 0) {
          // Prefer hexes adjacent to city tiles
          score += 10;
        }
        // Penalty for mountain/water terrain cost
        if (hexDef.terrain) score -= hexDef.terrain.cost / 10;
      }
      candidates.push({ coord: n, score });
    }
  }

  if (candidates.length === 0) return null;

  // Sort by score descending, pick the best hex
  candidates.sort((a, b) => b.score - a.score);
  const best = candidates[0]!;
  const tile = trackTiles[0]!;

  return { type: "lay_tile", companyId, coord: best.coord, tileId: tile.id, rotation: 0 };
}

// ─── Rollout ──────────────────────────────────────────────────────────────────

function rollout(startState: GameState, def: GameDef): Record<string, number> {
  let state = startState;

  for (let d = 0; d < ROLLOUT_DEPTH && state.status === "active"; d++) {
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
 * Net worth per player, normalised to a [0,1] ratio summing to 1.
 *
 * Components (researched from expert 1830 strategy guides):
 *   + cash in hand
 *   + market value of shares (price × percent / 10)
 *   + proportional share of company treasury
 *   + private company NPV (revenue × 15 ≈ realistic turn count in 1830)
 *   + train revenue heuristic: estimated future dividends per train type
 *     (avoids expensive route calc; TRAIN_REVENUE_ESTIMATE × 6 future ORs × share%)
 *   + president control premium: 15% bonus on the stock price
 */
function evaluate(state: GameState, def: GameDef): Record<string, number> {
  const raw: Record<string, number> = {};
  let total = 0;

  for (const player of state.players) {
    let worth = player.cash;

    for (const share of player.shares) {
      const pos = state.stockMarket[share.companyId];
      const price = pos ? priceAt(def, pos) : 0;
      const cs = state.companies[share.companyId];

      // Market value
      worth += price * (share.percent / 10);

      // Proportional treasury
      if (cs) worth += cs.cash * (share.percent / 100);

      // Future revenue estimate: best train in the company × 6 future ORs × share%
      if (cs && cs.trains.length > 0) {
        const bestEstimate = Math.max(
          ...cs.trains.map((t) => TRAIN_REVENUE_ESTIMATE[t] ?? 0),
        );
        worth += bestEstimate * (share.percent / 100) * 6;
      }

      // President control premium (route choice, train timing flexibility)
      if (share.president && cs && cs.status === "floated") {
        worth += price * 0.15;
      }
    }

    // Private companies NPV: 15 turns of income (realistic 1830 game length)
    for (const privId of player.privates) {
      const priv = def.privates.find((p) => p.id === privId);
      if (priv) worth += priv.revenue * 15;
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
