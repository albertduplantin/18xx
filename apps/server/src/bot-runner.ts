/**
 * After a human player acts, runs bots in a loop until it's a human's turn again.
 * Supports multiple bot personalities. Capped at 200 iterations to prevent hangs.
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
  while (iters++ < 200) {
    const rec = store.get(gameId);
    if (!rec || rec.phase !== "active" || !rec.state) break;
    if (rec.state.status === "finished") break;

    const { state } = rec;
    const activePlayerId = state.currentPlayerId;
    if (!botIds.has(activePlayerId)) break;

    const personality = botPersonality.get(activePlayerId) ?? "balanced";
    const aiAction = getAIAction(state, def, activePlayerId, 1500, personality);
    if (!aiAction) break;

    const result = applyAction(state, def, aiAction);
    if (!result.ok) break;

    store.save({ ...rec, state: result.state });
    wsManager.broadcast(gameId, result.state);
  }
}
