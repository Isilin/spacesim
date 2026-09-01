import {
  MAP_HEIGHT,
  MAP_WIDTH,
  type Fleet,
  type ForeignStation,
  type Galaxy,
  type StarSystem,
  type Station,
  type Territory,
} from "@spacesim/shared";
import { useFrame } from "@react-three/fiber";
import { useMemo, useRef, type RefObject } from "react";
import type { Mesh } from "three";
import { focusOf, type Focus } from "./bounds.js";
import type { Vec3 } from "./tiers.js";

/** Rayon du nœud d'un système dans le repère de la galaxie. */
export const SYSTEM_NODE = 11;

/**
 * Rayon du point d'un système à l'écran, en pixels (chantier 36.6).
 *
 * Le nœud avait une taille fixe en unités MONDE : il grossissait donc en zoomant, puis
 * cédait la place à une étoile trente-cinq fois plus petite dans le même repère. Le fondu
 * échangeait deux objets de tailles apparentes sans rapport. Il garde désormais sa taille
 * à l'écran tout le palier, et ne rejoint celle de l'étoile qu'au moment de lui céder la
 * place.
 */
const NODE_PIXELS = 5;

/** Champ de vision vertical de la carte — doit suivre `MapCanvas`. */
const HALF_FOV = ((50 / 2) * Math.PI) / 180;

/**
 * Tient les nœuds de système à taille écran constante, puis les fait converger vers la
 * taille de l'étoile réelle pendant la bande de transition.
 *
 * Une seule boucle pour tous les nœuds, et une écriture directe sur les objets : la taille
 * change à chaque image, et la faire passer par React re-rendrait la galaxie entière
 * soixante fois par seconde.
 */
function useNodeScale(
  nodes: RefObject<(Mesh | null)[]>,
  depthRef: RefObject<number>,
  starRadius: number,
): void {
  useFrame(({ camera, size }) => {
    const perPixel = (2 * Math.tan(HALF_FOV)) / Math.max(1, size.height);
    // Progression dans la bande galaxie -> système. Hors bande, zéro : le point garde sa
    // taille d'écran.
    const blend = Math.min(1, Math.max(0, depthRef.current - 1));
    for (const mesh of nodes.current ?? []) {
      const parent = mesh?.parent;
      if (!mesh || !parent) continue;
      const e = parent.matrixWorld.elements;
      const scale = Math.hypot(e[0]!, e[1]!, e[2]!) || 1;
      const distance = Math.hypot(
        camera.position.x - e[12]!,
        camera.position.y - e[13]!,
        camera.position.z - e[14]!,
      );
      // Rayon qui garde le point à la même taille à l'écran, exprimé dans le repère local.
      const screen = (distance * perPixel * NODE_PIXELS) / scale;
      const target = screen + (starRadius - screen) * blend;
      mesh.scale.setScalar(Math.max(1e-6, target));
    }
  });
}

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
  /**
   * Flottes en déplacement : un transit va d'un système à un autre, il vit à ce palier.
   * Les flottes étrangères n'en sont pas : la vue redactée ne porte pas leur mouvement,
   * seulement le système où elles sont vues.
   */
  fleets: Fleet[];
  /** Horloge locale, pour interpoler les transits. */
  now: number;
  /** Cadrage de la galaxie dans SON repère — `MapScene` l'imbrique ensuite. */
  focus: Focus;
  selectedId: string | null;
  /** Profondeur continue, écrite par `TierCamera` à chaque image. */
  depthRef: RefObject<number>;
  /**
   * Rayon qu'aura l'étoile du système ancré, dans le repère de la galaxie (chantier 36.6).
   *
   * C'est la cible vers laquelle le point converge pendant la bande, pour que le fondu
   * n'échange pas deux objets de tailles apparentes sans rapport. Les autres nœuds
   * convergent vers la même valeur : ils sont déjà transparents quand elle est atteinte.
   */
  starRadius: number;
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
  fleets,
  now,
  focus,
  selectedId,
  depthRef,
  starRadius,
  onSelect,
  onOpenSystem,
}: Props) {
  const nodes = useRef<(Mesh | null)[]>([]);
  useNodeScale(nodes, depthRef, starRadius);

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
      {/* Flottes en transit (chantier 35.8). `ShipModel` existait depuis le chantier 31.21
          mais ne servait qu'à l'aperçu du concepteur : une flotte en route n'apparaissait
          nulle part, alors que c'est le mouvement le plus lisible de la carte. */}
      {fleets.map((fleet) => {
        const move = fleet.movement;
        if (!move) return null;
        const from = byId.get(fleet.systemId);
        const to = byId.get(move.toSystemId);
        if (!from || !to) return null;
        const span = Math.max(1, move.arrivesAt - move.departedAt);
        const k = Math.min(1, Math.max(0, (now - move.departedAt) / span));
        const a = systemScenePosition(from);
        const b = systemScenePosition(to);
        return (
          <mesh
            key={fleet.id}
            position={[
              a[0] + (b[0] - a[0]) * k,
              a[1] + (b[1] - a[1]) * k,
              a[2] + (b[2] - a[2]) * k,
            ]}
          >
            <coneGeometry args={[SYSTEM_NODE * 0.4, SYSTEM_NODE * 1.2, 6]} />
            <meshBasicMaterial color="#4fc1ff" />
          </mesh>
        );
      })}
      {galaxy.systems.map((system, index) => {
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
              ref={(node) => {
                nodes.current[index] = node;
              }}
              // Géométrie unitaire : c'est l'échelle, écrite à chaque image, qui donne
              // sa taille au point. Un système revendiqué se rend d'un tiers plus gros.
              scale={claimed.has(system.id) ? SYSTEM_NODE * 1.3 : SYSTEM_NODE}
              onClick={() => onSelect(system)}
              onDoubleClick={() => onOpenSystem(system)}
            >
              <sphereGeometry args={[1, 16, 16]} />
              <meshBasicMaterial color={color} />
            </mesh>
          </group>
        );
      })}
    </>
  );
}
