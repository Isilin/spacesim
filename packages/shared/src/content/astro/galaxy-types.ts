/**
 * Types de galaxies (chantier 45.1).
 *
 * ## Ce qui change par rapport à `galaxyMorphology`
 *
 * L'ADR [0018](../../../../../docs/adr/0018-morphologie-de-galaxie-structurante.md) avait
 * déjà fait de la morphologie une **entrée** du générateur : c'est elle qui décide où les
 * systèmes sont posés. Elle restait pourtant dérivée de l'identifiant, et sa décision 3
 * l'interdisait explicitement de persister.
 *
 * L'ADR [0021](../../../../../docs/adr/0021-le-ciel-devient-une-donnee-de-jeu.md) renverse
 * ce point : la morphologie devient un champ du type de galaxie, et le type se persiste.
 * Le reste de 0018 est confirmé — la forme reste une cause, et sept autres familles la
 * rejoignent.
 *
 * ## La métallicité, ou pourquoi la richesse n'est plus posée au jugé
 *
 * `Galaxy.depositBonus` croît avec l'éloignement, sans autre justification que « les
 * anneaux lointains sont la récompense ». La métallicité donne enfin une raison physique
 * au biais de gisements : une elliptique est vieille, son gaz est parti et elle n'enrichit
 * plus — elle rend de la roche et peu de vivres. Une irrégulière est jeune et gazeuse, donc
 * généreuse en volatiles mais pauvre en fer. Les deux biais se composent.
 *
 * Mêmes deux moitiés que les autres catalogues de `astro/` : entrées de génération gelées,
 * effets et habillage éditables au palier 3.
 */

import {
  type AstroOverrides,
  NO_ASTRO_OVERRIDES,
  patched,
} from "./overrides.js";
import type { ResourceId } from "../../model/resources.js";
import type { BlackHoleTypeId } from "./black-hole-types.js";

export const GALAXY_TYPE_IDS = [
  "spiral",
  "barred_spiral",
  "lenticular",
  "elliptical",
  "dwarf_elliptical",
  "irregular",
  "ring",
  "peculiar",
] as const;

export type GalaxyTypeId = (typeof GALAXY_TYPE_IDS)[number];

export interface GalaxyTypeDef {
  id: string;

  // ── Entrées de génération — jamais éditables ──

  /**
   * Forme consommée par `generatePositions`. Ces quatre champs sont exactement l'ancienne
   * `GalaxyAppearance` : la structure est conservée pour que la définition se passe telle
   * quelle au générateur, sans adaptateur.
   *
   * `arms` à zéro décrit un nuage sans bras — c'est ce qui distingue une elliptique d'une
   * spirale.
   */
  arms: number;
  /** Nombre de radians parcourus par un bras sur toute sa longueur. */
  winding: number;
  /** Longueur de la barre centrale, en part du rayon. Zéro pour une spirale simple. */
  bar: number;
  /**
   * Dispersion perpendiculaire aux bras, en part du rayon.
   *
   * Pour une morphologie **sans bras**, le même champ vaut aplatissement : à 1 l'objet est
   * sphéroïdal, à 0,3 c'est un disque épais. C'est la seule grandeur qui distingue une
   * elliptique d'une lenticulaire — sans quoi les trois types sans bras rendraient la même
   * forme, à leur nombre de systèmes près.
   */
  scatter: number;
  /**
   * Rayon relatif de l'anneau de formation stellaire, pour une annulaire. Zéro ailleurs.
   * Une collision frontale a chassé la matière vers l'extérieur : le centre est vide et
   * les systèmes se concentrent sur un tore.
   */
  ring: number;
  /** Queues de marée : une fraction des systèmes est projetée loin du disque. */
  tidalTails: boolean;
  /**
   * Fourchette de systèmes. Remplace le seuil `POOR_GALAXY_SYSTEMS`, qui déduisait la
   * morphologie de la taille — c'est désormais l'inverse, le type précède et contraint.
   */
  systemRange: readonly [number, number];
  /** Poids de tirage du type. Les huit somment à 100, pour se lire comme des pourcents. */
  weight: number;
  /**
   * Singularités errantes pour cent systèmes. Une elliptique vieille en compte plus
   * qu'une irrégulière jeune : ses étoiles massives ont fini de mourir.
   */
  singularityDensity: number;
  /** Type du trou noir central. Une naine n'est pas assez massive pour un supermassif. */
  coreClassId: BlackHoleTypeId;

  // ── Effets ──

  /** Métallicité, en métallicités solaires. Cause physique du biais ci-dessous. */
  metallicity: number;
  /**
   * Biais de gisement par ressource, composé avec `Galaxy.depositBonus`. Une clé absente
   * vaut 1 — la forme `Partial<Record<ResourceId, number>>` est celle de tout le dépôt.
   */
  depositBias: Partial<Record<ResourceId, number>>;
  /** Multiplicateur de galaxie sur la récolte exotique — voir `BlackHoleTypeDef.exoticYield`. */
  exoticBias: number;

  // ── Habillage ──

  /** Teinte du nuage au palier univers. Aujourd'hui codée en dur à une seule valeur. */
  tint: string;
}

export interface StaticGalaxyTypeDef extends GalaxyTypeDef {
  id: GalaxyTypeId;
}

export const GALAXY_TYPES: Record<GalaxyTypeId, StaticGalaxyTypeDef> = {
  // Le cas de référence, et le seul calé à 1,00 partout : bras nets, disque riche en gaz,
  // formation stellaire continue, métallicité solaire.
  spiral: {
    id: "spiral",
    arms: 2,
    winding: Math.PI * 3,
    bar: 0,
    scatter: 0.28,
    ring: 0,
    tidalTails: false,
    systemRange: [380, 520],
    weight: 24,
    singularityDensity: 1.2,
    coreClassId: "supermassive",
    metallicity: 1.0,
    depositBias: {},
    exoticBias: 1.0,
    tint: "#8fb6e8",
  },
  // Une barre canalise le gaz vers le cœur : centre plus dense, enrichissement plus rapide.
  barred_spiral: {
    id: "barred_spiral",
    arms: 2,
    winding: Math.PI * 2.2,
    bar: 0.42,
    scatter: 0.22,
    ring: 0,
    tidalTails: false,
    systemRange: [400, 520],
    weight: 20,
    singularityDensity: 1.2,
    coreClassId: "supermassive",
    metallicity: 1.1,
    depositBias: { ore: 1.15, energy: 1.05 },
    exoticBias: 1.0,
    tint: "#a8c0e0",
  },
  // Un disque qui a perdu ses bras et son gaz : peu de mondes neufs, mais la roche est nue.
  // `bar` reste à zéro parce que la branche sans bras de `generatePositions` ne le lit pas —
  // lui donner une valeur serait une donnée morte qui ferait croire à une barre absente.
  // C'est `scatter`, ici aplatissement, qui en fait un disque et non un sphéroïde.
  lenticular: {
    id: "lenticular",
    arms: 0,
    winding: 0,
    bar: 0,
    scatter: 0.3,
    ring: 0,
    tidalTails: false,
    systemRange: [340, 460],
    weight: 12,
    singularityDensity: 1.0,
    coreClassId: "supermassive",
    metallicity: 0.7,
    depositBias: { ore: 1.1, food: 0.6 },
    exoticBias: 1.0,
    tint: "#cbb9a2",
  },
  // Population vieille et rouge, sans plan privilégié : le graphe de sauts y est un volume
  // et non une nappe. Le gaz est parti, les reliques restent.
  elliptical: {
    id: "elliptical",
    arms: 0,
    winding: 0,
    bar: 0,
    scatter: 1,
    ring: 0,
    tidalTails: false,
    systemRange: [320, 460],
    weight: 16,
    singularityDensity: 1.5,
    coreClassId: "supermassive",
    metallicity: 0.55,
    depositBias: { ore: 0.9, food: 0.5, energy: 1.1 },
    exoticBias: 1.0,
    tint: "#e0b48f",
  },
  // Trop peu massive pour retenir un cœur supermassif ni ses métaux.
  dwarf_elliptical: {
    id: "dwarf_elliptical",
    arms: 0,
    winding: 0,
    bar: 0,
    scatter: 0.9,
    ring: 0,
    tidalTails: false,
    systemRange: [300, 340],
    weight: 8,
    singularityDensity: 1.8,
    coreClassId: "intermediate",
    metallicity: 0.3,
    depositBias: { ore: 0.7, food: 0.5 },
    exoticBias: 1.0,
    tint: "#d9a884",
  },
  // Riche en gaz, en pleine flambée de formation, mais pauvre en métaux : elle nourrit
  // sans fournir de fer.
  irregular: {
    id: "irregular",
    arms: 3,
    winding: Math.PI * 1.2,
    bar: 0,
    scatter: 0.75,
    ring: 0,
    tidalTails: false,
    systemRange: [300, 420],
    weight: 14,
    singularityDensity: 0.8,
    coreClassId: "intermediate",
    metallicity: 0.4,
    depositBias: { food: 1.5, energy: 1.3, ore: 0.7 },
    exoticBias: 1.0,
    tint: "#7fd4c8",
  },
  // Un impact frontal a chassé la matière vers l'extérieur : anneau de formation, centre vide.
  ring: {
    id: "ring",
    arms: 0,
    winding: 0,
    bar: 0,
    scatter: 0.16,
    ring: 0.72,
    tidalTails: false,
    systemRange: [340, 480],
    weight: 4,
    singularityDensity: 1.4,
    coreClassId: "supermassive",
    metallicity: 0.8,
    depositBias: { ore: 1.2, energy: 1.2 },
    exoticBias: 1.1,
    tint: "#9ad6ff",
  },
  // En interaction : queues de marée, cœur double, enrichissement accéléré par la fusion.
  // La plus rare et la plus riche.
  peculiar: {
    id: "peculiar",
    arms: 2,
    winding: Math.PI * 4.2,
    bar: 0,
    scatter: 0.6,
    ring: 0,
    tidalTails: true,
    systemRange: [360, 500],
    weight: 2,
    singularityDensity: 2.5,
    coreClassId: "xray_binary",
    metallicity: 1.2,
    depositBias: { ore: 1.3, energy: 1.2 },
    exoticBias: 1.2,
    tint: "#c79ae8",
  },
};

/** Repli neutre — même règle que `blackHoleType` : un identifiant inconnu rend une spirale. */
const GENERIC_GALAXY: GalaxyTypeDef = GALAXY_TYPES.spiral;

export function galaxyType(
  id: string,
  overrides: AstroOverrides = NO_ASTRO_OVERRIDES,
): GalaxyTypeDef {
  return patched<GalaxyTypeDef>(
    GALAXY_TYPES[id as GalaxyTypeId] ?? GENERIC_GALAXY,
    overrides.galaxy?.[id],
  );
}

/**
 * Table de tirage, dérivée des poids plutôt que redéclarée à côté d'eux — sans quoi
 * ajouter un type demanderait de penser à deux endroits.
 */
export const GALAXY_TYPE_WEIGHTS: readonly (readonly [GalaxyTypeId, number])[] =
  GALAXY_TYPE_IDS.map((id) => [id, GALAXY_TYPES[id].weight] as const);
