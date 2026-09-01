import { useFrame, useThree } from "@react-three/fiber";
import {
  TICK_MS,
  type Colony,
  type ForeignStation,
  type Galaxy,
  type Gateway,
  type Planet,
  type StarSystem,
  type Station,
  type SystemSite,
  type Territory,
  type Universe,
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
import type { AmbientLight, Group, Vector3 } from "three";
import { BodyLayer, bodyFocus, moonsOf } from "./BodyLayer.js";
import { nestedFocus, type Focus } from "./bounds.js";
import { FadingGroup } from "./FadingGroup.js";
import { MapInfobox, type MapTarget } from "./MapInfobox.js";
import {
  galaxyFocus,
  GalaxyLayer,
  SYSTEM_NODE,
  systemScenePosition,
} from "./GalaxyLayer.js";
import { fitDistance, MapCanvas } from "./MapCanvas.js";
import { MapList } from "./MapList.js";
import { bodyLocalPosition, SystemLayer, systemFocus } from "./SystemLayer.js";
import { TierCamera, type AnchorCandidate } from "./TierCamera.js";
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
 * Chemin d'ancrage après avoir visé `id` au palier `name`.
 *
 * Fonction pure du chemin **précédent**, et non du chemin capturé au rendu : l'élection
 * d'ancre tourne à chaque image et son `setAnchors` peut se retrouver mis en file APRÈS
 * celui d'un saut. Sur un état capturé, elle reposait alors le chemin d'avant le saut et
 * effaçait le système qu'on venait de viser — l'URL annonçait un palier système avec une
 * ancre de galaxie, et un rechargement rouvrait la carte sur rien.
 *
 * Réélire le même objet ne touche à rien, pour la même raison.
 */
function anchorFrom(
  previous: AnchorPath,
  name: TierName,
  id: string | null,
): AnchorPath {
  if (name === "universe")
    return id === previous.galaxyId
      ? previous
      : { galaxyId: id, systemId: null, bodyId: null };
  if (name === "galaxy")
    return id === previous.systemId
      ? previous
      : { ...previous, systemId: id, bodyId: null };
  // Dernier palier : il n'y a pas d'enfant à ancrer sous un corps.
  return name === "system" ? { ...previous, bodyId: id } : previous;
}

/** Palier le plus profond que décrit un chemin d'ancrage. */
function deepestTier(path: AnchorPath): TierName {
  if (path.bodyId) return "body";
  if (path.systemId) return "system";
  if (path.galaxyId) return "galaxy";
  return "universe";
}

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
  universe: Universe,
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
export function resolveAnchor(universe: Universe, path: AnchorPath): Resolved {
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
  universe: Universe,
  resolved: Resolved,
  sites: readonly SystemSite[],
  tick: number,
): Placements {
  const out: Placements = {};
  out.universe = place(universeFocus(universe), [0, 0, 0], 1);

  const { galaxy, system, body } = resolved;
  if (galaxy) {
    const local = galaxyFocus(galaxy);
    out.galaxy = place(
      local,
      galaxyScenePosition(galaxy),
      nestingScale(GALAXY_DISC, local.radius),
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

/**
 * Recadrage instantané (chantiers 35.2 et 35.3).
 *
 * Sert aux sauts explicites — double-clic, arrivée par la recherche — et à la restauration
 * de la profondeur portée par l'URL. Sans `child`, on cadre la cible à 95 % de sa distance
 * de cadrage : ce n'est pas un détail esthétique, cela pose la progression juste au-delà de
 * 1 et déclenche le franchissement à l'image suivante.
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
  // Lu par référence : un redimensionnement du canvas ne doit pas rejouer le saut et
  // reprendre au joueur la vue qu'il s'est donnée depuis.
  const measured = useRef(size);
  measured.current = size;

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
    // Direction de vue conservée : le joueur a peut-être tourné la caméra, un saut ne
    // doit pas lui reprendre son point de vue en même temps que sa position.
    const dx = camera.position.x - controls.target.x;
    const dy = camera.position.y - controls.target.y;
    const dz = camera.position.z - controls.target.z;
    const length = Math.hypot(dx, dy, dz) || 1;
    const [tx, ty, tz] = request.focus.center;
    controls.target.set(tx, ty, tz);
    camera.position.set(
      tx + (dx / length) * distance,
      ty + (dy / length) * distance,
      tz + (dz / length) * distance,
    );
    controls.update();
    onDone();
  }, [request, camera, controls, onDone]);

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
  universe: Universe;
  colonies: Colony[];
  gateways: Gateway[];
  stations: Station[];
  foreignStations: ForeignStation[];
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
  onOpenBody: (body: Planet) => void;
  /** Clic dans le vide : referme l'infobox. */
  onClearSelection: () => void;
  /** Publie l'ancre et la profondeur atteintes, pour que l'URL les suive. */
  onViewChange: (anchor: AnchorPath, depth: number) => void;
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
  onOpenBody,
  onClearSelection,
  onViewChange,
}: Props) {
  const { t } = useTranslation();
  /** Partagé avec `TierCamera`, qui vit dans le canvas et doit écrire sur la section. */
  const hostRef = useRef<HTMLElement>(null);
  /** Surcouche DOM des infobox : hors du conteneur `aria-hidden` de R3F. */
  const overlayRef = useRef<HTMLDivElement>(null);
  const depthRef = useRef(routeDepth ?? 0);

  const [anchors, setAnchors] = useState<AnchorPath>(routeAnchor);
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
    // biome-ignore lint/correctness/useExhaustiveDependencies: `tick` est volontairement
    // hors dépendances — seule la géométrie stable des paliers est mémoïsée ici.
    [universe, resolved, sites],
  );

  /** Position de scène du voisinage du corps ancré, à l'instant présent. */
  const bodyAt = useMemo(() => {
    const s = placements.system;
    if (!s || !system || !body) return null;
    return (): Vec3 => under(s, bodyLocalPosition(system, body, tickAt()));
  }, [placements.system, system, body, tickAt]);

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
    // Au montage seulement : rejouer cette restauration reprendrait au joueur la vue
    // qu'il s'est donnée depuis.
    // biome-ignore lint/correctness/useExhaustiveDependencies: voir ci-dessus.
  }, []);

  /**
   * Ancre publiable. Tant qu'on n'a rien engagé — palier univers, enfant pas même monté —
   * l'ancre n'est que « la galaxie la plus proche du centre de l'écran », ce qui ne décrit
   * aucune intention et n'a rien à faire dans la barre d'adresse.
   */
  const publishable =
    tier === "universe" && !childMounted ? NO_ANCHOR : anchors;

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
    onViewChange(publishable, publishableDepth());
  }, [publishable, publishableDepth, onViewChange]);

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
    setAnchors(path);
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

  /** Candidats à l'ancrage du palier suivant, en unités de scène. */
  const candidates = useMemo<AnchorCandidate[]>(() => {
    if (tier === "universe")
      return universe.galaxies.map((g) => ({
        id: g.id,
        position: galaxyScenePosition(g),
      }));
    const g = placements.galaxy;
    if (tier === "galaxy" && g && galaxy)
      return galaxy.systems.map((s) => ({
        id: s.id,
        position: under(g, systemScenePosition(s)),
      }));
    const s = placements.system;
    if (tier === "system" && s && system)
      return system.planets
        .filter((p) => p.kind === "planet")
        .map((p) => ({
          id: p.id,
          position: under(s, bodyLocalPosition(system, p, tickAt())),
        }));
    return [];
  }, [tier, universe, galaxy, system, placements, tickAt]);

  /** Emprise d'un candidat dans la scène — cale le rayon d'élection de l'ancre. */
  const candidateFootprint =
    tier === "universe"
      ? GALAXY_DISC
      : tier === "galaxy"
        ? SYSTEM_NODE * (placements.galaxy?.scale ?? 1)
        : (placements.system?.scale ?? 1) * 20;

  const anchorFor = (name: TierName, id: string | null): AnchorPath =>
    anchorFrom(anchors, name, id);

  const cross = (delta: 1 | -1) => {
    setTier((from) => {
      const next = TIER_ORDER[tierIndex(from) + delta];
      if (!next) return from;
      // On ne descend que dans quelque chose : sans placement, il n'y a rien à cadrer.
      if (delta === 1 && !placements[next]) return from;
      return next;
    });
  };

  /**
   * Double-clic ou entrée de liste : ancrer ET sauter la bande d'un coup.
   *
   * Distinct de l'élection d'ancre, qui change de cible en continu pendant que le joueur
   * se déplace — y attacher un saut collerait la caméra à chaque galaxie survolée.
   */
  const dive = (name: TierName, id: string) => {
    const path = anchorFor(name, id);
    const next = computePlacements(
      universe,
      resolveAnchor(universe, path),
      sites,
      tick,
    );
    const arrival = TIER_ORDER[tierIndex(name) + 1] ?? "universe";
    const target = next[arrival];
    setAnchors(path);
    if (target)
      setJump({ tier: arrival, focus: target.scene, child: null, progress: 0 });
  };

  const publish = useCallback(
    () => onViewChange(publishable, publishableDepth()),
    [publishable, publishableDepth, onViewChange],
  );

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
    const path = anchorPathOf(universe, selectedId);

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
    universe,
    galaxy,
    system,
    placements,
    tickAt,
    explored,
    colonizedSystemIds,
    colonizedGalaxyIds,
  ]);

  const openSelection = () => {
    if (!selection) return;
    if (selection.target.kind === "body") onOpenBody(selection.target.body);
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
        ? system.planets.map(bodyEntry)
        : tier === "galaxy" && galaxy
          ? galaxy.systems.map((s) => ({
              id: s.id,
              label: s.name,
              detail: colonizedSystemIds.has(s.id)
                ? t("galaxyMap.colonized")
                : explored.has(s.id)
                  ? t("galaxyMap.explored")
                  : t("galaxyMap.unexplored"),
              selected: s.id === selectedId,
            }))
          : universe.galaxies.map((g) => ({
              id: g.id,
              label: g.name,
              detail: colonizedGalaxyIds.has(g.id)
                ? t("universeMap.colonized")
                : undefined,
              selected: g.id === selectedId,
            }));

  const pickFromList = (id: string, open: boolean) => {
    if (tier === "body" || tier === "system") {
      const target = system?.planets.find((p) => p.id === id);
      if (!target) return;
      if (!open) onSelectBody(target);
      else if (target.kind === "moon" || tier === "body") onOpenBody(target);
      else dive("system", target.id);
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
        onPointerMissed={onClearSelection}
      >
        <LightRig depthRef={depthRef} />
        <TierCamera
          host={hostRef}
          tier={tier}
          parentFocus={current.scene}
          childFocus={child?.scene ?? null}
          candidates={candidates}
          candidateFootprint={candidateFootprint}
          anchorId={
            tier === "universe"
              ? anchors.galaxyId
              : tier === "galaxy"
                ? anchors.systemId
                : tier === "system"
                  ? anchors.bodyId
                  : null
          }
          depthRef={depthRef}
          follow={
            bodyAt && (tier === "body" || (tier === "system" && childMounted))
              ? { key: body?.id ?? "", at: bodyAt }
              : null
          }
          onAnchor={(id) => setAnchors((prev) => anchorFrom(prev, tier, id))}
          onCross={cross}
          onChildMount={setChildMounted}
        />
        <DepthPublisher depthRef={depthRef} publish={publish} />
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
              onOpen={
                selection.target.kind === "body" ? openSelection : undefined
              }
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
              galaxy={galaxy}
              colonizedSystemIds={colonizedSystemIds}
              stations={stations}
              foreignStations={foreignStations}
              exploredSystemIds={exploredSystemIds}
              claimedSystemIds={claimedSystemIds}
              territories={territories}
              focus={placements.galaxy.local}
              selectedId={selectedId}
              onSelect={onSelectSystem}
              onOpenSystem={(s) => dive("galaxy", s.id)}
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
              selectedBodyId={selectedId}
              onSelectBody={onSelectBody}
              onOpenBody={(b) =>
                b.kind === "moon" ? onOpenBody(b) : dive("system", b.id)
              }
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
                selectedBodyId={selectedId}
                onSelectBody={onSelectBody}
                onOpenBody={onOpenBody}
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
