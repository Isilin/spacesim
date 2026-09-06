import type {
  ClientUniverse,
  Galaxy,
  Planet,
  StarSystem,
  SystemSite,
} from "@spacesim/shared";
import { bodyFocus } from "./BodyLayer.js";
import { nestedFocus, type Focus } from "./bounds.js";
import {
  galaxyFocus,
  SYSTEM_NODE,
  systemScenePosition,
} from "./GalaxyLayer.js";
import type { MapTarget } from "./MapInfobox.js";
import { bodyLocalPosition, systemFocus } from "./SystemLayer.js";
import { nestingScale, type TierName, type Vec3 } from "./tiers.js";
import {
  galaxyContentScale,
  galaxyScenePosition,
  universeFocus,
} from "./UniverseLayer.js";

/**
 * L'arithmétique d'ancrage de la carte : où se trouve chaque palier, ce que la caméra vise,
 * et ce que le joueur peut désigner. Sorti de `MapScene.tsx` au chantier 43.8.
 *
 * Ce module ne contient que des fonctions PURES sur l'univers — ni React, ni three.js, ni
 * état. C'est ce qui les rend vérifiables sans WebGL, comme `tiers.ts` et `bounds.ts` avant
 * elles : `MapScene.test.ts` importait déjà `pathFor` et `slotIdFor` depuis le composant,
 * ce qui signalait la couture sans la trancher.
 */

/** Chemin d'ancrage : ce que la caméra vise, palier par palier. */
export interface AnchorPath {
  galaxyId: string | null;
  systemId: string | null;
  bodyId: string | null;
}

export const NO_ANCHOR: AnchorPath = {
  galaxyId: null,
  systemId: null,
  bodyId: null,
};

/**
 * Placement d'un palier dans les coordonnées de la scène : une translation et une échelle,
 * accumulées depuis la racine.
 *
 * Les paliers sont rendus **côte à côte** et non imbriqués les uns dans les autres. Deux
 * raisons : démonter un parent ne touche alors jamais à la transformée de son enfant — ce
 * qui est exactement la propriété qui rend le franchissement invisible — et l'arbre reste
 * plat, donc lisible.
 */
export interface Placement {
  position: Vec3;
  scale: number;
  /** Cadrage du palier dans SON repère. */
  local: Focus;
  /** Le même, ramené aux unités de la scène. */
  scene: Focus;
}

export type Placements = Partial<Record<TierName, Placement>>;

/**
 * Un objet que le joueur peut désigner au palier courant (chantier 41).
 *
 * Une seule description, dont dérivent les quatre usages : l'étiquette posée dans la scène,
 * l'entrée de la liste DOM, le pool du clic tolérant et l'infobox. Elles vivaient dans quatre
 * listes parallèles qui décrivaient le même ensemble, et divergeaient sans que rien ne le
 * signale — le cœur galactique était nommé mais pas cliquable, une ceinture cliquable mais
 * pas nommée.
 */
export interface Selectable {
  id: string;
  /** Nom court : l'étiquette de la scène et la première ligne de la liste. */
  label: string;
  /** Seconde ligne de la liste. */
  detail?: string;
  /** Où il est, à l'instant présent — un corps orbite. */
  at: () => Vec3;
  /** Emprise RENDUE : c'est elle que le cadre de sélection entoure. */
  radius: number;
  /**
   * Emprise pour le seuil d'ÉTIQUETTE, volontairement distincte de la précédente : un nœud de
   * système garde une taille d'écran plancher, et son nom doit suivre ce qu'on VOIT.
   */
  labelExtent: number;
  /** Décalage vertical de l'étiquette, pour dégager un corps qui remplit l'écran. */
  lift?: number;
  /**
   * Ce que l'infobox affiche. Une FONCTION : au palier galaxie il y a jusqu'à cinq cents
   * candidats, et une seule cible est jamais construite.
   */
  target: () => MapTarget;
  /** La fiche qu'ouvre le bouton de l'infobox, quand ce n'est pas l'objet lui-même. */
  openId: string;
  /** Le double-clic descend-il dedans, ou se contente-t-il d'y voler ? */
  descendable: boolean;
}

export function place(local: Focus, position: Vec3, scale: number): Placement {
  return { position, scale, local, scene: nestedFocus(local, position, scale) };
}

/**
 * L'objet désigné, quand c'est exactement ce dans quoi le palier courant peut descendre
 * (chantier 38).
 *
 * C'est la moitié de l'invariant « la sélection est l'ancre » : sélectionner un objet d'un
 * autre palier, ou un objet du système qui n'a rien sous lui — comptoir, ceinture, site, dont
 * `anchorPathOf` ne rend aucun chemin — ne vise rien. Il n'y a donc pas de cas particulier à
 * écrire pour eux : les trois comparaisons échouent, et la visée est nulle.
 */
export function slotIdFor(
  path: AnchorPath,
  tier: TierName,
  id: string | null,
): string | null {
  if (!id) return null;
  if (tier === "universe") return path.galaxyId === id ? id : null;
  if (tier === "galaxy") return path.systemId === id ? id : null;
  if (tier === "system") return path.bodyId === id ? id : null;
  // Dernier palier : il n'y a rien sous un corps.
  return null;
}

/**
 * Chemin matérialisé : l'ascendance jusqu'au palier courant, plus ce qui est visé dessous
 * (chantier 38).
 *
 * L'autre moitié de l'invariant, et la raison pour laquelle il tient. `anchors` porte deux
 * choses que le code confondait : l'**ascendance**, qui ne doit jamais avoir de trou — sans
 * elle `placements[tier]` est absent et le cadrage retombe sur celui de l'amas — et la
 * **visée**, le seul créneau sous le palier courant, qui peut parfaitement être nulle.
 *
 * Cette fonction efface toujours ce qui est sous la visée. Son aînée `anchorFrom` rendait le
 * chemin précédent inchangé quand l'identifiant ne changeait pas, donc avec le `systemId`
 * fantôme d'une visite antérieure : une couche montée que le joueur n'avait pas visée, et
 * dans laquelle il ne pouvait pas descendre.
 */
export function pathFor(
  ancestry: AnchorPath,
  tier: TierName,
  aimId: string | null,
): AnchorPath {
  if (tier === "universe")
    return { galaxyId: aimId, systemId: null, bodyId: null };
  if (tier === "galaxy")
    return { galaxyId: ancestry.galaxyId, systemId: aimId, bodyId: null };
  if (tier === "system")
    return {
      galaxyId: ancestry.galaxyId,
      systemId: ancestry.systemId,
      bodyId: aimId,
    };
  // Palier corps : l'ascendance est complète, il n'y a plus de créneau à remplir.
  return ancestry;
}

/** Palier le plus profond que décrit un chemin d'ancrage. */
export function deepestTier(path: AnchorPath): TierName {
  if (path.bodyId) return "body";
  if (path.systemId) return "system";
  if (path.galaxyId) return "galaxy";
  return "universe";
}

/**
 * Rayon de lecture commun aux objets manufacturés d'un système, en unités système.
 *
 * Comptoir, station, avant-poste et flotte se rendent entre 4 et 11 unités ; leur nom
 * apparaît au même moment plutôt qu'un par un, ce qui donne une carte qui se lit d'un coup
 * au lieu de se remplir par paliers arbitraires.
 */
export const FEATURE_RADIUS = 6;

/**
 * Étiquettes montées au plus, à un palier donné (chantier 37.7).
 *
 * Chaque étiquette est un sprite et une texture rasterisée à la demande. Le seuil de taille
 * apparente en cache la plupart, mais il les monte quand même : à cinq cents systèmes par
 * galaxie, le coût était payé cinq cents fois pour une dizaine de noms visibles.
 */
export const LABEL_BUDGET = 60;

/** Compose une translation locale avec le placement de son parent. */
export function under(parent: Placement, local: Vec3): Vec3 {
  return [
    parent.position[0] + local[0] * parent.scale,
    parent.position[1] + local[1] * parent.scale,
    parent.position[2] + local[2] * parent.scale,
  ];
}

export interface Resolved {
  galaxy: Galaxy | null;
  system: StarSystem | null;
  body: Planet | null;
}

/** Chemin complet menant à un objet quelconque de l'univers. */
export function anchorPathOf(
  universe: ClientUniverse,
  id: string | null,
): AnchorPath {
  if (!id) return NO_ANCHOR;
  for (const galaxy of universe.galaxies) {
    if (galaxy.id === id) return { galaxyId: id, systemId: null, bodyId: null };
    for (const system of galaxy.systems) {
      if (system.id === id)
        return { galaxyId: galaxy.id, systemId: id, bodyId: null };
      for (const planet of system.planets) {
        if (planet.id === id)
          return { galaxyId: galaxy.id, systemId: system.id, bodyId: id };
      }
    }
  }
  return NO_ANCHOR;
}

/** Résout un chemin d'ancrage en entités, en s'arrêtant au premier maillon manquant. */
export function resolveAnchor(
  universe: ClientUniverse,
  path: AnchorPath,
): Resolved {
  const galaxy = universe.galaxies.find((g) => g.id === path.galaxyId) ?? null;
  const system =
    (galaxy && galaxy.systems.find((s) => s.id === path.systemId)) || null;
  const body =
    (system && system.planets.find((p) => p.id === path.bodyId)) || null;
  return { galaxy, system, body };
}

/**
 * Placements cumulés de tous les paliers ancrés.
 *
 * Extrait en fonction pure parce que trois appelants en ont besoin à des instants
 * différents : le rendu, la restauration depuis l'URL, et le saut déclenché par un
 * double-clic — ces deux derniers agissant sur une ancre que l'état React ne porte pas
 * encore.
 */
export function computePlacements(
  universe: ClientUniverse,
  resolved: Resolved,
  sites: readonly SystemSite[],
  tick: number,
): Placements {
  const out: Placements = {};
  out.universe = place(universeFocus(universe), [0, 0, 0], 1);

  const { galaxy, system, body } = resolved;
  if (galaxy) {
    out.galaxy = place(
      galaxyFocus(galaxy),
      galaxyScenePosition(galaxy),
      galaxyContentScale(galaxy),
    );
  }
  if (out.galaxy && system) {
    const local = systemFocus(
      system,
      sites.filter((s) => s.systemId === system.id),
    );
    out.system = place(
      local,
      under(out.galaxy, systemScenePosition(system)),
      out.galaxy.scale * nestingScale(SYSTEM_NODE, local.radius),
    );
  }
  if (out.system && system && body) {
    // Le palier corps ne change pas d'échelle : il vit dans les coordonnées de son
    // système. Ce qui le distingue du palier au-dessus n'est pas la taille de ce qu'il
    // montre — identique de part et d'autre, ce qui rend le franchissement invisible —
    // mais le détail qu'on ajoute une fois assez près pour le voir.
    out.body = place(
      bodyFocus(system, body),
      under(out.system, bodyLocalPosition(system, body, tick)),
      out.system.scale,
    );
  }
  return out;
}
