import React, { useState } from "react";
import type { GameState, GameDef, AuctionContext, StockContext, OperatingContext } from "@18xx/shared";
import { priceAt } from "@18xx/engine";

type Props = {
  state: GameState;
  def: GameDef;
  myPlayerId: string;
};

type TipLevel = "critical" | "warning" | "tip";

type Tip = {
  level: TipLevel;
  icon: string;
  title: string;
  body: string;
};

// ─── Auction tips ─────────────────────────────────────────────────────────────

const PRIVATE_ADVICE: Record<string, { level: TipLevel; title: string; body: string }> = {
  BO: {
    level: "critical",
    title: "B&O Railroad — Achetez absolument !",
    body: "Cette privée vous donne automatiquement la présidence de la Baltimore & Ohio, une des meilleures compagnies du jeu. Elle rapporte $30/OR en plus. Valeur stratégique extrêmement haute.",
  },
  CA: {
    level: "critical",
    title: "Camden & Amboy — Très forte",
    body: "Vous offre 10 % de la PRR gratuitement (valeur $67-$200 selon le cours), plus $25/OR de revenu. La PRR est souvent la compagnie la plus rentable sur la carte.",
  },
  MH: {
    level: "warning",
    title: "Mohawk & Hudson — Bonne affaire",
    body: "Peut être échangée contre 10 % de la NYC à n'importe quel moment. Revenue $20/OR. Puissante si vous comptez investir dans NYC qui commence à New York (revenu élevé).",
  },
  DH: {
    level: "tip",
    title: "Delaware & Hudson — Utile en montagne",
    body: "Vous permet de poser une tuile ET un jeton dans une case montagne à coût réduit. Revenue $15/OR. Particulièrement utile pour les compagnies visant Pittsburgh ou les Appalaches.",
  },
  CS: {
    level: "tip",
    title: "Champlain & St. Lawrence — Décent",
    body: "Une tuile jaune gratuite à poser n'importe quand. Revenue $10/OR. Bon en début de partie pour débloquer des connexions rapidement sans dépenser la trésorerie de la compagnie.",
  },
  SV: {
    level: "tip",
    title: "Schuylkill Valley — Basique",
    body: "Revenue $5/OR uniquement. Pas de capacité spéciale. À acheter seulement si les autres privées sont trop chères ou si vous avez du cash à placer.",
  },
};

function auctionTips(state: GameState, def: GameDef, myPlayerId: string): Tip[] {
  if (state.currentPlayerId !== myPlayerId) return [];
  const ctx = state.turnContext as AuctionContext;
  const priv = def.privates[ctx.privateIdx];
  const player = state.players.find((p) => p.id === myPlayerId);
  if (!priv || !player) return [];

  const tips: Tip[] = [];
  const canAfford = player.cash >= ctx.currentPrice;
  const reserveAfter = player.cash - ctx.currentPrice;
  const advice = PRIVATE_ADVICE[priv.id];

  if (!canAfford) {
    tips.push({
      level: "warning",
      icon: "💸",
      title: "Pas assez d'argent",
      body: `Prix actuel : $${ctx.currentPrice} — votre cash : $${player.cash}. Passez et attendez que le prix baisse.`,
    });
    return tips;
  }

  if (advice) {
    tips.push({
      level: advice.level,
      icon: advice.level === "critical" ? "🔥" : advice.level === "warning" ? "⭐" : "💡",
      title: advice.title,
      body: advice.body,
    });
  }

  // Warn if buying would leave too little to start a company
  if (reserveAfter < 134) {
    tips.push({
      level: "warning",
      icon: "⚠️",
      title: "Réserve faible après achat",
      body: `Il vous restera $${reserveAfter} — pas assez pour démarrer une compagnie (minimum $134 pour parité $67). Assurez-vous d'avoir assez pour le round boursier.`,
    });
  } else {
    // Revenue/price ratio comment
    const ratio = (priv.revenue / ctx.currentPrice) * 100;
    tips.push({
      level: "tip",
      icon: "📊",
      title: `Rendement : ${ratio.toFixed(0)} % par OR`,
      body: `Cette privée rapporte $${priv.revenue}/OR pour un prix de $${ctx.currentPrice}. Vous récupérerez votre investissement en ${Math.ceil(ctx.currentPrice / priv.revenue)} rounds opérationnels.`,
    });
  }

  return tips;
}

// ─── Stock tips ───────────────────────────────────────────────────────────────

function stockTips(state: GameState, def: GameDef, myPlayerId: string): Tip[] {
  if (state.currentPlayerId !== myPlayerId) return [];
  const ctx = state.turnContext as StockContext;
  const player = state.players.find((p) => p.id === myPlayerId);
  if (!player) return [];
  if (ctx.boughtThisTurn.includes(myPlayerId)) {
    return [{ level: "tip", icon: "✅", title: "Achat effectué", body: "Vous avez déjà acheté ce tour. Vous pouvez encore vendre des actions, puis passez." }];
  }

  const tips: Tip[] = [];

  // Own companies (president certs)
  const ownCompanyIds = player.shares.filter((s) => s.president).map((s) => s.companyId);

  // Check if any own company is in_progress and below float
  for (const compId of ownCompanyIds) {
    const cs = state.companies[compId];
    if (!cs || cs.status !== "in_progress") continue;
    const pos = state.stockMarket[compId];
    const price = pos ? priceAt(def, pos) : 0;
    const soldPercent = state.players.flatMap((p) => p.shares).filter((s) => s.companyId === compId).reduce((s, sh) => s + sh.percent, 0);
    const floatNeed = 60 - soldPercent;
    const compDef = def.companies.find((c) => c.id === compId);
    if (floatNeed > 0 && player.cash >= price) {
      tips.push({
        level: "critical",
        icon: "🚀",
        title: `Aidez ${compDef?.shortName ?? compId} à flotter !`,
        body: `${compDef?.name ?? compId} est à ${soldPercent}% vendu — il faut 60% pour flotter et opérer. Achetez 10% de plus ($${price}) pour progresser vers la flotation. Une compagnie flottée génère des revenus !`,
      });
    } else if (floatNeed > 0 && player.cash < price) {
      tips.push({
        level: "warning",
        icon: "⚠️",
        title: `${compDef?.shortName ?? compId} pas encore flottée`,
        body: `La compagnie est à ${soldPercent}% — il faut 60% pour flotter. Vous n'avez pas assez de cash ($${player.cash} < $${price}). Passez et espérez que d'autres joueurs achètent.`,
      });
    }
  }

  // If no own companies, suggest starting one
  if (ownCompanyIds.length === 0) {
    const bestPar = [82, 76, 90, 71, 67].find((p) => player.cash >= p * 2 + 100) ?? 67;
    if (player.cash >= bestPar * 2) {
      tips.push({
        level: "critical",
        icon: "🏭",
        title: "Démarrez une compagnie !",
        body: `Vous n'avez aucune compagnie. C'est la priorité absolue ! Recommandation : parité $${bestPar} (coût $${bestPar * 2}). La compagnie flotte à $${bestPar * 6} de capital. Plus la parité est haute, plus la trésorerie sera grande au départ.`,
      });
    } else {
      tips.push({
        level: "warning",
        icon: "💸",
        title: "Cash insuffisant pour démarrer",
        body: `Il vous faut au minimum $134 (2 × $67) pour démarrer une compagnie. Vous avez $${player.cash}. Passez pour l'instant.`,
      });
    }
  }

  // Par value advice for unstarted companies
  if (ownCompanyIds.length === 0 && player.cash >= 152) {
    tips.push({
      level: "tip",
      icon: "💰",
      title: "Quelle parité choisir ?",
      body: "Parité $82 → trésorerie ~$492 à la flotation. Parité $100 → trésorerie ~$600. Plus haute = la compagnie peut acheter des trains plus chers, mais ça vous coûte plus. Visez $76-$82 si possible.",
    });
  }

  // Warn about cert limit
  const certLimit = def.certLimit[state.players.length] ?? 28;
  const totalCerts = player.shares.length + player.privates.length;
  if (totalCerts >= certLimit - 2) {
    tips.push({
      level: "warning",
      icon: "📋",
      title: "Proche de la limite de certificats",
      body: `Vous avez ${totalCerts}/${certLimit} certificats. Si vous atteignez la limite, vous ne pouvez plus acheter. Envisagez de vendre des actions secondaires.`,
    });
  }

  // Warn against buying too many competitor shares
  const opponentShares = player.shares.filter((s) => !s.president);
  const opponentCompanies = new Set(opponentShares.map((s) => s.companyId));
  if (opponentCompanies.size > 0) {
    const multipleInSame = [...opponentCompanies].filter(
      (cid) => opponentShares.filter((s) => s.companyId === cid).length >= 2,
    );
    if (multipleInSame.length > 0) {
      const names = multipleInSame.map((cid) => def.companies.find((c) => c.id === cid)?.shortName ?? cid).join(", ");
      tips.push({
        level: "warning",
        icon: "⚠️",
        title: "Attention : risque de dump",
        body: `Vous avez 20%+ dans ${names} sans en être président. L'adversaire peut vous "dumper" la présidence indésirable en vendant ses actions. Limitez-vous à 10% dans les compagnies que vous ne contrôlez pas.`,
      });
    }
  }

  if (tips.length === 0) {
    tips.push({
      level: "tip",
      icon: "💡",
      title: "Stratégie bourse",
      body: "En milieu de partie, concentrez-vous sur vos propres compagnies. Achetez des actions dans les sociétés qui paient régulièrement des dividendes — leur cours monte et vous percevez des revenus.",
    });
  }

  return tips;
}

// ─── Operating tips ───────────────────────────────────────────────────────────

function operatingTips(state: GameState, def: GameDef, myPlayerId: string): Tip[] {
  const ctx = state.turnContext as OperatingContext;
  const companyId = ctx.companyOrder[ctx.companyIdx] ?? "";
  const companyState = state.companies[companyId];
  const companyDef = def.companies.find((c) => c.id === companyId);
  const isPresident = state.players.find((p) => p.id === myPlayerId)?.shares.some(
    (s) => s.companyId === companyId && s.president,
  );

  if (!companyState || !companyDef || !isPresident) return [];

  const tips: Tip[] = [];
  const done = new Set(ctx.companyActions);
  const phaseNum = parseInt(state.phaseId) || 1;

  // Train emergency
  if (companyState.trains.length === 0) {
    const cheapestTrain = def.trains
      .filter((t) => (state.trainBank[t.id] ?? 0) > 0)
      .sort((a, b) => a.price - b.price)[0];
    if (cheapestTrain) {
      if (companyState.cash >= cheapestTrain.price) {
        tips.push({
          level: "critical",
          icon: "🚨",
          title: "URGENCE : Achetez un train !",
          body: `${companyDef.shortName} n'a aucun train et ne peut pas générer de revenus. Achetez immédiatement un train ${cheapestTrain.name} ($${cheapestTrain.price}). Sans train, la compagnie perd de la valeur à chaque round.`,
        });
      } else {
        tips.push({
          level: "critical",
          icon: "🚨",
          title: "Pas de train et pas assez de cash !",
          body: `${companyDef.shortName} n'a pas de train et ne peut pas en acheter (trésorerie $${companyState.cash} < $${cheapestTrain.price}). Vous devrez peut-être payer de votre poche en tant que président !`,
        });
      }
    }
  }

  // Train rusting warning
  if (companyState.trains.length > 0) {
    const hasOldTrains = companyState.trains.some((t) => t === "2" || t === "3");
    const hasSafeTrains = companyState.trains.some((t) => t === "5" || t === "6" || t === "D");
    if (hasOldTrains && !hasSafeTrains) {
      if (phaseNum >= 3) {
        tips.push({
          level: "warning",
          icon: "⏰",
          title: "Trains bientôt obsolètes",
          body: companyState.trains.includes("2")
            ? "Vos trains 2 rouillent à la phase 4 (achat du 3ème train 4). Planifiez le remplacement. Les trains 5 ne rouillent jamais — achetez-en un dès que possible ($450)."
            : "Vos trains 3 rouillent à la phase 6. Planifiez des trains 5 ($450) qui ne rouillent jamais.",
        });
      }
    }
  }

  // Dividend advice
  if (!done.has("routes") && companyState.trains.length > 0) {
    tips.push({
      level: "tip",
      icon: "💰",
      title: "Payez les dividendes (règle d'or)",
      body: "En 1830, la règle experte est : TOUJOURS payer les dividendes quand vous avez du revenu. Payer = cours monte à droite + vous recevez de l'argent. Retenir = cours descend + argent va à la trésorerie. Sauf urgence train, payez toujours.",
    });
  }

  // 5-train is best value
  if (!done.has("trains") && companyState.trains.length > 0) {
    const fiveTrain = def.trains.find((t) => t.id === "5");
    const bankHas5 = fiveTrain && (state.trainBank["5"] ?? 0) > 0;
    if (bankHas5 && fiveTrain && companyState.cash >= fiveTrain.price) {
      tips.push({
        level: "warning",
        icon: "⭐",
        title: "Train 5 disponible — ne rouille jamais !",
        body: `Le train 5 ($${fiveTrain.price}) est le meilleur investissement : il ne rouille JAMAIS contrairement aux trains 2, 3, 4. Si la trésorerie le permet ($${companyState.cash}), achetez-en un maintenant.`,
      });
    }
  }

  // Tile lay suggestion
  if (!done.has("tile")) {
    tips.push({
      level: "tip",
      icon: "🗺️",
      title: "Posez la tuile EN PREMIER",
      body: "Posez votre tuile avant de lancer les trains — le nouveau tronçon est immédiatement utilisable ce même tour ! Priorisez les hexs qui connectent vers New York ($40), Boston, Chicago ou les terminaux hors-carte.",
    });
  }

  // Token placement tip (if tokens available and not placed)
  const tokensPlaced = companyState.tokens?.length ?? 0;
  const tokensTotal = companyDef.tokens.length;
  if (!done.has("token") && tokensTotal > tokensPlaced + 1) {
    tips.push({
      level: "tip",
      icon: "📌",
      title: "Placement de jeton",
      body: "Placer un jeton dans une ville clé garantit que votre réseau peut l'utiliser même si un adversaire y place aussi un jeton. Visez les villes à fort revenu ou les carrefours stratégiques.",
    });
  }

  return tips;
}

// ─── Component ────────────────────────────────────────────────────────────────

const LEVEL_STYLE: Record<TipLevel, { border: string; bg: string; titleColor: string; bodyColor: string; badge: string; badgeBg: string }> = {
  critical: {
    border: "#c0392b",
    bg: "#1a0808",
    titleColor: "#f08080",
    bodyColor: "#d4a0a0",
    badge: "IMPORTANT",
    badgeBg: "#c0392b",
  },
  warning: {
    border: "#e07030",
    bg: "#1a1008",
    titleColor: "#f0b060",
    bodyColor: "#c4a080",
    badge: "CONSEIL",
    badgeBg: "#8b5e00",
  },
  tip: {
    border: "#305080",
    bg: "#080e1a",
    titleColor: "#78b4e0",
    bodyColor: "#8090a8",
    badge: "ASTUCE",
    badgeBg: "#1a3a5a",
  },
};

export function Advisor({ state, def, myPlayerId }: Props) {
  const [open, setOpen] = useState(true);
  const isMyTurn = state.currentPlayerId === myPlayerId;

  let tips: Tip[] = [];
  if (state.turnContext.type === "auction") {
    tips = auctionTips(state, def, myPlayerId);
  } else if (state.turnContext.type === "stock") {
    tips = stockTips(state, def, myPlayerId);
  } else if (state.turnContext.type === "operating") {
    tips = operatingTips(state, def, myPlayerId);
  }

  if (tips.length === 0) return null;

  return (
    <div
      style={{
        border: `1px solid ${isMyTurn ? "#5060c0" : "#2a2a4a"}`,
        borderRadius: 8,
        overflow: "hidden",
        marginBottom: 4,
      }}
    >
      <button
        onClick={() => setOpen((v) => !v)}
        style={{
          width: "100%",
          background: isMyTurn ? "#0d0d28" : "#0a0a1a",
          border: "none",
          padding: "7px 12px",
          display: "flex",
          alignItems: "center",
          gap: 8,
          cursor: "pointer",
          textAlign: "left",
        }}
      >
        <span style={{ fontSize: 13 }}>🧠</span>
        <span style={{ fontSize: 11, color: "#8090d0", fontWeight: 600, letterSpacing: 0.5 }}>
          CONSEILS STRATÉGIQUES
        </span>
        {tips.some((t) => t.level === "critical") && (
          <span
            style={{
              background: "#c0392b",
              color: "#fff",
              fontSize: 9,
              fontWeight: "bold",
              padding: "1px 5px",
              borderRadius: 8,
            }}
          >
            ACTION REQUISE
          </span>
        )}
        <span style={{ marginLeft: "auto", color: "#444", fontSize: 12 }}>{open ? "▲" : "▼"}</span>
      </button>

      {open && (
        <div style={{ padding: "8px 10px", display: "flex", flexDirection: "column", gap: 6 }}>
          {tips.map((tip, i) => {
            const s = LEVEL_STYLE[tip.level];
            return (
              <div
                key={i}
                style={{
                  background: s.bg,
                  border: `1px solid ${s.border}`,
                  borderRadius: 6,
                  padding: "7px 10px",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
                  <span style={{ fontSize: 13 }}>{tip.icon}</span>
                  <span
                    style={{
                      background: s.badgeBg,
                      color: "#fff",
                      fontSize: 9,
                      fontWeight: "bold",
                      padding: "1px 5px",
                      borderRadius: 4,
                    }}
                  >
                    {s.badge}
                  </span>
                  <span style={{ fontSize: 12, fontWeight: "bold", color: s.titleColor }}>
                    {tip.title}
                  </span>
                </div>
                <div style={{ fontSize: 11, color: s.bodyColor, lineHeight: 1.55, paddingLeft: 4 }}>
                  {tip.body}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
