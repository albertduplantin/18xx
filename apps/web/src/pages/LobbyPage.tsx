import React, { useState } from "react";

type Props = {
  onJoin: (gameId: string, playerId: string) => void;
};

export function LobbyPage({ onJoin }: Props) {
  const [playerName, setPlayerName] = useState("");
  const [gameIdInput, setGameIdInput] = useState("");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const playerId = `p-${Math.random().toString(36).slice(2, 8)}`;

  async function handleCreateGame() {
    if (!playerName.trim()) { setError("Enter your name"); return; }
    setCreating(true);
    setError(null);
    try {
      const res = await fetch("/games", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          gameDefId: "1830",
          players: [{ id: playerId, name: playerName.trim() }],
        }),
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

  async function handleJoinGame() {
    if (!playerName.trim() || !gameIdInput.trim()) { setError("Enter name and game ID"); return; }
    onJoin(gameIdInput.trim(), playerId);
  }

  return (
    <div style={{
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      height: "100vh",
      background: "#1a1a2e",
    }}>
      <div style={{
        background: "#1e2040",
        border: "1px solid #333",
        borderRadius: 12,
        padding: 40,
        width: 400,
      }}>
        <h1 style={{ fontSize: 28, fontWeight: "bold", marginBottom: 4 }}>18xx Online</h1>
        <p style={{ color: "#aaa", marginBottom: 32, fontSize: 14 }}>Railroad strategy for the ages</p>

        {error && (
          <div style={{ background: "#c0392b20", border: "1px solid #c0392b", borderRadius: 6, padding: "8px 12px", marginBottom: 16, fontSize: 13, color: "#e74c3c" }}>
            {error}
          </div>
        )}

        <label style={{ fontSize: 12, color: "#aaa", display: "block", marginBottom: 4 }}>YOUR NAME</label>
        <input
          value={playerName}
          onChange={(e) => setPlayerName(e.target.value)}
          placeholder="e.g. Cornelius Vanderbilt"
          style={{
            width: "100%",
            padding: "10px 12px",
            background: "#12122a",
            border: "1px solid #444",
            borderRadius: 6,
            color: "#fff",
            fontSize: 14,
            marginBottom: 24,
          }}
        />

        <button
          onClick={handleCreateGame}
          disabled={creating}
          style={{
            width: "100%",
            padding: "12px",
            background: "#4040c0",
            border: "none",
            borderRadius: 6,
            color: "#fff",
            fontSize: 15,
            fontWeight: "bold",
            cursor: "pointer",
            marginBottom: 12,
          }}
        >
          {creating ? "Creating…" : "Create New Game (1830)"}
        </button>

        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <input
            value={gameIdInput}
            onChange={(e) => setGameIdInput(e.target.value)}
            placeholder="Game ID"
            style={{
              flex: 1,
              padding: "10px 12px",
              background: "#12122a",
              border: "1px solid #444",
              borderRadius: 6,
              color: "#fff",
              fontSize: 13,
            }}
          />
          <button
            onClick={handleJoinGame}
            style={{
              padding: "10px 16px",
              background: "#2a5030",
              border: "none",
              borderRadius: 6,
              color: "#fff",
              cursor: "pointer",
              fontSize: 13,
              fontWeight: "bold",
            }}
          >
            Join
          </button>
        </div>
      </div>
    </div>
  );
}
