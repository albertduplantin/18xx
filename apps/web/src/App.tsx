import React, { useState, useEffect } from "react";
import { LobbyPage } from "./pages/LobbyPage.js";
import { GamePage } from "./pages/GamePage.js";
import { EditorPage } from "./pages/EditorPage.js";
import { useGameStore } from "./store/game-store.js";
import { GAME_1830 } from "@18xx/games";
import type { GameState } from "@18xx/shared";

type View =
  | { page: "lobby" }
  | { page: "game"; gameId: string; playerId: string }
  | { page: "editor" };

// Ping the server every 10 minutes to prevent Render free-tier sleep.
// Only active when the tab is visible to avoid unnecessary pings.
function useKeepAlive() {
  useEffect(() => {
    const ping = () => {
      if (!document.hidden) fetch("/health").catch(() => {});
    };
    const id = setInterval(ping, 10 * 60 * 1000);
    return () => clearInterval(id);
  }, []);
}

export function App() {
  useKeepAlive();
  const [view, setView] = useState<View>({ page: "lobby" });
  const { setGame } = useGameStore();

  async function handleJoin(gameId: string, playerId: string) {
    try {
      const res = await fetch(`/games/${gameId}`);
      if (res.ok) {
        const data = await res.json() as { state: GameState };
        setGame(gameId, data.state, GAME_1830, playerId);
      } else {
        setGame(gameId, null as never, GAME_1830, playerId);
      }
    } catch {
      setGame(gameId, null as never, GAME_1830, playerId);
    }
    setView({ page: "game", gameId, playerId });
  }

  if (view.page === "game") {
    return <GamePage gameId={view.gameId} playerId={view.playerId} />;
  }

  if (view.page === "editor") {
    return <EditorPage onBack={() => setView({ page: "lobby" })} />;
  }

  return <LobbyPage onJoin={handleJoin} onOpenEditor={() => setView({ page: "editor" })} />;
}
