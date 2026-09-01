import type { Galaxy, StarSystem } from "../../model/universe.js";
import { createRng } from "../../rng.js";

/**
 * Classe d'étoile et morphologie de galaxie (chantier 35.9).
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
 * ## Portée
 *
 * **Purement cosmétique.** Aucune de ces valeurs n'entre dans l'économie, l'habitabilité,
 * l'exploration ou le combat. Elles n'existent que pour que deux systèmes ne se ressemblent
 * pas.
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
 * Morphologie d'une galaxie.
 *
 * Lue de sa richesse : une galaxie dense s'organise en spirale, une pauvre reste
 * irrégulière. Le générateur pose entre 7 et 14 systèmes par galaxie (`universe.ts`), ce
 * qui suffit à séparer les deux cas sans rien ajouter au modèle.
 */
export function galaxyMorphologyOf(galaxy: Galaxy): GalaxyMorphology {
  const roll = createRng(`galaxy:${galaxy.id}`)();
  if (galaxy.systems.length < 9) return roll < 0.6 ? "irregular" : "elliptical";
  if (roll < 0.45) return "spiral";
  if (roll < 0.8) return "barred";
  return "elliptical";
}
