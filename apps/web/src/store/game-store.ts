import { create } from "zustand";
import type { GameState, GameAction, GameDef } from "@18xx/shared";

type GameStore = {
  state: GameState | null;
  def: GameDef | null;
  gameId: string | null;
  playerId: string | null;
  ws: WebSocket | null;
  error: string | null;

  setGame(gameId: string, state: GameState, def: GameDef, playerId: string): void;
  connectWs(gameId: string, playerId: string): void;
  sendAction(action: GameAction): void;
  clearError(): void;
};

export const useGameStore = create<GameStore>((set, get) => ({
  state: null,
  def: null,
  gameId: null,
  playerId: null,
  ws: null,
  error: null,

  setGame(gameId, state, def, playerId) {
    set({ gameId, state, def, playerId });
  },

  connectWs(gameId, playerId) {
    const existing = get().ws;
    if (existing) existing.close();

    const protocol = location.protocol === "https:" ? "wss" : "ws";
    const ws = new WebSocket(`${protocol}://${location.host}/ws/${gameId}/${playerId}`);

    ws.onmessage = (ev) => {
      const msg = JSON.parse(ev.data as string) as
        | { type: "state_update"; state: GameState }
        | { type: "error"; error: string };

      if (msg.type === "state_update") {
        set({ state: msg.state, error: null });
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

  clearError() {
    set({ error: null });
  },
}));
