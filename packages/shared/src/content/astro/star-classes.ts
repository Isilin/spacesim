/**
 * Classes d'étoiles (chantier 45.2).
 *
 * Onze classes pour couvrir la séquence de Morgan-Keenan (OBAFGKM) plus les stades évolués
 * et les résidus. C'est la famille qui **cause** tout le reste : sa luminosité place la zone
 * habitable et la ligne des glaces, sa masse biaise le nombre de corps, son activité
 * éruptive et son rayonnement décident si une atmosphère survit.
 *
 * Elle remplace `STAR_CLASSES`, l'énumération à six valeurs dérivée de l'identifiant du
 * système (chantier 35.9). L'ADR
 * [0021](../../../../../docs/adr/0021-le-ciel-devient-une-donnee-de-jeu.md) explique
 * pourquoi ce qui était une lecture d'après coup devient un tirage persisté.
 *
 * ## Pourquoi les poids ne sont pas les proportions réelles
 *
 * Le ciel réel est écrasé par les naines rouges : 76 % des étoiles, contre 7,6 % de type
 * solaire. Reproduire ces parts donnerait un univers où presque chaque système est une naine
 * rouge — zone habitable à un vingtième d'unité astronomique, mondes verrouillés par marée,
 * atmosphères décapées par les éruptions.
 *
 * Les poids ci-dessous **penchent vers le réel sans l'épouser** : la naine rouge reste de
 * très loin la plus commune (40 %), mais laisse assez de place aux classes tempérées pour
 * que l'exploration ait des trouvailles à faire. La part réelle est conservée dans
 * `realShare`, parce qu'elle est ce que la fiche d'un système montre au joueur — et parce
 * qu'un jour où l'on voudra rapprocher les deux, il faudra savoir de combien.
 */

export const STAR_CLASS_IDS = [
  "red_dwarf",
  "orange_dwarf",
  "yellow_dwarf",
  "yellow_white",
  "blue_white",
  "blue_giant",
  "red_giant",
  "supergiant",
  "white_dwarf",
  "brown_dwarf",
  "pulsar",
] as const;

export type StarClassId = (typeof STAR_CLASS_IDS)[number];

export interface StarClassDef {
  id: string;

  // ── Entrées de génération — jamais éditables ──

  /** Masses solaires. Tirée, puis persistée sur le corps central. */
  massRange: readonly [number, number];
  /** Poids de tirage comme corps central d'un système. */
  weight: number;
  /**
   * Poids de tirage comme **compagnon**. Une supergéante ne se trouve pas en second rang
   * d'une naine ; une naine rouge, si, et c'est le cas le plus courant du ciel réel.
   */
  companionWeight: number;

  // ── Effets — le cœur de la chaîne physique ──

  /**
   * Luminosité bolométrique, en luminosités solaires.
   *
   * **La grandeur pivot de tout le chantier.** C'est d'elle que se déduisent la zone
   * habitable (`0,95√L` à `1,67√L` UA), la ligne des glaces (`2,7√L` UA), l'irradiance de
   * chaque corps (`L / d²`) et donc sa température d'équilibre. L'échelle des orbites du
   * système s'y adosse aussi : posées en absolu, aucune naine rouge n'aurait de monde
   * habitable, et elles sont la classe la plus commune.
   */
  luminosity: number;
  /**
   * Exposant de la relation masse-luminosité, à l'intérieur de la classe.
   *
   * Vaut 3,5 sur la séquence principale, où `L ∝ M^3,5` est la loi réelle. Il tombe pour
   * les stades évolués, dont la luminosité est fixée par le cœur et non par la masse
   * totale — et il est NÉGATIF pour une naine blanche, qui rétrécit en grossissant : plus
   * massive, donc plus petite, donc moins lumineuse.
   *
   * C'est ce champ qui rend `Star.mass` porteuse. Sans lui, la masse serait persistée sans
   * que rien ne la lise.
   */
  massLuminosityExponent: number;
  /** Température effective, en kelvins. Donne la couleur, et le domaine d'émission. */
  effectiveTempK: number;
  /**
   * Activité éruptive, 0–3. Une naine rouge en pleine jeunesse décape l'atmosphère d'un
   * monde à faible vitesse de libération — c'est ce qui rend sa zone habitable moins
   * accueillante que sa seule température ne le laisserait croire.
   */
  flareActivity: number;
  /** Rayonnement ionisant, 0–5. Stérilise, et entre dans le danger de séjour. */
  radiation: number;
  /** Multiplicateur de rendement énergétique d'une colonie du système. */
  energyMult: number;
  /** Multiplicateur de rendement minier — une relique a enrichi son voisinage. */
  depositMult: number;

  // ── Information ──

  /**
   * Part réelle de cette classe dans le ciel, pour la fiche. Volontairement distincte de
   * `weight` : voir l'en-tête du fichier.
   */
  realShare: string;

  // ── Habillage ──

  /** Une étoile qui n'éclaire pas ; ici toujours faux, les singularités ont leur catalogue. */
  dark: boolean;
  core: string;
  edge: string;
  halo: string;
  /** Rayon de rendu, relatif à une étoile de type solaire. */
  radius: number;
  corona: number;
  light: string;
  intensity: number;
  /** Vitesse de défilement de la granulation : une géante bout lentement. */
  churn: number;
}

export interface StaticStarClassDef extends StarClassDef {
  id: StarClassId;
}

export const STAR_CLASSES: Record<StarClassId, StaticStarClassDef> = {
  // Type M — la plus commune de très loin. Zone habitable si proche que les mondes s'y
  // verrouillent par marée, et des éruptions qui décapent ce qui n'est pas assez massif.
  red_dwarf: {
    id: "red_dwarf",
    massRange: [0.08, 0.45],
    weight: 40,
    companionWeight: 40,
    luminosity: 0.015,
    massLuminosityExponent: 3.5,
    effectiveTempK: 3200,
    flareActivity: 3,
    radiation: 2,
    energyMult: 0.35,
    depositMult: 1.0,
    realShare: "76 %",
    dark: false,
    core: "#ffb27a",
    edge: "#d8452a",
    halo: "#e0603a",
    radius: 0.62,
    corona: 0.8,
    light: "#ffb089",
    intensity: 2,
    churn: 0.55,
  },
  // Type K — le meilleur compromis du ciel réel : stable, calme, et vit assez longtemps
  // pour que quelque chose s'y installe.
  orange_dwarf: {
    id: "orange_dwarf",
    massRange: [0.45, 0.8],
    weight: 18,
    companionWeight: 20,
    luminosity: 0.25,
    massLuminosityExponent: 3.5,
    effectiveTempK: 4600,
    flareActivity: 1,
    radiation: 1,
    energyMult: 0.75,
    depositMult: 1.0,
    realShare: "12 %",
    dark: false,
    core: "#ffd9a8",
    edge: "#e08a3a",
    halo: "#ffa860",
    radius: 0.82,
    corona: 0.9,
    light: "#ffd0a0",
    intensity: 2.6,
    churn: 0.7,
  },
  // Type G — le cas solaire, et la référence à laquelle toute la chaîne est calée.
  yellow_dwarf: {
    id: "yellow_dwarf",
    massRange: [0.8, 1.04],
    weight: 14,
    companionWeight: 14,
    luminosity: 1,
    massLuminosityExponent: 3.5,
    effectiveTempK: 5700,
    flareActivity: 0,
    radiation: 1,
    energyMult: 1,
    depositMult: 1,
    realShare: "7,6 %",
    dark: false,
    core: "#fff0c2",
    edge: "#ff8a3d",
    halo: "#ffae52",
    radius: 1,
    corona: 1,
    light: "#ffffff",
    intensity: 3,
    churn: 1,
  },
  // Type F — plus chaude et plus brève. Bon rendement, ultraviolet déjà sensible.
  yellow_white: {
    id: "yellow_white",
    massRange: [1.04, 1.4],
    weight: 8,
    companionWeight: 8,
    luminosity: 2.5,
    massLuminosityExponent: 3.5,
    effectiveTempK: 6800,
    flareActivity: 0,
    radiation: 2,
    energyMult: 1.45,
    depositMult: 1.0,
    realShare: "3,0 %",
    dark: false,
    core: "#fdfaf0",
    edge: "#ffc98a",
    halo: "#ffe0b0",
    radius: 1.2,
    corona: 1.1,
    light: "#fff6e6",
    intensity: 3.4,
    churn: 1.2,
  },
  // Type A — quelques centaines de millions d'années, trop peu pour qu'une biosphère prenne.
  blue_white: {
    id: "blue_white",
    massRange: [1.4, 2.1],
    weight: 4,
    companionWeight: 6,
    luminosity: 12,
    massLuminosityExponent: 3.5,
    effectiveTempK: 8600,
    flareActivity: 0,
    radiation: 3,
    energyMult: 2.1,
    depositMult: 1.0,
    realShare: "0,6 %",
    dark: false,
    core: "#f4f8ff",
    edge: "#a8c8ff",
    halo: "#cfe0ff",
    radius: 1.5,
    corona: 1.3,
    light: "#e6f0ff",
    intensity: 3.8,
    churn: 1.5,
  },
  // Types O–B — le rendement maximal parmi les étoiles vivantes, et un ultraviolet qui
  // photodissocie toute atmosphère de son système.
  blue_giant: {
    id: "blue_giant",
    massRange: [2, 60],
    weight: 2,
    companionWeight: 3,
    luminosity: 5000,
    massLuminosityExponent: 3.5,
    effectiveTempK: 25000,
    flareActivity: 0,
    radiation: 5,
    energyMult: 3.2,
    depositMult: 1.1,
    realShare: "0,13 %",
    dark: false,
    core: "#eaf2ff",
    edge: "#7fa8ff",
    halo: "#a9c9ff",
    radius: 2.4,
    corona: 1.9,
    light: "#dbe8ff",
    intensity: 4.6,
    churn: 2.1,
  },
  // Elle a gonflé et dévoré ses mondes intérieurs : la zone habitable s'est déplacée sur
  // ce qui était des lunes de glace.
  red_giant: {
    id: "red_giant",
    massRange: [0.3, 8],
    weight: 4,
    companionWeight: 3,
    luminosity: 600,
    massLuminosityExponent: 0.8,
    effectiveTempK: 3800,
    flareActivity: 1,
    radiation: 2,
    energyMult: 1.9,
    depositMult: 1.2,
    realShare: "0,4 %",
    dark: false,
    core: "#ffd9a0",
    edge: "#e05a2a",
    halo: "#ff8a4a",
    radius: 1.7,
    corona: 1.5,
    light: "#ffd0a0",
    intensity: 3.6,
    churn: 0.4,
  },
  // En fin de vie et promise à la supernova : on y installe une station en sachant ce
  // qu'on fait.
  supergiant: {
    id: "supergiant",
    massRange: [10, 70],
    weight: 1,
    companionWeight: 1,
    luminosity: 100000,
    massLuminosityExponent: 0.8,
    effectiveTempK: 12000,
    flareActivity: 1,
    radiation: 5,
    energyMult: 3.6,
    depositMult: 1.3,
    realShare: "0,01 %",
    dark: false,
    core: "#ffe6cc",
    edge: "#ff9a5c",
    halo: "#ffc9a8",
    radius: 3.2,
    corona: 2.4,
    light: "#ffe0c8",
    intensity: 5,
    churn: 0.3,
  },
  // Le cœur nu d'une étoile morte, de la taille d'une planète : chaude mais minuscule, sa
  // zone habitable tient dans une orbite serrée et se refroidit.
  white_dwarf: {
    id: "white_dwarf",
    massRange: [0.5, 1.4],
    weight: 5,
    companionWeight: 8,
    luminosity: 0.005,
    massLuminosityExponent: -0.5,
    effectiveTempK: 15000,
    flareActivity: 0,
    radiation: 3,
    energyMult: 0.45,
    depositMult: 1.3,
    realShare: "5 %",
    dark: false,
    core: "#f2f8ff",
    edge: "#9fc4ff",
    halo: "#cfe2ff",
    radius: 0.34,
    corona: 0.55,
    light: "#dceaff",
    intensity: 2.4,
    churn: 1.8,
  },
  // Trop légère pour fusionner l'hydrogène : elle n'éclaire presque rien, et la colonie
  // devra produire son énergie autrement.
  brown_dwarf: {
    id: "brown_dwarf",
    massRange: [0.013, 0.08],
    weight: 3,
    companionWeight: 12,
    luminosity: 0.00002,
    massLuminosityExponent: 2.5,
    effectiveTempK: 1200,
    flareActivity: 2,
    radiation: 0,
    energyMult: 0.1,
    depositMult: 0.9,
    realShare: "—",
    dark: false,
    core: "#b06a5a",
    edge: "#5a2a2a",
    halo: "#a05a5a",
    radius: 0.3,
    corona: 0.4,
    light: "#8a4a3a",
    intensity: 0.6,
    churn: 0.9,
  },
  // 1,4 masse solaire dans vingt kilomètres, en rotation rapide. Rien ne vit là ; le
  // faisceau, lui, est une source d'énergie sans égale.
  pulsar: {
    id: "pulsar",
    massRange: [1.1, 2.2],
    weight: 1,
    companionWeight: 2,
    luminosity: 0.0001,
    massLuminosityExponent: 0,
    effectiveTempK: 1000000,
    flareActivity: 0,
    radiation: 5,
    energyMult: 2.4,
    depositMult: 1.4,
    realShare: "0,1 %",
    dark: false,
    core: "#eaf4ff",
    edge: "#7aa8ff",
    halo: "#9fd0ff",
    radius: 0.3,
    corona: 0.5,
    light: "#cfe4ff",
    intensity: 2.6,
    churn: 2.6,
  },
};

/** Repli neutre — même règle que `blackHoleType` : un id inconnu rend une étoile banale. */
const GENERIC_STAR: StarClassDef = STAR_CLASSES.yellow_dwarf;

export function starClass(id: string): StarClassDef {
  return STAR_CLASSES[id as StarClassId] ?? GENERIC_STAR;
}

/** Tables de tirage, dérivées des poids plutôt que redéclarées à côté d'eux. */
export const STAR_PRIMARY_WEIGHTS: readonly (readonly [StarClassId, number])[] =
  STAR_CLASS_IDS.map((id) => [id, STAR_CLASSES[id].weight] as const);

export const STAR_COMPANION_WEIGHTS: readonly (readonly [
  StarClassId,
  number,
])[] = STAR_CLASS_IDS.map(
  (id) => [id, STAR_CLASSES[id].companionWeight] as const,
);
