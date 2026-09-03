import type { Galaxy, StarSystem } from "../../model/universe.js";
import { createRng } from "../../rng.js";

/**
 * Classe d'étoile, morphologie de galaxie et cœur galactique (chantiers 35.9, 37.1, 39).
 *
 * ## Pourquoi dérivé plutôt que généré
 *
 * L'ADR 0002 interdit qu'une galaxie matérialisée change par régénération : ajouter une
 * colonne « classe d'étoile » demanderait de régénérer l'univers, ce qui est gratuit
 * aujourd'hui et impossible après le lancement officiel. Ces classes suivent donc le patron
 * déjà en place — `bodyPhysicals()` tire rayon, gravité et atmosphère de l'identifiant du
 * corps, `sitesOfSystem()` tire les sites du seed sans jamais les stocker. Zéro colonne,
 * zéro migration, et un résultat identique côté client et côté serveur.
 *
 * ## Pourquoi la classe se LIT du contenu
 *
 * Un trou noir avec cinq mondes habitables serait absurde. Le tirage est donc **conditionné
 * par ce que le système contient déjà** : les reliques — trou noir, pulsar, naine blanche —
 * ne sont possibles que là où rien ne vit, et la taille de l'étoile suit l'étendue de ses
 * orbites. La classe devient une lecture de la donnée existante plutôt qu'un tirage
 * indépendant qui la contredirait.
 *
 * ## Portée : la classe est cosmétique, la morphologie ne l'est plus
 *
 * La classe d'étoile n'entre ni dans l'économie, ni dans l'habitabilité, ni dans
 * l'exploration, ni dans le combat : elle n'existe que pour que deux systèmes ne se
 * ressemblent pas. Le trou noir central d'une galaxie, plus bas, est cosmétique au même
 * titre.
 *
 * La morphologie, elle, a changé de statut au chantier 37. Le générateur a cessé de tirer
 * les positions des systèmes au hasard pour les poser selon les bras de la galaxie : la
 * morphologie décide désormais **où sont les systèmes**. Les deux vivent dans ce fichier
 * parce qu'elles répondent à la même question (« à quoi ressemble cet objet ? »), pas parce
 * qu'elles ont la même portée.
 *
 * Elle reste néanmoins **dérivée**, jamais persistée : `galaxyMorphology()` ne lit que
 * l'identifiant de la galaxie et son nombre de systèmes, tous deux relus de la base. Aucune
 * colonne, aucune migration, et le client retrouve exactement ce que le générateur a posé.
 */

export const STAR_CLASSES = [
  "redDwarf",
  "mainSequence",
  "giant",
  "whiteDwarf",
  "pulsar",
  "blackHole",
] as const;

export type StarClass = (typeof STAR_CLASSES)[number];

export const GALAXY_MORPHOLOGIES = [
  "spiral",
  "barred",
  "elliptical",
  "irregular",
] as const;

export type GalaxyMorphology = (typeof GALAXY_MORPHOLOGIES)[number];

/**
 * Habitabilité du meilleur monde en deçà de laquelle un système est réputé mort, et peut
 * donc porter une relique.
 *
 * Calé sur les fourchettes du générateur : un monde tellurique naît entre 55 et 90, un
 * océanique entre 45 et 80, un gelé plafonne à 40 et un volcanique à 30. Sous 41, il n'y a
 * donc rien d'autre que du gelé, du volcanique et du gaz — aucun monde qui vaille d'être
 * pris. Mesuré sur l'univers de référence : onze systèmes sur trente-sept, dont un quart
 * deviennent des reliques.
 */
const DEAD_SYSTEM_HABITABILITY = 41;

/** Rayon orbital externe au-delà duquel une étoile est réputée dilatée, et en deçà serrée. */
const GIANT_OUTER_ORBIT = 240;
const DWARF_OUTER_ORBIT = 150;

/**
 * En deçà de ce nombre de systèmes, une galaxie est trop pauvre pour s'être organisée : elle
 * reste irrégulière ou elliptique. Calé sur le bas de la plage de `galaxyDefAt` (300), dont
 * il coupe le premier huitième — une galaxie de frontière chétive se distingue, sans que ce
 * soit le cas d'une sur deux.
 */
const POOR_GALAXY_SYSTEMS = 340;

/** Parts cumulées des reliques, dans un système mort. Rares à dessein. */
const BLACK_HOLE_SHARE = 0.05;
const PULSAR_SHARE = 0.12;
const WHITE_DWARF_SHARE = 0.26;

/**
 * Classe de l'étoile d'un système.
 *
 * Un système vide de corps — inexploré, donc redacté par le brouillard — rend la classe la
 * plus banale : ce que le joueur n'a pas visité ne doit pas lui annoncer un trou noir.
 */
export function starClassOf(system: StarSystem): StarClass {
  const planets = system.planets;
  if (planets.length === 0) return "mainSequence";

  const habitability = Math.max(...planets.map((p) => p.habitability));
  const outerOrbit = Math.max(...planets.map((p) => p.orbitRadius));
  const roll = createRng(`star:${system.id}`)();

  // Reliques : seulement là où rien ne vit. C'est ce qui empêche un trou noir d'éclairer
  // une colonie prospère.
  if (habitability < DEAD_SYSTEM_HABITABILITY) {
    if (roll < BLACK_HOLE_SHARE) return "blackHole";
    if (roll < PULSAR_SHARE) return "pulsar";
    if (roll < WHITE_DWARF_SHARE) return "whiteDwarf";
  }

  // Étoiles vivantes : la taille suit l'étendue des orbites, ce que le joueur voit déjà.
  if (outerOrbit > GIANT_OUTER_ORBIT)
    return roll < 0.55 ? "giant" : "mainSequence";
  if (outerOrbit < DWARF_OUTER_ORBIT)
    return roll < 0.6 ? "redDwarf" : "mainSequence";
  return "mainSequence";
}

/** Une étoile qui n'éclaire pas : le disque d'accrétion prend le relais. */
export function isDarkStar(starClass: StarClass): boolean {
  return starClass === "blackHole";
}

/**
 * Morphologie d'une galaxie, tirée de son seul identifiant et de sa taille.
 *
 * Signature volontairement primitive : le générateur l'appelle **avant** qu'un `Galaxy`
 * existe — il lui faut la forme pour placer les systèmes (`generatePositions`). Le client
 * l'appelle après, sur une galaxie chargée, via `galaxyMorphologyOf`. Une seule
 * implémentation pour les deux, sans quoi le nuage du palier univers et les systèmes du
 * palier galaxie dessineraient deux galaxies différentes.
 *
 * Lue de sa richesse : une galaxie dense s'organise en spirale, une pauvre reste
 * irrégulière. Le seuil suit la plage du générateur (`galaxyDefAt`) — il valait 9 quand une
 * galaxie comptait 7 à 14 systèmes, il vaut `POOR_GALAXY_SYSTEMS` depuis qu'elle en compte
 * 300 à 520.
 */
export function galaxyMorphology(
  id: string,
  systemCount: number,
): GalaxyMorphology {
  const roll = createRng(`galaxy:${id}`)();
  if (systemCount < POOR_GALAXY_SYSTEMS)
    return roll < 0.6 ? "irregular" : "elliptical";
  if (roll < 0.45) return "spiral";
  if (roll < 0.8) return "barred";
  return "elliptical";
}

/** Morphologie d'une galaxie déjà construite — l'appel côté client et côté rendu. */
export function galaxyMorphologyOf(galaxy: Galaxy): GalaxyMorphology {
  return galaxyMorphology(galaxy.id, galaxy.systems.length);
}

/**
 * Forme géométrique d'une galaxie, consommée par le générateur (chantier 37.2).
 *
 * Cette description vivait côté client (`apps/web/src/map3d/appearance.ts`) tant qu'elle ne
 * servait qu'à peindre un nuage décoratif au palier univers. Elle décrit maintenant où le
 * générateur pose réellement les systèmes : sa place est ici, et le client la lit d'ici.
 *
 * `arms` à zéro décrit un nuage sans bras — c'est ce qui distingue une elliptique d'une
 * spirale.
 */
export interface GalaxyAppearance {
  arms: number;
  /** Nombre de tours parcourus par un bras, en radians. */
  winding: number;
  /** Longueur de la barre centrale, en part du rayon. Zéro pour une spirale simple. */
  bar: number;
  /** Dispersion perpendiculaire aux bras, en part du rayon. */
  scatter: number;
}

const GENERIC_GALAXY: GalaxyAppearance = {
  arms: 2,
  winding: Math.PI * 3,
  bar: 0,
  scatter: 0.28,
};

const GALAXIES: Record<GalaxyMorphology, GalaxyAppearance> = {
  spiral: GENERIC_GALAXY,
  barred: { arms: 2, winding: Math.PI * 2.2, bar: 0.42, scatter: 0.22 },
  elliptical: { arms: 0, winding: 0, bar: 0, scatter: 1 },
  irregular: { arms: 3, winding: Math.PI * 1.2, bar: 0, scatter: 0.75 },
};

export function galaxyAppearance(morphology: string): GalaxyAppearance {
  return GALAXIES[morphology as GalaxyMorphology] ?? GENERIC_GALAXY;
}

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
 * dimension obligerait le rendu à redéclarer la constante 97 de son côté — le doublon que
 * `galaxyAppearance` a déjà créé entre ce fichier et `apps/web/src/map3d/appearance.ts`, et
 * qu'il ne faut pas reproduire.
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
 * Rapport de l'horizon au disque. Repris tel quel du trou noir stellaire (7,15 / 41,6, cf.
 * `STARS.blackHole` côté web) : le shader d'accrétion raisonne en parts du disque et n'a été
 * calé que dans ce domaine.
 */
const CORE_HORIZON_SHARE = 0.17;

/** Rayon du disque d'accrétion du cœur d'une galaxie, dans le repère de galaxie. */
export function galacticCoreDisc(systemCount: number): number {
  return CORE_DISC_PER_SYSTEM * systemCount;
}

/** Rayon de l'horizon du cœur d'une galaxie, dans le repère de galaxie. */
export function galacticCoreHorizon(systemCount: number): number {
  return CORE_HORIZON_SHARE * galacticCoreDisc(systemCount);
}
