import type {
  Atmosphere,
  OrbitZone,
  PlanetType,
} from "../../model/universe.js";

/**
 * Types de corps (chantier 45.2).
 *
 * ## Ce que ce fichier rassemble
 *
 * Les propriétés physiques d'un corps étaient éparpillées : `RADIUS_RANGE`, `DENSITY_RANGE`,
 * `BASE_TEMP` et `ATMOSPHERE_WEIGHTS` dans `sim/exploration/bodies.ts`, `HABITABILITY` et
 * `DEPOSIT_TENDENCIES` dans `universe.ts`, et rien nulle part pour l'albédo ni l'effet de
 * serre. Elles se réunissent ici, parce que la chaîne physique les lit ensemble.
 *
 * Deux d'entre elles disparaissent au passage : `BASE_TEMP` — une température par type,
 * indépendante de l'étoile — et la fourchette d'habitabilité. Elles ne sont plus des
 * entrées mais des **résultats** ; les remplacer, c'est tout l'objet du chantier.
 *
 * ## Ce qui reste à faire de ce fichier
 *
 * L'énumération à six valeurs confond une **taille** et un **climat** : « gazeuse » est une
 * structure, « océanique » un environnement, et rien ne permet aujourd'hui d'avoir une
 * super-Terre aride. Le palier 3 la scinde en deux axes. Les valeurs ci-dessous ne sont pas
 * perdues dans l'opération : elles se répartissent entre la classe (rayon, densité) et la
 * variante (albédo, serre, atmosphère, gisements).
 */

export interface PlanetTypeDef {
  id: string;

  // ── Entrées de génération — jamais éditables ──

  /**
   * Affinité par zone thermique, pondérée. C'est ici que l'inversion de causalité prend
   * effet : l'étoile place les zones, et les zones décident de ce qu'on y trouve. Un poids
   * nul interdit le type dans cette zone.
   */
  zoneWeights: Record<OrbitZone, number>;
  /** Idem, comme LUNE d'une planète. Une lune ne peut pas être une géante gazeuse. */
  moonZoneWeights: Record<OrbitZone, number>;
  /** Emplacements de bâtiments, si le corps est colonisable. */
  slotRange: readonly [number, number];
  /** Un sol se colonise ; une enveloppe gazeuse, non. */
  colonizable: boolean;
  /** Tendance des gisements : [ressource, probabilité, min, max]. */
  depositTendencies: readonly (readonly [
    "ore" | "energy" | "food",
    number,
    number,
    number,
  ])[];

  // ── Physique — lue par la chaîne ──

  /** [min, max] de rayon, en rayons terrestres. */
  radiusRange: readonly [number, number];
  /** [min, max] de densité, Terre = 1. Une gazeuse est immense mais légère. */
  densityRange: readonly [number, number];
  /**
   * Part du flux renvoyée au lieu d'être absorbée. Compte autant que la distance : une
   * gelée à 0,62 est plus froide que son irradiance ne l'imposerait, et la rétroaction
   * s'emballe.
   */
  albedo: number;
  /**
   * Réchauffement de serre à une atmosphère, en kelvins. La Terre gagne 33 K, Mars 5, et
   * Vénus les ~500 qui la rendent plus chaude que Mercure.
   */
  greenhousePerBar: number;
  /**
   * Pression que le corps tenterait de tenir s'il retenait tout, en bars. La rétention
   * décide de ce qui en survit réellement — c'est ce couplage qui fait qu'une naine sans
   * gravité reste nue quelle que soit sa nature.
   */
  outgassingBar: number;
  /** Composition proposée, si la rétention la laisse tenir. */
  atmosphere: Atmosphere;

  // ── Habillage ──

  color: string;
  accent: string;
  roughness: number;
  relief: number;
}

export interface StaticPlanetTypeDef extends PlanetTypeDef {
  id: PlanetType;
}

export const PLANET_TYPE_DEFS: Record<PlanetType, StaticPlanetTypeDef> = {
  // Le monde standard, et le seul où l'on colonise confortablement.
  telluric: {
    id: "telluric",
    zoneWeights: { inner: 1, habitable: 5, outer: 1, frozen: 0 },
    moonZoneWeights: { inner: 0, habitable: 1, outer: 0, frozen: 0 },
    slotRange: [6, 14],
    colonizable: true,
    depositTendencies: [
      ["ore", 0.8, 0.7, 1.2],
      ["food", 0.9, 0.9, 1.4],
      ["energy", 0.6, 0.8, 1.1],
    ],
    radiusRange: [0.75, 1.3],
    densityRange: [0.9, 1.1],
    albedo: 0.3,
    greenhousePerBar: 33,
    outgassingBar: 1.1,
    atmosphere: "breathable",
    color: "#7fa87f",
    accent: "#4a6f8a",
    roughness: 0.8,
    relief: 0.6,
  },
  // Couverte d'eau : albédo bas, donc chaude pour son irradiance. Nourrit beaucoup, ne rend
  // presque aucun minerai.
  oceanic: {
    id: "oceanic",
    zoneWeights: { inner: 0, habitable: 4, outer: 0, frozen: 0 },
    moonZoneWeights: { inner: 0, habitable: 0, outer: 0, frozen: 0 },
    slotRange: [5, 12],
    colonizable: true,
    depositTendencies: [
      ["food", 0.95, 1.1, 1.6],
      ["ore", 0.4, 0.5, 0.9],
      ["energy", 0.6, 0.8, 1.2],
    ],
    radiusRange: [0.85, 1.25],
    densityRange: [0.8, 1.0],
    albedo: 0.25,
    greenhousePerBar: 38,
    outgassingBar: 1.4,
    atmosphere: "breathable",
    color: "#3f7fb8",
    accent: "#8fd0e0",
    roughness: 0.3,
    relief: 0.2,
  },
  // Sèche mais tempérée : peu de vie, beaucoup de soleil et de roche exposée.
  arid: {
    id: "arid",
    zoneWeights: { inner: 5, habitable: 3, outer: 0, frozen: 0 },
    moonZoneWeights: { inner: 3, habitable: 2, outer: 0, frozen: 0 },
    slotRange: [5, 12],
    colonizable: true,
    depositTendencies: [
      ["ore", 0.85, 0.9, 1.4],
      ["energy", 0.85, 1.0, 1.5],
      ["food", 0.3, 0.4, 0.8],
    ],
    radiusRange: [0.55, 1.1],
    densityRange: [0.85, 1.05],
    albedo: 0.35,
    greenhousePerBar: 8,
    outgassingBar: 0.25,
    atmosphere: "thin",
    color: "#c99b56",
    accent: "#8a6a3a",
    roughness: 0.9,
    relief: 0.7,
  },
  // Glace d'eau et d'ammoniac. Albédo élevé, donc plus froide encore que son irradiance ne
  // l'imposerait.
  frozen: {
    id: "frozen",
    zoneWeights: { inner: 0, habitable: 1, outer: 4, frozen: 6 },
    moonZoneWeights: { inner: 0, habitable: 1, outer: 4, frozen: 6 },
    slotRange: [4, 10],
    colonizable: true,
    depositTendencies: [
      ["ore", 0.8, 0.9, 1.5],
      ["energy", 0.4, 0.5, 0.9],
      ["food", 0.2, 0.3, 0.6],
    ],
    radiusRange: [0.4, 1.0],
    densityRange: [0.5, 0.8],
    albedo: 0.62,
    greenhousePerBar: 3,
    outgassingBar: 0.05,
    atmosphere: "trace",
    color: "#a8c8dd",
    accent: "#e8f4ff",
    roughness: 0.4,
    relief: 0.35,
  },
  // Croûte en renouvellement permanent : les métaux lourds remontent d'eux-mêmes, et le
  // dégazage ne s'arrête jamais.
  volcanic: {
    id: "volcanic",
    zoneWeights: { inner: 5, habitable: 2, outer: 1, frozen: 0 },
    moonZoneWeights: { inner: 3, habitable: 2, outer: 2, frozen: 1 },
    slotRange: [4, 11],
    colonizable: true,
    depositTendencies: [
      ["ore", 0.95, 1.2, 1.8],
      ["energy", 0.9, 1.1, 1.6],
      ["food", 0.1, 0.2, 0.4],
    ],
    radiusRange: [0.5, 1.05],
    densityRange: [0.95, 1.25],
    albedo: 0.12,
    greenhousePerBar: 90,
    outgassingBar: 3.5,
    atmosphere: "toxic",
    color: "#c14a32",
    accent: "#ffb04a",
    roughness: 0.85,
    relief: 0.8,
  },
  // Aucun sol, un rendement énergétique élevé, et un cortège de lunes qui est le vrai butin.
  gas: {
    id: "gas",
    zoneWeights: { inner: 1, habitable: 1, outer: 4, frozen: 5 },
    moonZoneWeights: { inner: 0, habitable: 0, outer: 0, frozen: 0 },
    slotRange: [2, 4],
    colonizable: false,
    depositTendencies: [["energy", 1.0, 1.3, 2.0]],
    radiusRange: [6, 13],
    densityRange: [0.15, 0.3],
    albedo: 0.5,
    greenhousePerBar: 12,
    outgassingBar: 200,
    atmosphere: "crushing",
    color: "#c9a06a",
    accent: "#e8cfa0",
    roughness: 0.2,
    relief: 0.1,
  },
};

/** Repli neutre — même règle que les autres catalogues de `astro/`. */
const GENERIC_PLANET: PlanetTypeDef = PLANET_TYPE_DEFS.telluric;

export function planetType(id: string): PlanetTypeDef {
  return PLANET_TYPE_DEFS[id as PlanetType] ?? GENERIC_PLANET;
}

/**
 * Table de tirage pour une zone donnée, dérivée des affinités.
 *
 * Rendue vide si aucun type n'a d'affinité pour la zone, ce qui n'arrive pas avec la table
 * ci-dessus mais pourrait arriver après une édition — l'appelant retombe alors sur son
 * propre repli plutôt que de recevoir un tirage impossible.
 */
export function planetTypesForZone(
  zone: OrbitZone,
  asMoon = false,
): readonly (readonly [PlanetType, number])[] {
  return Object.values(PLANET_TYPE_DEFS)
    .map(
      (def) =>
        [
          def.id,
          asMoon ? def.moonZoneWeights[zone] : def.zoneWeights[zone],
        ] as const,
    )
    .filter(([, weight]) => weight > 0);
}
