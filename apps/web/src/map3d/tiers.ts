/**
 * Échelle continue de la carte (chantier 35.1).
 *
 * La carte n'a plus quatre niveaux mais une seule profondeur réelle. Ce module porte
 * toute l'arithmétique de cette profondeur — et rien d'autre : aucun import de `three`,
 * aucun composant, aucun état. Même doctrine que `bounds.ts` et `shipLayout.ts` : ce qui
 * décide est une fonction pure, donc testable sans contexte WebGL.
 *
 * ## Repères imbriqués, et pourquoi il n'y a PAS de rebasage
 *
 * Mesuré sur le générateur : l'amas de galaxies s'étend sur ~3 700 unités
 * (`GALAXY_SPACING` × √`MAX_GALAXIES`) alors qu'une lune se rend à un rayon de 5 dans le
 * repère de son système. Composés, les facteurs d'imbrication donnent un rapport d'échelle
 * de ~10⁶ entre les deux bouts de la carte. Chaque palier garde donc **son propre repère
 * local** et s'imbrique dans son parent par un `<group position scale>` — c'est ce que
 * calcule `nestingScale`.
 *
 * La parade classique à un tel rapport est le *floating origin* : rebaser la caméra à
 * chaque franchissement. **Ce module ne le fait pas, et c'est délibéré.** three.js ne
 * passe jamais de position monde au shader : il compose `modelViewMatrix =
 * matrixWorldInverse × matrixWorld` en float64 côté CPU, et n'envoie au GPU que le
 * résultat — une translation **relative à la caméra**, donc petite dès que l'objet est
 * regardé de près. La dérive de sommets que le rebasage devait éviter n'existe pas sur ce
 * chemin de rendu, et le rebasage, lui, coûterait un défaut bien réel : `setState` depuis
 * `useFrame` ne prend effet qu'à l'image suivante, si bien qu'une image serait rendue avec
 * la nouvelle caméra et l'ancien graphe — un éclair à chaque palier.
 *
 * Ce qui reste vraiment sensible à l'échelle, ce sont les **plans de coupe** :
 * `MapCanvas` ne fixe aujourd'hui que `far`, et le `near` par défaut de three.js (0,1)
 * découperait purement et simplement une lune regardée à 0,02 unité. D'où
 * `clipPlanesFor`, qui les fait suivre la distance de vue.
 *
 * Le franchissement se réduit alors à monter et démonter des couches — et les seuils de
 * `tierBlend` sont calés pour que cela n'arrive jamais que sur une couche transparente.
 */

export const TIER_ORDER = ["universe", "galaxy", "system", "body"] as const;

export type TierName = (typeof TIER_ORDER)[number];

export type Vec3 = readonly [number, number, number];

/** Pose de caméra dans le repère d'un palier : d'où l'on regarde, et quoi. */
export interface CameraPose {
  position: Vec3;
  target: Vec3;
}

/**
 * Bornes du facteur d'imbrication. Le plancher évite qu'un contenu dégénéré (une galaxie
 * à un seul système, un corps sans lune) ne produise une échelle nulle ; le plafond garde
 * `ln(1/scale)` loin de zéro, sans quoi la progression divise par ~0 et part à l'infini
 * au premier cran de molette.
 */
const MIN_SCALE = 1e-4;
const MAX_SCALE = 0.5;

/**
 * Seuils de fondu, en progression dans la bande de transition.
 *
 * L'enfant se monte AVANT de commencer à apparaître : monter une scène coûte une image,
 * la faire apparaître au même instant rendrait ce coût visible. Le parent, lui, ne
 * commence à s'effacer qu'une fois l'enfant bien lisible, et atteint zéro exactement à
 * `progress = 1` — le franchissement démonte donc une couche déjà transparente, ce qui
 * est toute la raison pour laquelle il ne se voit pas.
 */
const CHILD_MOUNT_AT = 0.3;
const CHILD_FADE_FROM = 0.35;
const CHILD_FADE_TO = 0.75;
const PARENT_FADE_FROM = 0.6;
const PARENT_FADE_TO = 1;

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return value < 0 ? 0 : value > 1 ? 1 : value;
}

/** Interpolation de Hermite entre deux bords — la même que `smoothstep` en GLSL. */
function smoothstep(edge0: number, edge1: number, x: number): number {
  if (edge1 <= edge0) return x < edge0 ? 0 : 1;
  const t = clamp01((x - edge0) / (edge1 - edge0));
  return t * t * (3 - 2 * t);
}

/**
 * Facteur d'imbrication ramené dans ses bornes.
 *
 * Toutes les fonctions de ce module passent par ce filtre plutôt que de faire confiance à
 * leur appelant : une échelle nulle ou négative ne produit pas une image dégradée mais
 * une caméra à `NaN`, dont on ne revient pas.
 */
function safeScale(scale: number): number {
  if (!Number.isFinite(scale) || scale <= 0) return MAX_SCALE;
  return scale < MIN_SCALE ? MIN_SCALE : scale > MAX_SCALE ? MAX_SCALE : scale;
}

export function tierIndex(name: TierName): number {
  return TIER_ORDER.indexOf(name);
}

/**
 * Palier dans lequel se trouve une profondeur. La partie fractionnaire est la progression
 * vers le palier suivant : elle ne change pas de palier avant d'atteindre 1.
 */
export function tierAt(depth: number): TierName {
  if (!Number.isFinite(depth) || depth < 0) return TIER_ORDER[0];
  const index = Math.floor(depth);
  return TIER_ORDER[Math.min(index, TIER_ORDER.length - 1)]!;
}

/** Palier suivant, ou `null` au dernier — il n'y a rien sous le corps. */
export function childTierOf(name: TierName): TierName | null {
  return TIER_ORDER[tierIndex(name) + 1] ?? null;
}

/**
 * Facteur d'imbrication d'un palier enfant dans son parent.
 *
 * `footprint` est la place que l'enfant occupe dans le repère du parent — le disque d'une
 * galaxie vue de l'univers, le nœud d'un système vu de la galaxie, le rayon de rendu
 * d'une planète vue du système. `contentRadius` est l'étendue de ce que ce même enfant
 * contient, dans SON repère. Le rapport des deux est le facteur par lequel il faut
 * multiplier le repère enfant pour le poser dans le parent.
 */
export function nestingScale(footprint: number, contentRadius: number): number {
  if (
    !Number.isFinite(footprint) ||
    !Number.isFinite(contentRadius) ||
    footprint <= 0 ||
    contentRadius <= 0
  )
    return MAX_SCALE;
  return safeScale(footprint / contentRadius);
}

/**
 * Progression dans la bande de transition, à partir de la distance caméra.
 *
 * La bande est définie par ses **deux** distances de cadrage, toutes deux exprimées dans
 * les unités de la scène : `parentFrame` est la distance à laquelle le palier courant
 * remplit le cadre (progression 0), `childFrame` celle à laquelle l'enfant le remplit à
 * son tour (progression 1). Ce sont deux appels à `fitDistance()`, celui de l'enfant sur
 * son cadrage déjà imbriqué.
 *
 * Déduire `childFrame` du seul facteur d'échelle serait faux : cela reviendrait à
 * supposer que parent et enfant se cadrent à la même distance dans leurs repères
 * respectifs, ce qu'aucune paire de paliers ne vérifie — un système ne se cadre pas comme
 * la galaxie qui le contient.
 *
 * Le résultat n'est **pas borné** : c'est son débordement hors de [0, 1] qui signale à
 * l'appelant qu'il doit changer de palier. Le borner ici rendrait le franchissement
 * indétectable.
 */
export function tierProgress(
  distance: number,
  parentFrame: number,
  childFrame: number,
): number {
  const span = bandSpan(parentFrame, childFrame);
  if (span === 0 || !Number.isFinite(distance) || distance <= 0) return 0;
  return Math.log(parentFrame / distance) / span;
}

/** Réciproque de `tierProgress` : la distance caméra qu'appelle une progression donnée. */
export function distanceForProgress(
  parentFrame: number,
  childFrame: number,
  progress: number,
): number {
  if (!Number.isFinite(parentFrame) || parentFrame <= 0) return 0;
  if (bandSpan(parentFrame, childFrame) === 0 || !Number.isFinite(progress))
    return parentFrame;
  return parentFrame * (childFrame / parentFrame) ** progress;
}

/**
 * Largeur de la bande, en logarithme de distance. Zéro signale une bande dégénérée — un
 * enfant qui se cadre aussi loin que son parent, ou plus loin. L'appelant lit ce zéro
 * comme « pas de descente possible ici » plutôt que de diviser par lui.
 */
function bandSpan(parentFrame: number, childFrame: number): number {
  if (
    !Number.isFinite(parentFrame) ||
    !Number.isFinite(childFrame) ||
    parentFrame <= 0 ||
    childFrame <= 0 ||
    childFrame >= parentFrame
  )
    return 0;
  return Math.log(parentFrame / childFrame);
}

export interface TierBlend {
  /**
   * L'enfant doit-il être monté ? Faux hors de la bande : on ne paie pas le rendu d'une
   * scène qui ne couvre pas un pixel.
   */
  childMounted: boolean;
  childOpacity: number;
  parentOpacity: number;
}

export function tierBlend(progress: number): TierBlend {
  const p = Number.isFinite(progress) ? progress : 0;
  return {
    childMounted: p >= CHILD_MOUNT_AT,
    childOpacity: smoothstep(CHILD_FADE_FROM, CHILD_FADE_TO, p),
    parentOpacity: 1 - smoothstep(PARENT_FADE_FROM, PARENT_FADE_TO, p),
  };
}

/**
 * Fraction de la distance de vue placée devant la caméra. Assez petit pour qu'un objet
 * situé entre la caméra et sa cible ne soit pas tranché, assez grand pour que le rapport
 * `far / near` reste dans ce que tient un tampon de profondeur 24 bits.
 */
const NEAR_RATIO = 0.005;

export interface ClipPlanes {
  near: number;
  far: number;
}

/**
 * Plans de coupe qui suivent la profondeur de zoom.
 *
 * Indispensable ici et pas seulement confortable : `MapCanvas` ne fixe que `far`, donc
 * `near` vaut le défaut de three.js, 0,1. Au palier corps la caméra regarde sa cible à
 * ~0,02 unité — tout serait devant le plan proche, et la carte rendrait du vide.
 *
 * `far` tient le palier courant en entier (`frameDistance` est la distance à laquelle il
 * remplit le cadre) plus la marge de ce qui l'entoure, sans quoi le fond disparaîtrait
 * dès qu'on avance.
 */
export function clipPlanesFor(
  distance: number,
  frameDistance: number,
): ClipPlanes {
  const d = Number.isFinite(distance) && distance > 0 ? distance : 1;
  const frame =
    Number.isFinite(frameDistance) && frameDistance > 0 ? frameDistance : d;
  return { near: d * NEAR_RATIO, far: d + frame * 3 };
}

/** Passage d'un point dans le repère de l'enfant : `p' = (p - ancre) / échelle`. */
export function toChildFrame(point: Vec3, anchor: Vec3, scale: number): Vec3 {
  const s = safeScale(scale);
  return [
    (point[0] - anchor[0]) / s,
    (point[1] - anchor[1]) / s,
    (point[2] - anchor[2]) / s,
  ];
}

/** Passage d'un point dans le repère du parent : `p = p' × échelle + ancre`. */
export function toParentFrame(point: Vec3, anchor: Vec3, scale: number): Vec3 {
  const s = safeScale(scale);
  return [
    point[0] * s + anchor[0],
    point[1] * s + anchor[1],
    point[2] * s + anchor[2],
  ];
}

/**
 * Pose de caméra exprimée dans le repère de l'enfant.
 *
 * Pas un rebasage de rendu — voir l'en-tête, il n'y en a pas — mais la conversion dont a
 * besoin tout ce qui **désigne** un point à travers les paliers : viser une lune depuis la
 * galaxie, restaurer une ancre depuis l'URL, animer un vol vers un corps. La projection
 * est conservée, ce que vérifie le test d'aller-retour.
 */
export function descend(
  pose: CameraPose,
  anchor: Vec3,
  scale: number,
): CameraPose {
  return {
    position: toChildFrame(pose.position, anchor, scale),
    target: toChildFrame(pose.target, anchor, scale),
  };
}

/** Pose de caméra exprimée dans le repère du parent — réciproque de `descend`. */
export function ascend(
  pose: CameraPose,
  anchor: Vec3,
  scale: number,
): CameraPose {
  return {
    position: toParentFrame(pose.position, anchor, scale),
    target: toParentFrame(pose.target, anchor, scale),
  };
}

/**
 * Élection de l'ancre : l'enfant dans lequel le zoom va descendre.
 *
 * Rendre `null` n'est pas un échec mais une décision — on ne plonge pas dans le vide. Le
 * zoom est alors borné à la frontière du palier, et le joueur doit viser quelque chose
 * pour descendre. Sans cette règle, dézoomer puis rezoomer au milieu de nulle part ferait
 * descendre d'un palier sur un objet arbitraire.
 */
export function electAnchor<T extends { id: string; position: Vec3 }>(
  target: Vec3,
  candidates: readonly T[],
  maxDistance: number,
): T | null {
  if (!Number.isFinite(maxDistance) || maxDistance <= 0) return null;
  // Comparaison au carré : la racine ne change pas l'ordre et coûte, ici, à chaque image.
  const limit = maxDistance * maxDistance;
  let best: T | null = null;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const candidate of candidates) {
    const dx = candidate.position[0] - target[0];
    const dy = candidate.position[1] - target[1];
    const dz = candidate.position[2] - target[2];
    const distance = dx * dx + dy * dy + dz * dz;
    if (distance < bestDistance && distance <= limit) {
      best = candidate;
      bestDistance = distance;
    }
  }
  return best;
}
