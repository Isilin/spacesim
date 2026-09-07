import type { MoonClass, PlanetClass } from "../../model/universe.js";
import type { BodyStructureDef } from "./planet-classes.js";

/**
 * Classes de lunes — l'axe **structurel** d'un cortège (chantier 45.3).
 *
 * ## Pourquoi une table à part
 *
 * Une lune n'est pas une petite planète, et la tirer dans les classes planétaires donnait des
 * naines gelées partout : la zone thermique décide de ce qu'est une planète, la PLANÈTE décide
 * de ce qu'est une lune. Io est volcanique à cinq unités astronomiques du Soleil, là où toute
 * planète serait morte de froid — parce que Jupiter la pétrit.
 *
 * L'affinité se lit donc par classe de planète parente, jamais par zone. Le reste — rayon,
 * densité, magnétosphère, habillage — garde la forme des définitions planétaires, parce que la
 * chaîne physique ne fait aucune différence entre une masse qui orbite une étoile et une masse
 * qui orbite une planète.
 *
 * ## Échelle
 *
 * Les rayons sont en rayons TERRESTRES comme pour les planètes : Ganymède vaut 0,41, Titan
 * 0,40, la Lune 0,27, Europe 0,25, Phœbé 0,017. Les densités sont rapportées à la Terre, ce qui
 * met une lune de glace entre 0,30 et 0,40 — sa faible vitesse de libération en découle, et
 * c'est elle qui décide de ce qu'elle retient.
 */

export interface MoonClassDef extends BodyStructureDef {
  // ── Entrées de génération — jamais éditables ──

  /** Affinité par classe de planète parente. Un poids nul l'interdit autour d'elle. */
  parentWeights: Record<PlanetClass, number>;
}

export interface StaticMoonClassDef extends MoonClassDef {
  id: MoonClass;
}

export const MOON_CLASS_DEFS: Record<MoonClass, StaticMoonClassDef> = {
  // Formée avec sa planète, dans son plan et dans son sens : la Lune, Ganymède, Titan.
  // C'est la lune qu'on colonise, et de loin la plus fréquente autour d'un monde rocheux.
  regular: {
    id: "regular",
    parentWeights: {
      rocky: 6,
      super_earth: 5,
      dwarf: 4,
      ice_giant: 2,
      gas_giant: 2,
    },
    variants: [
      ["airless", 6],
      ["tidal", 3],
      ["belted", 2],
      ["shepherd", 2],
      ["subglacial", 1],
    ],
    slotRange: [3, 7],
    radiusRange: [0.15, 0.3],
    densityRange: [0.55, 0.7],
    colonizable: true,
    magnetosphere: 0.04,
    renderRadius: 2,
    labelExtent: 5,
    ringChance: 0,
    relief: 0.75,
    roughness: 0.95,
  },
  // Capturée : orbite inclinée, souvent rétrograde, corps sombre et poreux. Peu
  // d'emplacements, mais elle n'a presque pas de gravité à vaincre pour appareiller.
  irregular: {
    id: "irregular",
    parentWeights: {
      rocky: 3,
      super_earth: 3,
      dwarf: 3,
      ice_giant: 4,
      gas_giant: 5,
    },
    variants: [
      ["airless", 6],
      ["belted", 3],
      ["shepherd", 3],
      ["tidal", 1],
    ],
    slotRange: [1, 3],
    radiusRange: [0.02, 0.1],
    densityRange: [0.25, 0.45],
    colonizable: true,
    magnetosphere: 0,
    renderRadius: 1.2,
    labelExtent: 4,
    ringChance: 0,
    relief: 0.9,
    roughness: 1,
  },
  // Manteau de glace d'eau sur noyau rocheux : Europe, Encelade. Densité faible, donc
  // vitesse de libération faible — elle ne retient rien, sauf sous sa croûte.
  icy: {
    id: "icy",
    parentWeights: {
      rocky: 1,
      super_earth: 1,
      dwarf: 2,
      ice_giant: 6,
      gas_giant: 5,
    },
    variants: [
      ["subglacial", 5],
      ["airless", 4],
      ["shepherd", 2],
      ["belted", 2],
      ["tidal", 2],
    ],
    slotRange: [2, 6],
    radiusRange: [0.1, 0.28],
    densityRange: [0.3, 0.58],
    colonizable: true,
    magnetosphere: 0.02,
    renderRadius: 2.2,
    labelExtent: 5,
    ringChance: 0,
    relief: 0.5,
    roughness: 0.7,
  },
  // Assez grande pour tenir une atmosphère : Titan, Ganymède. Le vrai butin d'un cortège de
  // géante, et souvent le meilleur monde d'un système externe.
  major: {
    id: "major",
    parentWeights: {
      rocky: 0,
      super_earth: 0,
      dwarf: 0,
      ice_giant: 3,
      gas_giant: 4,
    },
    variants: [
      ["thick_air", 5],
      ["subglacial", 4],
      ["airless", 2],
      ["tidal", 2],
    ],
    slotRange: [6, 12],
    radiusRange: [0.33, 0.46],
    densityRange: [0.32, 0.42],
    colonizable: true,
    magnetosphere: 0.15,
    renderRadius: 3,
    labelExtent: 7,
    ringChance: 0,
    relief: 0.45,
    roughness: 0.7,
  },
};

/** Repli neutre — même règle que les autres catalogues de `astro/`. */
const GENERIC_MOON_CLASS: MoonClassDef = MOON_CLASS_DEFS.regular;

export function moonClass(id: string): MoonClassDef {
  return MOON_CLASS_DEFS[id as MoonClass] ?? GENERIC_MOON_CLASS;
}

/**
 * Table de tirage des classes de lune pour une planète parente donnée.
 *
 * Vide si aucune classe n'a d'affinité — l'appelant retombe alors sur son propre repli plutôt
 * que de recevoir un tirage impossible. Ce cas n'arrive pas avec le catalogue intégré, mais il
 * arrivera dès que le contenu sera éditable.
 */
export function moonClassesForParent(
  parentClassId: string,
): readonly (readonly [MoonClass, number])[] {
  return Object.values(MOON_CLASS_DEFS)
    .map(
      (def) =>
        [def.id, def.parentWeights[parentClassId as PlanetClass] ?? 0] as const,
    )
    .filter(([, weight]) => weight > 0);
}
