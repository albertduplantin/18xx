import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { GAME_1830 } from "@18xx/games";
import { createInitialState, applyAction } from "@18xx/engine";
import type { GameAction } from "@18xx/shared";
import { store } from "../store.js";
import { wsManager } from "../ws-manager.js";
import { runBotActions } from "../bot-runner.js";

const GAME_DEFS: Record<string, typeof GAME_1830> = {
  "1830": GAME_1830,
};

const BOT_ID = "bot-1";
const BOT_NAME = "Bot";

const CreateGameSchema = z.object({
  gameDefId: z.string(),
  players: z.array(z.object({ id: z.string(), name: z.string() })).min(1).max(6),
});

const ActionSchema = z.object({ type: z.string() }).passthrough();

export const gamesRoutes: FastifyPluginAsync = async (fastify) => {
  // POST /games — create a new game
  fastify.post("/games", async (req, reply) => {
    const body = CreateGameSchema.safeParse(req.body);
    if (!body.success) return reply.status(400).send({ error: body.error.flatten() });

    const def = GAME_DEFS[body.data.gameDefId];
    if (!def) return reply.status(404).send({ error: "Game definition not found" });

    const humanPlayers = body.data.players;
    const needsBot = humanPlayers.length < def.minPlayers;

    // Auto-fill with bots to reach minimum player count
    const allPlayers = [...humanPlayers];
    const botIds: string[] = [];
    while (allPlayers.length < def.minPlayers) {
      const botId = `${BOT_ID}-${botIds.length + 1}`;
      allPlayers.push({ id: botId, name: `${BOT_NAME} ${botIds.length + 1}` });
      botIds.push(botId);
    }

    const state = createInitialState(def, allPlayers);
    store.save({
      state,
      defId: def.id,
      createdAt: Date.now(),
      playerIds: allPlayers.map((p) => p.id),
      botIds,
    });

    // If the first turn belongs to a bot, start it
    if (needsBot) {
      runBotActions(state.id, def, botIds);
    }

    const finalState = store.get(state.id)?.state ?? state;
    return reply.status(201).send({ gameId: finalState.id, state: finalState, botIds });
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

  // GET /games/:id — get full game state
  fastify.get<{ Params: { id: string } }>("/games/:id", async (req, reply) => {
    const record = store.get(req.params.id);
    if (!record) return reply.status(404).send({ error: "Game not found" });
    return reply.send({ state: record.state, botIds: record.botIds });
  });

  // POST /games/:id/action — apply a player action (REST fallback / async)
  fastify.post<{ Params: { id: string } }>("/games/:id/action", async (req, reply) => {
    const record = store.get(req.params.id);
    if (!record) return reply.status(404).send({ error: "Game not found" });

    const parsed = ActionSchema.safeParse(req.body);
    if (!parsed.success) return reply.status(400).send({ error: "Invalid action format" });

    const def = GAME_DEFS[record.defId];
    if (!def) return reply.status(500).send({ error: "Game definition missing" });

    const result = applyAction(record.state, def, parsed.data as GameAction);
    if (!result.ok) return reply.status(422).send({ error: result.error });

    store.save({ ...record, state: result.state });
    wsManager.broadcast(record.state.id, result.state);

    runBotActions(record.state.id, def, record.botIds);

    const finalState = store.get(record.state.id)?.state ?? result.state;
    return reply.send({ state: finalState });
  });
};
