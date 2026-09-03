import { useFrame, useThree } from "@react-three/fiber";
import {
  TICK_MS,
  type Colony,
  type Fleet,
  type ForeignFleet,
  type ForeignStation,
  type Galaxy,
  type MiningOutpost,
  type Gateway,
  type Planet,
  type StarSystem,
  type Station,
  type SystemSite,
  type Territory,
  type ResourceId,
  type ClientUniverse,
  galacticCoreDisc,
  sitePosition,
  starClassOf,
  systemCountOf,
} from "@spacesim/shared";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from "react";
import { useTranslation } from "react-i18next";
import { resourceLabel } from "../labels.js";
import type { AmbientLight, Group, Vector3 } from "three";
import { BodyLayer, bodyFocus, moonsOf } from "./BodyLayer.js";
import { seedOf } from "./appearance.js";
import { nestedFocus, type Focus } from "./bounds.js";
import { FadingGroup } from "./FadingGroup.js";
import { MapInfobox, type MapTarget } from "./MapInfobox.js";
import {
  galaxyFocus,
  GalaxyLayer,
  SYSTEM_LABEL_EXTENT,
  SYSTEM_NODE,
  systemScenePosition,
} from "./GalaxyLayer.js";
import { fitDistance, MapCanvas } from "./MapCanvas.js";
import { MapLabels, type LabelItem } from "./MapLabels.js";
import { MapList } from "./MapList.js";
import { Picker } from "./Picker.js";
import { SelectionMark } from "./SelectionMark.js";
import {
  bodyLocalPosition,
  bodyLabelExtent,
  bodyRadiusOf,
  STAR_CORE,
  derivedOrbit,
  SystemLayer,
  systemExtent,
  systemFocus,
} from "./SystemLayer.js";
import { TierCamera } from "./TierCamera.js";
import {
  distanceForProgress,
  nestingScale,
  tierAt,
  tierIndex,
  TIER_ORDER,
  type TierName,
  type Vec3,
} from "./tiers.js";
import {
  GALAXY_DISC,
  galaxyContentScale,
  galaxyScenePosition,
  UniverseLayer,
  universeFocus,
} from "./UniverseLayer.js";

interface ControlsHandle {
  target: Vector3;
  update: () => void;
}

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
interface Placement {
  position: Vec3;
  scale: number;
  /** Cadrage du palier dans SON repère. */
  local: Focus;
  /** Le même, ramené aux unités de la scène. */
  scene: Focus;
}

type Placements = Partial<Record<TierName, Placement>>;

function place(local: Focus, position: Vec3, scale: number): Placement {
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
function deepestTier(path: AnchorPath): TierName {
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
const FEATURE_RADIUS = 6;

/**
 * Étiquettes montées au plus, à un palier donné (chantier 37.7).
 *
 * Chaque étiquette est un sprite et une texture rasterisée à la demande. Le seuil de taille
 * apparente en cache la plupart, mais il les monte quand même : à cinq cents systèmes par
 * galaxie, le coût était payé cinq cents fois pour une dizaine de noms visibles.
 */
const LABEL_BUDGET = 60;

/** Compose une translation locale avec le placement de son parent. */
function under(parent: Placement, local: Vec3): Vec3 {
  return [
    parent.position[0] + local[0] * parent.scale,
    parent.position[1] + local[1] * parent.scale,
    parent.position[2] + local[2] * parent.scale,
  ];
}

interface Resolved {
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

/**
 * Groupe dont la position se recalcule à chaque image.
 *
 * Nécessaire au seul palier corps : une planète orbite, donc la place de son voisinage
 * dans la scène change en continu. Passer par une prop React la ferait re-rendre soixante
 * fois par seconde — même geste qu'`OrbitingBody`, qui écrit sur son `group`.
 */
function MovingGroup({
  at,
  scale,
  children,
}: {
  at: () => Vec3;
  scale: number;
  children: ReactNode;
}) {
  const ref = useRef<Group>(null);
  useFrame(() => {
    const p = at();
    ref.current?.position.set(p[0], p[1], p[2]);
  });
  return (
    <group ref={ref} scale={scale}>
      {children}
    </group>
  );
}

/**
 * Éclairage piloté par la profondeur (chantier 35.3).
 *
 * Les deux registres visuels de l'ADR 0007 — schématique en haut, semi-réaliste dès le
 * système — étaient un booléen porté par `MapCanvas`. Sous un zoom continu, un booléen
 * produirait un saut de lumière au moment précis où le contenu du système devient
 * pleinement visible. L'ambiante s'interpole donc sur la bande galaxie → système, où la
 * ponctuelle de l'étoile prend le relais.
 */
function LightRig({ depthRef }: { depthRef: RefObject<number> }) {
  const ambient = useRef<AmbientLight>(null);
  const from = tierIndex("system") - 1;
  useFrame(() => {
    if (!ambient.current) return;
    const t = Math.min(1, Math.max(0, depthRef.current - from));
    ambient.current.intensity = 1 - 0.85 * t;
  });
  return <ambientLight ref={ambient} intensity={1} />;
}

interface JumpRequest {
  /**
   * Palier d'arrivée, posé en même temps que le cadrage.
   *
   * Un saut explicite peut traverser plusieurs bandes — « Ma capitale » vise un système
   * depuis l'univers. Laisser la caméra les redécouvrir une par une, à raison d'un
   * franchissement par image, faisait dépendre l'arrivée d'une course entre la boucle de
   * rendu et les rendus de React : la traversée s'arrêtait par intermittence au palier
   * intermédiaire. Un saut sait où il va ; il n'a pas à le redécouvrir.
   */
  tier: TierName;
  focus: Focus;
  /** Cadrage de l'enfant, quand la distance doit se poser DANS la bande. */
  child: Focus | null;
  /** Progression visée dans cette bande ; ignorée sans `child`. */
  progress: number;
}

/** Pool suspendu pendant un vol : une liste vide et stable, plutôt qu'un tableau par rendu. */
const NOTHING_TO_PICK: { id: string; at: () => Vec3; radius: number }[] = [];

/** Durée d'un vol vers une cible, en ms. */
const FLIGHT_MS = 620;

/**
 * Vol de caméra vers une cible (chantiers 35.2, 35.3 puis 35.6).
 *
 * Sert aux gestes explicites — double-clic, recherche, raccourci — et à la restauration de
 * la profondeur portée par l'URL. Le recadrage était sec ; il est désormais animé, et c'est
 * ce qui donne au double-clic le sens que le joueur en attend : on **descend** vers l'objet
 * en traversant les paliers, on n'y est pas téléporté.
 *
 * Sans `child`, on cadre la cible à 95 % de sa distance de cadrage : ce n'est pas un détail
 * esthétique, cela pose la progression juste au-delà de 1 et déclenche le franchissement.
 */
function CameraJump({
  request,
  onDone,
}: {
  request: JumpRequest;
  onDone: () => void;
}) {
  const camera = useThree((s) => s.camera);
  const controls = useThree((s) => s.controls) as ControlsHandle | null;
  const size = useThree((s) => s.size);
  // Lu par référence : un redimensionnement du canvas ne doit pas rejouer le vol et
  // reprendre au joueur la vue qu'il s'est donnée depuis.
  const measured = useRef(size);
  measured.current = size;

  const flight = useRef<{
    at: number;
    from: { target: Vec3; distance: number };
    to: { target: Vec3; distance: number };
    direction: Vec3;
  } | null>(null);

  useEffect(() => {
    if (!controls) return;
    const { width, height } = measured.current;
    const aspect = width / Math.max(1, height);
    const parent = fitDistance(request.focus, aspect);
    const distance =
      request.child && request.progress > 0
        ? distanceForProgress(
            parent,
            fitDistance(request.child, aspect),
            request.progress,
          )
        : parent * 0.95;

    // Direction de vue conservée : le joueur a peut-être tourné la caméra, un vol ne doit
    // pas lui reprendre son point de vue en même temps que sa position.
    const dx = camera.position.x - controls.target.x;
    const dy = camera.position.y - controls.target.y;
    const dz = camera.position.z - controls.target.z;
    const length = Math.hypot(dx, dy, dz) || 1;
    flight.current = {
      at: performance.now(),
      from: {
        target: [controls.target.x, controls.target.y, controls.target.z],
        distance: length,
      },
      to: { target: request.focus.center, distance },
      direction: [dx / length, dy / length, dz / length],
    };
  }, [request, camera, controls]);

  useFrame(() => {
    const flying = flight.current;
    if (!flying || !controls) return;
    const k = Math.min(1, (performance.now() - flying.at) / FLIGHT_MS);
    // Hermite : le vol démarre et s'arrête en douceur, il ne claque à aucun bout.
    const eased = k * k * (3 - 2 * k);

    const [tx, ty, tz] = flying.from.target;
    const [ux, uy, uz] = flying.to.target;
    const target: Vec3 = [
      tx + (ux - tx) * eased,
      ty + (uy - ty) * eased,
      tz + (uz - tz) * eased,
    ];
    // Distance interpolée **géométriquement**, pas linéairement : une carte dont les
    // paliers s'emboîtent par facteurs d'échelle se parcourt en octaves. Linéairement, le
    // vol traverserait toutes les bandes profondes dans les dernières images et l'arrivée
    // serait un à-coup.
    const distance =
      flying.from.distance *
      (flying.to.distance / flying.from.distance) ** eased;

    controls.target.set(target[0], target[1], target[2]);
    camera.position.set(
      target[0] + flying.direction[0] * distance,
      target[1] + flying.direction[1] * distance,
      target[2] + flying.direction[2] * distance,
    );
    controls.update();

    if (k >= 1) {
      flight.current = null;
      onDone();
    }
  });

  return null;
}

/** Intervalle minimal entre deux écritures d'URL, en ms. */
const PUBLISH_MS = 900;

/**
 * Publie la profondeur atteinte, sans réécrire l'URL à chaque image.
 *
 * La profondeur change soixante fois par seconde et l'URL est un état React : la publier
 * telle quelle re-rendrait tout l'arbre au même rythme. On la publie donc au repos, et
 * seulement quand elle a bougé assez pour valoir une entrée d'historique.
 */
function DepthPublisher({
  depthRef,
  publish,
}: {
  depthRef: RefObject<number>;
  publish: () => void;
}) {
  const last = useRef({ at: 0, depth: depthRef.current });
  useFrame(() => {
    const now = performance.now();
    if (now - last.current.at < PUBLISH_MS) return;
    const depth = depthRef.current;
    if (Math.abs(depth - last.current.depth) < 0.02) {
      last.current.at = now;
      return;
    }
    last.current = { at: now, depth };
    publish();
  });
  return null;
}

interface Props {
  universe: ClientUniverse;
  colonies: Colony[];
  gateways: Gateway[];
  stations: Station[];
  foreignStations: ForeignStation[];
  outposts: MiningOutpost[];
  fleets: Fleet[];
  foreignFleets: ForeignFleet[];
  sites: SystemSite[];
  exploredSystemIds: string[];
  claimedSystemIds: string[];
  territories: Territory[];
  /** Tick serveur courant et date du dernier tick : servent à interpoler les orbites. */
  tick: number;
  lastTickAt: number;
  /** Ancre portée par l'URL au montage (`?at=`), résolue en chemin complet. */
  routeAnchor: AnchorPath;
  /** Profondeur portée par l'URL au montage (`?z=`). */
  routeDepth: number | null;
  /** Saut demandé par la recherche ou un raccourci ; le jeton permet de le rejouer. */
  jumpTo: { id: string | null; token: number } | null;
  selectedId: string | null;
  onSelectGalaxy: (galaxy: Galaxy) => void;
  onSelectSystem: (system: StarSystem) => void;
  onSelectBody: (body: Planet) => void;
  /** Ouvre la fiche complète d'un objet — le double-clic vole ET ouvre. */
  onOpenFiche: (id: string) => void;
  /** Sélectionne un objet du système qui n'est ni galaxie, ni système, ni corps. */
  /**
   * Sélection par identifiant, quelle que soit la nature de l'objet.
   *
   * Les trois précédentes prennent une entité parce que la couche qui les appelle l'a déjà
   * sous la main. Celle-ci sert là où seul l'identifiant est connu : les objets d'un
   * système sans type propre (chantier 35.8), et la remontée de sélection au franchissement
   * (chantier 36.5), qui peut aussi n'avoir plus rien à sélectionner.
   */
  onSelectId: (id: string | null) => void;
  /** Clic dans le vide : referme l'infobox. */
  onClearSelection: () => void;
  /** Publie ce que la caméra vise et à quelle profondeur, pour que l'URL les suive. */
  onViewChange: (at: string | null, depth: number) => void;
}

/**
 * Carte à zoom continu (chantiers 35.2 et 35.3).
 *
 * Les quatre niveaux de carte étaient quatre scènes qui s'excluaient : changer de niveau
 * démontait un canvas pour en monter un autre, et la caméra claquait d'un cadrage à
 * l'autre. Ici il n'y a qu'un canvas, et deux paliers voisins **coexistent** le temps
 * d'une transition — le contenu d'un système est déjà dessiné, réduit à la taille du nœud
 * qui le représentait, avant que la galaxie ne cesse de l'être.
 *
 * Les placements sont cumulés depuis la racine et appliqués à plat : chaque couche vit
 * dans un `<group position scale>` frère des autres, jamais imbriqué. Démonter un palier
 * ne déplace donc rien de ce qui reste à l'écran, et c'est ce qui rend le franchissement
 * invisible — sans avoir à rebaser la caméra.
 */
export function MapScene({
  universe,
  colonies,
  gateways,
  stations,
  foreignStations,
  outposts,
  fleets,
  foreignFleets,
  sites,
  exploredSystemIds,
  claimedSystemIds,
  territories,
  tick,
  lastTickAt,
  routeAnchor,
  routeDepth,
  jumpTo,
  selectedId,
  onSelectGalaxy,
  onSelectSystem,
  onSelectBody,
  onOpenFiche,
  onSelectId,
  onClearSelection,
  onViewChange,
}: Props) {
  const { t } = useTranslation();
  /** Partagé avec `TierCamera`, qui vit dans le canvas et doit écrire sur la section. */
  const hostRef = useRef<HTMLElement>(null);
  /**
   * Le picking tolérant, publié depuis l'intérieur du canvas (chantier 40).
   *
   * `onPointerMissed` est une prop de `<Canvas>`, donc posée d'ici, où il n'y a ni caméra ni
   * cadre. `Picker` vit dedans et a les deux : il dépose sa fonction ici.
   */
  const pick = useRef<((event: MouseEvent) => void) | null>(null);
  /** Surcouche DOM des infobox : hors du conteneur `aria-hidden` de R3F. */
  const overlayRef = useRef<HTMLDivElement>(null);
  const depthRef = useRef(routeDepth ?? 0);

  /**
   * Ascendance : le chemin matérialisé jusqu'au palier courant (chantier 38).
   *
   * Ses seuls écrivains sont le franchissement descendant, le saut externe et le double-clic.
   * Le créneau de visée, lui, n'est écrit par personne : il est lu de `selectedId`.
   */
  const [ancestry, setAncestry] = useState<AnchorPath>(routeAnchor);
  const [tier, setTier] = useState<TierName>(() =>
    tierAt(routeDepth ?? 0) === "universe" && routeAnchor.galaxyId
      ? // L'URL peut porter une ancre sans profondeur (lien ancien, saut direct) : on se
        // pose alors au palier le plus profond que l'ancre décrit.
        routeAnchor.bodyId
        ? "body"
        : routeAnchor.systemId
          ? "system"
          : "galaxy"
      : tierAt(routeDepth ?? 0),
  );
  const [childMounted, setChildMounted] = useState(tier !== "universe");
  const [jump, setJump] = useState<JumpRequest | null>(null);

  // Tick fractionnaire : le serveur n'avance que par pas de TICK_MS, l'écran par image.
  const tickAt = useMemo(
    () => () => tick + Math.max(0, (Date.now() - lastTickAt) / TICK_MS),
    [tick, lastTickAt],
  );

  /**
   * Chemin complet de l'objet sélectionné. Mémoïsé : `anchorPathOf` balaye galaxies,
   * systèmes et corps, et une galaxie en compte jusqu'à cinq cents (ADR 0018).
   */
  const selectedPath = useMemo(
    () => anchorPathOf(universe, selectedId),
    [universe, selectedId],
  );
  /** Ce que la sélection désigne, s'il y a lieu — voir `slotIdFor`. */
  const selectedAim = slotIdFor(selectedPath, tier, selectedId);

  /**
   * Visée retenue le temps d'une descente engagée (chantier 38).
   *
   * Effacer la sélection referme l'infobox — un clic dans le vide, une touche Échap. Mais la
   * sélection EST la visée : sans ce garde, l'effacer en pleine descente viderait le créneau
   * enfant, `placements` perdrait cette couche et elle se démonterait sous les yeux du joueur,
   * au milieu du fondu qui la faisait apparaître.
   *
   * Une descente entamée ne s'annule donc qu'en reculant, ce qui est le geste qui la défait.
   * Le garde se libère tout seul : sortir de la bande démonte l'enfant, et remet la mémoire
   * à zéro.
   */
  const [engaged, setEngaged] = useState<string | null>(null);
  const aimId = selectedAim ?? (childMounted ? engaged : null);

  /**
   * Le chemin matérialisé : l'ascendance jusqu'au palier courant, plus la visée dessous.
   *
   * Pendant un vol, c'est l'ascendance NUE. Un vol pose sa destination dans l'ascendance mais
   * n'atteint son palier qu'à l'arrivée : `tier` décrit encore l'origine, et `pathFor`
   * effacerait tout ce qui se trouve sous ce palier-là — c'est-à-dire précisément ce vers
   * quoi on vole. Les couches intermédiaires disparaîtraient, `childFocus` tomberait à `null`,
   * et la borne de dolly, privée de bande, rappellerait la caméra vers le palier de départ
   * pendant que le vol l'emmène : « Ma capitale » n'atteignait plus le système.
   */
  const anchors = useMemo(
    () => (jump ? ancestry : pathFor(ancestry, tier, aimId)),
    [jump, ancestry, tier, aimId],
  );

  useEffect(() => {
    if (selectedAim) setEngaged(selectedAim);
    else if (!childMounted) setEngaged(null);
  }, [selectedAim, childMounted]);

  const resolved = useMemo(
    () => resolveAnchor(universe, anchors),
    [universe, anchors],
  );
  const { galaxy, system, body } = resolved;

  const systemSites = useMemo(
    () => (system ? sites.filter((s) => s.systemId === system.id) : []),
    [sites, system],
  );

  /**
   * Les placements ne se recalculent qu'au changement d'ancre, jamais au tick : la
   * position instantanée du corps est reprise par image dans `MovingGroup`, et la faire
   * passer par React la rendrait saccadée au rythme du serveur.
   */
  const placements = useMemo(
    () => computePlacements(universe, resolved, sites, tick),
    // `tick` est volontairement hors dépendances — seule la géométrie stable des paliers
    // est mémoïsée ici.
    [universe, resolved, sites],
  );

  /** Position de scène du voisinage du corps ancré, à l'instant présent. */
  const bodyAt = useMemo(() => {
    const s = placements.system;
    if (!s || !system || !body) return null;
    return (): Vec3 => under(s, bodyLocalPosition(system, body, tickAt()));
  }, [placements.system, system, body, tickAt]);

  /**
   * Ce que le système contient en plus de ses corps : comptoir, stations, avant-postes,
   * ceintures, sites de scan (chantier 35.8).
   *
   * Construit ici et non dans la couche 3D parce que **les deux** en ont besoin : la scène
   * pour les dessiner, la liste DOM pour les nommer. Aucun n etait nomme nulle part, et
   * ceintures et sites n avaient meme pas de gestionnaire de clic.
   */
  const features = useMemo(() => {
    const out: {
      id: string;
      name: string;
      detail: string;
      at: () => Vec3;
      openId: string;
    }[] = [];

    /**
     * Cœur galactique (chantier 39) : le seul objet nommé du palier galaxie qui ne soit pas
     * un système. Il entre ici et non par un septième type parce que `selection`,
     * `pickFromList` et `openSelection` consultent déjà cette liste SANS regarder le palier —
     * l'infobox, le vol de caméra et l'ouverture de fiche lui viennent donc sans une ligne.
     *
     * Le gate sur le palier n'est pas cosmétique : `placements.galaxy` existe aussi au palier
     * univers, où la couche galaxie est montée en enfant, et le cœur apparaîtrait alors dans
     * la liste des galaxies.
     *
     * `placements.galaxy.position` EST le centre de la galaxie, pas un point voisin : c'est
     * `galaxyScenePosition`, ce que dit déjà le commentaire de `aim`.
     */
    if (tier === "galaxy" && galaxy && placements.galaxy) {
      const at = placements.galaxy.position;
      out.push({
        id: `${galaxy.id}:core`,
        name: t("mapInfobox.galacticCoreName", { galaxy: galaxy.name }),
        detail: t("mapInfobox.galacticCore"),
        at: () => at,
        // Un trou noir n'a pas de fiche propre : c'est celle de sa galaxie qui la porte.
        openId: galaxy.id,
      });
    }

    const post = system?.station;
    if (!system || !placements.system) return out;
    const parent = placements.system;
    const extent = systemExtent(system, systemSites);

    if (post)
      out.push({
        id: post.id,
        name: post.name,
        detail: t("mapInfobox.tradingPost"),
        at: () => under(parent, derivedOrbit(post.id, extent)),
        openId: system.id,
      });

    const orbiting = (bodyId: string) => {
      const body = system.planets.find((p) => p.id === bodyId);
      if (!body) return null;
      const offset = bodyRadiusOf(body) * 2.2;
      return (): Vec3 => {
        const [x, y, z] = bodyLocalPosition(system, body, tickAt());
        return under(parent, [x + offset, y + offset * 0.35, z]);
      };
    };

    for (const station of stations.filter((x) => x.systemId === system.id)) {
      const at = orbiting(station.bodyId);
      if (at)
        out.push({
          id: station.id,
          name: station.name,
          detail: t("mapInfobox.station"),
          at,
          openId: system.id,
        });
    }
    for (const station of foreignStations.filter(
      (x) => x.systemId === system.id,
    )) {
      const at = orbiting(station.bodyId);
      if (at)
        out.push({
          id: station.id,
          name: station.name,
          detail: t("mapInfobox.foreignStation", { owner: station.ownerName }),
          at,
          openId: system.id,
        });
    }
    for (const belt of system.belts) {
      const mined = outposts.some((o) => o.beltId === belt.id);
      const angle = seedOf(`${belt.id}:label`) * Math.PI * 2;
      const at = under(parent, [
        Math.cos(angle) * belt.orbitRadius,
        Math.sin(angle) * belt.orbitRadius,
        0,
      ]);
      out.push({
        id: belt.id,
        name: belt.name,
        detail: mined
          ? t("mapInfobox.beltMined")
          : t("mapInfobox.belt", {
              list:
                Object.keys(belt.deposits)
                  .map((r) => resourceLabel(r as ResourceId))
                  .join(" · ") || t("bodyView.noDeposits"),
            }),
        at: () => at,
        openId: system.id,
      });
    }
    for (const site of systemSites) {
      const p = sitePosition(site);
      const at = under(parent, [p.x, p.y, p.z]);
      out.push({
        id: site.id,
        name: t(`systemPanel.siteKind.${site.kind}`),
        detail: t("systemPanel.siteOrbit", {
          radius: Math.round(site.orbitRadius),
        }),
        at: () => at,
        openId: system.id,
      });
    }
    return out;
  }, [
    tier,
    galaxy,
    placements.galaxy,
    system,
    systemSites,
    placements.system,
    stations,
    foreignStations,
    outposts,
    tickAt,
    t,
  ]);

  const index = tierIndex(tier);
  const current = placements[tier] ?? placements.universe!;
  const childTier = TIER_ORDER[index + 1] ?? null;
  const child = childTier ? (placements[childTier] ?? null) : null;

  /** Une couche est rendue si elle est le palier courant, ou son enfant déjà monté. */
  const shows = (name: TierName) => {
    const k = tierIndex(name);
    if (k === index) return true;
    return k === index + 1 && childMounted && placements[name] !== undefined;
  };
  const showsBody = shows("body");

  /**
   * Corps repris en charge par le palier corps. Sans cela le même corps serait dessiné
   * deux fois, à la même place et à la même taille — deux surfaces coplanaires que le
   * tampon de profondeur départage au hasard, d'une image à l'autre.
   */
  const takenOver = useMemo(() => {
    if (!showsBody || !system || !body) return new Set<string>();
    return new Set([body.id, ...moonsOf(system, body).map((m) => m.id)]);
  }, [showsBody, system, body]);

  /**
   * Objets à nommer sur la carte (chantier 36.3).
   *
   * **Le palier courant seulement.** Ceux de l'enfant seraient tous sous le seuil de taille
   * apparente jusqu'au franchissement — mesuré : une planète dans un système qui remplit
   * tout juste le cadre vaut 0,011, sous les 0,013 requis. Les monter d'avance coûterait
   * des sprites que personne ne voit, et obligerait la résolution du clic à traiter deux
   * paliers à la fois.
   */
  const labelItems = useMemo((): LabelItem[] => {
    const out: LabelItem[] = [];

    if (tier === "universe") {
      for (const g of universe.galaxies) {
        const at = galaxyScenePosition(g);
        out.push({
          id: g.id,
          text: g.name,
          tier,
          at: () => at,
          radius: GALAXY_DISC,
        });
      }
      return out;
    }

    if (tier === "galaxy" && galaxy && placements.galaxy) {
      const parent = placements.galaxy;
      // Les plus proches du centre de la galaxie d'abord, puis coupe au budget. Le seuil de
      // taille apparente (`LABEL_MIN`) masque déjà l'immense majorité de ces noms, mais il
      // ne les empêche pas d'être MONTÉS : à cinq cents systèmes, cela faisait cinq cents
      // sprites et autant de textures rasterisées pour une poignée de noms lisibles.
      const centered = galaxy.systems
        .map((s) => ({ system: s, at: under(parent, systemScenePosition(s)) }))
        .sort(
          (a, b) =>
            Math.hypot(
              a.at[0] - parent.position[0],
              a.at[1] - parent.position[1],
              a.at[2] - parent.position[2],
            ) -
            Math.hypot(
              b.at[0] - parent.position[0],
              b.at[1] - parent.position[1],
              b.at[2] - parent.position[2],
            ),
        )
        .slice(0, LABEL_BUDGET);
      for (const { system: s, at } of centered) {
        out.push({
          id: s.id,
          text: s.name,
          tier,
          at: () => at,
          radius: SYSTEM_LABEL_EXTENT * parent.scale,
        });
      }
      // Le cœur, hors budget : il est seul, et son emprise est de deux ordres au-dessus de
      // celle d'un système — il se nomme donc bien avant que le premier nom de système
      // n'atteigne son seuil.
      for (const f of features)
        out.push({
          id: f.id,
          text: f.name,
          tier,
          at: f.at,
          radius: galacticCoreDisc(systemCountOf(galaxy)) * parent.scale,
        });
      return out;
    }

    const parent = placements.system;
    if (!system || !parent) return out;

    // Au palier corps, seuls le corps ancré et ses lunes sont nommés : le reste du système
    // est hors du cadre. Le palier corps ne change pas d'échelle, ses objets se situent
    // dans les mêmes coordonnées qu'au palier système.
    const bodies =
      tier === "body" && body
        ? [body, ...moonsOf(system, body)]
        : system.planets;

    for (const p of bodies) {
      out.push({
        id: p.id,
        text: p.name,
        tier,
        at: () => under(parent, bodyLocalPosition(system, p, tickAt())),
        radius: bodyLabelExtent(p) * parent.scale,
        lift: bodyRadiusOf(p) * parent.scale,
      });
    }

    if (tier === "system")
      for (const f of features)
        out.push({
          id: f.id,
          text: f.name,
          tier,
          at: f.at,
          // Les objets manufacturés vont de 4 à 11 unités système selon leur nature : un
          // rayon commun suffit à décider d'un seuil d'affichage, et évite de faire
          // remonter une taille de rendu jusqu'ici.
          radius: FEATURE_RADIUS * parent.scale,
        });

    return out;
  }, [
    tier,
    universe,
    galaxy,
    system,
    body,
    placements.galaxy,
    placements.system,
    features,
    tickAt,
  ]);

  /**
   * Cadrage initial du canvas. Figé au montage, et surtout pas recalculé : `FitCamera` se
   * rejoue dès que la valeur change, et le rejouer à chaque franchissement annulerait la
   * traversée qu'on vient de faire.
   */
  const [initialFocus] = useState<Focus>(() => current.scene);

  /** Restauration de la profondeur portée par l'URL, une seule fois au montage. */
  const restored = useRef(false);
  useEffect(() => {
    if (restored.current) return;
    restored.current = true;
    const fraction = (routeDepth ?? 0) % 1;
    if (fraction <= 0.02 || !child) return;
    setJump({
      tier,
      focus: current.scene,
      child: child.scene,
      progress: fraction,
    });
    // Dépendances volontairement vides : au montage seulement. Rejouer cette restauration
    // reprendrait au joueur la vue qu'il s'est donnée depuis.
  }, []);

  /**
   * Ce que l'URL doit nommer : l'objet dans lequel la caméra **est**, pas celui qu'elle a
   * élu plus bas.
   *
   * Publier l'ancre la plus profonde faisait dire à `?at=` « cette planète » alors que la
   * vue était encore celle du système — la fraction de `?z=` décrit déjà la descente en
   * cours. Au palier univers, tant que rien n'est engagé, l'ancre n'est que « la galaxie la
   * plus proche du centre de l'écran » : aucune intention, rien à mettre dans la barre
   * d'adresse.
   */
  const publishable =
    tier === "body"
      ? anchors.bodyId
      : tier === "system"
        ? anchors.systemId
        : tier === "galaxy"
          ? anchors.galaxyId
          : childMounted
            ? anchors.galaxyId
            : null;

  /**
   * Profondeur publiable, jamais en deçà du palier courant.
   *
   * `depthRef` est écrit par la boucle de rendu, `tier` par React : au moment où une ancre
   * change, la profondeur peut encore décrire le palier d'avant. L'URL portait alors un
   * `z` d'un palier plus haut que le `at` qui l'accompagnait, et un rechargement rouvrait
   * la carte au-dessus de ce qu'elle visait.
   */
  const publishableDepth = useCallback(
    () => Math.max(depthRef.current, tierIndex(tier)),
    [tier],
  );

  useEffect(() => {
    // Rien tant qu'un vol est en cours : la caméra est encore au palier de départ, et
    // publier de là effaçait l'ancre que le geste venait tout juste d'écrire dans l'URL.
    if (jump) return;
    onViewChange(publishable, publishableDepth());
  }, [jump, publishable, publishableDepth, onViewChange]);

  /**
   * Saut demandé de l'extérieur : recherche, raccourci de `MapNav`.
   *
   * Piloté par un **jeton explicite** et non par la lecture de l'URL. L'URL est écrite par
   * la carte elle-même à mesure qu'elle bouge ; la relire pour y détecter une navigation
   * faisait boucler les deux sens l'un sur l'autre — la carte publiait son ancre, se
   * relisait, croyait qu'on l'avait envoyée ailleurs, et sautait. Au chargement elle
   * descendait ainsi toute seule jusqu'à un système ; à la molette, chaque changement
   * d'ancre la ramenait au cadrage de la galaxie et le dézoom devenait impossible.
   */
  const jumped = useRef(0);
  useEffect(() => {
    if (!jumpTo || jumpTo.token === jumped.current) return;
    jumped.current = jumpTo.token;
    const { universe: u, sites: st, tick: tk } = world.current;
    const path = anchorPathOf(u, jumpTo.id);
    const next = computePlacements(u, resolveAnchor(u, path), st, tk);
    const target = path.bodyId
      ? next.body
      : path.systemId
        ? next.system
        : path.galaxyId
          ? next.galaxy
          : next.universe;
    onSelectId(jumpTo.id);
    setAncestry(path);
    if (target)
      setJump({
        tier: deepestTier(path),
        focus: target.scene,
        child: null,
        progress: 0,
      });
    // Ne dépend QUE du jeton. L'univers, les sites et le tick sont lus par référence :
    // les deux derniers changent d'identité à chaque tick serveur, et les avoir en
    // dépendances rejouait le saut toutes les cinq secondes — ce qui ramenait l'ancre au
    // système visé et effaçait le corps dans lequel on venait de descendre.
  }, [jumpTo]);

  /** Appartenances, utilisées par la couche 3D ET par la liste DOM. */
  const colonizedGalaxyIds = useMemo(() => {
    const ids = new Set<string>();
    for (const g of universe.galaxies) {
      if (
        g.systems.some((s) =>
          s.planets.some((p) => colonies.some((c) => c.planetId === p.id)),
        )
      )
        ids.add(g.id);
    }
    return ids;
  }, [universe, colonies]);

  const colonizedSystemIds = useMemo(() => {
    const ids = new Set<string>();
    for (const s of galaxy?.systems ?? []) {
      if (s.planets.some((p) => colonies.some((c) => c.planetId === p.id)))
        ids.add(s.id);
    }
    return ids;
  }, [galaxy, colonies]);

  const explored = useMemo(
    () => new Set(exploredSystemIds),
    [exploredSystemIds],
  );

  /** Monde courant, lu par référence par les effets qui ne doivent pas rejouer au tick. */
  const world = useRef({ universe, sites, tick });
  world.current = { universe, sites, tick };

  /**
   * Tout ce qui se sélectionne au palier courant (chantier 40).
   *
   * Ce fut d'abord la liste des seuls candidats à l'ancrage — galaxies, systèmes, planètes,
   * de quoi savoir dans quoi descendre. Elle sert maintenant à désigner, donc elle doit
   * contenir **tout ce qu'on peut vouloir montrer du doigt** : les lunes, et tout le
   * manufacturé du système, qui n'a aucun gestionnaire de clic dans la scène et n'était
   * atteignable que par son étiquette ou par la liste DOM.
   *
   * La position est une **fonction** et non un point : un corps orbite, et un pool figé au
   * dernier tick désignerait une place que la planète a quittée.
   */
  const selectables = useMemo(() => {
    const out: { id: string; at: () => Vec3; radius: number }[] = [];
    if (tier === "universe") {
      for (const g of universe.galaxies) {
        const at = galaxyScenePosition(g);
        out.push({ id: g.id, at: () => at, radius: GALAXY_DISC });
      }
      return out;
    }
    const g = placements.galaxy;
    if (tier === "galaxy" && g && galaxy) {
      for (const s of galaxy.systems) {
        const at = under(g, systemScenePosition(s));
        out.push({ id: s.id, at: () => at, radius: SYSTEM_NODE * g.scale });
      }
      return out;
    }
    const s = placements.system;
    if (!system || !s) return out;
    // Au palier corps, seuls le corps ancé et ses lunes sont à l'écran.
    const bodies =
      tier === "body" && body
        ? [body, ...moonsOf(system, body)]
        : system.planets;
    for (const p of bodies)
      out.push({
        id: p.id,
        at: () => under(s, bodyLocalPosition(system, p, tickAt())),
        radius: bodyRadiusOf(p) * s.scale,
      });
    for (const f of features)
      out.push({ id: f.id, at: f.at, radius: FEATURE_RADIUS * s.scale });
    return out;
  }, [tier, universe, galaxy, system, body, placements, tickAt, features]);

  /**
   * Franchissement de palier, demandé par la caméra.
   *
   * Les effets sont **hors de tout updater** : `onCross` est appelé depuis la boucle
   * d'images, qui voit toujours les props du dernier rendu, si bien que `tier`, `ancestry` et
   * `aimId` sont ici les valeurs courantes. Ils vivaient dans un `setTier(from => …)`, ce
   * qu'un updater ne doit pas porter — il doit être pur, et StrictMode l'invoque deux fois.
   */
  const cross = (delta: 1 | -1) => {
    // Jamais pendant un vol. Un vol traverse des paliers en chemin — c'est même ce qu'on lui
    // demande — et il pose lui-même le palier d'arrivée, qu'il connaît. Le laisser franchir
    // en passant était sans conséquence tant que `cross` ne touchait qu'au palier ; depuis
    // qu'il écrit l'ascendance, un franchissement parasite au palier univers y remet
    // `systemId` à zéro, et « Ma capitale » atterrissait au palier système sans système.
    if (jump) return;
    const next = TIER_ORDER[tierIndex(tier) + delta];
    if (!next) return;
    if (delta === 1) {
      // On ne descend que dans quelque chose : sans placement, il n'y a rien à cadrer.
      if (!placements[next]) return;
      // L'ascendance absorbe la visée. Le palier atteint repart sans visée : la sélection
      // décrit désormais l'objet dans lequel on vient d'entrer, et le prochain cran élira.
      setAncestry(pathFor(ancestry, tier, aimId));
    } else {
      // En remontant, la sélection devient ce qu'on vient de quitter (chantier 36.5, repris
      // au 38). Ce n'est pas seulement que l'infobox décrirait sinon un objet devenu
      // invisible : sans visée au palier atteint, le créneau enfant serait vide,
      // `placements` perdrait cette couche, et elle se démonterait à l'instant précis où
      // le parent est encore à opacité nulle — une image noire à chaque remontée.
      onSelectId(
        tier === "body"
          ? ancestry.bodyId
          : tier === "system"
            ? ancestry.systemId
            : ancestry.galaxyId,
      );
    }
    setTier(next);
  };

  /**
   * Vol jusqu'à un objet (chantiers 36.5 puis 38).
   *
   * Il ouvrait aussi la fiche depuis le chantier 35.6, ce qui rendait la modale bloquante
   * après chaque descente : impossible d'enchaîner les double-clics pour traverser sans
   * appuyer sur Échap entre deux. La fiche s'obtient désormais par le bouton de l'infobox,
   * ou par `?open=` dans l'URL.
   *
   * Il **sélectionne** avant de voler : c'est ce qu'un double-clic veut dire, et c'est ce
   * qui rend le premier de ses deux clics inoffensif. Il fallait autrefois retarder tout clic
   * simple d'un quart de seconde pour que celui-là n'ouvre pas une infobox que le vol allait
   * remplacer ; la boîte décrit désormais la cible du vol, et le suit.
   */
  const dive = (name: TierName, id: string) => {
    const path = pathFor(ancestry, name, id);
    const next = computePlacements(
      universe,
      resolveAnchor(universe, path),
      sites,
      tick,
    );
    const arrival = TIER_ORDER[tierIndex(name) + 1] ?? "universe";
    const target = next[arrival];
    onSelectId(id);
    setAncestry(path);
    if (target)
      setJump({ tier: arrival, focus: target.scene, child: null, progress: 0 });
  };

  /**
   * Vol de recentrage sur un objet qui n'a pas de palier sous lui (chantier 36.5).
   *
   * Comptoir, station, avant-poste, ceinture, site : rien ne se trouve « sous » eux, il n'y
   * a donc nulle part où descendre. Le double-clic les ramène quand même au centre — depuis
   * que la vue n'est plus libre, c'est le seul geste qui déplace la cible de la caméra.
   */
  const flyToFeature = (id: string, at: Vec3) => {
    onSelectId(id);
    // Assez large pour que l'objet ne remplisse pas le cadre : on vient le regarder, pas
    // s'y coller.
    const radius = FEATURE_RADIUS * (placements.system?.scale ?? 1) * 8;
    setJump({
      tier,
      focus: {
        id,
        center: [at[0], at[1], at[2]],
        radius,
        half: [radius, radius, radius],
      },
      child: null,
      progress: 0,
    });
  };

  const publish = useCallback(
    () => onViewChange(publishable, publishableDepth()),
    [publishable, publishableDepth, onViewChange],
  );

  /**
   * Nombre d'étiquettes lisibles, publié sur l'hôte (chantier 36.3).
   *
   * Un sprite ne laisse rien dans le DOM, pas plus que la caméra : c'est le seul point
   * depuis lequel un test peut affirmer qu'un nom est apparu. Même geste que
   * `data-map-tier` et `data-map-depth`, et écrit depuis la même horloge — la boucle
   * d'images.
   */
  const publishLabelCount = useCallback((count: number) => {
    hostRef.current?.setAttribute("data-map-labels", String(count));
  }, []);

  /**
   * Objet sélectionné : sa nature, et la position de scène où poser son infobox.
   *
   * La position est une fonction et non une valeur : un corps orbite, et son infobox doit
   * le suivre plutôt que rester où il était au moment du clic.
   */
  const selection = useMemo((): {
    target: MapTarget;
    at: () => Vec3;
  } | null => {
    if (!selectedId) return null;
    const feature = features.find((f) => f.id === selectedId);
    if (feature)
      return {
        target: {
          kind: "feature" as const,
          name: feature.name,
          detail: feature.detail,
        },
        at: feature.at,
      };
    const path = selectedPath;

    if (path.bodyId === selectedId && system && placements.system) {
      if (path.systemId !== system.id) return null;
      const picked = system.planets.find((p) => p.id === selectedId);
      if (!picked) return null;
      const parent = placements.system;
      return {
        target: {
          kind: "body",
          body: picked,
          moons: moonsOf(system, picked).length,
        },
        at: () => under(parent, bodyLocalPosition(system, picked, tickAt())),
      };
    }

    if (path.systemId === selectedId && galaxy && placements.galaxy) {
      if (path.galaxyId !== galaxy.id) return null;
      const picked = galaxy.systems.find((sys) => sys.id === selectedId);
      if (!picked) return null;
      const parent = placements.galaxy;
      const at = under(parent, systemScenePosition(picked));
      return {
        target: {
          kind: "system",
          system: picked,
          explored: explored.has(picked.id),
          colonized: colonizedSystemIds.has(picked.id),
          starClass: starClassOf(picked),
        },
        at: () => at,
      };
    }

    if (path.galaxyId === selectedId) {
      const picked = universe.galaxies.find((g) => g.id === selectedId);
      if (!picked) return null;
      const at = galaxyScenePosition(picked);
      return {
        target: {
          kind: "galaxy",
          galaxy: picked,
          colonized: colonizedGalaxyIds.has(picked.id),
        },
        at: () => at,
      };
    }
    return null;
  }, [
    selectedId,
    selectedPath,
    universe,
    galaxy,
    system,
    placements,
    tickAt,
    explored,
    colonizedSystemIds,
    colonizedGalaxyIds,
    features,
  ]);

  /**
   * Où la caméra doit converger (chantier 38).
   *
   * C'est **la fonction qui place déjà l'infobox**, et pas une seconde expression de la même
   * position. Élection et recentrage visaient jusqu'ici deux points différents : les candidats
   * donnaient l'origine d'une galaxie, le recentrage le centre de la boîte englobante de ses
   * systèmes. La cible glissait donc vers un point d'où l'élection désignait parfois une autre
   * galaxie — une des sources du ballotage. Ce n'est plus une coïncidence à maintenir, c'est
   * le même appel, et la boîte est posée là où la caméra arrive.
   *
   * Le point visé d'une galaxie est donc `galaxyScenePosition`, et c'est bien son centre :
   * depuis le chantier 37 une galaxie s'organise **autour de** (`MAP_WIDTH / 2`,
   * `MAP_HEIGHT / 2`), ce que `constants.ts` nomme expressément comme la propriété qui garde
   * intact le recentrage du client.
   */
  const aim = useMemo(
    () => (aimId && selection ? selection.at : null),
    [aimId, selection],
  );

  /**
   * L'objet sélectionné, parmi ceux qui sont à l'écran au palier courant.
   *
   * Distinct de `selection`, qui décrit ce que l'infobox affiche : le cadre, lui, ne se pose
   * que sur un objet effectivement rendu ici.
   */
  const marked = useMemo(
    () =>
      selectedId ? selectables.find((s) => s.id === selectedId) : undefined,
    [selectedId, selectables],
  );

  const openSelection = () => {
    if (!selectedId) return;
    // Un comptoir ou une ceinture n a pas de fiche propre : c est celle de son systeme qui
    // porte le marche, le scan et la revendication.
    onOpenFiche(
      features.find((f) => f.id === selectedId)?.openId ?? selectedId,
    );
  };

  const label =
    tier === "body" && body
      ? t("bodyView.schemaAriaLabel", { name: body.name })
      : tier === "system" && system
        ? t("systemView.ariaLabel", { name: system.name })
        : tier === "galaxy" && galaxy
          ? t("galaxyMap.ariaLabel", { name: galaxy.name })
          : t("universeMap.ariaLabel");

  const bodyEntry = (b: Planet) => ({
    id: b.id,
    label: b.name,
    detail:
      b.kind === "moon"
        ? t("systemView.moon")
        : t("systemView.habitability", { value: b.habitability }),
    selected: b.id === selectedId,
  });

  const entries =
    tier === "body" && system && body
      ? [body, ...moonsOf(system, body)].map(bodyEntry)
      : tier === "system" && system
        ? [
            ...system.planets.map(bodyEntry),
            ...features.map((f) => ({
              id: f.id,
              label: f.name,
              detail: f.detail,
              selected: f.id === selectedId,
            })),
          ]
        : tier === "galaxy" && galaxy
          ? [
              ...features.map((f) => ({
                id: f.id,
                label: f.name,
                detail: f.detail,
                selected: f.id === selectedId,
              })),
              ...galaxy.systems.map((s) => ({
                id: s.id,
                label: s.name,
                detail: colonizedSystemIds.has(s.id)
                  ? t("galaxyMap.colonized")
                  : explored.has(s.id)
                    ? t("galaxyMap.explored")
                    : t("galaxyMap.unexplored"),
                selected: s.id === selectedId,
              })),
            ]
          : universe.galaxies.map((g) => ({
              id: g.id,
              label: g.name,
              detail: colonizedGalaxyIds.has(g.id)
                ? t("universeMap.colonized")
                : g.systems.length === 0
                  ? t("universeMap.outOfReach")
                  : undefined,
              selected: g.id === selectedId,
            }));

  const pickFromList = (id: string, open: boolean) => {
    const feature = features.find((f) => f.id === id);
    if (feature) {
      if (open) flyToFeature(feature.id, feature.at());
      else onSelectId(id);
      return;
    }
    if (tier === "body" || tier === "system") {
      const target = system?.planets.find((p) => p.id === id);
      if (!target) return;
      if (open) dive("system", target.id);
      else onSelectBody(target);
      return;
    }
    if (tier === "galaxy") {
      const target = galaxy?.systems.find((s) => s.id === id);
      if (!target) return;
      if (open) dive("galaxy", target.id);
      else onSelectSystem(target);
      return;
    }
    const target = universe.galaxies.find((g) => g.id === id);
    if (!target) return;
    if (open) dive("universe", target.id);
    else onSelectGalaxy(target);
  };

  return (
    <div className="map3d">
      <MapCanvas
        ariaLabel={label}
        focus={initialFocus}
        hostRef={hostRef}
        overlayRef={overlayRef}
        onPointerMissed={(event) => {
          // Le rayon n'a rien rencontré de cliquable. Avant de conclure au vide, on laisse sa
          // chance à la tolérance : la moitié du contenu d'un système n'a aucune géométrie
          // cliquable, et le reste ne fait que quelques pixels en dézoomant.
          if (pick.current) pick.current(event);
          else onClearSelection();
        }}
      >
        <LightRig depthRef={depthRef} />
        <TierCamera
          host={hostRef}
          tier={tier}
          parentFocus={current.scene}
          childFocus={child?.scene ?? null}
          // Aucun candidat pendant un vol : la caméra survole alors d'autres objets, et
          // l'élection en désignerait un au passage — effaçant la cible que le geste
          // venait de fixer. Le défaut ne se voyait qu'avec assez de galaxies pour que
          // celle qu'on survole ne soit pas celle qu'on vise.
          aimId={aimId}
          // Aucune visée pendant un vol : la caméra est déjà menée par `CameraJump`, et le
          // ressort la disputerait à l'objet qu'elle survole.
          aimAt={jump ? null : aim}
          depthRef={depthRef}
          follow={
            bodyAt && (tier === "body" || (tier === "system" && childMounted))
              ? { key: body?.id ?? "", at: bodyAt }
              : null
          }
          onCross={cross}
          onChildMount={setChildMounted}
        />
        {!jump && <DepthPublisher depthRef={depthRef} publish={publish} />}

        {/* Étiquettes hors des couches : elles vivent en coordonnées de scène et portent
            elles-mêmes leur fondu de palier (chantier 36.3). */}
        <Picker
          host={hostRef}
          // Rien à désigner pendant un vol : la caméra survole d'autres objets, et un clic
          // en désignerait un au passage.
          selectables={jump ? NOTHING_TO_PICK : selectables}
          bind={pick}
          onPick={onSelectId}
        />

        {/* Le cadre de sélection, hors des couches : il survit au franchissement d'un palier,
            comme l'infobox. */}
        <SelectionMark at={marked?.at ?? null} radius={marked?.radius ?? 0} />

        <MapLabels
          items={labelItems}
          depthRef={depthRef}
          onSelect={(id) => pickFromList(id, false)}
          onOpen={(id) => pickFromList(id, true)}
          onVisibleCount={publishLabelCount}
        />
        {jump && (
          <CameraJump
            request={jump}
            onDone={() => {
              setTier(jump.tier);
              setJump(null);
            }}
          />
        )}

        {/* Posée hors des couches : l'infobox survit au franchissement d'un palier, et ne
            s'efface pas avec la couche qui portait l'objet sélectionné. */}
        {selection && (
          <MovingGroup at={selection.at} scale={1}>
            <MapInfobox
              target={selection.target}
              portal={overlayRef}
              onOpen={openSelection}
              onClose={onClearSelection}
            />
          </MovingGroup>
        )}

        {shows("universe") && placements.universe && (
          <FadingGroup tier="universe" depthRef={depthRef}>
            <UniverseLayer
              universe={universe}
              colonizedGalaxyIds={colonizedGalaxyIds}
              gateways={gateways}
              focus={placements.universe.local}
              selectedId={selectedId}
              onSelect={onSelectGalaxy}
              onOpenGalaxy={(g) => dive("universe", g.id)}
            />
          </FadingGroup>
        )}

        {shows("galaxy") && galaxy && placements.galaxy && (
          <FadingGroup
            tier="galaxy"
            depthRef={depthRef}
            position={placements.galaxy.position}
            scale={placements.galaxy.scale}
          >
            <GalaxyLayer
              // Rayon de l'étoile ramené au repère de la galaxie : le rapport des deux
              // échelles de placement dit exactement ce que vaut une unité système vue
              // d'ici. Sans lui, le fondu troquerait un nœud de 11 unités contre une
              // étoile de 0,3.
              starRadius={
                placements.system
                  ? (STAR_CORE * placements.system.scale) /
                    placements.galaxy.scale
                  : SYSTEM_NODE * 0.05
              }
              galaxy={galaxy}
              colonizedSystemIds={colonizedSystemIds}
              stations={stations}
              foreignStations={foreignStations}
              exploredSystemIds={exploredSystemIds}
              claimedSystemIds={claimedSystemIds}
              territories={territories}
              fleets={fleets}
              now={Date.now()}
              focus={placements.galaxy.local}
              selectedId={selectedId}
              onSelect={onSelectSystem}
              onOpenSystem={(s) => dive("galaxy", s.id)}
              onSelectCore={() => onSelectId(`${galaxy.id}:core`)}
              // Un cœur ne se descend pas comme un système : il n'y a pas de palier
              // dessous. Le double-clic fait donc ce que fait le bouton de l'infobox.
              onOpenCore={() => onOpenFiche(galaxy.id)}
            />
          </FadingGroup>
        )}

        {shows("system") && system && placements.system && (
          <FadingGroup
            tier="system"
            depthRef={depthRef}
            position={placements.system.position}
            scale={placements.system.scale}
          >
            <SystemLayer
              system={system}
              sites={systemSites}
              tickAt={tickAt}
              hiddenBodyIds={takenOver}
              stations={stations}
              foreignStations={foreignStations}
              outposts={outposts}
              fleets={fleets}
              foreignFleets={foreignFleets}
              onSelectBody={onSelectBody}
              onOpenBody={(b) => dive("system", b.id)}
            />
          </FadingGroup>
        )}

        {showsBody && system && body && bodyAt && placements.body && (
          <MovingGroup at={bodyAt} scale={placements.body.scale}>
            <FadingGroup tier="body" depthRef={depthRef}>
              <BodyLayer
                system={system}
                body={body}
                tickAt={tickAt}
                colonies={colonies}
                stations={stations}
                onSelectBody={onSelectBody}
                onOpenBody={(b) => dive("system", b.id)}
              />
            </FadingGroup>
          </MovingGroup>
        )}
      </MapCanvas>

      <MapList
        label={label}
        entries={entries}
        onSelect={(id) => pickFromList(id, false)}
        onOpen={(id) => pickFromList(id, true)}
      />
    </div>
  );
}
