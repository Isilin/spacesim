import {
  MOON_KEPLER_CONSTANT,
  PLANET_KEPLER_CONSTANT,
} from "../../constants.js";
import type { Planet, StarSystem } from "../../model/universe.js";

/**
 * Géométrie de l'univers volumétrique (chantier 31.5). Seul point de vérité :
 * la simulation (coûts de trajet intra-système) et le rendu consomment ces mêmes
 * fonctions, jamais deux calculs parallèles qui divergeraient.
 *
 * Tout est pur et dérivé du numéro de tick — aucune position n'est persistée, voir
 * [ADR 0006](../../../../../docs/adr/0006-univers-volumetrique-deux-echelles.md).
 *
 * Les ceintures d'astéroïdes sont volontairement absentes : un anneau n'a pas UNE
 * position, et le point qu'un convoi vise dépend d'où il part. Ce calcul arrivera avec
 * son besoin réel, au chantier 31.8.
 */
export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

/** Une lune orbite sa planète parente ; une planète orbite l'étoile. */
function isMoon(body: Planet): boolean {
  return body.kind === "moon";
}

/**
 * Vitesse angulaire en radians par tick, Kepler simplifié : `ω = K / r^1.5`. Les corps
 * proches tournent vite, les lointains lentement — ce qui suffit à rendre les
 * conjonctions lisibles sans simuler une vraie mécanique orbitale.
 *
 * `K` n'est **pas** calibré à ce stade : le chantier 31.9 fixe l'échelle de temps face à
 * `TICK_MS`, une fois qu'on peut mesurer l'effet sur des trajets réels.
 */
export function angularSpeedOf(body: Planet): number {
  const k = isMoon(body) ? MOON_KEPLER_CONSTANT : PLANET_KEPLER_CONSTANT;
  return k / body.orbitRadius ** 1.5;
}

/** Période orbitale en ticks — l'inverse de `angularSpeedOf`, utile aux tests et à l'UI. */
export function orbitalPeriodTicks(body: Planet): number {
  return (2 * Math.PI) / angularSpeedOf(body);
}

/**
 * Position d'un corps sur son orbite propre, dans le repère de ce qu'il orbite
 * (l'étoile, ou sa planète parente pour une lune).
 *
 * L'orbite est un cercle de rayon `orbitRadius` incliné de `inclination` puis pivoté de
 * `ascendingNode` — deux rotations, dans cet ordre, à partir du plan de référence.
 */
function localPositionAt(body: Planet, tick: number): Vec3 {
  const theta = body.orbitAngle + angularSpeedOf(body) * tick;
  const px = body.orbitRadius * Math.cos(theta);
  const py = body.orbitRadius * Math.sin(theta);

  // Inclinaison : rotation autour de l'axe X du plan orbital.
  const cosI = Math.cos(body.inclination);
  const sinI = Math.sin(body.inclination);
  const yTilted = py * cosI;
  const z = py * sinI;

  // Nœud ascendant : rotation autour de l'axe Z, oriente le plan dans le système.
  const cosN = Math.cos(body.ascendingNode);
  const sinN = Math.sin(body.ascendingNode);
  return {
    x: px * cosN - yTilted * sinN,
    y: px * sinN + yTilted * cosN,
    z,
  };
}

/**
 * Position d'un corps dans le repère de son système, à un tick donné — étoile à
 * l'origine. Une lune compose sa propre orbite avec celle de sa planète parente.
 *
 * Si la planète parente d'une lune est introuvable (données incohérentes), la lune est
 * positionnée comme si elle orbitait l'étoile : mieux vaut un corps mal placé qu'une vue
 * qui refuse de se rendre.
 */
export function bodyPositionAt(
  system: StarSystem,
  body: Planet,
  tick: number,
): Vec3 {
  const local = localPositionAt(body, tick);
  if (!isMoon(body) || !body.parentPlanetId) return local;

  const parent = system.planets.find((p) => p.id === body.parentPlanetId);
  if (!parent) return local;

  const parentPos = localPositionAt(parent, tick);
  return {
    x: parentPos.x + local.x,
    y: parentPos.y + local.y,
    z: parentPos.z + local.z,
  };
}

/**
 * Distance euclidienne en 3D. Accepte structurellement un `StarSystem` ou une `Galaxy`,
 * qui portent déjà `x`/`y`/`z` — pas de conversion intermédiaire à écrire.
 */
export function distance3(a: Vec3, b: Vec3): number {
  return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
}
