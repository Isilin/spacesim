import type { BeltTypeDef } from "./belt-types.js";
import type { BlackHoleTypeDef } from "./black-hole-types.js";
import type { GalaxyTypeDef } from "./galaxy-types.js";
import type { MoonClassDef } from "./moon-classes.js";
import type { MoonVariantDef } from "./moon-variants.js";
import type { PlanetClassDef } from "./planet-classes.js";
import type { PlanetVariantDef } from "./planet-variants.js";
import type { StarClassDef } from "./star-classes.js";
import type { WhiteHoleTypeDef } from "./white-hole-types.js";

/**
 * La moitié éditable des catalogues astronomiques (chantier 45.4).
 *
 * ## La frontière, et comment elle est tenue
 *
 * L'ADR 0021 coupe chaque catalogue en deux : les **entrées de génération**, gelées par
 * `GENERATOR_VERSION` et jamais éditables, et les **effets et l'habillage**, relus à chaque
 * usage et donc rééquilibrables. Jusqu'ici la frontière ne vivait que dans des commentaires.
 * Elle vit maintenant dans les types : un `Pick` par famille, et rien d'autre ne peut être
 * surchargé — le compilateur refuse une correction de `massRange` ou de `zoneWeights`.
 *
 * ## La règle exacte
 *
 * Éditable = **lu au moment de l'usage, et jamais par le générateur**. Le second membre
 * compte autant que le premier. `radiation` d'une étoile est lu par `systemHazard` (usage)
 * mais aussi par `bodyHabitability` (génération, persisté) : le rendre éditable ferait
 * diverger la fiche d'un corps de son habitabilité en base — exactement la contradiction que
 * le chantier 45.2 a supprimée en retirant les trois béquilles de `bodyPhysicals`. Il reste
 * donc gelé, malgré son apparence d'effet.
 *
 * Ce qui passe la règle : les multiplicateurs de rendement, les dangers qui n'entrent que
 * dans le coût de trajet, et tout l'habillage.
 *
 * ## Pourquoi un paramètre et pas un singleton
 *
 * `packages/shared` garde zéro dépendance runtime et zéro état mutable : les surcharges
 * descendent en paramètre explicite, avec un défaut vide. Un appelant qui ne connaît pas le
 * contenu édité obtient exactement le comportement d'avant le chantier — c'est la composition
 * explicite de l'ADR 0001, appliquée au contenu.
 */

/** Rendement et teinte d'une galaxie. Le reste — bras, taille, densité — est gelé. */
export type GalaxyEffects = Pick<GalaxyTypeDef, "depositBias" | "tint">;

/**
 * Rendement et apparence d'une étoile.
 *
 * `luminosity`, `radiation` et `flareActivity` n'y sont pas : la chaîne physique les lit à la
 * génération pour poser l'habitabilité, qui est persistée.
 */
export type StarEffects = Pick<
  StarClassDef,
  | "depositMult"
  | "energyMult"
  | "dark"
  | "core"
  | "edge"
  | "halo"
  | "radius"
  | "corona"
  | "light"
  | "intensity"
  | "churn"
>;

/** Rendement, danger et apparence d'un trou noir. `radiation` reste gelé, comme pour l'étoile. */
export type BlackHoleEffects = Pick<
  BlackHoleTypeDef,
  | "depositMult"
  | "energyMult"
  | "exoticYield"
  | "hazard"
  | "discRadius"
  | "horizonRadius"
  | "halo"
  | "light"
  | "intensity"
>;

/** Idem pour une fontaine blanche, dont la bouche remplace l'horizon. */
export type WhiteHoleEffects = Pick<
  WhiteHoleTypeDef,
  | "depositMult"
  | "energyMult"
  | "exoticYield"
  | "hazard"
  | "discRadius"
  | "mouthRadius"
  | "halo"
  | "light"
  | "intensity"
>;

/**
 * Habillage d'une structure de corps, planète ou lune.
 *
 * `colonizable`, `magnetosphere`, `radiusRange` et `densityRange` restent gelés : le
 * générateur en tire la masse et l'habitabilité, et `colonizable` ferme la colonisation d'un
 * monde déjà colonisé si on le retourne.
 */
export type StructureEffects = Pick<
  PlanetClassDef,
  "renderRadius" | "labelExtent" | "ringChance" | "relief" | "roughness"
>;

/** Teintes d'un environnement. L'albédo et le dégazage sont de la physique, pas de l'habillage. */
export type EnvironmentEffects = Pick<PlanetVariantDef, "color" | "accent">;

/** Danger et apparence d'une ceinture. `richness` est gelée : elle est tirée et persistée. */
export type BeltEffects = Pick<BeltTypeDef, "hazard" | "tint" | "density">;

/**
 * Surcharges par famille, indexées par identifiant de type.
 *
 * Partielles à deux niveaux : un type absent garde sa définition intégrale, et un champ absent
 * garde sa valeur intégrée. Une édition d'admin ne porte donc que sur ce qu'elle change.
 *
 * Alias de type et non interface : une interface n'a pas de signature d'index implicite, et la
 * publication au client sérialise ce paquet dans un `Record`.
 */
export type AstroOverrides = {
  galaxy?: Readonly<Record<string, Partial<GalaxyEffects>>>;
  star?: Readonly<Record<string, Partial<StarEffects>>>;
  blackHole?: Readonly<Record<string, Partial<BlackHoleEffects>>>;
  whiteHole?: Readonly<Record<string, Partial<WhiteHoleEffects>>>;
  planetClass?: Readonly<Record<string, Partial<StructureEffects>>>;
  moonClass?: Readonly<Record<string, Partial<StructureEffects>>>;
  planetVariant?: Readonly<Record<string, Partial<EnvironmentEffects>>>;
  moonVariant?: Readonly<Record<string, Partial<EnvironmentEffects>>>;
  belt?: Readonly<Record<string, Partial<BeltEffects>>>;
};

/** Les familles éditables, dans l'ordre où l'admin les présente. */
export const ASTRO_FAMILIES = [
  "galaxy",
  "star",
  "blackHole",
  "whiteHole",
  "planetClass",
  "planetVariant",
  "moonClass",
  "moonVariant",
  "belt",
] as const;

export type AstroFamily = (typeof ASTRO_FAMILIES)[number];

/** Aucune surcharge : le comportement d'avant le chantier, et le défaut de chaque accesseur. */
export const NO_ASTRO_OVERRIDES: AstroOverrides = {};

/**
 * Applique la surcharge d'un identifiant sur sa définition intégrée.
 *
 * Retourne la définition telle quelle quand rien ne la surcharge — pas de copie inutile sur un
 * chemin appelé pour chaque corps de chaque système rendu.
 */
export function patched<T extends object>(
  base: T,
  patch: Partial<T> | undefined,
): T {
  return patch ? { ...base, ...patch } : base;
}
