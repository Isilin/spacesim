import {
  GALAXY_SPACING,
  UNIVERSE_CENTER_X,
  UNIVERSE_CENTER_Y,
  type Colony,
  type Galaxy,
  type Gateway,
  type Universe,
} from "@spacesim/shared";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { MapCanvas } from "./MapCanvas.js";
import { MapList } from "./MapList.js";

interface Props {
  universe: Universe;
  colonies: Colony[];
  gateways: Gateway[];
  selectedId: string | null;
  onSelect: (galaxy: Galaxy) => void;
  onOpenGalaxy: (galaxy: Galaxy) => void;
}

/** Rayon du disque d'une galaxie dans la scène. */
const DISC = 55;

/**
 * Repère de scène : le générateur pose les galaxies autour de
 * (`UNIVERSE_CENTER_X`, `UNIVERSE_CENTER_Y`) avec un `z` centré sur 0. On recentre pour
 * que l'origine de la scène soit le centre de l'amas — la caméra orbite autour de lui.
 */
function toScene(g: { x: number; y: number; z: number }): [
  number,
  number,
  number,
] {
  return [g.x - UNIVERSE_CENTER_X, g.y - UNIVERSE_CENTER_Y, g.z];
}

/**
 * Niveau univers en volume (chantier 31.13). Registre schématique : c'est une carte de
 * commandement, pas une photographie — disques plats, halos d'accent, aucun relief.
 */
export function UniverseScene({
  universe,
  colonies,
  gateways,
  selectedId,
  onSelect,
  onOpenGalaxy,
}: Props) {
  const { t } = useTranslation();

  const colonizedGalaxyIds = useMemo(() => {
    const ids = new Set<string>();
    for (const colony of colonies) {
      for (const galaxy of universe.galaxies) {
        if (
          galaxy.systems.some((s) =>
            s.planets.some((p) => p.id === colony.planetId),
          )
        )
          ids.add(galaxy.id);
      }
    }
    return ids;
  }, [universe, colonies]);

  const activeGatewayIds = useMemo(
    () => new Set(gateways.filter((g) => g.active).map((g) => g.galaxyId)),
    [gateways],
  );

  const byId = useMemo(
    () => new Map(universe.galaxies.map((g) => [g.id, g])),
    [universe],
  );

  // La caméra doit embrasser l'amas entier : son rayon croît en √n (spirale d'or).
  const distance = Math.max(
    600,
    GALAXY_SPACING * Math.sqrt(universe.galaxies.length) * 2.4,
  );

  return (
    <div className="map3d">
      <MapCanvas
        ariaLabel={t("universeMap.ariaLabel")}
        distance={distance}
        register="schematic"
      >
        {/* Plan galactique : repère visuel du z=0, sans quoi la profondeur est illisible. */}
        <gridHelper
          args={[distance * 2, 20, "#1c2733", "#141c26"]}
          rotation={[Math.PI / 2, 0, 0]}
        />
        {universe.galaxies.map((galaxy) => {
          const position = toScene(galaxy);
          const colonized = colonizedGalaxyIds.has(galaxy.id);
          const selected = galaxy.id === selectedId;
          return (
            <group key={galaxy.id} position={position}>
              {/* Trait de rappel vers le plan : c'est lui qui rend le z lisible. */}
              <line>
                <bufferGeometry>
                  <bufferAttribute
                    attach="attributes-position"
                    args={[new Float32Array([0, 0, 0, 0, 0, -galaxy.z]), 3]}
                  />
                </bufferGeometry>
                <lineBasicMaterial color="#2a3a4a" />
              </line>
              {/* biome-ignore lint/a11y/useKeyWithClickEvents: `mesh` est un objet
                  de scène three.js, pas un nœud DOM — il ne peut recevoir ni focus ni
                  événement clavier. Le chemin accessible est la liste DOM parallèle
                  rendue à côté (chantier 31.16), qui porte les mêmes actions. */}
              <mesh
                onClick={() => onSelect(galaxy)}
                onDoubleClick={() => onOpenGalaxy(galaxy)}
              >
                <circleGeometry args={[DISC, 32]} />
                <meshBasicMaterial
                  color={
                    selected
                      ? "#4fc1ff"
                      : colonized
                        ? "#56d364"
                        : activeGatewayIds.has(galaxy.id)
                          ? "#b48fe0"
                          : "#2f3d4d"
                  }
                  transparent
                  opacity={selected ? 0.95 : 0.65}
                />
              </mesh>
            </group>
          );
        })}
      </MapCanvas>
      <MapList
        label={t("universeMap.ariaLabel")}
        entries={universe.galaxies.map((galaxy) => ({
          id: galaxy.id,
          label: galaxy.name,
          detail: colonizedGalaxyIds.has(galaxy.id)
            ? t("universeMap.colonized")
            : undefined,
          selected: galaxy.id === selectedId,
        }))}
        onSelect={(id) => {
          const galaxy = byId.get(id);
          if (galaxy) onSelect(galaxy);
        }}
        onOpen={(id) => {
          const galaxy = byId.get(id);
          if (galaxy) onOpenGalaxy(galaxy);
        }}
      />
    </div>
  );
}
