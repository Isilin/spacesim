import {
  MAX_CENTRAL_BODIES,
  starsOf,
  type CentralBody,
  type StarSystem,
} from "@spacesim/shared";

/**
 * Rayon du cœur d'une étoile et de sa couronne la plus externe, en unités de scène.
 *
 * Ils vivaient dans `SystemLayer` et ont déménagé ici au chantier 47 : ce sont les grandeurs
 * d'un corps central, et `pairReadingScale` en a besoin. Les laisser dans le composant aurait
 * fait un cycle d'import — le module de décision important du module de rendu.
 */
export const STAR_CORE = 13;
export const STAR_CORONA = 26;

/**
 * Ce qu'il faut savoir pour dessiner les corps centraux d'un système (chantier 47).
 *
 * ## Le défaut que ce module corrige
 *
 * Le chantier 45.2 a donné un à trois corps centraux à chaque système, avec de vraies orbites
 * S et P. `SystemLayer` n'en dessinait qu'un : `primaryOf(system)`. Une binaire large montrait
 * donc une seule étoile, et son second cortège tournait autour d'un point vide. Depuis le
 * 45.5, un compagnon peut même être un trou noir — invisible lui aussi.
 *
 * ## Pourquoi des fonctions pures, ici
 *
 * Même doctrine que `bounds.ts`, `tiers.ts` et `systemNodeColor.ts` : ce qui se décide se teste
 * sans WebGL. Les deux règles ci-dessous sont exactement le genre de chose qu'un `useMemo`
 * aurait rendue invérifiable — et le chantier 47 existe parce que trois décisions de rendu
 * avaient été écrites à cet endroit-là.
 */

/**
 * Les corps centraux d'un système, complétés à longueur **constante**.
 *
 * `MAX_CENTRAL_BODIES` emplacements, trous compris, quel que soit le nombre d'étoiles. Le rendu
 * monte autant de sources de lumière qu'il y a d'emplacements, celles des trous à intensité
 * nulle : un nombre VARIABLE de lumières fait recompiler tous les matériaux de la scène par
 * three.js — le compte entre dans les *defines* du programme — soit un à-coup visible à chaque
 * entrée dans un système au nombre d'étoiles différent.
 *
 * Un système redacté par le brouillard n'a aucun corps : la liste est alors entièrement vide,
 * et le rendu ne monte rien de plus qu'ailleurs.
 */
export function centralBodySlots(
  system: StarSystem,
): readonly (CentralBody | undefined)[] {
  const bodies = starsOf(system);
  return Array.from(
    { length: MAX_CENTRAL_BODIES },
    (_, index) => bodies[index],
  );
}

/**
 * Facteur de lecture d'une paire serrée.
 *
 * Une binaire serrée sépare ses deux corps de 10 à 22 unités (`TIGHT_BINARY`), et une étoile
 * se rend à `STAR_CORE = 13` de rayon. Deux naines jaunes à 10 unités l'une de l'autre sont
 * donc deux sphères de rayon 13 dont les centres sont à 10 : **une seule boule**. On aurait
 * corrigé « une seule étoile visible » par un correctif qui en montre toujours une.
 *
 * La bande ne peut pas s'élargir : 22 est le maximum pour que trois fois la séparation reste
 * sous la première orbite planétaire, condition de stabilité des orbites circumbinaires
 * (`universe.ts`). C'est donc au rendu de le dire — même doctrine que `bodyRadiusOf`, dont
 * l'en-tête rappelle que ce sont des tailles de LECTURE et non une échelle.
 *
 * Le facteur s'applique aux RAYONS de tous les corps centraux, singularités comprises : un
 * compagnon stellaire porte un disque de 41,6, et à 10 unités il avalerait le primaire. Jamais
 * aux positions, qui sont de la donnée.
 *
 * À 10 unités il vaut 0,32 — deux étoiles de rayon 4,2 dont les centres sont à 10, nettement
 * séparées. À 22, 0,70. Au-delà de 31, 1 : une binaire large n'a rien à corriger.
 */
export function pairReadingScale(bodies: readonly CentralBody[]): number {
  const separations = bodies.map((b) => b.orbitRadius).filter((r) => r > 0);
  if (separations.length === 0) return 1;
  const closest = Math.min(...separations);
  // 2,4 plutôt que 2 : deux sphères qui se touchent exactement se lisent encore comme une
  // seule. Il faut un intervalle franc entre elles pour que l'œil compte deux objets.
  return Math.min(1, closest / (2.4 * STAR_CORE));
}
