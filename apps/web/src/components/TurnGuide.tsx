import React, { useState } from "react";
import type { GameState, GameDef, AuctionContext, StockContext, OperatingContext } from "@18xx/shared";
import { priceAt } from "@18xx/engine";

type Props = {
  state: GameState;
  def: GameDef;
  myPlayerId: string;
};

// ─── Content by phase ─────────────────────────────────────────────────────────

type Step = { icon: string; title: string; body: string; highlight?: boolean };

function auctionGuide(state: GameState, def: GameDef, myPlayerId: string): Step[] {
  const ctx = state.turnContext as AuctionContext;
  const priv = def.privates[ctx.privateIdx];
  const isMyTurn = state.currentPlayerId === myPlayerId;
  const myPlayer = state.players.find((p) => p.id === myPlayerId)!;

  if (!priv) return [];

  const privGuides: Record<string, string> = {
    SV: "Pas de capacité spéciale — uniquement le revenu $5/OR. Utile en début de partie pour avoir de la liquidité.",
    CS: "Vous permet de poser une tuile jaune gratuite. Bon pour débloquer une voie rapidement.",
    DH: "Pose une tuile PLUS un jeton à F16 (hex montagne) pour seulement $120 au lieu de $120+jeton. Très fort si vous visez cette zone.",
    MH: "Peut être échangée contre 10 % des actions NYC. Très puissante si NYC monte haut.",
    CA: "Vous donne 10 % des actions PRR gratuitement. La PRR est souvent la compagnie la plus profitable.",
    BO: "Vous donne la présidence de la B&O Railroad ! La compagnie la plus grande du jeu.",
  };

  const advice = privGuides[priv.id] ?? "";

  return [
    {
      icon: "🎯",
      title: isMyTurn ? "C'est votre tour — Enchère sur une privée" : "Tour d'enchère en cours",
      body: isMyTurn
        ? `Vous devez décider si vous achetez ${priv.name} à $${ctx.currentPrice}.`
        : `En attente du joueur ${state.players.find((p) => p.id === state.currentPlayerId)?.name ?? "?"}`,
      highlight: isMyTurn,
    },
    {
      icon: "💡",
      title: "Pourquoi acheter cette privée ?",
      body: advice || priv.description,
    },
    {
      icon: "📋",
      title: "Règle de l'enchère",
      body: `Chaque joueur achète à tour de rôle la privée affichée au prix courant, ou passe. Si tout le monde passe, le prix baisse de $5. La privée est offerte gratuitement si le prix tombe à $0. Les privées rapportent un revenu à chaque fin de round opérationnel.`,
    },
    {
      icon: "💰",
      title: "Votre argent",
      body: `Vous avez $${myPlayer.cash}. Le prix actuel est $${ctx.currentPrice}. ${myPlayer.cash < ctx.currentPrice ? "⚠️ Pas assez pour acheter !" : "Vous pouvez acheter."}`,
      highlight: myPlayer.cash < ctx.currentPrice,
    },
  ];
}

function stockGuide(state: GameState, def: GameDef, myPlayerId: string): Step[] {
  const ctx = state.turnContext as StockContext;
  const isMyTurn = state.currentPlayerId === myPlayerId;
  const myPlayer = state.players.find((p) => p.id === myPlayerId)!;
  const alreadyBought = ctx.boughtThisTurn.includes(myPlayerId);

  const steps: Step[] = [
    {
      icon: "📈",
      title: isMyTurn ? "C'est votre tour en bourse" : "Round boursier en cours",
      body: isMyTurn
        ? alreadyBought
          ? "Vous avez déjà acheté ce tour. Vous pouvez encore vendre, puis passer."
          : "Vous pouvez vendre des actions, acheter une action (ou démarrer une compagnie), puis passer."
        : `En attente de ${state.players.find((p) => p.id === state.currentPlayerId)?.name ?? "?"}`,
      highlight: isMyTurn,
    },
    {
      icon: "🏦",
      title: "Démarrer une compagnie (Certificat Président)",
      body: "Achetez le certificat président (20%) d'une compagnie non démarrée en choisissant un prix de parité. La compagnie flotte (reçoit son capital) quand 60% des actions sont vendues au public. Coût : 2× le prix de parité.",
    },
    {
      icon: "📊",
      title: "Acheter des actions existantes",
      body: "Achetez 10% d'une compagnie déjà démarrée à son prix boursier actuel. Vous ne pouvez acheter qu'UNE action par tour (mais vendre plusieurs). Dividendes versés à chaque round opérationnel si la compagnie paye.",
    },
    {
      icon: "💸",
      title: "Vendre des actions",
      body: "Vendre fait baisser le cours (−1 case à gauche par action). Vous ne pouvez pas vendre une action que vous venez d'acheter ce tour. La vente du certificat président passe la présidence au prochain actionnaire majoritaire.",
    },
    {
      icon: "⏭️",
      title: "Quand passer ?",
      body: `Passez quand vous ne voulez rien faire. Le round boursier se termine quand tous les joueurs passent consécutivement. Actuellement : ${ctx.consecutivePasses}/${state.players.length} passes consécutifs.`,
    },
    {
      icon: "💰",
      title: "Votre situation",
      body: `Cash : $${myPlayer.cash} · Titres : ${myPlayer.shares.length} action${myPlayer.shares.length > 1 ? "s" : ""}`,
    },
  ];

  return steps;
}

function operatingGuide(state: GameState, def: GameDef, myPlayerId: string): Step[] {
  const ctx = state.turnContext as OperatingContext;
  const companyId = ctx.companyOrder[ctx.companyIdx] ?? "";
  const companyDef = def.companies.find((c) => c.id === companyId);
  const companyState = state.companies[companyId];
  const isPresident = state.players.find((p) => p.id === myPlayerId)?.shares.some(
    (s) => s.companyId === companyId && s.president,
  );

  if (!companyDef || !companyState) return [];

  const pos = state.stockMarket[companyId];
  const price = pos ? priceAt(def, pos) : 0;
  const canTile = !ctx.companyActions.includes("tile");
  const canRoutes = !ctx.companyActions.includes("routes");

  if (!isPresident) {
    return [
      {
        icon: "👁️",
        title: `Vous observez ${companyDef.shortName} opérer`,
        body: `Vous n'êtes pas président de ${companyDef.name}. Attendez que le président termine. Le cours actuel est $${price}.`,
      },
    ];
  }

  return [
    {
      icon: "🚂",
      title: `Vous gérez ${companyDef.shortName}`,
      body: `Trésorerie : $${companyState.cash} · Trains : ${companyState.trains.length > 0 ? companyState.trains.join(", ") : "aucun"} · Cours : $${price}`,
      highlight: true,
    },
    {
      icon: "1️⃣",
      title: canTile ? "ÉTAPE 1 : Poser une tuile (optionnel)" : "✅ Tuile posée",
      body: canTile
        ? "Cliquez sur un hex vert sur la carte, puis choisissez une tuile. Les tuiles jaunes = nouvelles voies. Les vertes/brunes = améliorations. Attention : tuiles montagne coûtent $120, eau $80 en plus."
        : "Vous avez déjà posé une tuile ce tour.",
    },
    {
      icon: "2️⃣",
      title: "ÉTAPE 2 : Placer un jeton station (optionnel)",
      body: `Un jeton garantit que la compagnie peut utiliser cette ville dans ses routes. Coût selon l'ordre : ${companyDef.tokens.slice(1).join("$, $") ? `$${companyDef.tokens.slice(1).join(", $")}` : "aucun token disponible"}. Cliquez sur une ville sur la carte.`,
    },
    {
      icon: "3️⃣",
      title: "ÉTAPE 3 : Acheter un train (si nécessaire)",
      body: companyState.trains.length === 0
        ? "⚠️ Vous n'avez AUCUN train ! Vous DEVEZ en acheter un. Sans train, la compagnie ne peut pas générer de revenus."
        : `Vous avez déjà des trains. Acheter plus augmente les revenus mais limite le type de train selon la phase.`,
      highlight: companyState.trains.length === 0,
    },
    {
      icon: "4️⃣",
      title: canRoutes ? "ÉTAPE 4 : Lancer les trains et choisir les dividendes" : "✅ Routes lancées",
      body: canRoutes && companyState.trains.length > 0
        ? "Le moteur calcule les meilleures routes. Choisissez : PAYER = distribuer les dividendes aux actionnaires (cours monte). RETENIR = argent va à la trésorerie (cours baisse). Payer est généralement meilleur pour le cours."
        : canRoutes
        ? "Pas de train = pas de revenus. Achetez un train d'abord."
        : "Dividendes déjà réglés.",
    },
    {
      icon: "⏭️",
      title: "Terminer",
      body: "Cliquez 'Done Operating' quand vous avez tout fait. La prochaine compagnie opère ensuite (par ordre décroissant de cours).",
    },
  ];
}

// ─── Main component ───────────────────────────────────────────────────────────

export function TurnGuide({ state, def, myPlayerId }: Props) {
  const [open, setOpen] = useState(true);

  const isMyTurn = state.currentPlayerId === myPlayerId;

  let steps: Step[] = [];
  if (state.turnContext.type === "auction") {
    steps = auctionGuide(state, def, myPlayerId);
  } else if (state.turnContext.type === "stock") {
    steps = stockGuide(state, def, myPlayerId);
  } else if (state.turnContext.type === "operating") {
    steps = operatingGuide(state, def, myPlayerId);
  }

  const borderColor = isMyTurn ? "#4caf50" : "#333";
  const headerBg = isMyTurn ? "#0d2010" : "#0d0d20";

  return (
    <div style={{
      border: `1px solid ${borderColor}`,
      borderRadius: 8,
      overflow: "hidden",
      marginBottom: 4,
    }}>
      {/* Header toggle */}
      <button
        onClick={() => setOpen((v) => !v)}
        style={{
          width: "100%",
          background: headerBg,
          border: "none",
          padding: "7px 12px",
          display: "flex",
          alignItems: "center",
          gap: 8,
          cursor: "pointer",
          textAlign: "left",
        }}
      >
        {isMyTurn && (
          <span style={{
            background: "#2a7a2a", color: "#fff",
            fontSize: 10, fontWeight: "bold", padding: "1px 6px", borderRadius: 8,
          }}>
            VOTRE TOUR
          </span>
        )}
        <span style={{ fontSize: 11, color: "#aaa", fontWeight: 600, letterSpacing: 0.5 }}>
          GUIDE DU JOUEUR
        </span>
        <span style={{ marginLeft: "auto", color: "#666", fontSize: 12 }}>{open ? "▲" : "▼"}</span>
      </button>

      {/* Steps */}
      {open && (
        <div style={{ padding: "8px 10px", display: "flex", flexDirection: "column", gap: 6 }}>
          {steps.map((step, i) => (
            <div
              key={i}
              style={{
                background: step.highlight ? "#0d200d" : "#0a0a18",
                border: `1px solid ${step.highlight ? "#2a5a2a" : "#1a1a30"}`,
                borderRadius: 6,
                padding: "7px 10px",
              }}
            >
              <div style={{ fontSize: 12, fontWeight: "bold", color: step.highlight ? "#80e080" : "#ccc", marginBottom: 2 }}>
                {step.icon} {step.title}
              </div>
              <div style={{ fontSize: 11, color: step.highlight ? "#aaddaa" : "#888", lineHeight: 1.5 }}>
                {step.body}
              </div>
            </div>
          ))}

          {steps.length === 0 && (
            <div style={{ fontSize: 12, color: "#555", textAlign: "center", padding: 8 }}>
              Aucun guide disponible pour cette phase.
            </div>
          )}

          {/* Link to full rules */}
          <div style={{ fontSize: 10, color: "#444", textAlign: "right", marginTop: 2 }}>
            Guide basé sur les règles de 1830 — Railroads &amp; Robber Barons
          </div>
        </div>
      )}
    </div>
  );
}
