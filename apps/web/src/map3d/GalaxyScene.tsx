import {
  MAP_HEIGHT,
  MAP_WIDTH,
  type Colony,
  type ForeignStation,
  type Galaxy,
  type StarSystem,
  type Station,
  type Territory,
} from "@spacesim/shared";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { focusOf } from "./bounds.js";
import { MapCanvas } from "./MapCanvas.js";
import { MapList } from "./MapList.js";

interface Props {
  galaxy: Galaxy;
  colonies: Colony[];
  stations: Station[];
  foreignStations: ForeignStation[];
  exploredSystemIds: string[];
  claimedSystemIds: string[];
  territories: Territory[];
  /** Itinéraire retenu à afficher (chantier 31.10), suite d'ids de systèmes. */
  highlightedRoute?: string[];
  selectedId: string | null;
  onSelect: (system: StarSystem) => void;
  onOpenSystem: (system: StarSystem) => void;
}

const NODE = 11;

/** Recentre la galaxie : le générateur pose ses systèmes dans un pavé, pas autour de 0. */
function toScene(s: {
  x: number;
  y: number;
  z: number;
}): [number, number, number] {
  return [s.x - MAP_WIDTH / 2, s.y - MAP_HEIGHT / 2, s.z];
}

/** Segment entre deux points de la scène. */
function Segment({
  from,
  to,
  color,
}: {
  from: [number, number, number];
  to: [number, number, number];
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

/**
 * Niveau galaxie en volume (chantier 31.14). La longueur d'une arête devient enfin
 * lisible : depuis le chantier 31.6 elle porte le coût du saut, ce que la carte 2D ne
 * pouvait pas montrer puisque le coût était un simple compte de sauts.
 */
export function GalaxyScene({
  galaxy,
  colonies,
  stations,
  foreignStations,
  exploredSystemIds,
  claimedSystemIds,
  territories,
  highlightedRoute,
  selectedId,
  onSelect,
  onOpenSystem,
}: Props) {
  const { t } = useTranslation();
  const byId = useMemo(
    () => new Map(galaxy.systems.map((s) => [s.id, s])),
    [galaxy],
  );
  const explored = useMemo(
    () => new Set(exploredSystemIds),
    [exploredSystemIds],
  );
  const claimed = useMemo(() => new Set(claimedSystemIds), [claimedSystemIds]);
  const colonized = useMemo(() => {
    const ids = new Set<string>();
    for (const system of galaxy.systems) {
      if (colonies.some((c) => system.planets.some((p) => p.id === c.planetId)))
        ids.add(system.id);
    }
    return ids;
  }, [galaxy, colonies]);
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

  /**
   * Cadrage sur les systèmes réellement placés. Le générateur les tire par rejet dans le
   * pavé `MAP_WIDTH × MAP_HEIGHT`, sans jamais garantir qu'il le remplisse ni qu'il soit
   * centré : cadrer sur le pavé théorique visait donc systématiquement à côté.
   */
  const focus = useMemo(
    () =>
      focusOf(galaxy.id, galaxy.systems.map(toScene), NODE * 3, MAP_HEIGHT / 5),
    [galaxy],
  );

  return (
    <div className="map3d">
      <MapCanvas
        ariaLabel={t("galaxyMap.ariaLabel", { name: galaxy.name })}
        focus={focus}
        register="schematic"
      >
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
              from={toScene(sa)}
              to={toScene(sb)}
              // L'itinéraire retenu ressort ; le reste du graphe s'efface.
              color={routePairs.has(key) ? "#4fc1ff" : "#223148"}
            />
          );
        })}
        {galaxy.systems.map((system) => {
          const position = toScene(system);
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
            <group key={system.id} position={position}>
              {/* Rappel au plan galactique : rend le z du système lisible. */}
              <Segment
                from={[0, 0, 0]}
                to={[0, 0, -system.z]}
                color="#22303f"
              />
              {/* biome-ignore lint/a11y/useKeyWithClickEvents: objet de scène three.js,
                  ni focusable ni clavier — le chemin accessible est la liste DOM
                  parallèle rendue à côté (chantier 31.16). */}
              <mesh
                onClick={() => onSelect(system)}
                onDoubleClick={() => onOpenSystem(system)}
              >
                <sphereGeometry
                  args={[claimed.has(system.id) ? NODE * 1.3 : NODE, 16, 16]}
                />
                <meshBasicMaterial color={color} />
              </mesh>
            </group>
          );
        })}
      </MapCanvas>
      <MapList
        label={t("galaxyMap.ariaLabel", { name: galaxy.name })}
        entries={galaxy.systems.map((system) => ({
          id: system.id,
          label: system.name,
          detail: colonized.has(system.id)
            ? t("galaxyMap.colonized")
            : explored.has(system.id)
              ? t("galaxyMap.explored")
              : t("galaxyMap.unexplored"),
          selected: system.id === selectedId,
        }))}
        onSelect={(id) => {
          const system = byId.get(id);
          if (system) onSelect(system);
        }}
        onOpen={(id) => {
          const system = byId.get(id);
          if (system) onOpenSystem(system);
        }}
      />
    </div>
  );
}
