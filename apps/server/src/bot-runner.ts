/**
 * Async bot runner with detailed decision logging.
 * Each step yields to the event loop (setImmediate) so health checks and WS writes
 * are never starved. MCTS is also capped at 800ms in ai.ts.
 */
import { applyAction, getAIAction, getLegalMoves } from "@18xx/engine";
import type { GameAction, GameState } from "@18xx/shared";
import type { GameDef } from "@18xx/shared";
import type { LobbySlot, BotPersonality } from "./store.js";
import { store } from "./store.js";
import { wsManager } from "./ws-manager.js";

function describeAction(
  action: GameAction,
  state: GameState,
  def: GameDef,
  personality: string
): string {
  const ctx = state.turnContext;
  const pName = state.players.find((p) => p.id === state.currentPlayerId)?.name ?? "?";
  const who = `${pName}[${personality}]`;

  switch (action.type) {
    case "lay_tile":
      return `${who}: tuile ${action.tileId} → (${action.coord.q},${action.coord.r}) rot.${action.rotation}`;

    case "buy_train": {
      const t = def.trains.find((tr) => tr.id === action.trainTypeId);
      return `${who}: achète train ${action.trainTypeId} ($${t?.price ?? "?"})`;
    }

    case "run_routes": {
      const rev = action.routes.reduce((s, r) => s + r.revenue, 0);
      const compId = ctx.type === "operating" ? (ctx.companyOrder[ctx.companyIdx] ?? "") : "";
      const co = state.companies[compId];
      const trains = co?.trains.join(",") || "aucun";
      const suffix = action.dividend === "pay" ? "dividende" : "retenu";
      if (rev === 0 && action.routes.length === 0)
        return `${who}: routes $0 [aucune route trouvée — trains:${trains}] → retenu`;
      return `${who}: routes $${rev} (${action.routes.length} route(s), trains:${trains}) → ${suffix}`;
    }

    case "pass_operate": {
      const compId = ctx.type === "operating" ? (ctx.companyOrder[ctx.companyIdx] ?? "") : "";
      const co = state.companies[compId];
      const trains = co?.trains.join(",") || "aucun";
      const cash = co?.cash ?? 0;
      return `${who}: passe exploitation (trains:${trains}, tréso:$${cash})`;
    }

    case "buy_share":
      return `${who}: achète ${action.companyId}${action.parValue ? ` @ par $${action.parValue}` : " (secondaire)"}`;

    case "pass_stock": {
      const p = state.players.find((pl) => pl.id === state.currentPlayerId);
      return `${who}: passe bourse (cash:$${p?.cash ?? "?"})`;
    }

    case "bid":
      return `${who}: enchère $${action.amount} → ${action.privateId}`;

    case "pass_bid":
      return `${who}: passe enchère`;

    case "place_token":
      return `${who}: token ${action.companyId} → (${action.coord.q},${action.coord.r})`;

    default:
      return `${who}: ${(action as { type: string }).type}`;
  }
}

export function runBotActions(gameId: string, def: GameDef, slots: readonly LobbySlot[]): void {
  const botSlots = slots.filter((s) => s.isBot);
  if (botSlots.length === 0) return;

  const botPersonality = new Map<string, BotPersonality>(botSlots.map((s) => [s.id, s.personality]));
  const botIds = new Set(botSlots.map((s) => s.id));

  let iters = 0;

  function step() {
    if (iters++ >= 200) return;

    const rec = store.get(gameId);
    if (!rec || rec.phase !== "active" || !rec.state) return;
    if (rec.state.status === "finished") return;

    const { state } = rec;
    const activePlayerId = state.currentPlayerId;
    if (!botIds.has(activePlayerId)) return;

    const personality = botPersonality.get(activePlayerId) ?? "balanced";
    let aiAction = getAIAction(state, def, activePlayerId, 1500, personality);

    // Fallback: random legal move to prevent deadlock
    if (!aiAction) {
      const legal = getLegalMoves(state, def);
      aiAction = legal[Math.floor(Math.random() * legal.length)] ?? null;
    }
    if (!aiAction) {
      setImmediate(step);
      return;
    }

    // Log the decision
    const decisionLog = describeAction(aiAction, state, def, personality);
    const prevDecisions = rec.botDecisions ?? [];
    const newDecisions = [...prevDecisions.slice(-99), decisionLog];

    const result = applyAction(state, def, aiAction);
    if (!result.ok) {
      // Try a random legal move as fallback
      const legal = getLegalMoves(state, def);
      const fallback = legal[Math.floor(Math.random() * legal.length)];
      if (!fallback) return;
      const r2 = applyAction(state, def, fallback);
      if (!r2.ok) return;
      const fallbackLog = `[fallback] ${describeAction(fallback, state, def, personality)}`;
      const fd = [...newDecisions.slice(-99), fallbackLog];
      store.save({ ...rec, state: r2.state, botDecisions: fd });
      wsManager.broadcast(gameId, r2.state, fd);
      setImmediate(step);
      return;
    }

    store.save({ ...rec, state: result.state, botDecisions: newDecisions });
    wsManager.broadcast(gameId, result.state, newDecisions);

    setImmediate(step);
  }

  setTimeout(step, 50);
}
