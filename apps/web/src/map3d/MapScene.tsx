import { useThree } from "@react-three/fiber";
import type {
  Colony,
  ForeignStation,
  Galaxy,
  Gateway,
  StarSystem,
  Station,
  Territory,
  Universe,
} from "@spacesim/shared";
import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import type { Vector3 } from "three";
import { nestedFocus, type Focus } from "./bounds.js";
import { galaxyFocus, GalaxyLayer } from "./GalaxyLayer.js";
import { fitDistance, MapCanvas } from "./MapCanvas.js";
import { MapList } from "./MapList.js";
import { TierCamera, type AnchorCandidate } from "./TierCamera.js";
import { nestingScale, type TierName } from "./tiers.js";
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

/**
 * Recadrage instantané sur un cadrage donné (chantier 35.2).
 *
 * Sert aux sauts explicites — double-clic sur une galaxie, arrivée par la recherche — qui
 * doivent traverser la bande d'un coup au lieu de la parcourir à la molette. Le vol animé
 * viendra au chantier 35.6 ; ici le saut est sec, ce qui suffit à prouver que la traversée
 * s'enchaîne correctement.
 *
 * Cadrer à 95 % de la distance de cadrage n'est pas un détail esthétique : cela pose la
 * progression juste au-delà de 1, ce qui déclenche le franchissement à l'image suivante.
 */
function CameraJump({ focus, onDone }: { focus: Focus; onDone: () => void }) {
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
    const distance = fitDistance(focus, width / Math.max(1, height)) * 0.95;
    // Direction de vue conservée : le joueur a peut-être tourné la caméra, un saut ne
    // doit pas lui reprendre son point de vue en même temps que sa position.
    const dx = camera.position.x - controls.target.x;
    const dy = camera.position.y - controls.target.y;
    const dz = camera.position.z - controls.target.z;
    const length = Math.hypot(dx, dy, dz) || 1;
    controls.target.set(focus.center[0], focus.center[1], focus.center[2]);
    camera.position.set(
      focus.center[0] + (dx / length) * distance,
      focus.center[1] + (dy / length) * distance,
      focus.center[2] + (dz / length) * distance,
    );
    controls.update();
    onDone();
  }, [focus, camera, controls, onDone]);

  return null;
}

/** Cadrage d'une galaxie tel qu'il s'imbrique dans l'amas. */
function galaxyPlacement(galaxy: Galaxy) {
  const local = galaxyFocus(galaxy);
  const scale = nestingScale(GALAXY_DISC, local.radius);
  const position = galaxyScenePosition(galaxy);
  return {
    local,
    scale,
    position,
    framed: nestedFocus(local, position, scale),
  };
}

interface Props {
  universe: Universe;
  colonies: Colony[];
  gateways: Gateway[];
  stations: Station[];
  foreignStations: ForeignStation[];
  exploredSystemIds: string[];
  claimedSystemIds: string[];
  territories: Territory[];
  /** Galaxie portée par l'URL, s'il y en a une — l'ancre de départ de la caméra. */
  routeGalaxyId: string | null;
  selectedId: string | null;
  onSelectGalaxy: (galaxy: Galaxy) => void;
  onSelectSystem: (system: StarSystem) => void;
  onOpenSystem: (system: StarSystem) => void;
}

/**
 * Carte à zoom continu (chantier 35.2), pour l'instant sur les deux premiers paliers.
 *
 * Les quatre niveaux de carte étaient quatre scènes qui s'excluaient : changer de niveau
 * démontait un canvas pour en monter un autre, et la caméra claquait d'un cadrage à
 * l'autre. Ici il n'y a qu'un canvas, et les paliers **coexistent** le temps d'une
 * transition — le contenu d'une galaxie est déjà monté, réduit à sa place dans l'amas,
 * avant que l'amas ne s'efface.
 *
 * Le groupe qui porte la galaxie garde la même position et la même échelle de part et
 * d'autre du franchissement : ce qui change, c'est seulement que l'univers cesse d'être
 * dessiné. Rien de visible ne bouge, donc le franchissement ne se voit pas — et il n'y a
 * ni caméra à rebaser ni image rendue avec un graphe périmé.
 */
export function MapScene({
  universe,
  colonies,
  gateways,
  stations,
  foreignStations,
  exploredSystemIds,
  claimedSystemIds,
  territories,
  routeGalaxyId,
  selectedId,
  onSelectGalaxy,
  onSelectSystem,
  onOpenSystem,
}: Props) {
  const { t } = useTranslation();
  /** Partagé avec `TierCamera`, qui vit dans le canvas et doit écrire sur la section. */
  const hostRef = useRef<HTMLElement>(null);

  const galaxyById = useMemo(
    () => new Map(universe.galaxies.map((g) => [g.id, g])),
    [universe],
  );
  const startsInGalaxy = Boolean(
    routeGalaxyId && galaxyById.has(routeGalaxyId),
  );

  const [tier, setTier] = useState<TierName>(
    startsInGalaxy ? "galaxy" : "universe",
  );
  const [anchorId, setAnchorId] = useState<string | null>(
    startsInGalaxy ? routeGalaxyId : null,
  );
  const [childMounted, setChildMounted] = useState(startsInGalaxy);
  const [jump, setJump] = useState<Focus | null>(null);

  const uFocus = useMemo(() => universeFocus(universe), [universe]);
  const anchor = anchorId ? (galaxyById.get(anchorId) ?? null) : null;
  const nested = useMemo(
    () => (anchor ? galaxyPlacement(anchor) : null),
    [anchor],
  );

  /**
   * Cadrage initial du canvas. Figé au montage, et surtout pas recalculé : `FitCamera` se
   * rejoue dès que la valeur change, et le rejouer à chaque franchissement de palier
   * annulerait la traversée qu'on vient de faire.
   */
  const [initialFocus] = useState<Focus>(() => {
    const galaxy = routeGalaxyId ? galaxyById.get(routeGalaxyId) : undefined;
    return galaxy ? galaxyPlacement(galaxy).framed : universeFocus(universe);
  });

  /** Arrivée sur une autre galaxie par l'URL (recherche, raccourci), après le montage. */
  const knownRoute = useRef(routeGalaxyId);
  useEffect(() => {
    if (routeGalaxyId === knownRoute.current) return;
    knownRoute.current = routeGalaxyId;
    const galaxy = routeGalaxyId ? galaxyById.get(routeGalaxyId) : undefined;
    if (!galaxy) return;
    setAnchorId(galaxy.id);
    setJump(galaxyPlacement(galaxy).framed);
  }, [routeGalaxyId, galaxyById]);

  /**
   * Appartenances, calculées ici parce que la couche 3D ET la liste DOM en ont besoin.
   * Le parcours est le même qu'avant le chantier 35 ; ce qui change, c'est qu'il n'est
   * plus fait deux fois.
   */
  const colonizedGalaxyIds = useMemo(() => {
    const ids = new Set<string>();
    for (const galaxy of universe.galaxies) {
      if (
        galaxy.systems.some((s) =>
          s.planets.some((p) => colonies.some((c) => c.planetId === p.id)),
        )
      )
        ids.add(galaxy.id);
    }
    return ids;
  }, [universe, colonies]);

  const colonizedSystemIds = useMemo(() => {
    const ids = new Set<string>();
    for (const system of anchor?.systems ?? []) {
      if (system.planets.some((p) => colonies.some((c) => c.planetId === p.id)))
        ids.add(system.id);
    }
    return ids;
  }, [anchor, colonies]);

  const inGalaxy = tier === "galaxy";

  const candidates = useMemo<AnchorCandidate[]>(
    () =>
      inGalaxy
        ? []
        : universe.galaxies.map((g) => ({
            id: g.id,
            position: galaxyScenePosition(g),
          })),
    [inGalaxy, universe],
  );

  const cross = (delta: 1 | -1) => {
    setTier((current) => {
      if (delta === 1 && current === "universe" && anchorId) return "galaxy";
      if (delta === -1 && current === "galaxy") return "universe";
      return current;
    });
  };

  /** Double-clic sur une galaxie : on l'ancre et on saute la bande d'un coup. */
  const diveInto = (galaxy: Galaxy) => {
    setAnchorId(galaxy.id);
    setJump(galaxyPlacement(galaxy).framed);
  };

  const explored = useMemo(
    () => new Set(exploredSystemIds),
    [exploredSystemIds],
  );
  const showGalaxy = Boolean(anchor && nested && (childMounted || inGalaxy));
  const label = inGalaxy
    ? t("galaxyMap.ariaLabel", { name: anchor?.name ?? "" })
    : t("universeMap.ariaLabel");

  return (
    <div className="map3d">
      <MapCanvas
        ariaLabel={label}
        focus={initialFocus}
        register="schematic"
        hostRef={hostRef}
      >
        <TierCamera
          host={hostRef}
          tier={tier}
          parentFocus={inGalaxy && nested ? nested.framed : uFocus}
          childFocus={inGalaxy ? null : (nested?.framed ?? null)}
          candidates={candidates}
          candidateFootprint={GALAXY_DISC}
          anchorId={anchorId}
          onAnchor={setAnchorId}
          onCross={cross}
          onChildMount={setChildMounted}
        />
        {jump && <CameraJump focus={jump} onDone={() => setJump(null)} />}

        {!inGalaxy && (
          <UniverseLayer
            universe={universe}
            colonizedGalaxyIds={colonizedGalaxyIds}
            gateways={gateways}
            focus={uFocus}
            selectedId={selectedId}
            onSelect={onSelectGalaxy}
            onOpenGalaxy={diveInto}
          />
        )}

        {/* Le groupe garde position et échelle de part et d'autre du franchissement :
            c'est ce qui fait que passer d'un palier à l'autre ne déplace rien à l'écran. */}
        {showGalaxy && anchor && nested && (
          <group
            position={[
              nested.position[0],
              nested.position[1],
              nested.position[2],
            ]}
            scale={nested.scale}
          >
            <GalaxyLayer
              galaxy={anchor}
              colonizedSystemIds={colonizedSystemIds}
              stations={stations}
              foreignStations={foreignStations}
              exploredSystemIds={exploredSystemIds}
              claimedSystemIds={claimedSystemIds}
              territories={territories}
              focus={nested.local}
              selectedId={selectedId}
              onSelect={onSelectSystem}
              onOpenSystem={onOpenSystem}
            />
          </group>
        )}
      </MapCanvas>

      <MapList
        label={label}
        entries={
          inGalaxy && anchor
            ? anchor.systems.map((system) => ({
                id: system.id,
                label: system.name,
                detail: colonizedSystemIds.has(system.id)
                  ? t("galaxyMap.colonized")
                  : explored.has(system.id)
                    ? t("galaxyMap.explored")
                    : t("galaxyMap.unexplored"),
                selected: system.id === selectedId,
              }))
            : universe.galaxies.map((galaxy) => ({
                id: galaxy.id,
                label: galaxy.name,
                detail: colonizedGalaxyIds.has(galaxy.id)
                  ? t("universeMap.colonized")
                  : undefined,
                selected: galaxy.id === selectedId,
              }))
        }
        onSelect={(id) => {
          if (inGalaxy && anchor) {
            const system = anchor.systems.find((s) => s.id === id);
            if (system) onSelectSystem(system);
            return;
          }
          const galaxy = galaxyById.get(id);
          if (galaxy) onSelectGalaxy(galaxy);
        }}
        onOpen={(id) => {
          if (inGalaxy && anchor) {
            const system = anchor.systems.find((s) => s.id === id);
            if (system) onOpenSystem(system);
            return;
          }
          const galaxy = galaxyById.get(id);
          if (galaxy) diveInto(galaxy);
        }}
      />
    </div>
  );
}
