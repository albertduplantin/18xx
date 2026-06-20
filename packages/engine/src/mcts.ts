/**
 * Monte Carlo Tree Search for 18xx.
 *
 * Algorithm: UCT (UCB1 applied to trees), multi-player max-n variant.
 *
 * Each node stores stats for the player who *moved to reach* it.
 * Selection uses UCB1 to balance exploration vs exploitation.
 * Rollouts are random (fast) with a depth cap; evaluated by net worth ratio.
 * Best action = child with most visits (robust, not greedy).
 *
 * Tuning:
 *   ITERATIONS  — more = stronger, slower. 600 fits comfortably in ~300ms on a shared CPU.
 *   ROLLOUT_DEPTH — deeper = more accurate, but slower per iteration.
 *   EXPLORATION — √2 is standard; increase for more exploration.
 */

import type { GameState, GameDef, GameAction } from "@18xx/shared";
import { applyAction } from "./game-engine.js";
import { getLegalMoves } from "./legal-moves.js";
import { priceAt } from "./stock-market.js";

const EXPLORATION    = Math.SQRT2;
const ROLLOUT_DEPTH  = 25;
const DEFAULT_ITERS  = 1500;

// ─── Node ────────────────────────────────────────────────────────────────────

type Node = {
  action:        GameAction | null; // move that produced this state from parent
  state:         GameState;
  parent:        Node | null;
  children:      Node[];
  visits:        number;
  totalValue:    number;            // cumulative normalized score for actingPlayer
  actingPlayer:  string;            // who chose the action that led HERE
  untried:       GameAction[];      // actions not yet expanded
};

function makeNode(
  state: GameState,
  def: GameDef,
  parent: Node | null,
  action: GameAction | null,
): Node {
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

// ─── UCB1 ────────────────────────────────────────────────────────────────────

function ucb1(node: Node, parentVisits: number): number {
  if (node.visits === 0) return Infinity;
  return (
    node.totalValue / node.visits +
    EXPLORATION * Math.sqrt(Math.log(parentVisits) / node.visits)
  );
}

// ─── MCTS phases ─────────────────────────────────────────────────────────────

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
  if (!result.ok) return node; // invalid action — skip
  const child = makeNode(result.state, def, node, action);
  node.children.push(child);
  return child;
}

function rollout(startState: GameState, def: GameDef): Record<string, number> {
  let state = startState;
  for (let d = 0; d < ROLLOUT_DEPTH && state.status === "active"; d++) {
    const moves = getLegalMoves(state, def);
    if (moves.length === 0) break;
    // Pick randomly — fast and avoids policy bias
    const action = moves[Math.floor(Math.random() * moves.length)]!;
    const result = applyAction(state, def, action);
    if (!result.ok) break;
    state = result.state;
  }
  return evaluate(state, def);
}

/** Net worth ratio: each player's score as a fraction of the total. Sums to 1. */
function evaluate(state: GameState, def: GameDef): Record<string, number> {
  const raw: Record<string, number> = {};
  let total = 0;
  for (const player of state.players) {
    let worth = player.cash;
    for (const share of player.shares) {
      const pos = state.stockMarket[share.companyId];
      if (pos) worth += priceAt(def, pos) * (share.percent / 10);
    }
    for (const privId of player.privates) {
      const priv = def.privates.find((p) => p.id === privId);
      if (priv) worth += priv.revenue * 10; // rough NPV
    }
    raw[player.id] = worth;
    total += worth;
  }
  const n = state.players.length;
  const result: Record<string, number> = {};
  for (const player of state.players) {
    result[player.id] = total > 0 ? (raw[player.id] ?? 0) / total : 1 / n;
  }
  return result;
}

function backpropagate(node: Node | null, scores: Record<string, number>): void {
  while (node !== null) {
    node.visits++;
    node.totalValue += scores[node.actingPlayer] ?? 0;
    node = node.parent;
  }
}

// ─── Public API ──────────────────────────────────────────────────────────────

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

  // Single legal move — no search needed
  if (root.untried.length === 1) {
    const only = root.untried[0]!;
    const r = applyAction(state, def, only);
    return r.ok ? only : null;
  }

  for (let i = 0; i < iterations; i++) {
    let node = select(root);

    if (node.untried.length > 0 && node.state.status === "active") {
      node = expand(node, def);
    }

    const scores = rollout(node.state, def);
    backpropagate(node, scores);
  }

  // Pick the most visited child — robust to noise
  if (root.children.length === 0) return root.untried[0] ?? null;
  let best = root.children[0]!;
  for (const child of root.children) {
    if (child.visits > best.visits) best = child;
  }
  return best.action;
}

// ─── Util ────────────────────────────────────────────────────────────────────

function shuffle<T>(arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j]!, arr[i]!];
  }
  return arr;
}
