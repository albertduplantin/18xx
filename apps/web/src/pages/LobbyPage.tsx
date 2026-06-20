import React, { useState, useEffect } from "react";

type GameSummary = {
  gameId: string;
  defId: string;
  status: string;
  players: { id: string; name: string }[];
  createdAt: number;
};

type Props = {
  onJoin: (gameId: string, playerId: string) => void;
  onOpenEditor: () => void;
};

function randomId() {
  return `p-${Math.random().toString(36).slice(2, 8)}`;
}

export function LobbyPage({ onJoin, onOpenEditor }: Props) {
  const [playerName, setPlayerName] = useState(() => localStorage.getItem("18xx_name") ?? "");
  const [playerId] = useState(() => localStorage.getItem("18xx_pid") ?? randomId());
  const [gameIdInput, setGameIdInput] = useState("");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeGames, setActiveGames] = useState<GameSummary[]>([]);

  useEffect(() => {
    if (playerName) localStorage.setItem("18xx_name", playerName);
    localStorage.setItem("18xx_pid", playerId);
  }, [playerName, playerId]);

  useEffect(() => {
    fetch("/games").then((r) => r.json()).then((d) => setActiveGames(d as GameSummary[])).catch(() => {});
  }, []);

  async function handleCreate() {
    if (!playerName.trim()) { setError("Enter your name first"); return; }
    setCreating(true); setError(null);
    try {
      const res = await fetch("/games", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ gameDefId: "1830", players: [{ id: playerId, name: playerName.trim() }] }),
      });
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json() as { gameId: string };
      onJoin(data.gameId, playerId);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create game");
    } finally {
      setCreating(false);
    }
  }

  async function handleJoin(gameId: string) {
    if (!playerName.trim()) { setError("Enter your name first"); return; }
    onJoin(gameId, playerId);
  }

  return (
    <div style={{ minHeight: "100vh", background: "#1a1a2e", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 24 }}>
      <div style={{ width: "100%", maxWidth: 560 }}>
        {/* Title */}
        <div style={{ textAlign: "center", marginBottom: 40 }}>
          <h1 style={{ fontSize: 42, fontWeight: 900, letterSpacing: -1, marginBottom: 8 }}>🚂 18xx Online</h1>
          <p style={{ color: "#666", fontSize: 15 }}>Railroad strategy. Build track. Corner markets. Win.</p>
        </div>

        {error && (
          <div style={{ background: "#3a1010", border: "1px solid #c0392b", borderRadius: 8, padding: "10px 14px", marginBottom: 16, fontSize: 13, color: "#e07070" }}>
            {error}
          </div>
        )}

        {/* Name input */}
        <div style={{ background: "#1e2040", border: "1px solid #2a2a50", borderRadius: 10, padding: 20, marginBottom: 16 }}>
          <label style={{ fontSize: 11, color: "#aaa", display: "block", marginBottom: 6, fontWeight: 600, letterSpacing: 1 }}>YOUR NAME</label>
          <input
            value={playerName}
            onChange={(e) => setPlayerName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleCreate()}
            placeholder="e.g. Cornelius Vanderbilt"
            style={{ width: "100%", padding: "10px 14px", background: "#12122a", border: "1px solid #444", borderRadius: 6, color: "#fff", fontSize: 15 }}
          />
        </div>

        {/* Actions */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 20 }}>
          <button
            onClick={handleCreate}
            disabled={creating}
            style={{ padding: "14px", background: "#4040c0", border: "none", borderRadius: 8, color: "#fff", fontSize: 14, fontWeight: "bold", cursor: "pointer" }}
          >
            {creating ? "Creating…" : "New Game (1830)"}
          </button>
          <button
            onClick={onOpenEditor}
            style={{ padding: "14px", background: "#1e3050", border: "1px solid #3050a0", borderRadius: 8, color: "#78c0f0", fontSize: 14, fontWeight: "bold", cursor: "pointer" }}
          >
            Map Editor
          </button>
        </div>

        {/* Join by ID */}
        <div style={{ display: "flex", gap: 8, marginBottom: 24 }}>
          <input
            value={gameIdInput}
            onChange={(e) => setGameIdInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && gameIdInput && handleJoin(gameIdInput)}
            placeholder="Paste game ID to join"
            style={{ flex: 1, padding: "10px 14px", background: "#12122a", border: "1px solid #333", borderRadius: 6, color: "#fff", fontSize: 13 }}
          />
          <button
            onClick={() => gameIdInput && handleJoin(gameIdInput)}
            disabled={!gameIdInput}
            style={{ padding: "10px 18px", background: "#2a5030", border: "1px solid #4a8050", borderRadius: 6, color: "#70d070", fontWeight: "bold", cursor: gameIdInput ? "pointer" : "not-allowed", fontSize: 13 }}
          >
            Join
          </button>
        </div>

        {/* Active games */}
        {activeGames.length > 0 && (
          <div>
            <div style={{ fontSize: 11, color: "#555", fontWeight: 600, letterSpacing: 1, marginBottom: 10 }}>ACTIVE GAMES</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {activeGames.map((g) => (
                <div key={g.gameId}
                  style={{ background: "#1e2040", border: "1px solid #2a2a50", borderRadius: 8, padding: "10px 14px", display: "flex", alignItems: "center", gap: 12 }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13, fontWeight: 600 }}>{g.defId}</div>
                    <div style={{ fontSize: 11, color: "#666", marginTop: 2 }}>
                      {g.players.map((p) => p.name).join(", ")} · {g.status}
                    </div>
                  </div>
                  <button
                    onClick={() => handleJoin(g.gameId)}
                    style={{ padding: "6px 14px", background: "#2a3060", border: "1px solid #4040c0", borderRadius: 6, color: "#78c0f0", cursor: "pointer", fontSize: 12, fontWeight: "bold" }}
                  >
                    Rejoin
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
