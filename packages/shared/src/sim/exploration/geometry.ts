import {
  MOON_KEPLER_CONSTANT,
  PLANET_KEPLER_CONSTANT,
} from "../../constants.js";
import {
  starsOf,
  type CentralBody,
  type Planet,
  type StarSystem,
} from "../../model/universe.js";
import { orbitsBarycenter } from "./physics.js";

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
  return angularSpeedAt(body.orbitRadius, k);
}

/**
 * Vitesse angulaire d'un rayon d'orbite, pour une constante donnée (chantier 50.1).
 *
 * `angularSpeedOf` n'en est que le cas d'un corps du générateur. Les rochers d'une ceinture,
 * les sites de scan et les géocroiseurs orbitent aussi sans être des `Planet` : ils suivent
 * cette même loi, et non une copie qui pourrait en diverger.
 */
export function angularSpeedAt(orbitRadius: number, k: number): number {
  return k / orbitRadius ** 1.5;
}

/** Période orbitale en ticks — l'inverse de `angularSpeedOf`, utile aux tests et à l'UI. */
export function orbitalPeriodTicks(body: Planet): number {
  return (2 * Math.PI) / angularSpeedOf(body);
}

/**
 * Rotation propre d'un corps (chantier 50.1). Symétrique d'`OrbitalElements` : des éléments
 * constants, et un angle qui se dérive du tick sans jamais être persisté (ADR 0006).
 *
 * L'orbite et le spin ne sont pas réglés sur la même échelle, et c'est voulu. L'orbite porte
 * une mécanique — attendre la conjonction raccourcit un transfert — et reste calibrée pour la
 * stratégie (chantier 31.9) : une planète y parcourt un degré par minute, ce qu'aucun œil ne
 * voit. Le spin ne décide de rien ; il est donc libre d'être réglé pour être vu.
 */
export interface SpinElements {
  /** Obliquité : inclinaison de l'axe sur la normale au plan orbital, en radians. */
  axialTilt: number;
  /** Longitude du nœud de l'axe : oriente l'obliquité dans le plan orbital, en radians. */
  axisNode: number;
  /** Période de rotation, en ticks. Toujours positive : le sens vit dans `retrograde`. */
  periodTicks: number;
  /** Angle de rotation à t=0, en radians. */
  spinAngle: number;
  /** Rotation à contresens de l'orbite — Vénus en est une. */
  retrograde: boolean;
}

/** Angle de rotation propre au tick donné. La seule fonction du spin appelée par image. */
export function spinAngleAt(el: SpinElements, tick: number): number {
  const turned = (2 * Math.PI * tick) / el.periodTicks;
  return el.spinAngle + (el.retrograde ? -turned : turned);
}

/**
 * Orbite excentrique (chantier 50.8) — celle des géocroiseurs, seuls objets du jeu à ne pas
 * tourner en cercle. `orbitRadius` y est le demi-grand axe et `orbitAngle` l'argument du
 * périastre ; le reste se lit comme sur une orbite circulaire.
 *
 * Un type à part plutôt qu'un champ de plus sur `OrbitalElements` : `orbitPosition` est le
 * chemin chaud de tous les corps et du coût de trajet, et rien d'autre ne s'y excentre.
 */
export interface EccentricElements extends OrbitalElements {
  /** Excentricité : 0 pour un cercle, strictement sous 1. */
  eccentricity: number;
  /** Anomalie moyenne à t=0, en radians. */
  meanAnomaly: number;
}

/**
 * Position sur une orbite excentrique, au tick donné.
 *
 * La loi est celle des corps, `angularSpeedAt` sur le demi-grand axe : un géocroiseur ne
 * tourne ni plus vite ni plus lentement que sa taille d'orbite ne l'impose. Mais il ne la
 * parcourt pas à vitesse constante — il plonge au périastre et traîne à l'apoastre, ce que
 * dit l'équation de Kepler, `M = E − e·sin E`, résolue ici par cinq pas de Newton. Sans
 * boucle de convergence, donc sans branche, et exacte bien au-delà du pixel sous e = 0,5 :
 * pour deux objets par image, le coût est nul.
 */
export function eccentricPositionAt(
  el: EccentricElements,
  tick: number,
  k = PLANET_KEPLER_CONSTANT,
): Vec3 {
  const e = el.eccentricity;
  const mean = el.meanAnomaly + angularSpeedAt(el.orbitRadius, k) * tick;
  let eccentric = mean + e * Math.sin(mean);
  for (let step = 0; step < 5; step++) {
    eccentric -=
      (eccentric - e * Math.sin(eccentric) - mean) /
      (1 - e * Math.cos(eccentric));
  }
  return eccentricPointAt(el, eccentric);
}

/**
 * Point d'une orbite excentrique à une anomalie excentrique donnée : ce que parcourt
 * `eccentricPositionAt`, et ce que la carte trace. Une seule formule pour les deux — le corps
 * ne peut pas s'écarter de la ligne qui prétend dessiner sa route.
 */
export function eccentricPointAt(
  el: EccentricElements,
  eccentricAnomaly: number,
): Vec3 {
  const e = el.eccentricity;
  const trueAnomaly =
    2 *
    Math.atan2(
      Math.sqrt(1 + e) * Math.sin(eccentricAnomaly / 2),
      Math.sqrt(1 - e) * Math.cos(eccentricAnomaly / 2),
    );
  const radius = el.orbitRadius * (1 - e * Math.cos(eccentricAnomaly));
  return orbitPosition({ ...el, orbitRadius: radius }, trueAnomaly);
}

/** Position d'un corps sur sa propre orbite, à un tick donné. */
function localPositionAt(body: Planet, tick: number): Vec3 {
  return orbitPosition(body, angularSpeedOf(body) * tick);
}

/**
 * Position d'un corps central autour du barycentre du système (chantier 45.2).
 *
 * L'ancre y est immobile — rayon nul, à l'origine, ce que tout le reste suppose. Un compagnon
 * suit la même loi de Kepler qu'une planète : sa période croît comme `r^1,5`, si bien qu'une
 * binaire serrée tourne vite et une binaire large très lentement. C'est physiquement juste, et
 * ça évite une seconde constante à calibrer.
 */
export function centralBodyPositionAt(body: CentralBody, tick: number): Vec3 {
  if (body.orbitRadius <= 0) return { x: 0, y: 0, z: 0 };
  return orbitPosition(
    body,
    (PLANET_KEPLER_CONSTANT / body.orbitRadius ** 1.5) * tick,
  );
}

/**
 * Position d'un corps dans le repère de son système, au tick donné.
 *
 * Trois compositions possibles, dans cet ordre :
 *
 * - une **lune** part de la position de sa planète ;
 * - une planète en orbite **S** part de la position de son étoile hôte, elle-même en orbite
 *   autour du barycentre — le cas d'une binaire large, où chaque étoile garde son cortège ;
 * - une planète en orbite **P** part de l'origine, qui EST le barycentre — le cas d'une
 *   étoile seule ou d'une binaire serrée que le cortège englobe.
 *
 * `orbitsBarycenter` tranche entre les deux dernières par la seule géométrie, sans champ
 * supplémentaire qui pourrait la contredire.
 */
export function bodyPositionAt(
  system: StarSystem,
  body: Planet,
  tick: number,
): Vec3 {
  const local = localPositionAt(body, tick);

  if (isMoon(body) && body.parentPlanetId) {
    const parent = system.planets.find((p) => p.id === body.parentPlanetId);
    if (!parent) return local;
    const parentPos = bodyPositionAt(system, parent, tick);
    return {
      x: parentPos.x + local.x,
      y: parentPos.y + local.y,
      z: parentPos.z + local.z,
    };
  }

  const stars = starsOf(system);
  if (!body.hostStarId || orbitsBarycenter(stars, body.orbitRadius)) {
    return local;
  }
  const host = stars.find((s) => s.id === body.hostStarId);
  if (!host) return local;

  const hostPos = centralBodyPositionAt(host, tick);
  return {
    x: hostPos.x + local.x,
    y: hostPos.y + local.y,
    z: hostPos.z + local.z,
  };
}

/**
 * Distance euclidienne en 3D. Accepte structurellement un `StarSystem` ou une `Galaxy`,
 * qui portent déjà `x`/`y`/`z` — pas de conversion intermédiaire à écrire.
 */
export function distance3(a: Vec3, b: Vec3): number {
  return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
}
