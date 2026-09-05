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
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { resourceLabel } from "../labels.js";
import { BodyLayer, moonsOf } from "./BodyLayer.js";
import { seedOf } from "./appearance.js";
import { type Focus } from "./bounds.js";
import { FadingGroup } from "./FadingGroup.js";
import { MapInfobox, type MapTarget } from "./MapInfobox.js";
import {
  GalaxyLayer,
  SYSTEM_LABEL_EXTENT,
  SYSTEM_NODE,
  systemScenePosition,
} from "./GalaxyLayer.js";
import { MapCanvas } from "./MapCanvas.js";
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
} from "./SystemLayer.js";
import { TierCamera } from "./TierCamera.js";
import {
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
} from "./UniverseLayer.js";
import {
  anchorPathOf,
  computePlacements,
  deepestTier,
  FEATURE_RADIUS,
  LABEL_BUDGET,
  pathFor,
  resolveAnchor,
  slotIdFor,
  under,
  type AnchorPath,
  type Selectable,
} from "./anchors.js";

import {
  CameraJump,
  DepthPublisher,
  LightRig,
  MovingGroup,
  NOTHING_TO_PICK,
  type JumpRequest,
} from "./SceneRig.js";

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

  /**
   * **Tout ce qui se sélectionne au palier courant** (chantier 41).
   *
   * Une seule liste, là où la carte en portait quatre qui décrivaient le même ensemble : les
   * objets « en plus des corps », les étiquettes de la scène, les entrées de la liste DOM et
   * le pool du clic tolérant. Elles divergeaient déjà — le cœur galactique était nommé mais
   * pas cliquable, une ceinture cliquable mais pas nommée — et rien ne signalait l'oubli.
   *
   * Les positions sont des **fonctions** : un corps orbite, et un point figé au dernier tick
   * désignerait une place que la planète a quittée. Les cibles d'infobox aussi : au palier
   * galaxie il y a jusqu'à cinq cents candidats, et une seule est jamais affichée.
   */
  const selectables = useMemo((): Selectable[] => {
    const out: Selectable[] = [];

    if (tier === "universe") {
      for (const g of universe.galaxies) {
        const at = galaxyScenePosition(g);
        const colonized = colonizedGalaxyIds.has(g.id);
        out.push({
          id: g.id,
          label: g.name,
          detail: colonized
            ? t("universeMap.colonized")
            : systemCountOf(g) === 0
              ? t("universeMap.outOfReach")
              : undefined,
          at: () => at,
          radius: GALAXY_DISC,
          labelExtent: GALAXY_DISC,
          target: () => ({ kind: "galaxy", galaxy: g, colonized }),
          openId: g.id,
          descendable: true,
        });
      }
      return out;
    }

    const parent = placements.galaxy;
    if (tier === "galaxy" && galaxy && parent) {
      /**
       * Le cœur galactique (chantier 39), seul objet du palier qui ne soit pas un système, et
       * posé EN TÊTE : il ne doit pas se perdre derrière quatre cents noms.
       *
       * `placements.galaxy.position` EST le centre de la galaxie, pas un point voisin : c'est
       * `galaxyScenePosition`. Rien ne se trouve sous un trou noir, donc on n'y descend pas ;
       * et il n'a pas de fiche propre, c'est celle de sa galaxie qui la porte.
       */
      const core = parent.position;
      const coreName = t("mapInfobox.galacticCoreName", {
        galaxy: galaxy.name,
      });
      const coreDetail = t("mapInfobox.galacticCore");
      const coreDisc = galacticCoreDisc(systemCountOf(galaxy)) * parent.scale;
      out.push({
        id: `${galaxy.id}:core`,
        label: coreName,
        detail: coreDetail,
        at: () => core,
        radius: coreDisc,
        labelExtent: coreDisc,
        target: () => ({ kind: "feature", name: coreName, detail: coreDetail }),
        openId: galaxy.id,
        descendable: false,
      });
      for (const s of galaxy.systems) {
        const at = under(parent, systemScenePosition(s));
        out.push({
          id: s.id,
          label: s.name,
          detail: colonizedSystemIds.has(s.id)
            ? t("galaxyMap.colonized")
            : explored.has(s.id)
              ? t("galaxyMap.explored")
              : t("galaxyMap.unexplored"),
          at: () => at,
          radius: SYSTEM_NODE * parent.scale,
          // Emprise d'ÉTIQUETTE, volontairement distincte du rayon rendu : un nœud de
          // système garde une taille d'écran plancher, et son nom doit suivre ce qu'on VOIT.
          labelExtent: SYSTEM_LABEL_EXTENT * parent.scale,
          target: () => ({
            kind: "system",
            system: s,
            explored: explored.has(s.id),
            colonized: colonizedSystemIds.has(s.id),
            starClass: starClassOf(s),
          }),
          openId: s.id,
          descendable: true,
        });
      }
      return out;
    }

    const home = placements.system;
    if (!system || !home) return out;
    const extent = systemExtent(system, systemSites);

    // Au palier corps, seuls le corps ancré et ses lunes sont à l'écran.
    const bodies =
      tier === "body" && body
        ? [body, ...moonsOf(system, body)]
        : system.planets;
    for (const p of bodies)
      out.push({
        id: p.id,
        label: p.name,
        detail:
          p.kind === "moon"
            ? t("systemView.moon")
            : t("systemView.habitability", { value: p.habitability }),
        at: () => under(home, bodyLocalPosition(system, p, tickAt())),
        radius: bodyRadiusOf(p) * home.scale,
        labelExtent: bodyLabelExtent(p) * home.scale,
        lift: bodyRadiusOf(p) * home.scale,
        target: () => ({
          kind: "body",
          body: p,
          moons: moonsOf(system, p).length,
        }),
        openId: p.id,
        descendable: true,
      });

    /**
     * Le manufacturé : comptoir, stations, avant-postes, ceintures, sites de scan.
     *
     * Rien ne se trouve « sous » eux, donc on n'y descend pas — le double-clic les ramène au
     * centre. Et aucun n'a de fiche propre : c'est celle du système qui porte le marché, le
     * scan et la revendication.
     */
    const feature = (
      id: string,
      name: string,
      detail: string,
      at: () => Vec3,
    ): Selectable => ({
      id,
      label: name,
      detail,
      at,
      radius: FEATURE_RADIUS * home.scale,
      // Les objets manufacturés vont de 4 à 11 unités système selon leur nature : un rayon
      // commun suffit à décider d'un seuil d'affichage, et évite de faire remonter une
      // taille de rendu jusqu'ici.
      labelExtent: FEATURE_RADIUS * home.scale,
      target: () => ({ kind: "feature", name, detail }),
      openId: system.id,
      descendable: false,
    });

    const post = system.station;
    if (post)
      out.push(
        feature(post.id, post.name, t("mapInfobox.tradingPost"), () =>
          under(home, derivedOrbit(post.id, extent)),
        ),
      );

    const orbiting = (bodyId: string) => {
      const around = system.planets.find((p) => p.id === bodyId);
      if (!around) return null;
      const offset = bodyRadiusOf(around) * 2.2;
      return (): Vec3 => {
        const [x, y, z] = bodyLocalPosition(system, around, tickAt());
        return under(home, [x + offset, y + offset * 0.35, z]);
      };
    };

    for (const station of stations.filter((x) => x.systemId === system.id)) {
      const at = orbiting(station.bodyId);
      if (at)
        out.push(
          feature(station.id, station.name, t("mapInfobox.station"), at),
        );
    }
    for (const station of foreignStations.filter(
      (x) => x.systemId === system.id,
    )) {
      const at = orbiting(station.bodyId);
      if (at)
        out.push(
          feature(
            station.id,
            station.name,
            t("mapInfobox.foreignStation", { owner: station.ownerName }),
            at,
          ),
        );
    }
    for (const belt of system.belts) {
      const mined = outposts.some((o) => o.beltId === belt.id);
      const angle = seedOf(`${belt.id}:label`) * Math.PI * 2;
      const at = under(home, [
        Math.cos(angle) * belt.orbitRadius,
        Math.sin(angle) * belt.orbitRadius,
        0,
      ]);
      out.push(
        feature(
          belt.id,
          belt.name,
          mined
            ? t("mapInfobox.beltMined")
            : t("mapInfobox.belt", {
                list:
                  Object.keys(belt.deposits)
                    .map((r) => resourceLabel(r as ResourceId))
                    .join(" · ") || t("bodyView.noDeposits"),
              }),
          () => at,
        ),
      );
    }
    for (const site of systemSites) {
      const p = sitePosition(site);
      const at = under(home, [p.x, p.y, p.z]);
      out.push(
        feature(
          site.id,
          t(`systemPanel.siteKind.${site.kind}`),
          t("systemPanel.siteOrbit", { radius: Math.round(site.orbitRadius) }),
          () => at,
        ),
      );
    }
    return out;
  }, [
    tier,
    universe,
    galaxy,
    system,
    body,
    systemSites,
    placements,
    stations,
    foreignStations,
    outposts,
    tickAt,
    explored,
    colonizedSystemIds,
    colonizedGalaxyIds,
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
   * Ce qu'on nomme dans la scène, dérivé des sélectionnables (chantiers 36.3 puis 41).
   *
   * **Le palier courant seulement.** Ceux de l'enfant seraient tous sous le seuil de taille
   * apparente jusqu'au franchissement — mesuré : une planète dans un système qui remplit tout
   * juste le cadre vaut 0,011, sous les 0,013 requis.
   */
  const labelItems = useMemo((): LabelItem[] => {
    const named = (s: Selectable): LabelItem => ({
      id: s.id,
      text: s.label,
      tier,
      at: s.at,
      radius: s.labelExtent,
      lift: s.lift,
    });
    const centre = placements.galaxy?.position;
    if (tier !== "galaxy" || !centre) return selectables.map(named);

    // Les plus proches du centre de la galaxie d'abord, puis coupe au budget. Le seuil de
    // taille apparente masque déjà l'immense majorité de ces noms, mais il ne les empêche pas
    // d'être MONTÉS : à cinq cents systèmes, cela faisait cinq cents sprites et autant de
    // textures rastérisées pour une poignée de noms lisibles.
    //
    // Le cœur reste HORS budget : il est seul, et son emprise est de deux ordres au-dessus de
    // celle d'un système — il se nomme donc bien avant le premier nom de système.
    const budgeted = selectables
      .filter((s) => s.descendable)
      .map((s) => {
        const [x, y, z] = s.at();
        return {
          s,
          away: Math.hypot(x - centre[0], y - centre[1], z - centre[2]),
        };
      })
      .sort((a, b) => a.away - b.away)
      .slice(0, LABEL_BUDGET)
      .map(({ s }) => named(s));
    return [
      ...selectables.filter((s) => !s.descendable).map(named),
      ...budgeted,
    ];
  }, [tier, selectables, placements.galaxy]);

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

  const world = useRef({ universe, sites, tick });
  world.current = { universe, sites, tick };

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
   * L'objet que l'infobox décrit.
   *
   * Une recherche dans les sélectionnables, PLUS un repli — et c'est le seul endroit où la
   * liste unique du chantier 41 ne suffit pas. Entrer dans un système le laisse sélectionné
   * alors qu'il ne figure plus parmi les objets à l'écran : l'infobox doit continuer de le
   * décrire, et son bouton de rester celui de sa fiche. La sélection déborde donc le palier
   * courant d'un cran vers le haut, délibérément.
   */
  const selection = useMemo((): {
    target: MapTarget;
    at: () => Vec3;
  } | null => {
    if (!selectedId) return null;
    const here = selectables.find((s) => s.id === selectedId);
    if (here) return { target: here.target(), at: here.at };

    const path = selectedPath;
    if (path.systemId === selectedId && galaxy && placements.galaxy) {
      if (path.galaxyId !== galaxy.id) return null;
      const picked = galaxy.systems.find((sys) => sys.id === selectedId);
      if (!picked) return null;
      const at = under(placements.galaxy, systemScenePosition(picked));
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
    selectables,
    universe,
    galaxy,
    placements.galaxy,
    explored,
    colonizedSystemIds,
    colonizedGalaxyIds,
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
      selectables.find((s) => s.id === selectedId)?.openId ?? selectedId,
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

  const entries = selectables.map((s) => ({
    id: s.id,
    label: s.label,
    detail: s.detail,
    selected: s.id === selectedId,
  }));

  const pickFromList = (id: string, open: boolean) => {
    const picked = selectables.find((s) => s.id === id);
    if (!picked) return;
    if (!open) {
      onSelectId(id);
      return;
    }
    // Descendre depuis le palier CORPS se fait dans le repère du système : la couche corps
    // n'a pas d'enfant, et ses lunes vivent dans les coordonnées de leur système.
    if (picked.descendable) dive(tier === "body" ? "system" : tier, id);
    else flyToFeature(id, picked.at());
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
