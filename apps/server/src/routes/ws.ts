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

      // Send current state immediately on connect
      const record = store.get(gameId);
      if (record) {
        socket.send(JSON.stringify({ type: "state_update", state: record.state }));
      } else {
        socket.send(JSON.stringify({ type: "error", error: "Game not found" }));
        socket.close();
        return;
      }

      socket.on("message", (raw: Buffer | string) => {
        try {
          const parsed = ActionSchema.safeParse(JSON.parse(raw.toString()));
          if (!parsed.success) {
            socket.send(JSON.stringify({ type: "error", error: "Invalid action format" }));
            return;
          }

          const rec = store.get(gameId);
          if (!rec) {
            socket.send(JSON.stringify({ type: "error", error: "Game not found" }));
            return;
          }

          const def = GAME_DEFS[rec.defId];
          if (!def) return;

          const result = applyAction(rec.state, def, parsed.data as GameAction);
          if (!result.ok) {
            wsManager.broadcastError(gameId, playerId, result.error);
            return;
          }

          store.save({ ...rec, state: result.state });
          wsManager.broadcast(gameId, result.state);

          // Let the bot act if it's now the bot's turn
          runBotActions(gameId, def, rec.botIds);

          // Broadcast final state after all bot moves
          const finalRec = store.get(gameId);
          if (finalRec) wsManager.broadcast(gameId, finalRec.state);
        } catch {
          socket.send(JSON.stringify({ type: "error", error: "Invalid message format" }));
        }
      });
    },
  );
};
