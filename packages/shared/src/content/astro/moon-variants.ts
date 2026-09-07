import type { MoonVariant, PlanetClass } from "../../model/universe.js";
import type { BodyEnvironmentDef } from "./planet-variants.js";

/**
 * Variantes de lune — l'axe **environnemental** d'un cortège (chantier 45.3).
 *
 * Ce qui décide de l'environnement d'une lune n'est pas son orbite autour de l'étoile, c'est sa
 * planète. Une géante chauffe ses lunes par effet de marée, les baigne dans une ceinture de
 * radiations et fait de leurs anneaux un champ de débris — trois phénomènes qu'aucune variante
 * planétaire ne peut exprimer, et qui sont exactement ce qui rend un cortège intéressant.
 *
 * C'est la raison de la table à part. Sans elle, une lune de Jupiter serait gelée et stérile
 * comme tout ce qui orbite au-delà de la ligne des glaces, et Io comme Europe disparaîtraient.
 *
 * ## L'atmosphère proposée n'est toujours pas l'atmosphère retenue
 *
 * Même règle que pour les planètes : `outgassingBar` dit ce que la lune tenterait de tenir, la
 * chaîne physique dit ce qu'il en reste. Titan tient une atmosphère plus épaisse que la nôtre
 * avec quatre fois moins de vitesse de libération, parce qu'il fait assez froid — et c'est le
 * calcul qui le retrouve, pas une valeur écrite ici.
 */

export interface MoonVariantDef extends BodyEnvironmentDef {
  // ── Entrées de génération — jamais éditables ──

  /** Affinité par classe de planète parente. Un poids nul l'interdit autour d'elle. */
  parentWeights: Record<PlanetClass, number>;
}

export interface StaticMoonVariantDef extends MoonVariantDef {
  id: MoonVariant;
}

export const MOON_VARIANT_DEFS: Record<MoonVariant, StaticMoonVariantDef> = {
  // Pétrie par les marées de sa géante : volcanisme permanent, soufre en surface, métaux
  // lourds qui remontent seuls. Io, la meilleure mine du système externe.
  tidal: {
    id: "tidal",
    parentWeights: {
      rocky: 1,
      super_earth: 1,
      dwarf: 0,
      ice_giant: 4,
      gas_giant: 6,
    },
    depositTendencies: [
      ["ore", 0.95, 1.3, 1.9],
      ["energy", 0.9, 1.1, 1.6],
    ],
    // Le soufre déposé par les éruptions la rend claire, à rebours de ce qu'on attend d'un
    // monde volcanique : elle réfléchit plus qu'elle n'absorbe, et se chauffe par en dessous.
    albedo: 0.55,
    greenhousePerBar: 40,
    outgassingBar: 0.5,
    atmosphere: "toxic",
    hazard: 2,
    color: "#d8b24a",
    accent: "#e8622a",
  },
  // Océan liquide sous une croûte de glace, entretenu par les mêmes marées. Europe : le seul
  // endroit du système externe où l'eau coule, donc le seul qui nourrisse.
  subglacial: {
    id: "subglacial",
    parentWeights: {
      rocky: 1,
      super_earth: 1,
      dwarf: 1,
      ice_giant: 5,
      gas_giant: 5,
    },
    depositTendencies: [
      ["food", 0.85, 1.0, 1.5],
      ["energy", 0.7, 0.8, 1.2],
      ["ore", 0.5, 0.6, 1.0],
    ],
    albedo: 0.65,
    greenhousePerBar: 2,
    outgassingBar: 0.02,
    atmosphere: "trace",
    hazard: 1,
    color: "#cfe4f0",
    accent: "#6fa8c8",
  },
  // Assez froide pour que rien ne s'échappe : elle garde une atmosphère épaisse que sa
  // gravité seule ne pourrait pas retenir. Titan, et ses lacs d'hydrocarbures.
  thick_air: {
    id: "thick_air",
    parentWeights: {
      rocky: 0,
      super_earth: 0,
      dwarf: 0,
      ice_giant: 3,
      gas_giant: 4,
    },
    depositTendencies: [
      ["energy", 0.95, 1.3, 1.9],
      ["food", 0.5, 0.6, 1.0],
      ["ore", 0.4, 0.5, 0.9],
    ],
    albedo: 0.22,
    greenhousePerBar: 20,
    outgassingBar: 1.6,
    atmosphere: "reducing",
    hazard: 1,
    color: "#c8913f",
    accent: "#e0c070",
  },
  // Nue, criblée, immobile. La Lune : rien n'y aide une colonie, rien ne l'y menace non plus,
  // et le minerai s'y ramasse sans creuser.
  airless: {
    id: "airless",
    parentWeights: {
      rocky: 6,
      super_earth: 6,
      dwarf: 6,
      ice_giant: 4,
      gas_giant: 4,
    },
    depositTendencies: [
      ["ore", 0.9, 1.0, 1.5],
      ["energy", 0.5, 0.6, 1.0],
    ],
    albedo: 0.12,
    greenhousePerBar: 0,
    outgassingBar: 0,
    atmosphere: "none",
    hazard: 0,
    color: "#8f8b83",
    accent: "#b8b2a6",
  },
  // Dans la ceinture de radiations de sa géante : stérilisée en permanence, et chargée
  // d'isotopes que rien d'autre ne produit.
  belted: {
    id: "belted",
    parentWeights: {
      rocky: 0,
      super_earth: 0,
      dwarf: 0,
      ice_giant: 2,
      gas_giant: 4,
    },
    depositTendencies: [
      ["energy", 0.95, 1.4, 2.0],
      ["ore", 0.8, 1.0, 1.5],
    ],
    albedo: 0.3,
    greenhousePerBar: 0,
    outgassingBar: 0,
    atmosphere: "none",
    hazard: 4,
    color: "#9a7fc4",
    accent: "#d0b8ec",
  },
  // Bergère d'anneau : elle creuse une division dans les anneaux de sa planète et prend leur
  // poussière en pleine face. Séjour pénible, gisements de surface exceptionnels.
  shepherd: {
    id: "shepherd",
    parentWeights: {
      rocky: 0,
      super_earth: 1,
      dwarf: 0,
      ice_giant: 3,
      gas_giant: 3,
    },
    depositTendencies: [
      ["ore", 0.95, 1.2, 1.8],
      ["energy", 0.7, 0.9, 1.3],
    ],
    albedo: 0.45,
    greenhousePerBar: 0,
    outgassingBar: 0,
    atmosphere: "none",
    hazard: 2,
    color: "#c4bda8",
    accent: "#f0e8d0",
  },
};

/** Repli neutre — même règle que les autres catalogues de `astro/`. */
const GENERIC_MOON_VARIANT: MoonVariantDef = MOON_VARIANT_DEFS.airless;

export function moonVariant(id: string): MoonVariantDef {
  return MOON_VARIANT_DEFS[id as MoonVariant] ?? GENERIC_MOON_VARIANT;
}

/**
 * Variantes tirables pour une classe de lune autour d'une planète donnée : l'intersection de
 * ce que la structure admet et de ce que la planète parente rend possible.
 *
 * Les deux poids se **multiplient**, comme du côté planétaire. Une lune de glace admet
 * l'océan sous-glaciaire, mais seule une géante l'entretient ; une lune régulière admet le
 * volcanisme de marée, mais pas autour d'une naine qui ne pétrit rien.
 */
export function moonVariantsFor(
  allowed: readonly (readonly [string, number])[],
  parentClassId: string,
): readonly (readonly [string, number])[] {
  return allowed
    .map(
      ([id, classWeight]) =>
        [
          id,
          classWeight *
            (moonVariant(id).parentWeights[parentClassId as PlanetClass] ?? 0),
        ] as const,
    )
    .filter(([, weight]) => weight > 0);
}
