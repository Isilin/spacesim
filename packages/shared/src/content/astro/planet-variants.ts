import type {
  Atmosphere,
  OrbitZone,
  PlanetVariant,
} from "../../model/universe.js";

/**
 * Variantes d'environnement — l'axe **climatique** (chantier 45.3).
 *
 * La classe dit de quoi le corps est fait ; la variante dit ce qu'il fait de sa position. Elle
 * est donc **conditionnée par la zone thermique** de son orbite : une même structure rocheuse
 * donne un monde tempéré au bon endroit et un monde gelé deux orbites plus loin.
 *
 * ## L'atmosphère proposée n'est pas l'atmosphère retenue
 *
 * `atmosphere` et `outgassingBar` disent ce que le corps **tenterait** de tenir. Ce qu'il en
 * garde dépend de sa vitesse de libération et de sa température — donc de sa classe et de son
 * étoile, pas de sa variante. Un monde volcanique dégaze une atmosphère toxique épaisse, mais
 * une naine volcanique en orbite serrée reste nue. C'est le couplage que l'énumération à plat
 * ne pouvait pas exprimer, et il vit dans `physics.ts`.
 */

export interface PlanetVariantDef {
  id: string;

  // ── Entrées de génération — jamais éditables ──

  /** Affinité par zone thermique. Croisée avec les variantes que la classe admet. */
  zoneWeights: Record<OrbitZone, number>;
  /** Tendance des gisements : [ressource, probabilité, min, max]. */
  depositTendencies: readonly (readonly [
    "ore" | "energy" | "food",
    number,
    number,
    number,
  ])[];

  // ── Physique — lue par la chaîne ──

  /**
   * Part du flux renvoyée au lieu d'être absorbée.
   *
   * Compte autant que la distance, et parfois davantage : Vénus renvoie 77 % de ce qu'elle
   * reçoit et reste plus chaude que Mercure, parce que sa serre l'emporte. Une gelée à 0,62
   * est plus froide que son irradiance ne l'imposerait, et la rétroaction s'emballe.
   */
  albedo: number;
  /** Réchauffement de serre à une atmosphère, en kelvins. La Terre gagne 33 K, Mars 5. */
  greenhousePerBar: number;
  /** Pression que le corps tenterait de tenir s'il retenait tout, en bars. */
  outgassingBar: number;
  /** Composition proposée, si la rétention la laisse tenir. */
  atmosphere: Atmosphere;
  /** Danger de séjour propre à l'environnement, 0–5 — corrosion, radioactivité, éruptions. */
  hazard: number;

  // ── Habillage ──

  /** Teinte de surface. C'est la variante qui donne sa couleur à un monde, pas sa taille. */
  color: string;
  accent: string;
}

export interface StaticPlanetVariantDef extends PlanetVariantDef {
  id: PlanetVariant;
}

export const PLANET_VARIANT_DEFS: Record<
  PlanetVariant,
  StaticPlanetVariantDef
> = {
  // Eau liquide stable et atmosphère respirable : le monde qu'on cherche.
  temperate: {
    id: "temperate",
    zoneWeights: { inner: 1, habitable: 6, outer: 1, frozen: 0 },
    depositTendencies: [
      ["food", 0.9, 0.9, 1.4],
      ["ore", 0.8, 0.7, 1.2],
      ["energy", 0.6, 0.8, 1.1],
    ],
    albedo: 0.3,
    greenhousePerBar: 33,
    outgassingBar: 1.1,
    atmosphere: "breathable",
    hazard: 0,
    color: "#7fa87f",
    accent: "#4a6f8a",
  },
  // Couverte d'eau : albédo bas, donc chaude pour son irradiance. Nourrit beaucoup, ne rend
  // presque aucun minerai.
  oceanic: {
    id: "oceanic",
    zoneWeights: { inner: 0, habitable: 5, outer: 0, frozen: 0 },
    depositTendencies: [
      ["food", 0.95, 1.1, 1.6],
      ["ore", 0.4, 0.5, 0.9],
      ["energy", 0.6, 0.8, 1.2],
    ],
    albedo: 0.25,
    greenhousePerBar: 38,
    outgassingBar: 1.4,
    atmosphere: "breathable",
    hazard: 0,
    color: "#3f7fb8",
    accent: "#8fd0e0",
  },
  // Sèche mais tempérée : peu de vie, beaucoup de soleil et de roche exposée.
  arid: {
    id: "arid",
    zoneWeights: { inner: 5, habitable: 3, outer: 1, frozen: 0 },
    depositTendencies: [
      ["ore", 0.85, 0.9, 1.4],
      ["energy", 0.85, 1.0, 1.5],
      ["food", 0.3, 0.4, 0.8],
    ],
    albedo: 0.35,
    greenhousePerBar: 8,
    outgassingBar: 0.25,
    atmosphere: "thin",
    hazard: 0,
    color: "#c99b56",
    accent: "#8a6a3a",
  },
  // L'effet de serre a divergé : 460 °C au sol sous une pression écrasante. Albédo le plus
  // haut de la table, et pourtant la plus chaude — c'est la serre qui fait tout le travail.
  greenhouse: {
    id: "greenhouse",
    zoneWeights: { inner: 5, habitable: 1, outer: 0, frozen: 0 },
    depositTendencies: [
      ["energy", 0.9, 1.2, 1.7],
      ["ore", 0.7, 0.8, 1.1],
    ],
    albedo: 0.75,
    greenhousePerBar: 52,
    outgassingBar: 90,
    atmosphere: "crushing",
    hazard: 2,
    color: "#d8b45a",
    accent: "#f0dca0",
  },
  // Croûte en renouvellement permanent : les métaux lourds remontent d'eux-mêmes, et le
  // dégazage ne s'arrête jamais.
  volcanic: {
    id: "volcanic",
    zoneWeights: { inner: 5, habitable: 2, outer: 1, frozen: 0 },
    depositTendencies: [
      ["ore", 0.95, 1.2, 1.8],
      ["energy", 0.9, 1.1, 1.6],
      ["food", 0.1, 0.2, 0.4],
    ],
    albedo: 0.12,
    greenhousePerBar: 90,
    outgassingBar: 3.5,
    atmosphere: "toxic",
    hazard: 2,
    color: "#c14a32",
    accent: "#ffb04a",
  },
  // Atmosphère corrosive : exploitable, jamais habitable — l'entretien y coûte le double.
  toxic: {
    id: "toxic",
    zoneWeights: { inner: 3, habitable: 2, outer: 2, frozen: 1 },
    depositTendencies: [
      ["ore", 0.8, 0.9, 1.3],
      ["energy", 0.8, 0.9, 1.4],
    ],
    albedo: 0.3,
    greenhousePerBar: 60,
    outgassingBar: 2,
    atmosphere: "corrosive",
    hazard: 2,
    color: "#a3b544",
    accent: "#d8e07a",
  },
  // Glace d'eau et d'ammoniac. Albédo élevé, donc plus froide encore que son irradiance ne
  // l'imposerait.
  frozen: {
    id: "frozen",
    zoneWeights: { inner: 0, habitable: 1, outer: 5, frozen: 6 },
    depositTendencies: [
      ["ore", 0.8, 0.9, 1.5],
      ["energy", 0.4, 0.5, 0.9],
      ["food", 0.2, 0.3, 0.6],
    ],
    albedo: 0.62,
    greenhousePerBar: 3,
    outgassingBar: 0.05,
    atmosphere: "trace",
    hazard: 0,
    color: "#a8c8dd",
    accent: "#e8f4ff",
  },
  // Sans atmosphère ni eau, criblée de cratères. Un caillou, mais un caillou franc à exploiter.
  barren: {
    id: "barren",
    zoneWeights: { inner: 3, habitable: 2, outer: 3, frozen: 3 },
    depositTendencies: [
      ["ore", 0.9, 1.0, 1.5],
      ["energy", 0.6, 0.7, 1.1],
    ],
    albedo: 0.14,
    greenhousePerBar: 0,
    outgassingBar: 0,
    atmosphere: "none",
    hazard: 0,
    color: "#8d8577",
    accent: "#b0a696",
  },
  // Le rayonnement d'un pulsar ou d'un disque d'accrétion a emporté son atmosphère.
  // Stérilisée, mais chargée d'isotopes rares.
  irradiated: {
    id: "irradiated",
    zoneWeights: { inner: 2, habitable: 1, outer: 1, frozen: 1 },
    depositTendencies: [
      ["ore", 0.9, 1.2, 1.8],
      ["energy", 0.7, 0.9, 1.3],
    ],
    albedo: 0.2,
    greenhousePerBar: 0,
    outgassingBar: 0,
    atmosphere: "none",
    hazard: 4,
    color: "#b47fd6",
    accent: "#e0c0f0",
  },
  // Une géante dont l'étoile a arraché l'enveloppe : il ne reste que le noyau métallique,
  // le meilleur minerai du jeu.
  chthonian: {
    id: "chthonian",
    zoneWeights: { inner: 4, habitable: 0, outer: 0, frozen: 0 },
    depositTendencies: [
      ["ore", 1.0, 1.6, 2.4],
      ["energy", 0.8, 1.0, 1.5],
    ],
    albedo: 0.08,
    greenhousePerBar: 0,
    outgassingBar: 0,
    atmosphere: "none",
    hazard: 3,
    color: "#6e5a4e",
    accent: "#a08878",
  },
};

/** Repli neutre — même règle que les autres catalogues de `astro/`. */
const GENERIC_VARIANT: PlanetVariantDef = PLANET_VARIANT_DEFS.barren;

export function planetVariant(id: string): PlanetVariantDef {
  return PLANET_VARIANT_DEFS[id as PlanetVariant] ?? GENERIC_VARIANT;
}

/**
 * Variantes tirables pour une classe dans une zone : l'intersection de ce que la structure
 * admet et de ce que le climat autorise.
 *
 * Les deux poids se **multiplient** au lieu de se remplacer. Une rocheuse admet le tempéré,
 * mais seulement la zone habitable le rend probable ; une géante admet le gelé partout, mais
 * l'inter-glaces l'y pousse. Prendre l'un ou l'autre seul perdrait la moitié de l'information.
 */
export function variantsFor(
  allowed: readonly (readonly [string, number])[],
  zone: OrbitZone,
): readonly (readonly [string, number])[] {
  return allowed
    .map(
      ([id, classWeight]) =>
        [id, classWeight * planetVariant(id).zoneWeights[zone]] as const,
    )
    .filter(([, weight]) => weight > 0);
}
