import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { GAME_1830 } from "@18xx/games";
import { createInitialState, applyAction } from "@18xx/engine";
import type { GameAction } from "@18xx/shared";
import { store } from "../store.js";
import { wsManager } from "../ws-manager.js";

const GAME_DEFS: Record<string, typeof GAME_1830> = {
  "1830": GAME_1830,
};

const CreateGameSchema = z.object({
  gameDefId: z.string(),
  players: z.array(z.object({ id: z.string(), name: z.string() })).min(2).max(6),
});

export const gamesRoutes: FastifyPluginAsync = async (fastify) => {
  // POST /games — create a new game
  fastify.post("/games", async (req, reply) => {
    const body = CreateGameSchema.safeParse(req.body);
    if (!body.success) return reply.status(400).send({ error: body.error.flatten() });

    const def = GAME_DEFS[body.data.gameDefId];
    if (!def) return reply.status(404).send({ error: "Game definition not found" });

    const state = createInitialState(def, body.data.players);
    store.save({ state, defId: def.id, createdAt: Date.now(), playerIds: body.data.players.map((p) => p.id) });
    return reply.status(201).send({ gameId: state.id, state });
  });

  // GET /games — list active games
  fastify.get("/games", async (_req, reply) => {
    const list = store.list().map(({ state, defId, createdAt }) => ({
      gameId: state.id,
      defId,
      status: state.status,
      players: state.players.map((p) => ({ id: p.id, name: p.name })),
      createdAt,
    }));
    return reply.send(list);
  });

  // GET /games/:id — get full game state
  fastify.get<{ Params: { id: string } }>("/games/:id", async (req, reply) => {
    const record = store.get(req.params.id);
    if (!record) return reply.status(404).send({ error: "Game not found" });
    return reply.send({ state: record.state });
  });

  // POST /games/:id/action — apply a player action (REST fallback, also used for async)
  fastify.post<{ Params: { id: string } }>("/games/:id/action", async (req, reply) => {
    const record = store.get(req.params.id);
    if (!record) return reply.status(404).send({ error: "Game not found" });

    const def = GAME_DEFS[record.defId];
    if (!def) return reply.status(500).send({ error: "Game definition missing" });

    const action = req.body as GameAction;
    const result = applyAction(record.state, def, action);
    if (!result.ok) return reply.status(422).send({ error: result.error });

    const updatedRecord = { ...record, state: result.state };
    store.save(updatedRecord);
    wsManager.broadcast(record.state.id, result.state);
    return reply.send({ state: result.state });
  });

  // GET /games/defs — list available game definitions
  fastify.get("/games/defs", async (_req, reply) => {
    const defs = Object.entries(GAME_DEFS).map(([id, def]) => ({
      id,
      name: def.name,
      minPlayers: def.minPlayers,
      maxPlayers: def.maxPlayers,
    }));
    return reply.send(defs);
  });
};
