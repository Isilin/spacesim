/**
 * Types de trous noirs (chantier 45.1).
 *
 * Le jeu en connaissait deux, sans parenté : une valeur de `StarClass` pour l'étoile d'un
 * système, et un cœur galactique dérivé de `systemCountOf`. Ils deviennent une famille, à
 * quatre emplacements — cœur de galaxie, corps central d'un système, compagnon d'une
 * étoile, et errant entre les systèmes.
 *
 * ## Les deux moitiés d'une définition
 *
 * L'ADR [0021](../../../../../docs/adr/0021-le-ciel-devient-une-donnee-de-jeu.md) impose
 * une frontière que ce fichier matérialise, et qui n'admet aucun cas particulier :
 *
 * - **Entrées de génération** (`massRange`, `placements`, `weights`) — lues uniquement par
 *   `universe.ts`, gelées par `GENERATOR_VERSION`, **jamais éditables** au CMS. Les
 *   modifier ne changerait rien aux galaxies déjà matérialisées et rendrait les suivantes
 *   incohérentes avec elles.
 * - **Effets et habillage** (tout le reste) — lus à l'usage par la simulation et le rendu.
 *   Ce sont les seuls que le palier 3 exposera à l'administration.
 *
 * Seul l'identifiant part en base ; ces valeurs se relisent à chaque fois.
 */

/** Où un trou noir peut apparaître. Un supermassif n'ancre pas un système. */
export const BLACK_HOLE_PLACEMENTS = [
  /** Au centre du bulbe d'une galaxie. Habillage pur : aucune mécanique n'en dépend. */
  "core",
  /** Corps central d'un système — c'est lui qu'on orbite. */
  "primary",
  /** En orbite aux côtés d'une étoile, dans un système qu'elle éclaire encore. */
  "companion",
  /** Système sans étoile ni monde, posé hors des bras. Nœud du graphe de sauts. */
  "drifter",
] as const;

export type BlackHolePlacement = (typeof BLACK_HOLE_PLACEMENTS)[number];

export const BLACK_HOLE_TYPE_IDS = [
  "stellar",
  "intermediate",
  "supermassive",
  "primordial",
  "dormant",
  "xray_binary",
  "microquasar",
] as const;

export type BlackHoleTypeId = (typeof BLACK_HOLE_TYPE_IDS)[number];

/**
 * Définition ouverte : `id` reste une chaîne pour que du contenu chargé depuis la base
 * (palier 3) type-checke. La table intégrée est narrowée par `StaticBlackHoleTypeDef` —
 * même idiome que `ChassisDef` / `StaticChassisDef`.
 */
export interface BlackHoleTypeDef {
  id: string;

  // ── Entrées de génération — jamais éditables ──

  /** Masses solaires. Tirée, puis persistée sur le corps central. */
  massRange: readonly [number, number];
  /** Emplacements permis. Un type absent d'un emplacement n'y est jamais tiré. */
  placements: readonly BlackHolePlacement[];
  /** Poids de tirage par emplacement. Une clé absente vaut zéro. */
  weights: Partial<Record<BlackHolePlacement, number>>;

  // ── Effets ──

  /** Multiplicateur de rendement minier du système : métaux arrachés au disque. */
  depositMult: number;
  /** Multiplicateur de rendement énergétique. Un disque d'accrétion est un réacteur. */
  energyMult: number;
  /**
   * Rendement en matière exotique. La ressource n'existe pas encore dans `RESOURCES` —
   * l'ajouter touche marché, PNJ et équilibrage, et c'est le palier 3 qui le fera. La
   * valeur est posée ici pour que la table soit complète le jour où elle sera branchée.
   */
  exoticYield: number;
  /**
   * Danger de séjour, 0–5. Entre dans le coût de trajet **à l'arrivée**, jamais dans le
   * poids d'une arête : le graphe reste de la géométrie pure, sans quoi
   * `travel.calibration.test.ts` cesserait de mesurer ce qu'il mesure.
   */
  hazard: number;
  /** Rayonnement, 0–5. Décape l'atmosphère des corps proches (chaîne physique, étape 13). */
  radiation: number;

  // ── Habillage ──

  /**
   * Rayon du disque d'accrétion, dans le repère de système. Zéro pour un dormant : plus
   * rien à accréter, donc rien à voir. Le cœur galactique fait exception et garde
   * `galacticCoreDisc(systemCount)`, calibré sur la relation M–σ au chantier 39 : sa
   * taille suit le bulbe, pas une constante de table.
   */
  discRadius: number;
  /**
   * Rayon de l'horizon, même repère. Absolu plutôt qu'en part du disque, pour qu'un
   * dormant sans disque en ait un quand même.
   */
  horizonRadius: number;
  /** Teinte du disque — l'horizon ne rend rien, c'est le disque qui porte la couleur. */
  halo: string;
  /** Lumière émise, faible et chaude : elle remplace celle d'une étoile absente. */
  light: string;
  intensity: number;
}

export interface StaticBlackHoleTypeDef extends BlackHoleTypeDef {
  id: BlackHoleTypeId;
}

export const BLACK_HOLE_TYPES: Record<BlackHoleTypeId, StaticBlackHoleTypeDef> =
  {
    // L'effondrement d'une étoile massive : le cas commun, et le seul que le jeu rendait déjà.
    stellar: {
      id: "stellar",
      massRange: [5, 30],
      placements: ["primary", "companion"],
      weights: { primary: 10, companion: 6 },
      depositMult: 1.4,
      energyMult: 1.6,
      exoticYield: 0.6,
      hazard: 4,
      radiation: 4,
      discRadius: 41.6,
      horizonRadius: 7.15,
      halo: "#ff8a3d",
      light: "#ffb37a",
      intensity: 1.1,
    },
    // Le chaînon manquant : trop lourd pour naître d'une étoile, trop léger pour un bulbe.
    intermediate: {
      id: "intermediate",
      massRange: [100, 100000],
      placements: ["core", "primary"],
      weights: { core: 4, primary: 2 },
      depositMult: 1.6,
      energyMult: 2.0,
      exoticYield: 0.9,
      hazard: 5,
      radiation: 5,
      discRadius: 120,
      horizonRadius: 20,
      halo: "#ffb46b",
      light: "#ffc98f",
      intensity: 1.4,
    },
    // Un par galaxie, au centre du bulbe. Habillage pur : rien ne vit dessous, donc rien
    // ne peut en dépendre — c'est ce qui l'autorise à rester dérivé (ADR 0021).
    supermassive: {
      id: "supermassive",
      massRange: [1e6, 1e10],
      placements: ["core"],
      weights: { core: 10 },
      depositMult: 1.0,
      energyMult: 2.6,
      exoticYield: 1.4,
      hazard: 5,
      radiation: 5,
      discRadius: 300,
      horizonRadius: 51,
      halo: "#ffd08a",
      light: "#ffdca8",
      intensity: 1.8,
    },
    // Né des surdensités du premier univers, pas d'une étoile. Il s'évapore lentement, et
    // c'est ce rayonnement qu'on récolte.
    primordial: {
      id: "primordial",
      massRange: [1e-5, 1],
      placements: ["drifter"],
      weights: { drifter: 14 },
      depositMult: 0.8,
      energyMult: 0.8,
      exoticYield: 1.8,
      hazard: 2,
      radiation: 2,
      discRadius: 6,
      horizonRadius: 1,
      halo: "#8f7fd6",
      light: "#a898e0",
      intensity: 0.6,
    },
    // Plus rien à accréter, donc rien à voir : le danger n'est pas annoncé.
    dormant: {
      id: "dormant",
      massRange: [3, 20],
      placements: ["drifter", "companion"],
      weights: { drifter: 12, companion: 3 },
      depositMult: 1.0,
      energyMult: 0,
      exoticYield: 0.4,
      hazard: 5,
      radiation: 1,
      discRadius: 0,
      horizonRadius: 4.5,
      halo: "#4a5568",
      light: "#000000",
      intensity: 0,
    },
    // Il arrache sa matière à une étoile compagne : le disque brûle en rayons X.
    xray_binary: {
      id: "xray_binary",
      massRange: [5, 20],
      placements: ["core", "primary", "companion"],
      weights: { core: 1, primary: 3, companion: 4 },
      depositMult: 1.3,
      energyMult: 2.8,
      exoticYield: 1.0,
      hazard: 5,
      radiation: 5,
      discRadius: 64,
      horizonRadius: 11,
      halo: "#7fc4ff",
      light: "#a8d8ff",
      intensity: 2.2,
    },
    // Une binaire X qui projette deux jets : le rendement maximal, à l'endroit le plus mortel.
    microquasar: {
      id: "microquasar",
      massRange: [8, 25],
      placements: ["primary"],
      weights: { primary: 1 },
      depositMult: 1.2,
      energyMult: 3.2,
      exoticYield: 1.6,
      hazard: 5,
      radiation: 5,
      discRadius: 88,
      horizonRadius: 15,
      halo: "#5fe0d8",
      light: "#8ff0e8",
      intensity: 2.6,
    },
  };

/**
 * Repli neutre, obligatoire. Le contenu devient éditable au palier 3 : un identifiant
 * inconnu doit rendre une forme banale plutôt que casser la vue — c'est la condition pour
 * que le CMS tienne sa promesse, et la règle que `bodyAppearance` applique déjà (ADR 0007).
 */
const GENERIC_BLACK_HOLE: BlackHoleTypeDef = BLACK_HOLE_TYPES.stellar;

export function blackHoleType(id: string): BlackHoleTypeDef {
  return BLACK_HOLE_TYPES[id as BlackHoleTypeId] ?? GENERIC_BLACK_HOLE;
}
