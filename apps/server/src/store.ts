/**
 * File-backed game store.
 * Supports a "lobby" phase (waiting for players) before the game starts.
 */
import type { GameState } from "@18xx/shared";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { resolve } from "path";

export type BotPersonality = "balanced" | "aggressive" | "conservative" | "random";

export type LobbySlot = {
  id: string;
  name: string;
  isBot: boolean;
  personality: BotPersonality;
  joined: boolean;
};

export type GameRecord = {
  id: string;
  defId: string;
  createdAt: number;
  phase: "lobby" | "active";
  creatorId: string;
  slots: LobbySlot[];
  maxPlayers: number;
  // set when phase = "active"
  state?: GameState;
  botIds?: readonly string[];
  botDecisions?: readonly string[];
};

const DATA_DIR  = process.env["DATA_DIR"] ?? resolve(process.cwd(), "data");
const DATA_FILE = resolve(DATA_DIR, "games.json");

function loadFromDisk(): Map<string, GameRecord> {
  try {
    if (!existsSync(DATA_FILE)) return new Map();
    const raw = readFileSync(DATA_FILE, "utf8");
    const entries = JSON.parse(raw) as [string, GameRecord][];
    // Migrate legacy records (no phase field)
    const migrated: [string, GameRecord][] = entries.map(([k, v]) => {
      const rec: GameRecord = {
        id: v.id || k,
        defId: v.defId,
        createdAt: v.createdAt,
        phase: v.phase ?? "active",
        creatorId: v.creatorId ?? "",
        slots: v.slots ?? [],
        maxPlayers: v.maxPlayers ?? 4,
      };
      if (v.state) rec.state = v.state;
      if (v.botIds) rec.botIds = v.botIds;
      return [k, rec];
    });
    return new Map(migrated);
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

export const store = {
  save(record: GameRecord): void {
    games.set(record.id, record);
    saveToDisk(games);
  },

  get(id: string): GameRecord | undefined {
    return games.get(id);
  },

  list(): GameRecord[] {
    return [...games.values()];
  },

  delete(id: string): boolean {
    const deleted = games.delete(id);
    if (deleted) saveToDisk(games);
    return deleted;
  },
};
