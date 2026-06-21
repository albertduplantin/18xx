import type { WebSocket } from "@fastify/websocket";
import type { GameState } from "@18xx/shared";
import type { GameRecord } from "./store.js";

type Client = {
  socket: WebSocket;
  playerId: string;
};

const rooms = new Map<string, Set<Client>>();

export const wsManager = {
  join(gameId: string, playerId: string, socket: WebSocket): void {
    if (!rooms.has(gameId)) rooms.set(gameId, new Set());
    rooms.get(gameId)!.add({ socket, playerId });

    socket.on("close", () => {
      const room = rooms.get(gameId);
      if (room) {
        room.forEach((c) => { if (c.socket === socket) room.delete(c); });
        if (room.size === 0) rooms.delete(gameId);
      }
    });
  },

  broadcast(gameId: string, state: GameState): void {
    const room = rooms.get(gameId);
    if (!room) return;
    const payload = JSON.stringify({ type: "state_update", state });
    room.forEach(({ socket }) => {
      if (socket.readyState === 1) socket.send(payload);
    });
  },

  broadcastLobby(record: GameRecord): void {
    const room = rooms.get(record.id);
    if (!room) return;
    const payload = JSON.stringify({
      type: "lobby_update",
      lobby: {
        id: record.id,
        defId: record.defId,
        phase: record.phase,
        creatorId: record.creatorId,
        slots: record.slots,
        maxPlayers: record.maxPlayers,
      },
    });
    room.forEach(({ socket }) => {
      if (socket.readyState === 1) socket.send(payload);
    });
  },

  broadcastError(gameId: string, playerId: string, error: string): void {
    const room = rooms.get(gameId);
    if (!room) return;
    const payload = JSON.stringify({ type: "error", error });
    room.forEach((c) => {
      if (c.playerId === playerId && c.socket.readyState === 1) {
        c.socket.send(payload);
      }
    });
  },

  connectedCount(gameId: string): number {
    return rooms.get(gameId)?.size ?? 0;
  },
};
