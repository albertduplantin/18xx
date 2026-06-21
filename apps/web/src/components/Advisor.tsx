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
    title: "B&O Railroad — À acheter absolument !",
    body: "Cette société privée vous donne automatiquement la présidence (le contrôle) de la Baltimore & Ohio Railroad, la compagnie ferroviaire la plus puissante du jeu. En plus, elle vous rapporte $30 à chaque round opérationnel. C'est la meilleure affaire du jeu.",
  },
  CA: {
    level: "critical",
    title: "Camden & Amboy — Très forte",
    body: "En achetant cette société privée, vous recevez immédiatement 10 % des actions de la PRR (Pennsylvania Railroad) gratuitement. La PRR est souvent la compagnie la plus rentable. En plus, $25 de revenu par round opérationnel.",
  },
  MH: {
    level: "warning",
    title: "Mohawk & Hudson — Bonne affaire",
    body: "Cette société peut être échangée contre 10 % des actions de la NYC (New York Central) à n'importe quel moment. New York étant la ville la plus rentable de la carte, la NYC est très précieuse. $20 de revenu par round en attendant.",
  },
  DH: {
    level: "tip",
    title: "Delaware & Hudson — Utile en montagne",
    body: "Vous permet de poser une voie ferrée ET un jeton de station dans une case montagne à prix réduit. Sans cette carte, traverser les Appalaches coûte $120 supplémentaires prélevés sur la trésorerie de votre compagnie. $15/round de revenu.",
  },
  CS: {
    level: "tip",
    title: "Champlain & St. Lawrence — Décent",
    body: "Vous donne droit à une tuile de voie jaune gratuite à poser n'importe quand. Utile pour étendre rapidement votre réseau sans dépenser la trésorerie de votre compagnie. $10/round de revenu de base.",
  },
  SV: {
    level: "tip",
    title: "Schuylkill Valley — Basique",
    body: "Cette société privée ne fait que rapporter $5 par round opérationnel, sans capacité spéciale. C'est la moins intéressante des six. À acheter seulement si le prix a beaucoup baissé ou si vous n'avez pas d'autre option.",
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
      title: "Pas assez d'argent pour acheter",
      body: `Le prix actuel est $${ctx.currentPrice} mais vous n'avez que $${player.cash}. Passez votre tour — si tout le monde passe, le prix baissera de $5 au prochain tour.`,
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

  // Revenue/price context
  const turns = Math.ceil(ctx.currentPrice / priv.revenue);
  tips.push({
    level: "tip",
    icon: "📊",
    title: `Rendement : vous récupérez votre mise en ${turns} rounds`,
    body: `Cette société rapporte $${priv.revenue} à chaque round opérationnel. Pour $${ctx.currentPrice} d'achat, vous rentrez dans vos frais après ${turns} rounds opérationnels. Ensuite, c'est du profit pur.`,
  });

  // Reserve warning
  if (reserveAfter < 134) {
    tips.push({
      level: "warning",
      icon: "⚠️",
      title: "Attention : il restera peu d'argent après achat",
      body: `Après cet achat, il vous restera seulement $${reserveAfter}. Or, pour créer une compagnie ferroviaire au round boursier, il faut au minimum $134 (2 fois la parité minimale de $67). Réfléchissez si vous pouvez vous le permettre.`,
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
    return [{
      level: "tip",
      icon: "✅",
      title: "Achat effectué ce tour",
      body: "Vous avez déjà acheté une action ce tour (règle : 1 achat max par tour). Vous pouvez encore vendre des actions si vous le souhaitez, puis passez votre tour.",
    }];
  }

  const tips: Tip[] = [];
  const ownCompanyIds = player.shares.filter((s) => s.president).map((s) => s.companyId);

  // Priority 1: push own in_progress company to float
  for (const compId of ownCompanyIds) {
    const cs = state.companies[compId];
    if (!cs || cs.status !== "in_progress") continue;
    const pos = state.stockMarket[compId];
    const price = pos ? priceAt(def, pos) : 0;
    const soldPercent = state.players.flatMap((p) => p.shares).filter((s) => s.companyId === compId).reduce((s, sh) => s + sh.percent, 0);
    const compDef = def.companies.find((c) => c.id === compId);

    if (soldPercent < 60 && player.cash >= price) {
      tips.push({
        level: "critical",
        icon: "🚀",
        title: `Aidez ${compDef?.shortName ?? compId} à démarrer !`,
        body: `Votre compagnie ${compDef?.name ?? compId} a ${soldPercent} % de ses actions vendues. Elle a besoin de 60 % pour "flotter" (= recevoir ses fonds de départ et pouvoir opérer). Achetez 10 % de plus pour $${price} — plus vite elle flotte, plus vite elle rapporte des revenus !`,
      });
    } else if (soldPercent < 60) {
      tips.push({
        level: "warning",
        icon: "⏳",
        title: `${compDef?.shortName ?? compId} attend de flotter`,
        body: `La compagnie est à ${soldPercent} % — il lui faut 60 % pour démarrer. Vous n'avez pas assez de cash ($${player.cash} < $${price}). Passez et espérez que d'autres joueurs achètent des actions dans votre compagnie.`,
      });
    }
  }

  // Priority 2: no companies at all
  if (ownCompanyIds.length === 0) {
    const bestPar = ([82, 76, 90, 71, 67] as const).find((p) => player.cash >= p * 2 + 100) ?? 67;
    if (player.cash >= bestPar * 2) {
      tips.push({
        level: "critical",
        icon: "🏭",
        title: "Créez votre compagnie ferroviaire !",
        body: `Vous n'avez encore aucune compagnie. C'est la priorité absolue ! Pour créer une compagnie : cliquez sur "IPO (démarrer)" à côté d'une compagnie, puis choisissez le prix de départ ("parité"). Avec votre cash de $${player.cash}, nous recommandons une parité de $${bestPar} (coût : $${bestPar * 2}). La compagnie recevra $${bestPar * 6} en trésorerie quand elle flottera.`,
      });
      if (player.cash >= 152) {
        tips.push({
          level: "tip",
          icon: "💰",
          title: "Quel prix de départ (parité) choisir ?",
          body: `La "parité" est le prix auquel l'action démarre en bourse. Vous payez 2× ce prix pour votre certificat. Quand 60 % des actions sont vendues, la compagnie reçoit 6× la parité en trésorerie (pour acheter des trains). Exemple : parité $82 → vous payez $164 → la compagnie reçoit $492. Plus c'est haut, mieux c'est pour la compagnie, mais ça vous coûte plus cher.`,
        });
      }
    } else {
      tips.push({
        level: "warning",
        icon: "💸",
        title: "Pas assez pour créer une compagnie",
        body: `Il faut au minimum $134 (= 2 × $67, le prix minimum) pour créer une compagnie. Vous avez $${player.cash}. Passez ce tour.`,
      });
    }
  }

  // Cert limit warning
  const certLimit = def.certLimit[state.players.length] ?? 28;
  const totalCerts = player.shares.length + player.privates.length;
  if (totalCerts >= certLimit - 2) {
    tips.push({
      level: "warning",
      icon: "📋",
      title: "Presque à la limite de certificats",
      body: `Vous avez ${totalCerts} certificats sur ${certLimit} autorisés. Si vous atteignez la limite, vous ne pourrez plus rien acheter. Envisagez de vendre des actions dont vous avez peu besoin.`,
    });
  }

  // Dump risk warning
  for (const compId of ownCompanyIds) {
    const myOwned = player.shares.filter((s) => s.companyId === compId && !s.president).reduce((s, sh) => s + sh.percent, 0);
    if (myOwned === 0) continue;
  }
  const nonPresidentByCompany = new Map<string, number>();
  for (const share of player.shares) {
    if (!share.president) {
      nonPresidentByCompany.set(share.companyId, (nonPresidentByCompany.get(share.companyId) ?? 0) + share.percent);
    }
  }
  for (const [compId, pct] of nonPresidentByCompany) {
    if (pct >= 20 && !ownCompanyIds.includes(compId)) {
      const compDef = def.companies.find((c) => c.id === compId);
      tips.push({
        level: "warning",
        icon: "⚠️",
        title: `Risque avec ${compDef?.shortName ?? compId}`,
        body: `Vous avez ${pct} % de ${compDef?.name ?? compId} sans en être président. Si l'adversaire vend ses actions, vous pourriez devenir président forcé d'une compagnie que vous ne voulez pas gérer. Limitez-vous à 10 % dans les compagnies des adversaires.`,
      });
    }
  }

  if (tips.length === 0) {
    tips.push({
      level: "tip",
      icon: "💡",
      title: "Stratégie en milieu de partie",
      body: "Concentrez-vous sur vos propres compagnies. Achetez des actions dans les compagnies qui paient des dividendes régulièrement — leur cours monte et vous percevez des revenus à chaque round.",
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

  // No trains — urgent
  if (companyState.trains.length === 0) {
    const cheapestTrain = def.trains
      .filter((t) => (state.trainBank[t.id] ?? 0) > 0)
      .sort((a, b) => a.price - b.price)[0];
    if (cheapestTrain) {
      if (companyState.cash >= cheapestTrain.price) {
        tips.push({
          level: "critical",
          icon: "🚨",
          title: "URGENT : Achetez un train !",
          body: `${companyDef.shortName} n'a aucun train. Sans train, la compagnie ne peut pas faire circuler ses wagons et ne génère aucun revenu. Achetez immédiatement un train "${cheapestTrain.name}" à $${cheapestTrain.price} (la trésorerie de la compagnie contient $${companyState.cash}).`,
        });
      } else {
        tips.push({
          level: "critical",
          icon: "🚨",
          title: "PAS DE TRAIN et trésorerie insuffisante !",
          body: `${companyDef.shortName} n'a aucun train et ne peut pas en acheter (trésorerie : $${companyState.cash}, train le moins cher : $${cheapestTrain.price}). En tant que président, vous pourrez DEVOIR payer de votre propre argent pour acheter un train si vos anciens trains rouillent !`,
        });
      }
    }
  }

  // Trains about to rust
  if (companyState.trains.length > 0 && phaseNum >= 3) {
    const hasOldTrains = companyState.trains.some((t) => t === "2" || t === "3");
    const hasSafeTrains = companyState.trains.some((t) => t === "5" || t === "6" || t === "D");
    if (hasOldTrains && !hasSafeTrains) {
      tips.push({
        level: "warning",
        icon: "⏰",
        title: "Vos trains vont bientôt devenir obsolètes",
        body: companyState.trains.includes("2")
          ? "Les trains '2' seront retirés du jeu à la phase 4 (quand le 3ème train '4' est acheté dans la partie). Anticipez leur remplacement ! Le train '5' ($450) ne rouille jamais — c'est le meilleur investissement à long terme."
          : "Les trains '3' seront retirés à la phase 6. Planifiez l'achat de trains '5' ($450) qui ne rouillent jamais.",
      });
    }
  }

  // 5-train available
  if (!done.has("trains") && companyState.trains.length > 0) {
    const fiveTrain = def.trains.find((t) => t.id === "5");
    if (fiveTrain && (state.trainBank["5"] ?? 0) > 0 && companyState.cash >= fiveTrain.price) {
      const hasSafe = companyState.trains.some((t) => t === "5" || t === "6" || t === "D");
      if (!hasSafe) {
        tips.push({
          level: "warning",
          icon: "⭐",
          title: "Train 5 disponible — il ne rouille jamais !",
          body: `Le train 5 ($${fiveTrain.price}) est le meilleur investissement du jeu : contrairement aux trains 2, 3 et 4, il ne sera JAMAIS retiré. La trésorerie de ${companyDef.shortName} contient $${companyState.cash}, ce qui suffit pour l'acheter. Considérez sérieusement cet achat.`,
        });
      }
    }
  }

  // Tile order reminder
  if (!done.has("tile")) {
    tips.push({
      level: "tip",
      icon: "🗺️",
      title: "Posez la tuile EN PREMIER (avant de lancer les trains)",
      body: "La nouvelle voie ferrée peut être utilisée immédiatement ce même tour. Si vous lancez les trains avant de poser la tuile, vous ratez peut-être une meilleure route. Étendez votre réseau vers New York ($40), Boston, Chicago, ou les autres villes à fort revenu.",
    });
  }

  // Dividend advice
  if (!done.has("routes") && companyState.trains.length > 0) {
    tips.push({
      level: "tip",
      icon: "💰",
      title: "Choisissez 'Payer' les dividendes — règle d'or",
      body: "En 1830, les experts paient presque toujours les dividendes. Payer = le cours de l'action monte (votre richesse augmente) + vous et vos co-actionnaires recevez de l'argent. Retenir = le cours baisse + l'argent va dans la caisse de la compagnie. Retenez SEULEMENT si vous avez besoin d'acheter un train très cher.",
    });
  }

  return tips;
}

// ─── Component ────────────────────────────────────────────────────────────────

const LEVEL_STYLE: Record<TipLevel, { border: string; bg: string; titleColor: string; bodyColor: string; badge: string; badgeBg: string }> = {
  critical: {
    border: "#c0392b", bg: "#1a0808",
    titleColor: "#f08080", bodyColor: "#d4a0a0",
    badge: "IMPORTANT", badgeBg: "#c0392b",
  },
  warning: {
    border: "#e07030", bg: "#1a1008",
    titleColor: "#f0b060", bodyColor: "#c4a080",
    badge: "CONSEIL", badgeBg: "#8b5e00",
  },
  tip: {
    border: "#305080", bg: "#080e1a",
    titleColor: "#78b4e0", bodyColor: "#8090a8",
    badge: "ASTUCE", badgeBg: "#1a3a5a",
  },
};

export function Advisor({ state, def, myPlayerId }: Props) {
  const [open, setOpen] = useState(true);
  const isMyTurn = state.currentPlayerId === myPlayerId;

  let tips: Tip[] = [];
  if (state.turnContext.type === "auction") tips = auctionTips(state, def, myPlayerId);
  else if (state.turnContext.type === "stock") tips = stockTips(state, def, myPlayerId);
  else if (state.turnContext.type === "operating") tips = operatingTips(state, def, myPlayerId);

  if (tips.length === 0) return null;

  return (
    <div style={{ border: `1px solid ${isMyTurn ? "#5060c0" : "#2a2a4a"}`, borderRadius: 8, overflow: "hidden", marginBottom: 4 }}>
      <button
        onClick={() => setOpen((v) => !v)}
        style={{ width: "100%", background: isMyTurn ? "#0d0d28" : "#0a0a1a", border: "none", padding: "7px 12px", display: "flex", alignItems: "center", gap: 8, cursor: "pointer", textAlign: "left" }}
      >
        <span style={{ fontSize: 13 }}>🧠</span>
        <span style={{ fontSize: 11, color: "#8090d0", fontWeight: 600, letterSpacing: 0.5 }}>CONSEILS STRATÉGIQUES</span>
        {tips.some((t) => t.level === "critical") && (
          <span style={{ background: "#c0392b", color: "#fff", fontSize: 9, fontWeight: "bold", padding: "1px 5px", borderRadius: 8 }}>
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
              <div key={i} style={{ background: s.bg, border: `1px solid ${s.border}`, borderRadius: 6, padding: "7px 10px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
                  <span style={{ fontSize: 13 }}>{tip.icon}</span>
                  <span style={{ background: s.badgeBg, color: "#fff", fontSize: 9, fontWeight: "bold", padding: "1px 5px", borderRadius: 4 }}>{s.badge}</span>
                  <span style={{ fontSize: 12, fontWeight: "bold", color: s.titleColor }}>{tip.title}</span>
                </div>
                <div style={{ fontSize: 11, color: s.bodyColor, lineHeight: 1.6, paddingLeft: 4 }}>{tip.body}</div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
