import { blackHoleType } from "../../content/astro/black-hole-types.js";
import type { AstroOverrides } from "../../content/astro/overrides.js";

/**
 * Cœur galactique (chantier 39).
 *
 * ## Ce qui a quitté ce fichier
 *
 * Tout le reste. La morphologie de galaxie y était dérivée de l'identifiant, la classe
 * d'étoile lue d'après les planètes déjà posées : le chantier 45 en fait des types persistés
 * et tirés en amont (ADR 0021, qui remplace l'ADR 0016 et renverse la décision 3 de
 * l'ADR 0018). `starClassOf` a disparu avec sa logique de reliques — un système ne se lit
 * plus, il se déclare.
 *
 * ## Pourquoi le cœur, lui, reste dérivé
 *
 * Il est le seul objet du chantier 45 à ne recevoir aucune mécanique, et c'est délibéré :
 * dérivé ET mécanique, une réédition de catalogue changerait rétroactivement le rendement
 * d'une galaxie vivante. Rien ne vit sous un cœur — `MapScene` le déclare non descendable —
 * donc rien ne peut en dépendre, et il peut rester gratuit.
 */

/**
 * Trou noir supermassif au centre d'une galaxie (chantier 39).
 *
 * ## Pourquoi la taille suit le NOMBRE de systèmes, et non le rayon du disque
 *
 * La relation M–σ lie la masse d'un trou noir central à celle du bulbe qui l'entoure, donc au
 * nombre d'étoiles ; et le rayon de Schwarzschild suit la masse. Le rayon du disque de la
 * galaxie, lui, suit `√n` (`GALAXY_RADIUS_PER_ROOT_SYSTEM`). Le cœur occupe donc une part
 * croissante de sa galaxie quand celle-ci grossit — et c'est le point : calé sur le rayon, il
 * aurait rendu la même image dans toutes les galaxies et la dépendance demandée ne se serait
 * vue nulle part.
 *
 * ## Pourquoi ces rayons sont en unités du repère de galaxie
 *
 * C'est le repère où vit déjà le rayon du disque (`GALAXY_RADIUS_PER_ROOT_SYSTEM × √n`) et
 * celui que le client retrouve par `systemScenePosition`. Rendre ici une grandeur sans
 * dimension obligerait le rendu à redéclarer la constante 97 de son côté — exactement le
 * doublon que `galaxyAppearance` avait créé entre ce fichier et `apps/web/src/map3d/
 * appearance.ts`, et que le chantier 45 vient de supprimer.
 *
 * Dérivé, jamais persisté, comme tout ce fichier : le seul appui est `systemCountOf`, qui vaut
 * aussi sur une galaxie condensée. Une galaxie hors de portée montre donc son cœur pendant que
 * ses systèmes restent redactés — le nombre de systèmes traverse déjà le brouillard.
 */

/**
 * Rayon du disque d'accrétion, par système de la galaxie.
 *
 * Calé pour rester SOUS le vide central : `generatePositions` ne pose rien en deçà de 0,08·R
 * dans les morphologies non barrées, et le disque doit se lire comme le bulbe, pas comme une
 * nappe posée sur les systèmes internes. À 400 systèmes il vaut 100 unités contre 155 de vide.
 * Verrou : `stars.test.ts`.
 */
const CORE_DISC_PER_SYSTEM = 0.25;

/**
 * Rapport de l'horizon au disque, si le type du cœur ne dit rien. Repris du trou noir
 * stellaire (7,15 / 41,6) : le shader d'accrétion raisonne en parts du disque et n'a été calé
 * que dans ce domaine.
 */
const CORE_HORIZON_SHARE = 0.17;

/** Rayon du disque d'accrétion du cœur d'une galaxie, dans le repère de galaxie. */
export function galacticCoreDisc(systemCount: number): number {
  return CORE_DISC_PER_SYSTEM * systemCount;
}

/**
 * Rayon de l'horizon du cœur d'une galaxie, dans le repère de galaxie.
 *
 * La **taille** reste dérivée du nombre de systèmes — c'est la relation M–σ, et le cœur est le
 * seul objet du chantier 45 sans mécanique, donc le seul qui ait le droit de rester dérivé.
 * La **proportion**, elle, vient du catalogue depuis le chantier 47 : `CORE_HORIZON_SHARE`
 * avouait dupliquer le rapport du trou noir stellaire, alors que `supermassive` porte
 * 51 / 300 = 0,17 exactement. Le doublon disparaît sans qu'aucune valeur ne change, et un
 * éditeur qui retouche les deux rayons d'un type de cœur en voit enfin la forme bouger.
 *
 * Les rayons du catalogue ne sont pas repris tels quels : calibrés dans le repère d'un
 * SYSTÈME, 300 unités dans une galaxie de rayon ~2 170 rendraient un cœur trois fois trop
 * petit.
 */
export function galacticCoreHorizon(
  systemCount: number,
  coreTypeId?: string,
  overrides?: AstroOverrides,
): number {
  const def = coreTypeId ? blackHoleType(coreTypeId, overrides) : undefined;
  const share =
    def && def.discRadius > 0
      ? def.horizonRadius / def.discRadius
      : CORE_HORIZON_SHARE;
  return share * galacticCoreDisc(systemCount);
}
