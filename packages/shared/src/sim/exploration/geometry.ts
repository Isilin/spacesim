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

/**
 * Éléments décrivant une orbite circulaire inclinée. Partagés par les corps du
 * générateur et les sites découvrables au scan (chantier 31.11), qui ont besoin d'une
 * position dans le volume sans être des planètes.
 */
export interface OrbitalElements {
  orbitRadius: number;
  /** Angle à t=0, en radians. */
  orbitAngle: number;
  inclination: number;
  ascendingNode: number;
}

/**
 * Position sur une orbite, dans le repère de ce qu'elle entoure. `angleOffset` est
 * l'avance angulaire accumulée depuis t=0 — nulle pour un objet immobile.
 *
 * L'orbite est un cercle de rayon `orbitRadius` incliné de `inclination` puis pivoté de
 * `ascendingNode` : deux rotations, dans cet ordre.
 */
export function orbitPosition(el: OrbitalElements, angleOffset = 0): Vec3 {
  const theta = el.orbitAngle + angleOffset;
  const px = el.orbitRadius * Math.cos(theta);
  const py = el.orbitRadius * Math.sin(theta);

  // Inclinaison : rotation autour de l'axe X du plan orbital.
  const cosI = Math.cos(el.inclination);
  const sinI = Math.sin(el.inclination);
  const yTilted = py * cosI;
  const z = py * sinI;

  // Nœud ascendant : rotation autour de l'axe Z, oriente le plan dans le système.
  const cosN = Math.cos(el.ascendingNode);
  const sinN = Math.sin(el.ascendingNode);
  return {
    x: px * cosN - yTilted * sinN,
    y: px * sinN + yTilted * cosN,
    z,
  };
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

/** Position d'un corps sur sa propre orbite, à un tick donné. */
function localPositionAt(body: Planet, tick: number): Vec3 {
  return orbitPosition(body, angularSpeedOf(body) * tick);
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
