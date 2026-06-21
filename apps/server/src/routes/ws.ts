import type { FastifyPluginAsync, FastifyInstance } from "fastify";
import { z } from "zod";
import { applyAction } from "@18xx/engine";
import { GAME_1830 } from "@18xx/games";
import type { GameAction } from "@18xx/shared";
import { store } from "../store.js";
import { wsManager } from "../ws-manager.js";
import { runBotActions } from "../bot-runner.js";

const GAME_DEFS: Record<string, typeof GAME_1830> = { "1830": GAME_1830 };
const ActionSchema = z.object({ type: z.string() }).passthrough();

export const wsRoutes: FastifyPluginAsync = async (fastify: FastifyInstance) => {
  fastify.get<{ Params: { gameId: string; playerId: string } }>(
    "/ws/:gameId/:playerId",
    { websocket: true },
    (socket, req) => {
      const { gameId, playerId } = req.params;
      wsManager.join(gameId, playerId, socket);

      const record = store.get(gameId);
      if (!record) {
        socket.send(JSON.stringify({ type: "error", error: "Game not found" }));
        socket.close();
        return;
      }

      // Send current state immediately
      if (record.phase === "lobby") {
        socket.send(JSON.stringify({
          type: "lobby_update",
          lobby: { id: record.id, defId: record.defId, phase: "lobby", creatorId: record.creatorId, slots: record.slots, maxPlayers: record.maxPlayers },
        }));
      } else if (record.state) {
        socket.send(JSON.stringify({ type: "state_update", state: record.state }));
      }

      socket.on("message", (raw: Buffer | string) => {
        try {
          const msg = JSON.parse(raw.toString()) as Record<string, unknown>;

          // Observer (playerId not in slots) → reject actions silently
          const currentRec = store.get(gameId);
          if (!currentRec) return;

          const isPlayer = currentRec.slots.some((s) => s.id === playerId && !s.isBot);
          if (!isPlayer) {
            socket.send(JSON.stringify({ type: "error", error: "Observers cannot send actions" }));
            return;
          }

          if (currentRec.phase !== "active" || !currentRec.state) {
            socket.send(JSON.stringify({ type: "error", error: "Game has not started yet" }));
            return;
          }

          const parsed = ActionSchema.safeParse(msg);
          if (!parsed.success) {
            socket.send(JSON.stringify({ type: "error", error: "Invalid action format" }));
            return;
          }

          const def = GAME_DEFS[currentRec.defId];
          if (!def) return;

          const result = applyAction(currentRec.state, def, parsed.data as GameAction);
          if (!result.ok) {
            wsManager.broadcastError(gameId, playerId, result.error);
            return;
          }

          store.save({ ...currentRec, state: result.state });
          wsManager.broadcast(gameId, result.state);
          runBotActions(gameId, def, currentRec.slots);

          const finalRec = store.get(gameId);
          if (finalRec?.state) wsManager.broadcast(gameId, finalRec.state);
        } catch {
          socket.send(JSON.stringify({ type: "error", error: "Invalid message format" }));
        }
      });
    },
  );
};
