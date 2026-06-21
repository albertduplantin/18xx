import React, { useState } from "react";
import type { LobbyInfo } from "../store/game-store.js";

const PERSONALITY_LABELS: Record<string, { emoji: string; color: string }> = {
  balanced:     { emoji: "⚖️", color: "#4060c0" },
  aggressive:   { emoji: "⚔️", color: "#c04040" },
  conservative: { emoji: "🛡️", color: "#40a040" },
  random:       { emoji: "🎲", color: "#808080" },
};

type Props = {
  lobby: LobbyInfo;
  playerId: string;
  onStart: () => void;
  onLeave: () => void;
};

export function WaitingRoomPage({ lobby, playerId, onStart, onLeave }: Props) {
  const [copied, setCopied] = useState(false);

  const inviteUrl = `${location.origin}${location.pathname}?join=${lobby.id}`;
  const isCreator = playerId === lobby.creatorId;
  const allJoined = lobby.slots.every((s) => s.joined);
  const openSlots = lobby.slots.filter((s) => !s.isBot && !s.joined);

  function copyLink() {
    navigator.clipboard.writeText(inviteUrl).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  async function handleStart() {
    const res = await fetch(`/games/${lobby.id}/start`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ playerId }),
    });
    if (res.ok) onStart();
  }

  return (
    <div style={{ minHeight: "100vh", background: "#0f0f1e", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
      <div style={{ width: "100%", maxWidth: 500 }}>
        <div style={{ textAlign: "center", marginBottom: 28 }}>
          <div style={{ fontSize: 36, marginBottom: 8 }}>🚂</div>
          <h1 style={{ fontSize: 22, fontWeight: 900, marginBottom: 4 }}>Salle d'attente</h1>
          <p style={{ color: "#555", fontSize: 13 }}>1830 · {lobby.maxPlayers} joueurs</p>
        </div>

        {/* Slots */}
        <div style={{ background: "#1a1a2e", border: "1px solid #2a2a50", borderRadius: 12, padding: 16, marginBottom: 14 }}>
          <div style={{ fontSize: 11, color: "#555", fontWeight: 700, letterSpacing: 2, marginBottom: 12, textTransform: "uppercase" }}>Joueurs</div>
          {lobby.slots.map((slot, i) => {
            const pers = slot.isBot ? PERSONALITY_LABELS[slot.personality] : null;
            return (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 0", borderBottom: i < lobby.slots.length - 1 ? "1px solid #1a1a30" : "none" }}>
                <div style={{ width: 34, height: 34, borderRadius: "50%", background: slot.joined ? (slot.isBot ? (pers?.color ?? "#606080") : "#2a4060") : "#1a1a30",
                  display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16, flexShrink: 0 }}>
                  {slot.isBot ? (pers?.emoji ?? "🤖") : slot.joined ? "👤" : "⏳"}
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: slot.joined ? "#fff" : "#444" }}>
                    {slot.joined ? slot.name : "En attente…"}
                    {slot.id === playerId && <span style={{ fontSize: 10, color: "#6060a0", marginLeft: 6 }}>TOI</span>}
                  </div>
                  {slot.isBot && (
                    <div style={{ fontSize: 10, color: "#555" }}>Bot · {slot.personality}</div>
                  )}
                </div>
                <div style={{ fontSize: 11, padding: "3px 10px", borderRadius: 10,
                  background: slot.joined ? (slot.isBot ? "#1a2a1a" : "#1a2a40") : "#1a1a1a",
                  color: slot.joined ? (slot.isBot ? "#70c050" : "#60a0e0") : "#444" }}>
                  {slot.isBot ? "Bot" : slot.joined ? "Prêt" : "Libre"}
                </div>
              </div>
            );
          })}
        </div>

        {/* Invite link */}
        {openSlots.length > 0 && (
          <div style={{ background: "#12122a", border: "1px solid #2a2a40", borderRadius: 10, padding: 14, marginBottom: 14 }}>
            <div style={{ fontSize: 11, color: "#555", fontWeight: 700, letterSpacing: 2, marginBottom: 8, textTransform: "uppercase" }}>
              Lien d'invitation ({openSlots.length} place(s) libre(s))
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <code style={{ flex: 1, fontSize: 11, color: "#6080a0", background: "#0a0a1a", padding: "8px 10px", borderRadius: 6, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {inviteUrl}
              </code>
              <button onClick={copyLink}
                style={{ padding: "8px 14px", background: copied ? "#2a4020" : "#2a2060", border: `1px solid ${copied ? "#40c050" : "#4040c0"}`,
                  borderRadius: 6, color: copied ? "#70c050" : "#78c0f0", fontSize: 12, cursor: "pointer", flexShrink: 0, fontWeight: "bold" }}>
                {copied ? "✓ Copié" : "Copier"}
              </button>
            </div>
          </div>
        )}

        {/* Actions */}
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {isCreator && (
            <button onClick={handleStart}
              disabled={!allJoined}
              style={{ padding: 13, background: allJoined ? "#4040c0" : "#222", border: `1px solid ${allJoined ? "#6060e0" : "#333"}`,
                borderRadius: 8, color: allJoined ? "#fff" : "#555", fontSize: 14, fontWeight: "bold", cursor: allJoined ? "pointer" : "not-allowed" }}>
              {allJoined ? "🚀 Lancer la partie" : `⏳ ${openSlots.length} place(s) encore libre(s)…`}
            </button>
          )}
          {!isCreator && (
            <div style={{ padding: 13, background: "#12122a", border: "1px solid #2a2a40", borderRadius: 8, color: "#666", fontSize: 13, textAlign: "center" }}>
              En attente que le créateur lance la partie…
            </div>
          )}
          <button onClick={onLeave}
            style={{ padding: 10, background: "transparent", border: "1px solid #2a2a40", borderRadius: 8, color: "#555", fontSize: 13, cursor: "pointer" }}>
            ← Retour au lobby
          </button>
        </div>
      </div>
    </div>
  );
}
