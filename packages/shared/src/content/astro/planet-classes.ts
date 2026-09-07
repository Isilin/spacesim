import type { OrbitZone, PlanetClass } from "../../model/universe.js";

/**
 * Classes de corps — l'axe **structurel** (chantier 45.3).
 *
 * ## Pourquoi deux axes
 *
 * `PLANET_TYPES` confondait une taille et un climat : « gazeuse » est une structure,
 * « océanique » un environnement, et rien ne permettait une super-Terre aride. Six entrées
 * couvraient donc trente combinaisons, en en interdisant vingt-quatre sans raison.
 *
 * La classe dit **de quoi le corps est fait** : son rayon, sa densité, donc sa gravité et sa
 * vitesse de libération, donc ce qu'il peut retenir. La variante dit **ce qu'il fait de sa
 * position** — voir `planet-variants.ts`. La chaîne physique croise les deux.
 *
 * ## Ce qui n'est plus une entrée
 *
 * Ni température ni habitabilité : elles se calculent (`physics.ts`). Une classe ne porte que
 * ce qu'aucun calcul ne peut déduire.
 */

export interface PlanetClassDef {
  id: string;

  // ── Entrées de génération — jamais éditables ──

  /** Affinité par zone thermique. Un poids nul interdit la classe dans cette zone. */
  zoneWeights: Record<OrbitZone, number>;
  /** Idem comme LUNE. Une lune n'est jamais une géante : elle serait la planète. */
  moonZoneWeights: Record<OrbitZone, number>;
  /** Variantes que cette structure admet, pondérées. La matrice vit ici, en un seul endroit. */
  variants: readonly (readonly [string, number])[];
  slotRange: readonly [number, number];
  /** Lunes possibles. Une géante en garde un cortège, une naine presque jamais. */
  moonRange: readonly [number, number];

  // ── Physique — lue par la chaîne ──

  /** [min, max] de rayon, en rayons terrestres. */
  radiusRange: readonly [number, number];
  /** [min, max] de densité, Terre = 1. Une gazeuse est immense mais légère. */
  densityRange: readonly [number, number];
  /**
   * Un sol se colonise ; une enveloppe gazeuse, non.
   *
   * Remplace les six `type === "gas"` éparpillés dans le dépôt — une propriété nommée plutôt
   * qu'un identifiant comparé.
   */
  colonizable: boolean;
  /**
   * Champ magnétique, 0–1 : ce qui protège une atmosphère du vent stellaire. Un noyau
   * métallique en fusion en produit, une boule de glace non.
   */
  magnetosphere: number;

  // ── Habillage ──

  /** Rayon de rendu dans le repère du système — une taille de LECTURE, pas une échelle. */
  renderRadius: number;
  /** Emprise d'étiquette, distincte du rayon rendu (voir `bodyLabelExtent`). */
  labelExtent: number;
  /** Une géante porte des anneaux ; un caillou, non. */
  ringChance: number;
  /** Relief du bruit de surface : une gazeuse est lisse, un monde rocheux accidenté. */
  relief: number;
  roughness: number;
}

export interface StaticPlanetClassDef extends PlanetClassDef {
  id: PlanetClass;
}

export const PLANET_CLASS_DEFS: Record<PlanetClass, StaticPlanetClassDef> = {
  // Le monde standard, et celui où l'on colonise le plus confortablement.
  rocky: {
    id: "rocky",
    zoneWeights: { inner: 5, habitable: 6, outer: 3, frozen: 2 },
    moonZoneWeights: { inner: 2, habitable: 3, outer: 2, frozen: 1 },
    variants: [
      ["temperate", 5],
      ["oceanic", 4],
      ["arid", 4],
      ["greenhouse", 2],
      ["volcanic", 3],
      ["toxic", 2],
      ["frozen", 3],
      ["barren", 3],
      ["irradiated", 1],
      ["chthonian", 1],
    ],
    slotRange: [6, 14],
    moonRange: [0, 2],
    radiusRange: [0.75, 1.3],
    densityRange: [0.9, 1.1],
    colonizable: true,
    magnetosphere: 0.6,
    renderRadius: 4.5,
    labelExtent: 9,
    ringChance: 0,
    relief: 0.6,
    roughness: 0.85,
  },
  // Plus d'emplacements et une atmosphère très bien retenue — mais une gravité qui renchérit
  // tout ce qui doit monter à l'ascenseur orbital.
  super_earth: {
    id: "super_earth",
    zoneWeights: { inner: 2, habitable: 3, outer: 2, frozen: 1 },
    moonZoneWeights: { inner: 0, habitable: 0, outer: 0, frozen: 0 },
    variants: [
      ["temperate", 4],
      ["oceanic", 4],
      ["arid", 3],
      ["greenhouse", 3],
      ["volcanic", 3],
      ["toxic", 3],
      ["frozen", 3],
      ["barren", 1],
      ["irradiated", 1],
    ],
    slotRange: [12, 20],
    moonRange: [0, 3],
    radiusRange: [1.4, 2.6],
    densityRange: [0.95, 1.25],
    colonizable: true,
    magnetosphere: 0.9,
    renderRadius: 5.6,
    labelExtent: 11,
    ringChance: 0.05,
    relief: 0.55,
    roughness: 0.85,
  },
  // Vitesse de libération trop basse pour retenir grand-chose : elle est nue ou presque,
  // quelle que soit sa variante. L'ascenseur orbital n'y coûte presque rien.
  dwarf: {
    id: "dwarf",
    zoneWeights: { inner: 2, habitable: 1, outer: 3, frozen: 4 },
    moonZoneWeights: { inner: 4, habitable: 3, outer: 5, frozen: 6 },
    variants: [
      ["arid", 2],
      ["volcanic", 2],
      ["toxic", 1],
      ["frozen", 5],
      ["barren", 5],
      ["irradiated", 1],
    ],
    slotRange: [2, 6],
    moonRange: [0, 1],
    radiusRange: [0.15, 0.45],
    densityRange: [0.4, 0.7],
    colonizable: true,
    magnetosphere: 0.05,
    renderRadius: 2.4,
    labelExtent: 6,
    ringChance: 0,
    relief: 0.7,
    roughness: 0.95,
  },
  // Volatiles en abondance, sol inexistant. On l'exploite depuis l'orbite, ou depuis ses lunes.
  ice_giant: {
    id: "ice_giant",
    zoneWeights: { inner: 0, habitable: 0, outer: 3, frozen: 4 },
    moonZoneWeights: { inner: 0, habitable: 0, outer: 0, frozen: 0 },
    variants: [
      ["frozen", 6],
      ["toxic", 2],
      ["irradiated", 1],
      ["chthonian", 1],
    ],
    slotRange: [2, 5],
    moonRange: [2, 5],
    radiusRange: [3.5, 6.5],
    densityRange: [0.2, 0.35],
    colonizable: false,
    magnetosphere: 0.8,
    renderRadius: 7,
    labelExtent: 13,
    ringChance: 0.35,
    relief: 0.15,
    roughness: 0.2,
  },
  // Aucun sol, un rendement énergétique élevé, et un cortège de lunes qui est le vrai butin.
  gas_giant: {
    id: "gas_giant",
    zoneWeights: { inner: 1, habitable: 1, outer: 4, frozen: 5 },
    moonZoneWeights: { inner: 0, habitable: 0, outer: 0, frozen: 0 },
    variants: [
      ["frozen", 5],
      ["toxic", 3],
      ["irradiated", 1],
      ["chthonian", 2],
    ],
    slotRange: [2, 4],
    moonRange: [3, 6],
    radiusRange: [7, 13],
    densityRange: [0.15, 0.3],
    colonizable: false,
    magnetosphere: 1,
    renderRadius: 8,
    labelExtent: 14,
    ringChance: 0.5,
    relief: 0.1,
    roughness: 0.15,
  },
};

/** Repli neutre — même règle que les autres catalogues de `astro/`. */
const GENERIC_CLASS: PlanetClassDef = PLANET_CLASS_DEFS.rocky;

export function planetClass(id: string): PlanetClassDef {
  return PLANET_CLASS_DEFS[id as PlanetClass] ?? GENERIC_CLASS;
}

/**
 * Table de tirage des classes pour une zone donnée, dérivée des affinités.
 *
 * Vide si aucune classe n'a d'affinité pour la zone — l'appelant retombe alors sur son propre
 * repli plutôt que de recevoir un tirage impossible.
 */
export function planetClassesForZone(
  zone: OrbitZone,
  asMoon = false,
): readonly (readonly [PlanetClass, number])[] {
  return Object.values(PLANET_CLASS_DEFS)
    .map(
      (def) =>
        [
          def.id,
          asMoon ? def.moonZoneWeights[zone] : def.zoneWeights[zone],
        ] as const,
    )
    .filter(([, weight]) => weight > 0);
}
