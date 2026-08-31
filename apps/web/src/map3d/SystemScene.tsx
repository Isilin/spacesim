import {
  bodyPositionAt,
  sitePosition,
  TICK_MS,
  type Planet,
  type StarSystem,
  type SystemSite,
} from "@spacesim/shared";
import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import { useTranslation } from "react-i18next";
import { type Group, type InstancedMesh, Object3D } from "three";
import { seedOf, siteColor } from "./appearance.js";
import { focusOf } from "./bounds.js";
import { MapCanvas } from "./MapCanvas.js";
import { MapList } from "./MapList.js";
import { ProceduralBody } from "./ProceduralBody.js";

interface Props {
  system: StarSystem;
  /** Sites révélés par un scan (chantier 31.11) — absents tant que le système n'est pas scanné. */
  sites: SystemSite[];
  /** Tick serveur courant et date du dernier tick : servent à interpoler les orbites. */
  tick: number;
  lastTickAt: number;
  selectedBodyId: string | null;
  onSelectBody: (planet: Planet) => void;
  onOpenBody: (planet: Planet) => void;
}

/**
 * Rayon de rendu d'un corps. Sans rapport avec une échelle réelle, qui rendrait toute
 * planète invisible à côté de son étoile : ce sont des tailles de LECTURE, calées pour
 * qu'une lune reste distincte de sa planète et qu'une géante se repère d'un coup d'œil.
 */
function radiusOf(planet: Planet): number {
  if (planet.kind === "moon") return 5;
  return planet.type === "gas" ? 14 : 9;
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
          radius={radiusOf(body)}
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

/** Rayon du coeur de l'étoile et de sa couronne la plus externe. */
const STAR_CORE = 13;
const STAR_CORONA = 26;

/** Anneau d'orbite, tracé dans le plan du corps puis incliné comme lui. */
function OrbitRing({ body }: { body: Planet }) {
  return (
    <mesh
      rotation={[body.inclination, 0, body.ascendingNode]}
      // L'anneau est plat : on le couche dans le plan de l'orbite.
    >
      <ringGeometry
        args={[body.orbitRadius - 0.4, body.orbitRadius + 0.4, 96]}
      />
      <meshBasicMaterial color="#1e2a38" transparent opacity={0.7} />
    </mesh>
  );
}

/**
 * Niveau système en volume (chantier 31.15). Registre semi-réaliste : l'étoile éclaire
 * réellement les corps, c'est le niveau où le joueur regarde plutôt qu'il ne pilote.
 */
export function SystemScene({
  system,
  sites,
  tick,
  lastTickAt,
  selectedBodyId,
  onSelectBody,
  onOpenBody,
}: Props) {
  const { t } = useTranslation();

  // Tick fractionnaire : le serveur n'avance que par pas de TICK_MS, l'écran par image.
  const tickAt = useMemo(
    () => () => tick + Math.max(0, (Date.now() - lastTickAt) / TICK_MS),
    [tick, lastTickAt],
  );

  const planets = system.planets.filter((p) => p.kind === "planet");
  // Plancher = la couronne de l'étoile, pas une valeur ronde : un système aux orbites
  // serrées se cadrait sur 200 unités de vide et n'occupait qu'un tiers de l'image.
  const extent = Math.max(
    STAR_CORONA * 2.2,
    ...system.planets.map((p) => p.orbitRadius + radiusOf(p)),
    ...system.belts.map((b) => b.orbitRadius),
    ...sites.map((s) => s.orbitRadius),
  );
  const byId = new Map(system.planets.map((p) => [p.id, p]));

  // Ici le centre est connu — c'est l'étoile —, seul le rayon dépend du contenu. Les
  // orbites sont parcourues comme des points cardinaux : la sphère englobante doit
  // contenir l'orbite entière, pas la position instantanée des corps.
  const focus = useMemo(
    () =>
      focusOf(
        system.id,
        [
          [extent, 0, 0],
          [-extent, 0, 0],
          [0, extent, 0],
          [0, -extent, 0],
        ],
        0,
        extent,
      ),
    [system.id, extent],
  );

  return (
    <div className="map3d">
      <MapCanvas
        ariaLabel={t("systemView.ariaLabel", { name: system.name })}
        focus={focus}
        register="lit"
      >
        {/* L'étoile : émissive, elle est aussi la source de lumière du registre `lit`. */}
        <mesh>
          <sphereGeometry args={[STAR_CORE, 32, 32]} />
          <meshBasicMaterial color="#ffd27f" />
        </mesh>
        {/* Couronne : deux coques translucides suffisent à donner à l'étoile sa
            présence, sans post-traitement ni passe de bloom. */}
        <mesh>
          <sphereGeometry args={[STAR_CORE * 1.4, 24, 24]} />
          <meshBasicMaterial color="#ffb347" transparent opacity={0.22} />
        </mesh>
        <mesh>
          <sphereGeometry args={[STAR_CORONA, 24, 24]} />
          <meshBasicMaterial color="#ff9640" transparent opacity={0.1} />
        </mesh>

        {planets.map((planet) => (
          <OrbitRing key={`ring-${planet.id}`} body={planet} />
        ))}

        {system.belts.map((belt) => (
          <AsteroidBelt key={belt.id} belt={belt} />
        ))}

        {system.planets.map((body) => (
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
      </MapCanvas>
      <MapList
        label={t("systemView.ariaLabel", { name: system.name })}
        entries={[
          ...system.planets.map((body) => ({
            id: body.id,
            label: body.name,
            detail:
              body.kind === "moon"
                ? t("systemView.moon")
                : t("systemView.habitability", { value: body.habitability }),
            selected: body.id === selectedBodyId,
          })),
          ...sites.map((site) => ({
            id: site.id,
            label: t(`systemPanel.siteKind.${site.kind}`),
            detail: t("systemPanel.siteOrbit", {
              radius: Math.round(site.orbitRadius),
            }),
          })),
        ]}
        onSelect={(id) => {
          const body = byId.get(id);
          if (body) onSelectBody(body);
        }}
        onOpen={(id) => {
          const body = byId.get(id);
          if (body) onOpenBody(body);
        }}
      />
    </div>
  );
}
