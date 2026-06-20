/**
 * After a human player acts, this runs the AI bot in a loop until
 * it's a human's turn again (or the game ends).
 * Cap at 100 iterations to prevent any infinite loop bugs from hanging the server.
 */
import { applyAction, getAIAction } from "@18xx/engine";
import type { GameDef } from "@18xx/shared";
import { store } from "./store.js";
import { wsManager } from "./ws-manager.js";

export function runBotActions(gameId: string, def: GameDef, botIds: readonly string[]): void {
  if (botIds.length === 0) return;

  let iters = 0;
  while (iters++ < 100) {
    const rec = store.get(gameId);
    if (!rec || rec.state.status === "finished") break;

    const { state } = rec;

    // Determine whose turn it is
    const activePlayerId = state.currentPlayerId;
    if (!botIds.includes(activePlayerId)) break;

    const aiAction = getAIAction(state, def, activePlayerId);
    if (!aiAction) break;

    const result = applyAction(state, def, aiAction);
    if (!result.ok) break;

    store.save({ ...rec, state: result.state });
    wsManager.broadcast(gameId, result.state);
  }
}
