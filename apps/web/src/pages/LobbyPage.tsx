import React, { useState, useEffect } from "react";
import type { BotPersonality, LobbySlot } from "../store/game-store.js";

type GameSummary = {
  gameId: string;
  defId: string;
  phase: "lobby" | "active";
  status: string;
  players: { id: string; name: string; isBot: boolean }[];
  createdAt: number;
};

type Props = {
  onJoinGame: (gameId: string, playerId: string, asObserver?: boolean) => void;
  onOpenEditor: () => void;
  /** If set, auto-show the join flow for this game (invite link) */
  inviteGameId?: string;
};

function randomId() {
  return `p-${Math.random().toString(36).slice(2, 9)}`;
}

const PERSONALITY_LABELS: Record<BotPersonality, { label: string; desc: string; color: string }> = {
  balanced:     { label: "Équilibré",    desc: "MCTS — stratégie optimale",          color: "#4060c0" },
  aggressive:   { label: "Agressif",     desc: "Par élevé, trains chers, licite tout", color: "#c04040" },
  conservative: { label: "Conservateur", desc: "Économise, par bas, retient souvent", color: "#40a040" },
  random:       { label: "Aléatoire",    desc: "Coups au hasard — point de référence", color: "#808080" },
};

export function LobbyPage({ onJoinGame, onOpenEditor, inviteGameId }: Props) {
  const [playerName, setPlayerName] = useState(() => localStorage.getItem("18xx_name") ?? "");
  const [playerId] = useState(() => {
    const stored = localStorage.getItem("18xx_pid");
    if (stored) return stored;
    const id = randomId();
    localStorage.setItem("18xx_pid", id);
    return id;
  });
  const [activeGames, setActiveGames] = useState<GameSummary[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  // Game setup state
  const [humanSlots, setHumanSlots] = useState(1);
  const [bots, setBots] = useState<BotPersonality[]>(["balanced", "balanced", "balanced"]);

  // Invite flow
  const [joiningGameId, setJoiningGameId] = useState<string | null>(inviteGameId ?? null);

  useEffect(() => {
    if (playerName) localStorage.setItem("18xx_name", playerName);
  }, [playerName]);

  useEffect(() => {
    fetchGames();
    const id = setInterval(fetchGames, 5000);
    return () => clearInterval(id);
  }, []);

  function fetchGames() {
    fetch("/games")
      .then((r) => r.ok ? r.json() : Promise.resolve([]))
      .then((d) => setActiveGames(d as GameSummary[]))
      .catch(() => {});
  }

  const totalPlayers = humanSlots + bots.length;

  async function handleCreate() {
    if (!playerName.trim()) { setError("Entre ton nom d'abord"); return; }
    if (totalPlayers < 2 || totalPlayers > 6) { setError("1830 : 2–6 joueurs en tout"); return; }
    setCreating(true); setError(null);
    try {
      const res = await fetch("/games", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          gameDefId: "1830",
          creatorId: playerId,
          creatorName: playerName.trim(),
          humanSlots,
          bots: bots.map((p) => ({ personality: p })),
        }),
      });
      if (!res.ok) {
        const text = await res.text();
        let msg = `Erreur serveur (${res.status})`;
        try { msg = (JSON.parse(text) as { error?: string }).error ?? msg; } catch {}
        throw new Error(msg);
      }
      const data = await res.json() as { gameId: string; phase: string };
      // humanSlots = 0 → pure bot game, join as observer
      if (humanSlots === 0) {
        onJoinGame(data.gameId, playerId, true);
      } else {
        onJoinGame(data.gameId, playerId);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Impossible de créer la partie");
    } finally {
      setCreating(false);
    }
  }

  async function handleJoin(gameId: string) {
    if (!playerName.trim()) { setError("Entre ton nom d'abord"); return; }
    try {
      const res = await fetch(`/games/${gameId}/join`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ playerId, playerName: playerName.trim() }),
      });
      if (!res.ok) throw new Error("Impossible de rejoindre");
      onJoinGame(gameId, playerId);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur");
    }
  }

  function handleWatch(gameId: string) {
    onJoinGame(gameId, `obs-${randomId()}`, true);
  }

  async function handleCreateBotSpectacle() {
    if (!playerName.trim()) { setError("Entre ton nom d'abord"); return; }
    setCreating(true); setError(null);
    try {
      const res = await fetch("/games", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          gameDefId: "1830",
          creatorId: playerId,
          creatorName: playerName.trim(),
          humanSlots: 0,  // pure bot game — creator joins as observer
          bots: [
            { personality: "balanced" },
            { personality: "aggressive" },
            { personality: "conservative" },
            { personality: "random" },
          ],
        }),
      });
      const data = await res.json() as { gameId: string };
      if (!res.ok) throw new Error((data as { error?: string }).error ?? "Erreur");
      onJoinGame(data.gameId, playerId, true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur");
    } finally {
      setCreating(false);
    }
  }

  async function handleDelete(gameId: string) {
    await fetch(`/games/${gameId}`, { method: "DELETE" });
    setConfirmDeleteId(null);
    fetchGames();
  }

  const s = {
    page: { minHeight: "100vh", background: "#0f0f1e", display: "flex", flexDirection: "column", alignItems: "center", padding: "32px 16px", fontFamily: "'Palatino Linotype', Palatino, Georgia, serif" } as React.CSSProperties,
    card: { background: "#1a1a2e", border: "1px solid #2a2a50", borderRadius: 12, padding: 20, marginBottom: 12, width: "100%", maxWidth: 620 } as React.CSSProperties,
    h2: { fontSize: 13, fontWeight: 700, letterSpacing: 2, color: "#6060a0", marginBottom: 14, textTransform: "uppercase" } as React.CSSProperties,
    input: { width: "100%", padding: "10px 14px", background: "#12122a", border: "1px solid #444", borderRadius: 6, color: "#fff", fontSize: 14, boxSizing: "border-box" } as React.CSSProperties,
    label: { fontSize: 11, color: "#888", display: "block", marginBottom: 5, fontWeight: 600, letterSpacing: 1, textTransform: "uppercase" } as React.CSSProperties,
  };
  function btn(bg: string, border = bg): React.CSSProperties {
    return { padding: "10px 20px", background: bg, border: `1px solid ${border}`, borderRadius: 7, color: "#fff", fontWeight: "bold", cursor: "pointer", fontSize: 13 };
  }

  return (
    <div style={s.page}>
      <div style={{ textAlign: "center", marginBottom: 36, maxWidth: 620 }}>
        <div style={{ fontSize: 44, marginBottom: 8 }}>🚂</div>
        <h1 style={{ fontSize: 34, fontWeight: 900, letterSpacing: -1, marginBottom: 6 }}>18xx Online</h1>
        <p style={{ color: "#555", fontSize: 14 }}>Construis des voies ferrées. Manœuvre en bourse. Domine tes rivaux.</p>
      </div>

      {error && (
        <div style={{ ...s.card, background: "#2a1010", border: "1px solid #c03030", padding: "12px 16px", color: "#e07070", fontSize: 13 }}>
          {error}
        </div>
      )}

      {/* Invite to join a specific game */}
      {joiningGameId && (
        <div style={{ ...s.card, border: "1px solid #4060c0" }}>
          <div style={s.h2}>Rejoindre la partie</div>
          <p style={{ fontSize: 13, color: "#aaa", marginBottom: 12 }}>ID: <code style={{ color: "#78c0f0" }}>{joiningGameId}</code></p>
          <label style={s.label}>Ton nom</label>
          <input style={{ ...s.input, marginBottom: 12 }} value={playerName} onChange={(e) => setPlayerName(e.target.value)} placeholder="Cornelius Vanderbilt" />
          <div style={{ display: "flex", gap: 8 }}>
            <button style={btn("#4040c0")} onClick={() => handleJoin(joiningGameId)}>Rejoindre</button>
            <button style={btn("transparent", "#444")} onClick={() => handleWatch(joiningGameId)}>Observer</button>
            <button style={{ ...btn("transparent", "#333"), color: "#555" }} onClick={() => setJoiningGameId(null)}>Annuler</button>
          </div>
        </div>
      )}

      {/* Player name */}
      <div style={s.card}>
        <label style={s.label}>Ton nom</label>
        <input style={s.input} value={playerName} onChange={(e) => setPlayerName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleCreate()}
          placeholder="Cornelius Vanderbilt" />
      </div>

      {/* Create game */}
      <div style={s.card}>
        <div style={s.h2}>Créer une partie — 1830</div>

        {/* Human slots */}
        <div style={{ marginBottom: 16 }}>
          <label style={s.label}>Joueurs humains</label>
          <div style={{ display: "flex", gap: 6 }}>
            {[0, 1, 2, 3, 4, 5, 6].filter((n) => n + bots.length <= 6 && (n === 0 || n + bots.length >= 2)).map((n) => (
              <button key={n} onClick={() => setHumanSlots(n)}
                style={{ ...btn(humanSlots === n ? (n === 0 ? "#2a1a40" : "#4040c0") : "#1a1a3a", humanSlots === n ? (n === 0 ? "#7030c0" : "#6060e0") : "#333"), padding: "6px 14px", fontSize: 13 }}>
                {n === 0 ? "👁 0" : n}
              </button>
            ))}
          </div>
          {humanSlots === 0 && (
            <p style={{ fontSize: 11, color: "#a060e0", marginTop: 6 }}>
              Partie 100% bots — tu regardes en observateur.
            </p>
          )}
          {humanSlots > 1 && (
            <p style={{ fontSize: 11, color: "#666", marginTop: 6 }}>
              Les {humanSlots - 1} autre(s) joueur(s) rejoignent via lien d'invitation.
            </p>
          )}
        </div>

        {/* Bots */}
        <div style={{ marginBottom: 16 }}>
          <label style={s.label}>Bots ({bots.length}) — total : {totalPlayers} joueurs</label>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {bots.map((p, i) => (
              <div key={i} style={{ display: "flex", gap: 6, alignItems: "center" }}>
                <span style={{ fontSize: 12, color: "#666", width: 50 }}>Bot {i + 1}</span>
                {(Object.keys(PERSONALITY_LABELS) as BotPersonality[]).map((pers) => (
                  <button key={pers} onClick={() => { const nb = [...bots]; nb[i] = pers; setBots(nb); }}
                    style={{ padding: "4px 10px", fontSize: 11, cursor: "pointer", borderRadius: 12,
                      background: p === pers ? PERSONALITY_LABELS[pers].color : "transparent",
                      border: `1px solid ${p === pers ? PERSONALITY_LABELS[pers].color : "#333"}`,
                      color: p === pers ? "#fff" : "#666" }}>
                    {PERSONALITY_LABELS[pers].label}
                  </button>
                ))}
                <button onClick={() => { if (bots.length + humanSlots > 2) setBots(bots.filter((_, j) => j !== i)); }}
                  style={{ ...btn("transparent", "#333"), padding: "3px 8px", color: "#555", fontSize: 11 }}>✕</button>
              </div>
            ))}
            {totalPlayers < 6 && (
              <button onClick={() => setBots([...bots, "balanced"])}
                style={{ ...btn("transparent", "#2a2a40"), fontSize: 12, textAlign: "left" as const, padding: "6px 12px" }}>
                + Ajouter un bot
              </button>
            )}
          </div>
          <p style={{ fontSize: 11, color: "#666", marginTop: 8 }}>
            {totalPlayers < 2 ? "⚠️ 2 joueurs minimum" : `✓ ${totalPlayers} joueurs — ${humanSlots} humain(s) + ${bots.length} bot(s)`}
          </p>
        </div>

        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={handleCreate} disabled={creating || totalPlayers < 2}
            style={{ ...btn(humanSlots === 0 ? "#2a1a40" : (totalPlayers >= 2 ? "#4040c0" : "#222"), humanSlots === 0 ? "#7030c0" : "#6060e0"), flex: 1, opacity: totalPlayers < 2 ? 0.5 : 1 }}>
            {creating ? "Création…" : humanSlots === 0 ? "👁 Lancer et observer" : "Créer la partie"}
          </button>
          <button onClick={onOpenEditor} style={{ ...btn("#1e3050", "#3050a0"), color: "#78c0f0" }}>
            Éditeur
          </button>
        </div>
      </div>

      {/* Active games list */}
      {activeGames.length > 0 && (
        <div style={{ ...s.card, maxWidth: 620 }}>
          <div style={s.h2}>Parties en cours</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {activeGames.map((g) => {
              const humans = g.players.filter((p) => !p.isBot);
              const bots = g.players.filter((p) => p.isBot);
              const isLobby = g.phase === "lobby";
              return (
                <div key={g.gameId} style={{ background: "#12122a", border: "1px solid #2a2a40", borderRadius: 8, padding: "10px 14px", display: "flex", alignItems: "center", gap: 10 }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 4 }}>
                      <span style={{ fontSize: 12, fontWeight: 700, color: "#fff" }}>{g.defId}</span>
                      <span style={{ fontSize: 10, padding: "2px 8px", borderRadius: 10, background: isLobby ? "#2a4020" : "#1a2a50", color: isLobby ? "#70c050" : "#6090f0" }}>
                        {isLobby ? "En attente" : g.status === "finished" ? "Terminée" : "En cours"}
                      </span>
                    </div>
                    <div style={{ fontSize: 11, color: "#666" }}>
                      {humans.map((p) => p.name).join(", ")}
                      {bots.length > 0 && ` + ${bots.length} bot(s)`}
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                    {isLobby && (
                      <button onClick={() => handleJoin(g.gameId)}
                        style={{ ...btn("#2a4060", "#3060a0"), fontSize: 12, padding: "5px 12px", color: "#78c0f0" }}>
                        Rejoindre
                      </button>
                    )}
                    <button onClick={() => handleWatch(g.gameId)}
                      style={{ ...btn("transparent", "#333"), fontSize: 12, padding: "5px 12px", color: "#888" }}>
                      Observer
                    </button>
                    {!isLobby && g.players.some((p) => p.id === playerId) && (
                      <button onClick={() => onJoinGame(g.gameId, playerId)}
                        style={{ ...btn("#2a2060", "#4040c0"), fontSize: 12, padding: "5px 12px" }}>
                        Reprendre
                      </button>
                    )}
                    {confirmDeleteId === g.gameId ? (
                      <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
                        <span style={{ fontSize: 11, color: "#e07070" }}>Supprimer ?</span>
                        <button onClick={() => handleDelete(g.gameId)}
                          style={{ ...btn("#6a1010", "#a02020"), fontSize: 11, padding: "3px 8px", color: "#ffaaaa" }}>
                          Oui
                        </button>
                        <button onClick={() => setConfirmDeleteId(null)}
                          style={{ ...btn("transparent", "#333"), fontSize: 11, padding: "3px 8px", color: "#666" }}>
                          Non
                        </button>
                      </div>
                    ) : (
                      <button onClick={() => setConfirmDeleteId(g.gameId)}
                        style={{ ...btn("transparent", "#2a1010"), fontSize: 13, padding: "3px 8px", color: "#554", lineHeight: 1 }}
                        title="Supprimer cette partie">
                        ✕
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div style={{ marginTop: 24, fontSize: 11, color: "#333" }}>
        ID joueur : <code style={{ color: "#444" }}>{playerId}</code>
      </div>
    </div>
  );
}
