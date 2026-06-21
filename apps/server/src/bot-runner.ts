/**
 * After a human player acts, runs bots asynchronously until it's a human's turn again.
 * Each bot move is scheduled via setImmediate so the event loop (health checks, WS) can
 * breathe between moves. MCTS is also capped at 800ms in ai.ts.
 */
import { applyAction, getAIAction, getLegalMoves } from "@18xx/engine";
import type { GameDef } from "@18xx/shared";
import type { LobbySlot, BotPersonality } from "./store.js";
import { store } from "./store.js";
import { wsManager } from "./ws-manager.js";

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

    // Safety: if personality returns null, fall back to a random legal move to prevent deadlock
    if (!aiAction) {
      const legal = getLegalMoves(state, def);
      aiAction = legal[Math.floor(Math.random() * legal.length)] ?? null;
    }
    if (!aiAction) {
      // Genuinely no legal moves — retry next tick in case state resolves itself
      setImmediate(step);
      return;
    }

    const result = applyAction(state, def, aiAction);
    if (!result.ok) {
      // Invalid move — try a random legal move instead
      const legal = getLegalMoves(state, def);
      const fallback = legal[Math.floor(Math.random() * legal.length)];
      if (!fallback) return;
      const r2 = applyAction(state, def, fallback);
      if (!r2.ok) return;
      store.save({ ...rec, state: r2.state });
      wsManager.broadcast(gameId, r2.state);
      setImmediate(step);
      return;
    }

    store.save({ ...rec, state: result.state });
    wsManager.broadcast(gameId, result.state);

    // Yield to the event loop before the next move (allows health checks and WS writes)
    setImmediate(step);
  }

  // Start after a short delay so the HTTP response is sent first
  setTimeout(step, 50);
}
