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
import { seedOf } from "./appearance.js";
import { focusOf } from "./bounds.js";
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
 * Étoiles figurées par galaxie (chantier 31.23). Le compte DÉCROÎT avec la taille de
 * l'univers : à 160 étoiles fixes, les 200 galaxies d'un univers plein en dessineraient
 * 32 000 alors qu'aucune n'occupe plus de quelques pixels à cette distance. On borne le
 * total plutôt que le détail unitaire — une galaxie isolée reste dense, un amas reste
 * lisible, et le budget d'images du chantier 31.17 tient dans les deux cas.
 */
const STAR_BUDGET = 6000;
const MIN_STARS = 40;
const MAX_STARS = 160;

function starsPerGalaxy(galaxyCount: number): number {
  return Math.max(
    MIN_STARS,
    Math.min(MAX_STARS, Math.floor(STAR_BUDGET / Math.max(1, galaxyCount))),
  );
}

/**
 * Nuage d'étoiles d'une galaxie (chantier 31.19) : une spirale à deux bras, dérivée de
 * l'identifiant de la galaxie. Aucun asset, aucune persistance — deux galaxies diffèrent
 * parce que leurs ids diffèrent, comme partout ailleurs dans la génération.
 */
function GalaxyCloud({
  id,
  color,
  stars,
}: {
  id: string;
  color: string;
  stars: number;
}) {
  const positions = useMemo(() => {
    const seed = seedOf(id);
    const out = new Float32Array(stars * 3);
    for (let i = 0; i < stars; i++) {
      const t = i / stars;
      // Deux bras, enroulés d'un tour et demi, plus une dispersion qui croît vers le bord.
      const arm = i % 2 === 0 ? 0 : Math.PI;
      const angle = t * Math.PI * 3 + arm + seed * 6.283;
      const radius = DISC * (0.15 + t * 0.85);
      const jitter = (seedOf(`${id}:${i}`) - 0.5) * DISC * 0.28 * t;
      out[i * 3] = Math.cos(angle) * radius + jitter;
      out[i * 3 + 1] = Math.sin(angle) * radius + jitter;
      // Le disque s'aplatit vers l'extérieur : bulbe épais au centre.
      out[i * 3 + 2] = (seedOf(`${id}:z${i}`) - 0.5) * DISC * 0.3 * (1 - t);
    }
    return out;
  }, [id, stars]);

  return (
    <points>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
      </bufferGeometry>
      <pointsMaterial
        color={color}
        size={2.4}
        sizeAttenuation
        transparent
        opacity={0.9}
      />
    </points>
  );
}

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

  const stars = starsPerGalaxy(universe.galaxies.length);

  /**
   * Cadrage sur l'amas réellement peuplé. La spirale d'or ne remplit pas un rayon
   * prévisible : quatre galaxies tiennent dans quelques centaines d'unités, deux cents
   * s'étalent sur plusieurs milliers. Déduire la distance de `GALAXY_SPACING` plaçait la
   * caméra très au-delà d'un petit amas, qui se réduisait alors à quelques pixels.
   */
  const focus = useMemo(
    () =>
      focusOf("universe", universe.galaxies.map(toScene), DISC, GALAXY_SPACING),
    [universe],
  );
  return (
    <div className="map3d">
      <MapCanvas
        ariaLabel={t("universeMap.ariaLabel")}
        focus={focus}
        register="schematic"
      >
        {/* Plan galactique : repère visuel du z=0, sans quoi la profondeur est illisible.
            Centré sur l'amas en x/y mais laissé à z=0, qui est le plan de référence. */}
        <gridHelper
          args={[
            Math.max(focus.half[0], focus.half[1]) * 2.2,
            16,
            "#243342",
            "#18222e",
          ]}
          position={[focus.center[0], focus.center[1], 0]}
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
              <GalaxyCloud
                stars={stars}
                id={galaxy.id}
                color={
                  selected
                    ? "#9fdcff"
                    : colonized
                      ? "#8fe6a0"
                      : activeGatewayIds.has(galaxy.id)
                        ? "#cbb0ee"
                        : "#7f95ad"
                }
              />
              {/* Disque de saisie : quasi invisible, il porte le clic là où le nuage
                  de points serait trop épars pour être visé. */}
              {/* biome-ignore lint/a11y/useKeyWithClickEvents: `mesh` est un objet de
                  scène three.js, pas un nœud DOM — il ne peut recevoir ni focus ni
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
                  opacity={selected ? 0.28 : 0.12}
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
