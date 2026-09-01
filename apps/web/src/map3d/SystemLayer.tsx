import { useFrame } from "@react-three/fiber";
import {
  bodyPositionAt,
  sitePosition,
  type Planet,
  type StarSystem,
  type SystemSite,
} from "@spacesim/shared";
import { useEffect, useRef } from "react";
import { type Group, type InstancedMesh, Object3D } from "three";
import { seedOf, siteColor } from "./appearance.js";
import { focusOf, type Focus } from "./bounds.js";
import { ProceduralBody } from "./ProceduralBody.js";
import { StarBody } from "./StarBody.js";
import { orbitColor } from "./theme.js";
import type { Vec3 } from "./tiers.js";

/** Rayon du coeur de l'étoile et de sa couronne la plus externe. */
export const STAR_CORE = 13;
export const STAR_CORONA = 26;

/**
 * Rayon de rendu d'un corps. Sans rapport avec une échelle réelle, qui rendrait toute
 * planète invisible à côté de son étoile : ce sont des tailles de LECTURE, calées pour
 * qu'une lune reste distincte de sa planète et qu'une géante se repère d'un coup d'œil.
 */
export function bodyRadiusOf(planet: Planet): number {
  if (planet.kind === "moon") return 5;
  return planet.type === "gas" ? 14 : 9;
}

/**
 * Étendue du système, orbites comprises.
 *
 * Plancher = la couronne de l'étoile, pas une valeur ronde : un système aux orbites
 * serrées se cadrait sur 200 unités de vide et n'occupait qu'un tiers de l'image.
 */
export function systemExtent(
  system: StarSystem,
  sites: readonly SystemSite[],
): number {
  return Math.max(
    STAR_CORONA * 2.2,
    ...system.planets.map((p) => p.orbitRadius + bodyRadiusOf(p)),
    ...system.belts.map((b) => b.orbitRadius),
    ...sites.map((s) => s.orbitRadius),
  );
}

/**
 * Cadrage du système. Le centre est connu — c'est l'étoile —, seul le rayon dépend du
 * contenu. Les orbites sont parcourues comme des points cardinaux : la sphère englobante
 * doit contenir l'orbite entière, pas la position instantanée des corps.
 */
export function systemFocus(
  system: StarSystem,
  sites: readonly SystemSite[],
): Focus {
  const extent = systemExtent(system, sites);
  return focusOf(
    system.id,
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

/**
 * Un corps, repositionné à chaque image. Les orbites bougent en continu alors que le
 * serveur n'avance que toutes les `TICK_MS` : le tick fractionnaire interpole entre deux
 * ticks, sinon les planètes sauteraient toutes les cinq secondes.
 *
 * La position est écrite directement sur le `group` plutôt que par un état React — un
 * `setState` par image et par corps re-rendrait tout l'arbre soixante fois par seconde.
 */
function OrbitingBody({
  system,
  body,
  tickAt,
  selected,
  onSelect,
  onOpen,
}: {
  system: StarSystem;
  body: Planet;
  tickAt: () => number;
  selected: boolean;
  onSelect: () => void;
  onOpen: () => void;
}) {
  const ref = useRef<Group>(null);
  useFrame(() => {
    if (!ref.current) return;
    const p = bodyPositionAt(system, body, tickAt());
    ref.current.position.set(p.x, p.y, p.z);
  });
  return (
    <group ref={ref}>
      {/* biome-ignore lint/a11y/useKeyWithClickEvents: objet de scène three.js, ni
          focusable ni clavier — le chemin accessible est la liste DOM parallèle
          (chantier 31.16). */}
      <group onClick={onSelect} onDoubleClick={onOpen}>
        <ProceduralBody
          id={body.id}
          type={body.type}
          radius={bodyRadiusOf(body)}
          selected={selected}
        />
      </group>
    </group>
  );
}

/**
 * Ceinture d'astéroïdes en rochers instanciés (chantier 31.19). Une seule géométrie
 * dessinée `ASTEROIDS` fois : sans instanciation, une ceinture coûterait autant de
 * commandes de dessin que de rochers.
 */
const ASTEROIDS = 90;

function AsteroidBelt({ belt }: { belt: StarSystem["belts"][number] }) {
  const ref = useRef<InstancedMesh>(null);
  useEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    const dummy = new Object3D();
    for (let i = 0; i < ASTEROIDS; i++) {
      const angle = (i / ASTEROIDS) * Math.PI * 2;
      // Dispersion dérivée de l'id : deux ceintures ne se ressemblent pas.
      const spread = (seedOf(`${belt.id}:${i}`) - 0.5) * 14;
      const radius = belt.orbitRadius + spread;
      dummy.position.set(
        Math.cos(angle) * radius,
        Math.sin(angle) * radius,
        (seedOf(`${belt.id}:z${i}`) - 0.5) * 8,
      );
      const scale = 0.8 + seedOf(`${belt.id}:s${i}`) * 2.2;
      dummy.scale.setScalar(scale);
      dummy.rotation.set(angle, spread, i);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
  }, [belt]);

  return (
    <group rotation={[belt.inclination, 0, belt.ascendingNode]}>
      <instancedMesh ref={ref} args={[undefined, undefined, ASTEROIDS]}>
        {/* Icosaèdre non subdivisé : anguleux comme un caillou, trois fois moins de
            sommets qu'une sphère. */}
        <icosahedronGeometry args={[1.6, 0]} />
        <meshStandardMaterial color="#6b5a44" roughness={1} />
      </instancedMesh>
    </group>
  );
}

/** Anneau d'orbite, tracé dans le plan du corps puis incliné comme lui. */
function OrbitRing({ body }: { body: Planet }) {
  return (
    <mesh rotation={[body.inclination, 0, body.ascendingNode]}>
      <ringGeometry
        args={[body.orbitRadius - 0.35, body.orbitRadius + 0.35, 96]}
      />
      {/* Relevé au chantier 33.8 : `#1e2a38` à 0,7 sur le fond plat `#080b10` se
          distinguait à peine — l'anneau porte pourtant la lecture de la géométrie du
          système. La teinte vient du jeton de bordure claire, comme les filets du HUD. */}
      <meshBasicMaterial color={orbitColor()} transparent opacity={0.85} />
    </mesh>
  );
}

interface Props {
  system: StarSystem;
  /** Sites révélés par un scan (chantier 31.11) — absents tant que le système n'est pas scanné. */
  sites: SystemSite[];
  /** Tick fractionnaire courant, partagé par toute la scène (`MapScene`). */
  tickAt: () => number;
  /**
   * Corps repris en charge par le palier corps, à ne pas dessiner ici (chantier 35.3).
   *
   * Les deux paliers coexistent pendant la transition et rendent le même corps à la même
   * place et à la même taille — deux surfaces coplanaires que le tampon de profondeur
   * départage au hasard, d'une image à l'autre. L'orbite, elle, reste tracée : le palier
   * corps est centré sur la planète et ne la montre pas tourner autour de son étoile.
   */
  hiddenBodyIds?: ReadonlySet<string>;
  selectedBodyId: string | null;
  onSelectBody: (planet: Planet) => void;
  onOpenBody: (planet: Planet) => void;
}

/**
 * Contenu du palier système (chantiers 31.15 puis 35.3). Registre semi-réaliste : l'étoile
 * éclaire réellement les corps, c'est le niveau où le joueur regarde plutôt qu'il ne
 * pilote.
 *
 * La lumière ponctuelle vit ici et non dans `MapCanvas` : depuis que les paliers
 * coexistent, l'étoile n'est plus à l'origine de la scène mais à la position du système
 * dans sa galaxie. Elle appartient donc au contenu, pas au socle de rendu.
 */
export function SystemLayer({
  system,
  sites,
  tickAt,
  hiddenBodyIds,
  selectedBodyId,
  onSelectBody,
  onOpenBody,
}: Props) {
  const planets = system.planets.filter((p) => p.kind === "planet");
  const drawn = system.planets.filter((p) => !hiddenBodyIds?.has(p.id));

  return (
    <>
      {/* L'étoile est au centre du repère du système : une lumière ponctuelle à son
          origine locale suffit à donner leur relief aux corps qui l'entourent. */}
      <pointLight position={[0, 0, 0]} intensity={3} decay={0.4} />

      {/* L'étoile : surface procédurale, et source de lumière du registre `lit`. */}
      <StarBody id={system.id} radius={STAR_CORE} coronaRadius={STAR_CORONA} />

      {planets.map((planet) => (
        <OrbitRing key={`ring-${planet.id}`} body={planet} />
      ))}

      {system.belts.map((belt) => (
        <AsteroidBelt key={belt.id} belt={belt} />
      ))}

      {drawn.map((body) => (
        <OrbitingBody
          key={body.id}
          system={system}
          body={body}
          tickAt={tickAt}
          selected={body.id === selectedBodyId}
          onSelect={() => onSelectBody(body)}
          onOpen={() => onOpenBody(body)}
        />
      ))}

      {/* Sites du scan : figés, une épave à la dérive n'a pas de période utile. */}
      {sites.map((site) => {
        const p = sitePosition(site);
        return (
          <mesh key={site.id} position={[p.x, p.y, p.z]}>
            <octahedronGeometry args={[5]} />
            <meshBasicMaterial color={siteColor(site.kind)} />
          </mesh>
        );
      })}
    </>
  );
}

/** Position d'un corps dans le repère de son système, au tick fractionnaire donné. */
export function bodyLocalPosition(
  system: StarSystem,
  body: Planet,
  tick: number,
): Vec3 {
  const p = bodyPositionAt(system, body, tick);
  return [p.x, p.y, p.z];
}
