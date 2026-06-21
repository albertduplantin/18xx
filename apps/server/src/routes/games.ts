import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { randomUUID } from "crypto";
import { GAME_1830 } from "@18xx/games";
import { createInitialState, applyAction } from "@18xx/engine";
import type { GameAction } from "@18xx/shared";
import type { BotPersonality, LobbySlot } from "../store.js";
import { store } from "../store.js";
import { wsManager } from "../ws-manager.js";
import { runBotActions } from "../bot-runner.js";

const GAME_DEFS: Record<string, typeof GAME_1830> = { "1830": GAME_1830 };

const PersonalitySchema = z.enum(["balanced", "aggressive", "conservative", "random"]);

const CreateGameSchema = z.object({
  gameDefId: z.string(),
  creatorId: z.string(),
  creatorName: z.string(),
  // Human player slots (including creator). Must be 1–6 total.
  humanSlots: z.number().int().min(1).max(6).default(1),
  // Bot slots to fill remaining spots
  bots: z.array(z.object({ personality: PersonalitySchema })).max(6).default([]),
});

const JoinSchema = z.object({
  playerId: z.string(),
  playerName: z.string(),
});

const StartSchema = z.object({
  playerId: z.string(), // must be creator
});

const ActionSchema = z.object({ type: z.string() }).passthrough();

export const gamesRoutes: FastifyPluginAsync = async (fastify) => {

  // ── Create lobby ──────────────────────────────────────────────────────────
  fastify.post("/games", async (req, reply) => {
    const body = CreateGameSchema.safeParse(req.body);
    if (!body.success) return reply.status(400).send({ error: body.error.flatten() });

    const { gameDefId, creatorId, creatorName, humanSlots, bots } = body.data;
    const def = GAME_DEFS[gameDefId];
    if (!def) return reply.status(404).send({ error: "Game definition not found" });

    const totalSlots = humanSlots + bots.length;
    if (totalSlots < def.minPlayers || totalSlots > def.maxPlayers) {
      return reply.status(400).send({
        error: `1830 requires ${def.minPlayers}–${def.maxPlayers} players total. Got ${totalSlots}.`,
      });
    }

    const id = randomUUID();

    // Build slots: creator first, then empty human slots, then bots
    const slots: LobbySlot[] = [
      { id: creatorId, name: creatorName, isBot: false, personality: "balanced", joined: true },
      ...Array.from({ length: humanSlots - 1 }, (_, i) => ({
        id: `open-slot-${i}`,
        name: `Joueur ${i + 2}`,
        isBot: false,
        personality: "balanced" as BotPersonality,
        joined: false,
      })),
      ...bots.map((b, i) => ({
        id: `bot-${id}-${i}`,
        name: `Bot ${i + 1} (${b.personality})`,
        isBot: true,
        personality: b.personality as BotPersonality,
        joined: true,
      })),
    ];

    store.save({
      id,
      defId: gameDefId,
      createdAt: Date.now(),
      phase: "lobby",
      creatorId,
      slots,
      maxPlayers: totalSlots,
    });

    // If no open human slots, start immediately
    const openSlots = slots.filter((s) => !s.isBot && !s.joined);
    if (openSlots.length === 0) {
      return startGame(id, def, slots, reply);
    }

    return reply.status(201).send({ gameId: id, phase: "lobby", slots });
  });

  // ── Join lobby ────────────────────────────────────────────────────────────
  fastify.post<{ Params: { id: string } }>("/games/:id/join", async (req, reply) => {
    const record = store.get(req.params.id);
    if (!record) return reply.status(404).send({ error: "Game not found" });
    if (record.phase !== "lobby") return reply.status(409).send({ error: "Game already started" });

    const body = JoinSchema.safeParse(req.body);
    if (!body.success) return reply.status(400).send({ error: body.error.flatten() });

    const { playerId, playerName } = body.data;

    // Check if already joined
    const existing = record.slots.find((s) => s.id === playerId);
    if (existing) {
      wsManager.broadcastLobby(record);
      return reply.send({ gameId: record.id, phase: "lobby", slots: record.slots });
    }

    // Find an open slot
    const openIdx = record.slots.findIndex((s) => !s.isBot && !s.joined);
    if (openIdx === -1) return reply.status(409).send({ error: "Lobby is full" });

    const updated = { ...record };
    updated.slots = [...record.slots];
    updated.slots[openIdx] = { ...updated.slots[openIdx]!, id: playerId, name: playerName, joined: true };

    store.save(updated);
    wsManager.broadcastLobby(updated);

    return reply.send({ gameId: record.id, phase: "lobby", slots: updated.slots });
  });

  // ── Start game (creator only) ─────────────────────────────────────────────
  fastify.post<{ Params: { id: string } }>("/games/:id/start", async (req, reply) => {
    const record = store.get(req.params.id);
    if (!record) return reply.status(404).send({ error: "Game not found" });
    if (record.phase !== "lobby") return reply.status(409).send({ error: "Game already started" });

    const body = StartSchema.safeParse(req.body);
    if (!body.success || body.data.playerId !== record.creatorId) {
      return reply.status(403).send({ error: "Only the creator can start the game" });
    }

    const def = GAME_DEFS[record.defId];
    if (!def) return reply.status(500).send({ error: "Game definition missing" });

    return startGame(record.id, def, record.slots, reply);
  });

  // ── List games ────────────────────────────────────────────────────────────
  fastify.get("/games", async (_req, reply) => {
    const list = store.list().map((r) => ({
      gameId: r.id,
      defId: r.defId,
      phase: r.phase,
      status: r.state?.status ?? "lobby",
      createdAt: r.createdAt,
      players: r.slots.map((s) => ({ id: s.id, name: s.name, isBot: s.isBot })),
    }));
    return reply.send(list);
  });

  // ── Get game definitions ──────────────────────────────────────────────────
  fastify.get("/games/defs", async (_req, reply) => {
    const defs = Object.entries(GAME_DEFS).map(([id, def]) => ({
      id, name: def.name, minPlayers: def.minPlayers, maxPlayers: def.maxPlayers,
    }));
    return reply.send(defs);
  });

  // ── Get game ──────────────────────────────────────────────────────────────
  fastify.get<{ Params: { id: string } }>("/games/:id", async (req, reply) => {
    const record = store.get(req.params.id);
    if (!record) return reply.status(404).send({ error: "Game not found" });

    if (record.phase === "lobby") {
      return reply.send({ phase: "lobby", gameId: record.id, defId: record.defId, creatorId: record.creatorId, slots: record.slots });
    }

    return reply.send({
      phase: "active",
      state: record.state,
      botIds: record.slots.filter((s) => s.isBot).map((s) => s.id),
    });
  });

  // ── Apply action ──────────────────────────────────────────────────────────
  fastify.post<{ Params: { id: string } }>("/games/:id/action", async (req, reply) => {
    const record = store.get(req.params.id);
    if (!record || record.phase !== "active" || !record.state) {
      return reply.status(404).send({ error: "Game not found or not started" });
    }

    const parsed = ActionSchema.safeParse(req.body);
    if (!parsed.success) return reply.status(400).send({ error: "Invalid action format" });

    const def = GAME_DEFS[record.defId];
    if (!def) return reply.status(500).send({ error: "Game definition missing" });

    const result = applyAction(record.state, def, parsed.data as GameAction);
    if (!result.ok) return reply.status(422).send({ error: result.error });

    store.save({ ...record, state: result.state });
    wsManager.broadcast(record.id, result.state);
    runBotActions(record.id, def, record.slots);

    const finalState = store.get(record.id)?.state ?? result.state;
    return reply.send({ state: finalState });
  });
};

// ─── Helper: transition lobby → active ───────────────────────────────────────

import type { FastifyReply } from "fastify";

async function startGame(
  gameId: string,
  def: typeof GAME_1830,
  slots: LobbySlot[],
  reply: FastifyReply,
) {
  const record = store.get(gameId)!;

  const players = slots.map((s) => ({ id: s.id, name: s.name }));
  const state = createInitialState(def, players);

  store.save({ ...record, phase: "active", state, botIds: slots.filter((s) => s.isBot).map((s) => s.id) });

  wsManager.broadcast(gameId, state);
  runBotActions(gameId, def, slots);

  const finalState = store.get(gameId)?.state ?? state;
  return reply.status(201).send({ gameId, phase: "active", state: finalState });
}
