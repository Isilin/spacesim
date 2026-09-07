import type { Planet } from "../../model/universe.js";
import { type AstroOverrides, NO_ASTRO_OVERRIDES } from "./overrides.js";
import { moonClass } from "./moon-classes.js";
import { moonVariant } from "./moon-variants.js";
import { type BodyStructureDef, planetClass } from "./planet-classes.js";
import { type BodyEnvironmentDef, planetVariant } from "./planet-variants.js";

/**
 * Le point où les deux familles de catalogues se rejoignent (chantier 45.3).
 *
 * Une planète et une lune portent les mêmes deux axes mais les tirent de tables distinctes :
 * une planète se tire par zone thermique, une lune par sa planète parente. Ce qui les
 * distingue est donc entièrement dans les ENTRÉES de génération — la moitié gelée de l'ADR
 * 0021 — et pas du tout dans les effets, que la chaîne physique lit de la même façon.
 *
 * Ces deux fonctions sont la conséquence : `kind` décide de la table une seule fois, ici, et
 * la vingtaine d'appelants qui ne veulent qu'un albédo ou un rayon de rendu n'a jamais à le
 * savoir. Sans elles, chacun d'eux porterait le même `if`.
 */

/** Ce qu'il faut d'un corps pour retrouver ses définitions — jamais le corps entier. */
export type BodyRef = Pick<Planet, "kind" | "classId" | "variantId">;

export function bodyStructure(
  body: BodyRef,
  overrides: AstroOverrides = NO_ASTRO_OVERRIDES,
): BodyStructureDef {
  return body.kind === "moon"
    ? moonClass(body.classId, overrides)
    : planetClass(body.classId, overrides);
}

export function bodyEnvironment(
  body: BodyRef,
  overrides: AstroOverrides = NO_ASTRO_OVERRIDES,
): BodyEnvironmentDef {
  return body.kind === "moon"
    ? moonVariant(body.variantId, overrides)
    : planetVariant(body.variantId, overrides);
}
