/**
 * File-backed game store. Games persist through process restarts.
 * On Render free tier, the file survives crashes but not redeployments
 * (no persistent volume). Upgrade path: mount a Render Disk at /data.
 */
import type { GameState } from "@18xx/shared";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { resolve } from "path";

export type GameRecord = {
  state: GameState;
  defId: string;
  createdAt: number;
  playerIds: string[];
  botIds: readonly string[];
};

const DATA_DIR  = process.env["DATA_DIR"] ?? resolve(process.cwd(), "data");
const DATA_FILE = resolve(DATA_DIR, "games.json");

// ─── Load from disk at startup ────────────────────────────────────────────────

function loadFromDisk(): Map<string, GameRecord> {
  try {
    if (!existsSync(DATA_FILE)) return new Map();
    const raw = readFileSync(DATA_FILE, "utf8");
    const entries = JSON.parse(raw) as [string, GameRecord][];
    return new Map(entries);
  } catch {
    console.warn("[store] Could not load games from disk — starting fresh");
    return new Map();
  }
}

function saveToDisk(games: Map<string, GameRecord>): void {
  try {
    if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
    writeFileSync(DATA_FILE, JSON.stringify([...games.entries()]), "utf8");
  } catch (err) {
    console.error("[store] Failed to persist games:", err);
  }
}

const games = loadFromDisk();
console.log(`[store] Loaded ${games.size} game(s) from disk`);

// ─── Public API ───────────────────────────────────────────────────────────────

export const store = {
  save(record: GameRecord): void {
    games.set(record.state.id, record);
    saveToDisk(games);
  },

  get(gameId: string): GameRecord | undefined {
    return games.get(gameId);
  },

  list(): GameRecord[] {
    return [...games.values()];
  },

  delete(gameId: string): boolean {
    const deleted = games.delete(gameId);
    if (deleted) saveToDisk(games);
    return deleted;
  },
};
