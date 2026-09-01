import {
  MAP_HEIGHT,
  MAP_WIDTH,
  type ForeignStation,
  type Galaxy,
  type StarSystem,
  type Station,
  type Territory,
} from "@spacesim/shared";
import { useMemo } from "react";
import { focusOf, type Focus } from "./bounds.js";
import type { Vec3 } from "./tiers.js";

/** Rayon du nœud d'un système dans le repère de la galaxie. */
export const SYSTEM_NODE = 11;

/** Recentre la galaxie : le générateur pose ses systèmes dans un pavé, pas autour de 0. */
export function systemScenePosition(s: {
  x: number;
  y: number;
  z: number;
}): Vec3 {
  return [s.x - MAP_WIDTH / 2, s.y - MAP_HEIGHT / 2, s.z];
}

/**
 * Cadrage sur les systèmes réellement placés. Le générateur les tire par rejet dans le
 * pavé `MAP_WIDTH × MAP_HEIGHT`, sans jamais garantir qu'il le remplisse ni qu'il soit
 * centré : cadrer sur le pavé théorique visait donc systématiquement à côté.
 */
export function galaxyFocus(galaxy: Galaxy): Focus {
  return focusOf(
    galaxy.id,
    galaxy.systems.map(
      (s) => systemScenePosition(s) as [number, number, number],
    ),
    SYSTEM_NODE * 3,
    MAP_HEIGHT / 5,
  );
}

/** Segment entre deux points de la scène. */
function Segment({
  from,
  to,
  color,
}: {
  from: Vec3;
  to: Vec3;
  color: string;
}) {
  const positions = useMemo(
    () => new Float32Array([...from, ...to]),
    [from, to],
  );
  return (
    <line>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
      </bufferGeometry>
      <lineBasicMaterial color={color} />
    </line>
  );
}

interface Props {
  galaxy: Galaxy;
  /** Systèmes colonisés — calculé par `MapScene`, que la liste DOM en a besoin aussi. */
  colonizedSystemIds: ReadonlySet<string>;
  stations: Station[];
  foreignStations: ForeignStation[];
  exploredSystemIds: string[];
  claimedSystemIds: string[];
  territories: Territory[];
  /** Itinéraire retenu à afficher (chantier 31.10), suite d'ids de systèmes. */
  highlightedRoute?: string[];
  /** Cadrage de la galaxie dans SON repère — `MapScene` l'imbrique ensuite. */
  focus: Focus;
  selectedId: string | null;
  onSelect: (system: StarSystem) => void;
  onOpenSystem: (system: StarSystem) => void;
}

/**
 * Contenu du palier galaxie (chantiers 31.14 puis 35.2). La longueur d'une arête est
 * lisible : depuis le chantier 31.6 elle porte le coût du saut, ce que la carte 2D ne
 * pouvait pas montrer puisque le coût était un simple compte de sauts.
 *
 * Comme `UniverseLayer`, ce composant ne porte plus ni canvas ni liste : il rend son
 * contenu dans **son propre repère**, et c'est `MapScene` qui l'imbrique dans le palier
 * parent par un `<group position scale>`.
 */
export function GalaxyLayer({
  galaxy,
  colonizedSystemIds: colonized,
  stations,
  foreignStations,
  exploredSystemIds,
  claimedSystemIds,
  territories,
  highlightedRoute,
  focus,
  selectedId,
  onSelect,
  onOpenSystem,
}: Props) {
  const byId = useMemo(
    () => new Map(galaxy.systems.map((s) => [s.id, s])),
    [galaxy],
  );
  const explored = useMemo(
    () => new Set(exploredSystemIds),
    [exploredSystemIds],
  );
  const claimed = useMemo(() => new Set(claimedSystemIds), [claimedSystemIds]);
  const withStation = useMemo(
    () =>
      new Set([
        ...stations.map((s) => s.systemId),
        ...foreignStations.map((s) => s.systemId),
      ]),
    [stations, foreignStations],
  );
  const territoryColor = useMemo(
    () => new Map(territories.map((tt) => [tt.systemId, tt.ownerColor])),
    [territories],
  );
  const routePairs = useMemo(() => {
    const pairs: [string, string][] = [];
    for (let i = 0; i < (highlightedRoute?.length ?? 0) - 1; i++) {
      pairs.push([highlightedRoute![i]!, highlightedRoute![i + 1]!]);
    }
    return new Set(pairs.map(([a, b]) => (a < b ? `${a}|${b}` : `${b}|${a}`)));
  }, [highlightedRoute]);

  return (
    <>
      <gridHelper
        args={[
          Math.max(focus.half[0], focus.half[1]) * 2.2,
          14,
          "#243342",
          "#18222e",
        ]}
        position={[focus.center[0], focus.center[1], 0]}
        rotation={[Math.PI / 2, 0, 0]}
      />
      {galaxy.links.map(([a, b]) => {
        const sa = byId.get(a);
        const sb = byId.get(b);
        if (!sa || !sb) return null;
        const key = a < b ? `${a}|${b}` : `${b}|${a}`;
        return (
          <Segment
            key={key}
            from={systemScenePosition(sa)}
            to={systemScenePosition(sb)}
            // L'itinéraire retenu ressort ; le reste du graphe s'efface.
            color={routePairs.has(key) ? "#4fc1ff" : "#223148"}
          />
        );
      })}
      {galaxy.systems.map((system) => {
        const position = systemScenePosition(system);
        const selected = system.id === selectedId;
        const color = selected
          ? "#4fc1ff"
          : colonized.has(system.id)
            ? "#56d364"
            : withStation.has(system.id)
              ? "#e0b64f"
              : (territoryColor.get(system.id) ??
                (explored.has(system.id) ? "#7f95ad" : "#3a4757"));
        return (
          <group
            key={system.id}
            position={[position[0], position[1], position[2]]}
          >
            {/* Rappel au plan galactique : rend le z du système lisible. */}
            <Segment from={[0, 0, 0]} to={[0, 0, -system.z]} color="#22303f" />
            {/* biome-ignore lint/a11y/useKeyWithClickEvents: objet de scène three.js,
                ni focusable ni clavier — le chemin accessible est la liste DOM
                parallèle rendue à côté (chantier 31.16). */}
            <mesh
              onClick={() => onSelect(system)}
              onDoubleClick={() => onOpenSystem(system)}
            >
              <sphereGeometry
                args={[
                  claimed.has(system.id) ? SYSTEM_NODE * 1.3 : SYSTEM_NODE,
                  16,
                  16,
                ]}
              />
              <meshBasicMaterial color={color} />
            </mesh>
          </group>
        );
      })}
    </>
  );
}
