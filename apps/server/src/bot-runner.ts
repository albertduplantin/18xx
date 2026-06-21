/**
 * After a human player acts, runs bots asynchronously until it's a human's turn again.
 * Each bot move is scheduled via setImmediate so the event loop (health checks, WS) can
 * breathe between moves. MCTS is also capped at 800ms in ai.ts.
 */
import { applyAction, getAIAction } from "@18xx/engine";
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
    const aiAction = getAIAction(state, def, activePlayerId, 1500, personality);
    if (!aiAction) return;

    const result = applyAction(state, def, aiAction);
    if (!result.ok) return;

    store.save({ ...rec, state: result.state });
    wsManager.broadcast(gameId, result.state);

    // Yield to the event loop before the next move (allows health checks and WS writes)
    setImmediate(step);
  }

  // Start after a short delay so the HTTP response is sent first
  setTimeout(step, 50);
}
