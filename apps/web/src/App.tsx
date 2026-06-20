import React, { useState } from "react";
import { LobbyPage } from "./pages/LobbyPage.js";
import { GamePage } from "./pages/GamePage.js";
import { useGameStore } from "./store/game-store.js";
import { GAME_1830 } from "@18xx/games";

type View =
  | { page: "lobby" }
  | { page: "game"; gameId: string; playerId: string };

export function App() {
  const [view, setView] = useState<View>({ page: "lobby" });
  const { setGame } = useGameStore();

  function handleJoin(gameId: string, playerId: string) {
    // For now, use the static 1830 definition
    setGame(gameId, {} as never, GAME_1830, playerId);
    setView({ page: "game", gameId, playerId });
  }

  if (view.page === "game") {
    return <GamePage gameId={view.gameId} playerId={view.playerId} />;
  }

  return <LobbyPage onJoin={handleJoin} />;
}
