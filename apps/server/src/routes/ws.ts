import type { FastifyPluginAsync } from "fastify";
import type { FastifyInstance } from "fastify";
import { applyAction } from "@18xx/engine";
import { GAME_1830 } from "@18xx/games";
import type { GameAction } from "@18xx/shared";
import { store } from "../store.js";
import { wsManager } from "../ws-manager.js";

const GAME_DEFS: Record<string, typeof GAME_1830> = { "1830": GAME_1830 };

export const wsRoutes: FastifyPluginAsync = async (fastify: FastifyInstance) => {
  fastify.get<{ Params: { gameId: string; playerId: string } }>(
    "/ws/:gameId/:playerId",
    { websocket: true },
    (socket, req) => {
      const { gameId, playerId } = req.params;
      wsManager.join(gameId, playerId, socket);

      const record = store.get(gameId);
      if (record) {
        socket.send(JSON.stringify({ type: "state_update", state: record.state }));
      }

      socket.on("message", (raw: Buffer | string) => {
        try {
          const action = JSON.parse(raw.toString()) as GameAction;
          const rec = store.get(gameId);
          if (!rec) return;

          const def = GAME_DEFS[rec.defId];
          if (!def) return;

          const result = applyAction(rec.state, def, action);
          if (!result.ok) {
            wsManager.broadcastError(gameId, playerId, result.error);
            return;
          }

          store.save({ ...rec, state: result.state });
          wsManager.broadcast(gameId, result.state);
        } catch {
          socket.send(JSON.stringify({ type: "error", error: "Invalid message format" }));
        }
      });
    },
  );
};
