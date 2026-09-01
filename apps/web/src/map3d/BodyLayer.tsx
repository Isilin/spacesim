import { useFrame } from "@react-three/fiber";
import {
  bodyPositionAt,
  type Colony,
  type Planet,
  type StarSystem,
  type Station,
} from "@spacesim/shared";
import { useRef } from "react";
import type { Group } from "three";
import { focusOf, type Focus } from "./bounds.js";
import { hasRings, PlanetRings } from "./PlanetRings.js";
import { ProceduralBody } from "./ProceduralBody.js";
import { bodyRadiusOf } from "./SystemLayer.js";
import { orbitColor } from "./theme.js";

/** Lunes en orbite d'un corps, dans l'ordre du modèle. */
export function moonsOf(system: StarSystem, body: Planet): Planet[] {
  return system.planets.filter((p) => p.parentPlanetId === body.id);
}

/**
 * Étendue du voisinage d'un corps : lui-même et ses lunes, dans les unités de son système.
 *
 * Le palier corps n'introduit **aucun changement d'échelle** — il vit dans les coordonnées
 * de son système. Ce qui le distingue du palier au-dessus n'est pas la taille des objets,
 * qui est identique de part et d'autre du franchissement et rend donc celui-ci invisible,
 * mais le détail qu'on ajoute une fois qu'on est assez près pour le voir : anneaux
 * d'orbite lunaires, marqueurs de colonie et de station.
 */
export function bodyExtent(system: StarSystem, body: Planet): number {
  return Math.max(
    bodyRadiusOf(body) * 2.6,
    ...moonsOf(system, body).map((m) => m.orbitRadius + bodyRadiusOf(m) * 2),
  );
}

export function bodyFocus(system: StarSystem, body: Planet): Focus {
  const extent = bodyExtent(system, body);
  return focusOf(
    body.id,
    [
      [extent, 0, 0],
      [-extent, 0, 0],
      [0, extent, 0],
      [0, -extent, 0],
    ],
    0,
    extent,
  );
}

/** Anneau d'orbite d'une lune, tracé dans le plan de son orbite autour du corps. */
function MoonOrbitRing({ moon }: { moon: Planet }) {
  const width = Math.max(0.12, moon.orbitRadius * 0.008);
  return (
    <mesh rotation={[moon.inclination, 0, moon.ascendingNode]}>
      <ringGeometry
        args={[moon.orbitRadius - width, moon.orbitRadius + width, 96]}
      />
      <meshBasicMaterial color={orbitColor()} transparent opacity={0.75} />
    </mesh>
  );
}

/**
 * Une lune, positionnée **relativement à sa planète**.
 *
 * `bodyPositionAt` rend une position dans le repère du système ; le repère de ce palier est
 * centré sur la planète. La différence des deux est la position locale, et elle se
 * recalcule à chaque image parce que les deux corps avancent sur leurs orbites.
 */
function OrbitingMoon({
  system,
  parent,
  moon,
  tickAt,
  selected,
  onSelect,
  onOpen,
}: {
  system: StarSystem;
  parent: Planet;
  moon: Planet;
  tickAt: () => number;
  selected: boolean;
  onSelect: () => void;
  onOpen: () => void;
}) {
  const ref = useRef<Group>(null);
  useFrame(() => {
    if (!ref.current) return;
    const t = tickAt();
    const here = bodyPositionAt(system, moon, t);
    const origin = bodyPositionAt(system, parent, t);
    ref.current.position.set(
      here.x - origin.x,
      here.y - origin.y,
      here.z - origin.z,
    );
  });
  return (
    <group ref={ref}>
      {/* biome-ignore lint/a11y/useKeyWithClickEvents: objet de scène three.js, ni
          focusable ni clavier — le chemin accessible est la liste DOM parallèle
          (chantier 31.16). */}
      <group onClick={onSelect} onDoubleClick={onOpen}>
        <ProceduralBody
          id={moon.id}
          type={moon.type}
          radius={bodyRadiusOf(moon)}
          selected={selected}
        />
      </group>
    </group>
  );
}

/** Anneau plat autour du corps, posé dans le plan de son orbite. */
function Marker({
  radius,
  color,
  opacity,
}: {
  radius: number;
  color: string;
  opacity: number;
}) {
  return (
    <mesh>
      <ringGeometry args={[radius, radius * 1.05, 64]} />
      <meshBasicMaterial color={color} transparent opacity={opacity} />
    </mesh>
  );
}

interface Props {
  system: StarSystem;
  body: Planet;
  tickAt: () => number;
  colonies: Colony[];
  stations: Station[];
  selectedBodyId: string | null;
  onSelectBody: (body: Planet) => void;
  onOpenBody: (body: Planet) => void;
}

/**
 * Contenu du palier corps (chantier 35.3).
 *
 * C'était le seul des quatre niveaux de carte à n'être pas de la 3D : `BodyView` en rendait
 * un schéma SVG figé de 320 px, sans zoom, où les lunes étaient posées à leur angle initial
 * et n'avançaient jamais. Ici elles tournent réellement, sur les mêmes orbites que la
 * simulation, et la fiche physique devient l'ouverture pleine plutôt qu'un niveau de carte.
 */
export function BodyLayer({
  system,
  body,
  tickAt,
  colonies,
  stations,
  selectedBodyId,
  onSelectBody,
  onOpenBody,
}: Props) {
  const moons = moonsOf(system, body);
  const radius = bodyRadiusOf(body);
  const hasColony = colonies.some((c) => c.planetId === body.id);
  const hasStation = stations.some((s) => s.bodyId === body.id);

  return (
    <>
      {/* biome-ignore lint/a11y/useKeyWithClickEvents: objet de scène three.js, ni
          focusable ni clavier — le chemin accessible est la liste DOM parallèle. */}
      <group
        onClick={() => onSelectBody(body)}
        onDoubleClick={() => onOpenBody(body)}
      >
        {/* Pas de halo sur le corps ancré : à ce palier il occupe l'écran, et le
            grillage de sélection — dimensionné pour le repérer de loin dans un système —
            le recouvrait entièrement. Les lunes gardent le leur, elles restent à choisir
            parmi d'autres. */}
        <ProceduralBody
          id={body.id}
          type={body.type}
          radius={radius}
          selected={false}
        />
        {/* Les mêmes anneaux qu'au palier système (chantier 35.12) : la géante les portait
            de loin et les perdait de près, au moment exact où l'on s'approchait pour les
            regarder. */}
        {hasRings(body) && <PlanetRings body={body} radius={radius} />}
      </group>

      {/* Deux rayons distincts : un corps peut porter colonie ET station (chantier 24). */}
      {hasColony && (
        <Marker radius={radius * 1.5} color="#56d364" opacity={0.8} />
      )}
      {hasStation && (
        <Marker radius={radius * 1.9} color="#e0b64f" opacity={0.8} />
      )}

      {moons.map((moon) => (
        <MoonOrbitRing key={`ring-${moon.id}`} moon={moon} />
      ))}
      {moons.map((moon) => (
        <OrbitingMoon
          key={moon.id}
          system={system}
          parent={body}
          moon={moon}
          tickAt={tickAt}
          selected={moon.id === selectedBodyId}
          onSelect={() => onSelectBody(moon)}
          onOpen={() => onOpenBody(moon)}
        />
      ))}
    </>
  );
}
