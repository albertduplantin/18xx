import React, { useState } from "react";

type Section = "objectif" | "encheres" | "bourse" | "operations" | "conseils" | "glossaire";

const NAV: { id: Section; label: string; icon: string }[] = [
  { id: "objectif",    label: "Comment gagner",     icon: "🏆" },
  { id: "encheres",   label: "Phase 1 — Enchères",  icon: "🔨" },
  { id: "bourse",     label: "Phase 2 — Bourse",    icon: "📈" },
  { id: "operations", label: "Phase 3 — Exploitation", icon: "🚂" },
  { id: "conseils",   label: "Conseils débutants",  icon: "💡" },
  { id: "glossaire",  label: "Glossaire",            icon: "📖" },
];

// ─── Content ──────────────────────────────────────────────────────────────────

function SectionObjectif() {
  return (
    <div>
      <h2 style={h2}>Objectif du jeu</h2>
      <p style={p}>
        1830 est un jeu de gestion de compagnies ferroviaires qui se déroule dans le nord-est des États-Unis au XIXe siècle.
        Vous incarnez un baron des chemins de fer qui investit dans des compagnies pour s'enrichir.
      </p>
      <Box color="#2a3a5a">
        <strong style={{ color: "#ffd700" }}>Qui gagne ?</strong> Le joueur le plus riche à la fin de la partie (quand la banque est à court d'argent).
        Votre richesse = <strong>argent en main</strong> + <strong>valeur boursière de vos actions</strong>.
      </Box>

      <h3 style={h3}>La structure d'une partie</h3>
      <p style={p}>La partie se déroule en trois phases qui se répètent :</p>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <StepBox n="1" color="#5a3a2a" title="Enchères (une seule fois au début)">
          Les joueurs achètent des sociétés privées qui rapportent des revenus.
        </StepBox>
        <StepBox n="2" color="#2a4a2a" title="Round boursier">
          Les joueurs créent et investissent dans des compagnies ferroviaires en bourse.
        </StepBox>
        <StepBox n="3" color="#2a2a5a" title="Round opérationnel">
          Les compagnies ferroviaires posent des voies, achètent des trains, et génèrent des revenus distribués aux actionnaires.
        </StepBox>
      </div>

      <h3 style={h3}>La banque</h3>
      <p style={p}>
        La banque commence avec <strong style={{ color: "#ffd700" }}>$12 000</strong>. Quand elle est vide, la partie se termine
        et le joueur le plus riche gagne. Toute action génératrice de revenus accélère la fin de la partie.
      </p>
    </div>
  );
}

function SectionEncheres() {
  return (
    <div>
      <h2 style={h2}>Phase 1 — Les Enchères</h2>
      <p style={p}>
        Au tout début de la partie (une seule fois), les joueurs s'adjugent des <strong>sociétés privées</strong>.
        Ce sont de petites entreprises qui rapportent des revenus fixes à chaque round opérationnel.
      </p>

      <h3 style={h3}>Comment se déroulent les enchères ?</h3>
      <ol style={{ color: "#ccc", paddingLeft: 20, lineHeight: 2 }}>
        <li>La première société privée est mise aux enchères.</li>
        <li>Chaque joueur, à son tour, peut soit <strong>acheter au prix affiché</strong>, soit <strong>passer</strong>.</li>
        <li>Si tout le monde passe, le prix baisse de $5 au prochain tour.</li>
        <li>Si le prix tombe à $0, la société est donnée gratuitement au prochain joueur.</li>
        <li>Quand une société est vendue, on passe à la suivante.</li>
      </ol>

      <h3 style={h3}>Les 6 sociétés privées</h3>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {[
          { id: "SV", name: "Schuylkill Valley", price: 20, rev: 5, desc: "Pas de capacité spéciale. Revenu de base.", value: "★★☆☆☆" },
          { id: "CS", name: "Champlain & St. Lawrence", price: 40, rev: 10, desc: "Vous permet de poser une tuile de voie gratuite à n'importe quel moment.", value: "★★★☆☆" },
          { id: "DH", name: "Delaware & Hudson", price: 70, rev: 15, desc: "Vous permet de poser une tuile ET un jeton en terrain montagneux à prix réduit.", value: "★★★☆☆" },
          { id: "MH", name: "Mohawk & Hudson", price: 110, rev: 20, desc: "Peut être échangée contre 10 % des actions NYC à tout moment.", value: "★★★★☆" },
          { id: "CA", name: "Camden & Amboy", price: 160, rev: 25, desc: "Vous donne 10 % des actions PRR gratuitement dès l'achat.", value: "★★★★☆" },
          { id: "BO", name: "B&O Railroad", price: 220, rev: 30, desc: "Vous donne automatiquement la présidence de la B&O Railroad — la plus puissante !", value: "★★★★★" },
        ].map((priv) => (
          <div key={priv.id} style={{ background: "#12122a", border: "1px solid #333", borderRadius: 6, padding: "8px 12px" }}>
            <div style={{ display: "flex", gap: 10, alignItems: "baseline" }}>
              <span style={{ fontSize: 12, fontWeight: "bold", color: "#fff" }}>{priv.name}</span>
              <span style={{ fontSize: 11, color: "#ffd700" }}>${priv.price}</span>
              <span style={{ fontSize: 11, color: "#4caf50" }}>+${priv.rev}/OR</span>
              <span style={{ marginLeft: "auto", fontSize: 13 }}>{priv.value}</span>
            </div>
            <div style={{ fontSize: 11, color: "#888", marginTop: 3 }}>{priv.desc}</div>
          </div>
        ))}
      </div>

      <Box color="#2a3a2a">
        <strong>Conseil :</strong> Achetez dès que vous avez les fonds, mais gardez toujours au moins <strong style={{ color: "#ffd700" }}>$134</strong> en réserve
        pour pouvoir créer votre première compagnie ferroviaire au round boursier.
      </Box>
    </div>
  );
}

function SectionBourse() {
  return (
    <div>
      <h2 style={h2}>Phase 2 — Le Round Boursier</h2>
      <p style={p}>
        Dans le round boursier, les joueurs achètent et vendent des <strong>actions de compagnies ferroviaires</strong>.
        Une compagnie ne commence à opérer (et donc à rapporter de l'argent) que quand elle a "flotté".
      </p>

      <h3 style={h3}>Créer une compagnie (Certificat Président)</h3>
      <Box color="#2a2a4a">
        Pour créer une compagnie, vous achetez le <strong>certificat président (20 %)</strong> en choisissant un <strong>prix de parité</strong> (le cours initial de l'action).
        Vous payez <strong>2× la parité</strong> (car vous prenez 20 % = 2 parts de 10 %).
      </Box>
      <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 10 }}>
        {[
          { par: 67, cost: 134, float: 402 },
          { par: 76, cost: 152, float: 456 },
          { par: 82, cost: 164, float: 492 },
          { par: 90, cost: 180, float: 540 },
          { par: 100, cost: 200, float: 600 },
        ].map((row) => (
          <div key={row.par} style={{ display: "flex", gap: 10, background: "#0a0a1a", padding: "6px 10px", borderRadius: 4, fontSize: 12 }}>
            <span style={{ color: "#78c0f0", width: 100 }}>Parité <strong>${row.par}</strong></span>
            <span style={{ color: "#aaa" }}>→ Coût : <strong style={{ color: "#ffd700" }}>${row.cost}</strong></span>
            <span style={{ color: "#aaa" }}>→ Capital à la flotation : <strong style={{ color: "#4caf50" }}>${row.float}</strong></span>
          </div>
        ))}
      </div>

      <h3 style={h3}>Quand la compagnie flotte-t-elle ?</h3>
      <p style={p}>
        Une compagnie <strong>flotte</strong> (= reçoit ses fonds et peut opérer) quand <strong>60 % de ses actions sont vendues</strong>.
        Vous avez déjà acheté 20 % (votre certificat), donc d'autres joueurs doivent acheter 40 % de plus.
        Ou vous pouvez acheter jusqu'à 60 % vous-même.
      </p>
      <Box color="#2a1a1a">
        <strong>Important :</strong> Tant que votre compagnie n'a pas flotté, elle n'opère pas et ne génère aucun revenu.
        Aidez-la à flotter le plus vite possible en achetant des actions supplémentaires.
      </Box>

      <h3 style={h3}>Acheter des actions existantes</h3>
      <p style={p}>
        Vous pouvez acheter <strong>une seule action (10 %)</strong> par round dans une compagnie déjà démarrée, au prix boursier actuel.
        Vous pouvez vendre autant d'actions que vous voulez (mais pas les actions achetées ce même round).
      </p>

      <h3 style={h3}>Fin du round boursier</h3>
      <p style={p}>
        Le round se termine quand tous les joueurs passent consécutivement. On passe alors au round opérationnel.
      </p>
    </div>
  );
}

function SectionOperations() {
  return (
    <div>
      <h2 style={h2}>Phase 3 — Le Round Opérationnel</h2>
      <p style={p}>
        Dans le round opérationnel, chaque compagnie flottée joue à son tour (par ordre de cours décroissant).
        En tant que président, c'est vous qui décidez des actions de la compagnie.
      </p>

      <h3 style={h3}>Les 4 étapes d'une compagnie</h3>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <StepBox n="1" color="#1a3a5a" title="Poser une tuile de voie (optionnel)">
          Vous pouvez poser une tuile sur la carte pour étendre le réseau ferroviaire de votre compagnie.
          <br /><br />
          <strong>Important :</strong> Posez la tuile EN PREMIER — le nouveau tronçon peut être utilisé immédiatement pour vos routes ce tour.
          <br /><br />
          Attention aux terrains difficiles : montagne = $120 de surcoût, eau = $80. Ces frais sont prélevés sur la trésorerie de la compagnie.
        </StepBox>
        <StepBox n="2" color="#1a3a5a" title="Placer un jeton station (optionnel)">
          Un jeton garantit que votre compagnie peut utiliser cette ville dans ses routes, même si un concurrent y est aussi présent.
          Coût variable selon l'ordre (indiqué sur le certificat).
        </StepBox>
        <StepBox n="3" color="#1a3a5a" title="Acheter un train (recommandé si vous n'en avez pas)">
          Les trains définissent combien de villes vous pouvez relier dans une route :
          <br />
          • Train 2 ($80) : relie 2 villes — <span style={{ color: "#e07070" }}>devient obsolète à la phase 4</span>
          <br />
          • Train 3 ($180) : 3 villes — <span style={{ color: "#e07070" }}>obsolète à la phase 6</span>
          <br />
          • Train 4 ($300) : 4 villes — <span style={{ color: "#e07070" }}>obsolète quand les diesels arrivent</span>
          <br />
          • <strong style={{ color: "#ffd700" }}>Train 5 ($450) : 5 villes — NE ROUILLE JAMAIS !</strong>
          <br />
          • Train 6 ($630) : 6 villes — ne rouille jamais
          <br />
          • Train D ($1100) : diesel, illimité — ne rouille jamais
        </StepBox>
        <StepBox n="4" color="#1a3a5a" title="Lancer les trains et distribuer les dividendes">
          Le système calcule automatiquement la meilleure route possible.
          Vous choisissez alors :
          <br /><br />
          <strong style={{ color: "#4caf50" }}>Payer les dividendes</strong> : le revenu est distribué aux actionnaires proportionnellement.
          Le cours de l'action <strong>monte</strong> d'une case à droite.
          <br /><br />
          <strong style={{ color: "#e07070" }}>Retenir</strong> : l'argent va dans la trésorerie de la compagnie.
          Le cours <strong>descend</strong> d'une case à gauche.
        </StepBox>
      </div>

      <h3 style={h3}>Le rouillage des trains — danger principal</h3>
      <Box color="#3a1a1a">
        Quand un nouveau type de train devient disponible, les trains de la génération précédente "rouillent" et sont retirés du jeu.
        Si votre compagnie n'a plus de train, vous DEVEZ en acheter un immédiatement — même si vous devez payer de votre poche !
        Anticipez toujours le remplacement des trains.
      </Box>
    </div>
  );
}

function SectionConseils() {
  return (
    <div>
      <h2 style={h2}>Conseils pour débutants</h2>

      <h3 style={h3}>Aux enchères</h3>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <Tip icon="✅">Achetez la B&O ($220) si vous pouvez — elle vous donne la présidence de la meilleure compagnie.</Tip>
        <Tip icon="✅">La Camden & Amboy ($160) est aussi excellente : elle vous offre 10 % de la PRR gratuitement.</Tip>
        <Tip icon="⚠️">Gardez toujours au moins $134 en réserve pour créer votre compagnie.</Tip>
        <Tip icon="❌">N'achetez pas une privée si ça vous laisse sans argent pour la suite.</Tip>
      </div>

      <h3 style={h3}>Au round boursier</h3>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <Tip icon="✅">Créez votre compagnie dès le 1er round — plus tôt elle flotte, plus vite elle rapporte.</Tip>
        <Tip icon="✅">Choisissez une parité de $76 à $82. C'est le meilleur équilibre coût/trésorerie.</Tip>
        <Tip icon="✅">Achetez 10 % supplémentaire de votre compagnie au tour suivant pour l'aider à flotter.</Tip>
        <Tip icon="⚠️">Ne créez votre 2e compagnie qu'APRÈS que la 1ère a flotté.</Tip>
        <Tip icon="❌">N'achetez pas plus de 10 % d'une compagnie que vous ne contrôlez pas (risque de vous la refiler).</Tip>
      </div>

      <h3 style={h3}>Au round opérationnel</h3>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <Tip icon="✅">Posez la tuile EN PREMIER avant de lancer les trains.</Tip>
        <Tip icon="✅">Payez toujours les dividendes — votre cours monte et vous gagnez de l'argent.</Tip>
        <Tip icon="✅">Achetez un train 5 dès que possible — il ne rouille jamais.</Tip>
        <Tip icon="✅">Planifiez l'achat de trains AVANT que les vôtres rouillent.</Tip>
        <Tip icon="❌">Ne retenez presque jamais — le cours baisse et vous perdez de la valeur.</Tip>
      </div>

      <h3 style={h3}>Stratégie générale</h3>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <Tip icon="💡">Une compagnie rentable dont le cours monte vaut bien plus que son simple revenu.</Tip>
        <Tip icon="💡">Les trains 5 sont le meilleur investissement à long terme — visez-les.</Tip>
        <Tip icon="💡">Bloquez vos adversaires en plaçant des jetons dans les villes clés avant eux.</Tip>
        <Tip icon="💡">La partie accélère quand les trains chers arrivent. Anticipez !</Tip>
      </div>
    </div>
  );
}

function SectionGlossaire() {
  const terms: [string, string][] = [
    ["Parité", "Le prix de départ d'une action en bourse. Vous choisissez ce prix quand vous créez une compagnie. Plus il est élevé, plus la compagnie aura de capital au démarrage, mais plus ça vous coûte cher."],
    ["Flotter", "Une compagnie 'flotte' quand 60% de ses actions sont vendues. Elle reçoit alors son capital de départ (6 × parité) et peut commencer à opérer et générer des revenus."],
    ["Trésorerie", "L'argent détenu par la compagnie elle-même (pas par vous). Sert à acheter des trains et payer les terrains difficiles. Bien différent de votre argent personnel."],
    ["Dividendes", "Les bénéfices distribués aux actionnaires à chaque round opérationnel quand une compagnie choisit de 'payer'. Vous recevez votre part proportionnellement à vos actions."],
    ["Retenir", "Au lieu de distribuer les dividendes, l'argent va dans la trésorerie de la compagnie. Utile pour acheter des trains chers, mais le cours boursier descend."],
    ["Certificat président", "L'action à 20% qui fait de vous le président d'une compagnie. C'est vous qui prenez toutes les décisions opérationnelles."],
    ["Cours boursier", "Le prix actuel d'une action en bourse. Il monte quand la compagnie paie des dividendes, descend quand elle retient. Votre richesse dépend de ce cours."],
    ["Rouillage", "Quand un nouveau type de train arrive, les anciens deviennent obsolètes et disparaissent. Si votre compagnie perd tous ses trains, vous devez en racheter un (de votre poche si nécessaire)."],
    ["Terrain montagne / eau", "Des hexs de la carte avec un surcoût pour y poser une tuile : montagne +$120, eau +$80, prélevés sur la trésorerie de la compagnie."],
    ["Jeton station", "Un marqueur placé dans une ville qui permet à votre compagnie d'y faire passer ses routes. Sans jeton, vous ne pouvez pas utiliser une ville bloquée par un concurrent."],
    ["Offboard", "Les villes hors de la carte (Chicago, Boston, etc.) qui ont des valeurs de revenu élevées. Ce sont des terminaux rentables pour vos routes."],
    ["Banque", "La caisse commune du jeu ($12 000 au départ). Quand elle est à court, la partie se termine. Tous les paiements transitent par la banque."],
  ];

  return (
    <div>
      <h2 style={h2}>Glossaire</h2>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {terms.map(([term, def]) => (
          <div key={term} style={{ background: "#0a0a1a", border: "1px solid #2a2a40", borderRadius: 6, padding: "8px 12px" }}>
            <div style={{ fontSize: 12, fontWeight: "bold", color: "#78c0f0", marginBottom: 3 }}>{term}</div>
            <div style={{ fontSize: 11, color: "#888", lineHeight: 1.55 }}>{def}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Shared sub-components ────────────────────────────────────────────────────

function Box({ color, children }: { color: string; children: React.ReactNode }) {
  return (
    <div style={{ background: color, border: `1px solid ${color}88`, borderRadius: 6, padding: "10px 14px", margin: "10px 0", fontSize: 12, color: "#ccc", lineHeight: 1.6 }}>
      {children}
    </div>
  );
}

function StepBox({ n, color, title, children }: { n: string; color: string; title: string; children: React.ReactNode }) {
  return (
    <div style={{ background: color, border: `1px solid ${color}88`, borderRadius: 6, padding: "10px 14px", display: "flex", gap: 12 }}>
      <div style={{ width: 24, height: 24, background: "#4060c0", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: "bold", color: "#fff", flexShrink: 0 }}>{n}</div>
      <div>
        <div style={{ fontSize: 12, fontWeight: "bold", color: "#78c0f0", marginBottom: 4 }}>{title}</div>
        <div style={{ fontSize: 11, color: "#aaa", lineHeight: 1.6 }}>{children}</div>
      </div>
    </div>
  );
}

function Tip({ icon, children }: { icon: string; children: React.ReactNode }) {
  return (
    <div style={{ display: "flex", gap: 8, fontSize: 12, color: "#aaa", lineHeight: 1.5, background: "#0a0a1a", padding: "6px 10px", borderRadius: 4 }}>
      <span style={{ flexShrink: 0 }}>{icon}</span>
      <span>{children}</span>
    </div>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const h2: React.CSSProperties = { fontSize: 16, fontWeight: "bold", color: "#fff", marginBottom: 12, marginTop: 0 };
const h3: React.CSSProperties = { fontSize: 13, fontWeight: "bold", color: "#78c0f0", marginTop: 18, marginBottom: 8 };
const p: React.CSSProperties = { fontSize: 12, color: "#aaa", lineHeight: 1.7, marginTop: 0, marginBottom: 10 };

// ─── Modal ────────────────────────────────────────────────────────────────────

export function RulesModal({ onClose }: { onClose: () => void }) {
  const [section, setSection] = useState<Section>("objectif");

  const SECTION_MAP: Record<Section, React.ReactNode> = {
    objectif:    <SectionObjectif />,
    encheres:    <SectionEncheres />,
    bourse:      <SectionBourse />,
    operations:  <SectionOperations />,
    conseils:    <SectionConseils />,
    glossaire:   <SectionGlossaire />,
  };

  return (
    <div
      style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.85)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center" }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div style={{ background: "#0d0d20", border: "1px solid #333", borderRadius: 10, width: "min(860px, 96vw)", height: "min(650px, 90vh)", display: "flex", flexDirection: "column", overflow: "hidden" }}>
        {/* Header */}
        <div style={{ background: "#12122a", borderBottom: "1px solid #2a2a50", padding: "12px 16px", display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontSize: 18 }}>📖</span>
          <span style={{ fontWeight: "bold", fontSize: 15, color: "#fff" }}>Guide du joueur — 1830 Railroads & Robber Barons</span>
          <button
            onClick={onClose}
            style={{ marginLeft: "auto", background: "#333", border: "none", borderRadius: 6, color: "#aaa", padding: "4px 10px", cursor: "pointer", fontSize: 16 }}
          >
            ✕
          </button>
        </div>

        <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>
          {/* Sidebar nav */}
          <div style={{ width: 190, borderRight: "1px solid #2a2a50", background: "#0a0a18", flexShrink: 0, overflowY: "auto", padding: "8px 0" }}>
            {NAV.map((item) => (
              <button
                key={item.id}
                onClick={() => setSection(item.id)}
                style={{
                  width: "100%", background: section === item.id ? "#1e1e40" : "transparent",
                  border: "none", borderLeft: `3px solid ${section === item.id ? "#6060e0" : "transparent"}`,
                  padding: "10px 14px", textAlign: "left", cursor: "pointer",
                  display: "flex", alignItems: "center", gap: 8,
                  color: section === item.id ? "#fff" : "#666",
                  fontSize: 12, fontWeight: section === item.id ? "bold" : "normal",
                }}
              >
                <span style={{ fontSize: 14 }}>{item.icon}</span>
                {item.label}
              </button>
            ))}
          </div>

          {/* Content */}
          <div style={{ flex: 1, overflowY: "auto", padding: "16px 20px" }}>
            {SECTION_MAP[section]}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Trigger button ───────────────────────────────────────────────────────────

export function RulesButton() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        onClick={() => setOpen(true)}
        style={{
          padding: "3px 10px", background: "#1a1a35", border: "1px solid #3a3a6a",
          borderRadius: 5, color: "#8090c0", cursor: "pointer", fontSize: 11, fontWeight: 600,
        }}
        title="Afficher les règles et conseils"
      >
        📖 Aide
      </button>
      {open && <RulesModal onClose={() => setOpen(false)} />}
    </>
  );
}
