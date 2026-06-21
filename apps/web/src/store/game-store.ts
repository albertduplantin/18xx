import { create } from "zustand";
import type { GameState, GameAction, GameDef } from "@18xx/shared";

export type BotPersonality = "balanced" | "aggressive" | "conservative" | "random";

export type LobbySlot = {
  id: string;
  name: string;
  isBot: boolean;
  personality: BotPersonality;
  joined: boolean;
};

export type LobbyInfo = {
  id: string;
  defId: string;
  phase: "lobby";
  creatorId: string;
  slots: LobbySlot[];
  maxPlayers: number;
};

type GameStore = {
  gameId: string | null;
  playerId: string | null;
  phase: "idle" | "lobby" | "active";
  lobby: LobbyInfo | null;
  state: GameState | null;
  def: GameDef | null;
  isObserver: boolean;
  ws: WebSocket | null;
  error: string | null;

  setLobby(gameId: string, lobby: LobbyInfo, playerId: string): void;
  setGame(gameId: string, state: GameState, def: GameDef, playerId: string, isObserver?: boolean): void;
  connectWs(gameId: string, playerId: string): void;
  sendAction(action: GameAction): void;
  clearError(): void;
  reset(): void;
};

export const useGameStore = create<GameStore>((set, get) => ({
  gameId: null,
  playerId: null,
  phase: "idle",
  lobby: null,
  state: null,
  def: null,
  isObserver: false,
  ws: null,
  error: null,

  setLobby(gameId, lobby, playerId) {
    set({ gameId, lobby, playerId, phase: "lobby", state: null, error: null });
  },

  setGame(gameId, state, def, playerId, isObserver = false) {
    set({ gameId, state, def, playerId, phase: "active", lobby: null, isObserver, error: null });
  },

  connectWs(gameId, playerId) {
    const existing = get().ws;
    if (existing) existing.close();

    const protocol = location.protocol === "https:" ? "wss" : "ws";
    const ws = new WebSocket(`${protocol}://${location.host}/ws/${gameId}/${playerId}`);

    ws.onmessage = (ev) => {
      const msg = JSON.parse(ev.data as string) as
        | { type: "state_update"; state: GameState }
        | { type: "lobby_update"; lobby: LobbyInfo }
        | { type: "error"; error: string };

      if (msg.type === "state_update") {
        const { def, playerId: pid } = get();
        const playerIds = msg.state.players.map((p) => p.id);
        const isObs = !playerIds.includes(pid ?? "");
        set({ state: msg.state, phase: "active", lobby: null, isObserver: isObs, def: def ?? undefined as never, error: null });
      } else if (msg.type === "lobby_update") {
        set({ lobby: msg.lobby, phase: "lobby", state: null, error: null });
      } else {
        set({ error: msg.error });
      }
    };

    ws.onclose = () => set({ ws: null });
    ws.onerror = () => set({ error: "WebSocket connection lost" });

    set({ ws });
  },

  sendAction(action) {
    const { ws } = get();
    if (ws?.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(action));
    } else {
      set({ error: "Not connected to game server" });
    }
  },

  clearError() { set({ error: null }); },

  reset() {
    const { ws } = get();
    if (ws) ws.close();
    set({ gameId: null, playerId: null, phase: "idle", lobby: null, state: null, def: null, isObserver: false, ws: null, error: null });
  },
}));
