/**
 * In-memory game store. Replace with PostgreSQL + Redis for production.
 * Each game is stored as its full serializable GameState.
 */
import type { GameState } from "@18xx/shared";

export type GameRecord = {
  state: GameState;
  defId: string;
  createdAt: number;
  playerIds: string[];
  botIds: readonly string[];
};

const games = new Map<string, GameRecord>();

export const store = {
  save(record: GameRecord): void {
    games.set(record.state.id, record);
  },

  get(gameId: string): GameRecord | undefined {
    return games.get(gameId);
  },

  list(): GameRecord[] {
    return [...games.values()];
  },

  delete(gameId: string): boolean {
    return games.delete(gameId);
  },
};
