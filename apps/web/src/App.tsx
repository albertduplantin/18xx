import React, { useState, useEffect } from "react";
import { LobbyPage } from "./pages/LobbyPage.js";
import { WaitingRoomPage } from "./pages/WaitingRoomPage.js";
import { GamePage } from "./pages/GamePage.js";
import { EditorPage } from "./pages/EditorPage.js";
import { useGameStore } from "./store/game-store.js";
import { GAME_1830 } from "@18xx/games";
import type { GameState } from "@18xx/shared";
import type { LobbyInfo } from "./store/game-store.js";

type View =
  | { page: "lobby" }
  | { page: "waiting"; gameId: string; playerId: string }
  | { page: "game"; gameId: string; playerId: string }
  | { page: "editor" };

// Keep Render free-tier alive (ping every 10 minutes when tab is visible).
function useKeepAlive() {
  useEffect(() => {
    const ping = () => { if (!document.hidden) fetch("/health").catch(() => {}); };
    const id = setInterval(ping, 10 * 60 * 1000);
    return () => clearInterval(id);
  }, []);
}

export function App() {
  useKeepAlive();
  const { setGame, connectWs, lobby, phase } = useGameStore();

  // Check URL for ?join=<gameId> (invite link)
  const urlParams = new URLSearchParams(location.search);
  const inviteGameId = urlParams.get("join") ?? undefined;

  const [view, setView] = useState<View>({ page: "lobby" });

  // When the store's WS receives state_update, transition from waiting → game
  useEffect(() => {
    if (phase === "active" && view.page === "waiting") {
      setView({ page: "game", gameId: view.gameId, playerId: view.playerId });
    }
  }, [phase]);

  async function handleJoin(gameId: string, playerId: string, asObserver = false) {
    try {
      const res = await fetch(`/games/${gameId}`);
      if (!res.ok) { console.error("Game not found"); return; }

      const data = await res.json() as
        | { phase: "lobby"; gameId: string; slots: LobbyInfo["slots"]; creatorId: string; defId: string; maxPlayers?: number }
        | { phase: "active"; state: GameState };

      if (data.phase === "lobby") {
        useGameStore.getState().setLobby(gameId, {
          id: gameId,
          defId: data.defId,
          phase: "lobby",
          creatorId: data.creatorId,
          slots: data.slots,
          maxPlayers: data.maxPlayers ?? data.slots.length,
        }, playerId);
        // Connect WS to receive lobby_update when others join
        connectWs(gameId, playerId);
        setView({ page: "waiting", gameId, playerId });
      } else {
        // Active game — let GamePage.useEffect call connectWs (avoids double connection)
        const playerIds = data.state.players.map((p: { id: string }) => p.id);
        const isObs = asObserver || !playerIds.includes(playerId);
        setGame(gameId, data.state, GAME_1830, playerId, isObs);
        setView({ page: "game", gameId, playerId });
      }

      // Clean invite param from URL after joining
      if (inviteGameId) {
        const url = new URL(location.href);
        url.searchParams.delete("join");
        history.replaceState({}, "", url.toString());
      }
    } catch (e) {
      console.error("Join failed", e);
    }
  }

  if (view.page === "editor") {
    return <EditorPage onBack={() => setView({ page: "lobby" })} />;
  }

  if (view.page === "game") {
    return <GamePage gameId={view.gameId} playerId={view.playerId} onLeave={() => setView({ page: "lobby" })} />;
  }

  if (view.page === "waiting") {
    const currentLobby = lobby ?? { id: view.gameId, defId: "1830", phase: "lobby" as const, creatorId: "", slots: [], maxPlayers: 0 };
    return (
      <WaitingRoomPage
        lobby={currentLobby}
        playerId={view.playerId}
        onStart={() => handleJoin(view.gameId, view.playerId)}
        onLeave={() => { useGameStore.getState().reset(); setView({ page: "lobby" }); }}
      />
    );
  }

  return (
    <LobbyPage
      onJoinGame={handleJoin}
      onOpenEditor={() => setView({ page: "editor" })}
      {...(inviteGameId ? { inviteGameId } : {})}
    />
  );
}
