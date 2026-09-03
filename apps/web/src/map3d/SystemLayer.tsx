import { useFrame } from "@react-three/fiber";
import {
  bodyPositionAt,
  sitePosition,
  starClassOf,
  type Fleet,
  type ForeignFleet,
  type ForeignStation,
  type MiningOutpost,
  type Planet,
  type StarSystem,
  type Station,
  type SystemSite,
} from "@spacesim/shared";
import { useEffect, useMemo, useRef, type ReactNode } from "react";
import { type Group, type InstancedMesh, Object3D } from "three";
import { ASTEROID_SHAPES, asteroidGeometry } from "./asteroids.js";
import {
  asteroidTint,
  factionTint,
  seedOf,
  siteColor,
  starAppearance,
} from "./appearance.js";
import { focusOf, type Focus } from "./bounds.js";
import { hasRings, PlanetRings } from "./PlanetRings.js";
import { ProceduralBody } from "./ProceduralBody.js";
import { BlackHole } from "./BlackHole.js";
import { StarBody } from "./StarBody.js";
import { StationModel } from "./StationModel.js";
import { TradingPostModel } from "./TradingPostModel.js";
import { orbitColor } from "./theme.js";
import type { Vec3 } from "./tiers.js";

/** Rayon du coeur de l'étoile et de sa couronne la plus externe. */
export const STAR_CORE = 13;
export const STAR_CORONA = 26;

/**
 * Rayon de rendu d'un corps (chantier 37.14).
 *
 * Sans rapport avec une échelle réelle, qui rendrait toute planète invisible à côté de son
 * étoile : ce sont des tailles de LECTURE. Mais elles étaient fausses d'un ordre de grandeur
 * de trop, et cela se voyait — une lune faisait les deux tiers du diamètre de sa planète et
 * la touchait presque, une planète rivalisait avec son soleil.
 *
 * Ce que les valeurs tiennent maintenant, les orbites étant ce qu'elles sont (70 à 290 pour
 * une planète, 26 à 46 pour une lune, et ce sont des DONNÉES, pas des réglages de rendu — une
 * galaxie matérialisée ne se régénère pas, ADR 0002) :
 *
 * | rapport | avant | après | réel |
 * |---|---|---|---|
 * | lune / son orbite | 1:5 | 1:14 | 1:220 |
 * | planète / son orbite | 1:8 | 1:16 | 1:23000 |
 * | lune / planète rocheuse | 0,56 | 0,40 | 0,27 (Lune/Terre) |
 * | étoile / planète rocheuse | 1,4 | 2,9 | 109 |
 * | orbite lunaire / rayon de la planète | 2,9 | 5,8 | 60 |
 *
 * On ne va pas au réel — une planète à l'échelle ferait un pixel sur mille — ni même aussi
 * loin que possible : essayé à 3,2 pour une rocheuse, les planètes devenaient des points de
 * six pixels qu'on ne pouvait plus viser à la souris. On va jusqu'où la hiérarchie se lit
 * sans que la carte cesse d'être manipulable : l'étoile domine, la géante se repère d'un coup
 * d'œil, la lune est nettement détachée de sa planète. Le seuil de nommage, lui, ne suit PAS
 * cette réduction : voir `bodyLabelExtent`.
 */
export function bodyRadiusOf(planet: Planet): number {
  if (planet.kind === "moon") return 1.8;
  return planet.type === "gas" ? 8 : 4.5;
}

/**
 * Emprise servant au seuil d'ÉTIQUETTE, distincte du rayon de rendu ci-dessus.
 *
 * Un nom apparaît quand son objet dépasse une taille apparente (`labelOpacity`). Réduire les
 * corps d'un facteur trois aurait donc fait disparaître les noms des planètes du palier
 * système, où ils s'affichaient tout juste — une correction d'échelle n'a pas à coûter la
 * lisibilité de la carte. Ces valeurs sont celles d'avant le chantier 37.14.
 */
export function bodyLabelExtent(planet: Planet): number {
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
  onSelect,
  onOpen,
}: {
  system: StarSystem;
  body: Planet;
  tickAt: () => number;
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
        />
        {hasRings(body) && (
          <PlanetRings body={body} radius={bodyRadiusOf(body)} />
        )}
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
  const first = useRef<InstancedMesh>(null);
  const second = useRef<InstancedMesh>(null);
  const third = useRef<InstancedMesh>(null);
  const refs = [first, second, third];

  // Trois silhouettes tirées de l'identifiant de la ceinture, réparties entre trois
  // instances : la géométrie reste partagée, mais le motif cesse de se répéter à
  // l'identique quatre-vingt-dix fois.
  const shapes = useMemo(
    () =>
      Array.from({ length: ASTEROID_SHAPES }, (_, k) =>
        // Rayon de base réduit avec les corps (chantier 37.14) : à 1,6, et une fois les
        // planètes ramenées à leur juste taille, le plus gros rocher d'une ceinture faisait
        // la taille d'une planète tellurique. Le tirage d'échelle qui suit (0,8 à 3,0) le
        // maintient désormais sous le rayon d'une lune.
        asteroidGeometry(`${belt.id}:shape${k}`, 0.6),
      ),
    [belt.id],
  );
  const tint = asteroidTint(belt.deposits);
  const perShape = Math.ceil(ASTEROIDS / ASTEROID_SHAPES);

  useEffect(() => {
    const dummy = new Object3D();
    for (const [shape, ref] of refs.entries()) {
      const mesh = ref.current;
      if (!mesh) continue;
      for (let n = 0; n < perShape; n++) {
        const i = shape * perShape + n;
        const angle = (i / ASTEROIDS) * Math.PI * 2;
        // Dispersion dérivée de l'id : deux ceintures ne se ressemblent pas.
        const spread = (seedOf(`${belt.id}:${i}`) - 0.5) * 14;
        const radius = belt.orbitRadius + spread;
        dummy.position.set(
          Math.cos(angle) * radius,
          Math.sin(angle) * radius,
          (seedOf(`${belt.id}:z${i}`) - 0.5) * 8,
        );
        dummy.scale.setScalar(0.8 + seedOf(`${belt.id}:s${i}`) * 2.2);
        dummy.rotation.set(angle, spread, i);
        dummy.updateMatrix();
        mesh.setMatrixAt(n, dummy.matrix);
      }
      mesh.instanceMatrix.needsUpdate = true;
    }
    // Dépendances volontairement incomplètes : les trois références sont stables, seul le
    // contenu de la ceinture décide des matrices.
  }, [belt, perShape]);

  return (
    <group rotation={[belt.inclination, 0, belt.ascendingNode]}>
      {shapes.map((geometry, k) => (
        <instancedMesh
          key={`${belt.id}:${k}`}
          ref={refs[k]}
          args={[geometry, undefined, perShape]}
        >
          {/* La teinte vient du gisement : une ceinture de fer ne ressemble plus à une
              ceinture de glace, et c'était la seule chose qu'elle avait à dire. */}
          <meshStandardMaterial color={tint} roughness={1} />
        </instancedMesh>
      ))}
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

/** Taille de lecture des objets manufacturés dans le repère du système. */
const TRADING_POST = 11;
const STATION = 9;
const OUTPOST = 4;
const FLEET = 5;

/**
 * Orbite d'un objet que le modèle ne situe pas (chantier 35.8).
 *
 * Un comptoir n'a ni rayon ni angle : le modèle ne lui en donne pas, et lui en ajouter
 * demanderait une colonne et une régénération. La position se **dérive de l'identifiant**,
 * comme le reste de l'univers — stable d'une session à l'autre, sans rien persister.
 */
export function derivedOrbit(id: string, extent: number): Vec3 {
  const angle = seedOf(`${id}:angle`) * Math.PI * 2;
  const radius = extent * (0.35 + seedOf(`${id}:radius`) * 0.45);
  return [
    Math.cos(angle) * radius,
    Math.sin(angle) * radius,
    (seedOf(`${id}:z`) - 0.5) * extent * 0.06,
  ];
}

/** Objet manufacturé accroché à un corps : il suit son orbite. */
function InOrbitOf({
  system,
  body,
  tickAt,
  offset,
  children,
}: {
  system: StarSystem;
  body: Planet;
  tickAt: () => number;
  offset: number;
  children: ReactNode;
}) {
  const ref = useRef<Group>(null);
  useFrame(() => {
    if (!ref.current) return;
    const p = bodyPositionAt(system, body, tickAt());
    ref.current.position.set(p.x + offset, p.y + offset * 0.35, p.z);
  });
  return <group ref={ref}>{children}</group>;
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
  /** Stations, avant-postes et flottes — absents de la carte jusqu'au chantier 35.8. */
  stations: Station[];
  foreignStations: ForeignStation[];
  outposts: MiningOutpost[];
  fleets: Fleet[];
  foreignFleets: ForeignFleet[];
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
  stations,
  foreignStations,
  outposts,
  fleets,
  foreignFleets,
  onSelectBody,
  onOpenBody,
}: Props) {
  const planets = system.planets.filter((p) => p.kind === "planet");
  const drawn = system.planets.filter((p) => !hiddenBodyIds?.has(p.id));
  const extent = systemExtent(system, sites);
  const bodyById = new Map(system.planets.map((p) => [p.id, p]));
  const beltById = new Map(system.belts.map((b) => [b.id, b]));
  const here = <T extends { systemId: string }>(list: T[]) =>
    list.filter((x) => x.systemId === system.id);
  const starClass = starClassOf(system);
  const look = starAppearance(starClass);

  return (
    <>
      {/* L'étoile, et la lumière du système. Elle prend sa teinte et son intensité de sa
          classe (chantier 35.10) : une naine rouge éclaire peu et rouge. Un trou noir
          n'éclaire pas du tout — c'est son disque d'accrétion qui s'en charge, et il porte
          donc sa propre lumière. */}
      {starClass === "blackHole" ? (
        <BlackHole
          id={system.id}
          radius={STAR_CORE * look.radius}
          discRadius={STAR_CORONA * look.corona}
          color={look.halo}
        />
      ) : (
        <>
          <pointLight
            position={[0, 0, 0]}
            color={look.light}
            intensity={look.intensity}
            decay={0.4}
          />
          <StarBody
            id={system.id}
            radius={STAR_CORE}
            coronaRadius={STAR_CORONA}
            starClass={starClass}
          />
        </>
      )}

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
          onSelect={() => onSelectBody(body)}
          onOpen={() => onOpenBody(body)}
        />
      ))}

      {/* Comptoir NPC. Il n'était pas rendu : un système qui en porte un était
          indiscernable d'un système vide, alors que c'est le seul endroit où l'on peut
          commercer sans rien avoir bâti. */}
      {system.station && (
        <group
          position={
            derivedOrbit(system.station.id, extent) as [number, number, number]
          }
        >
          <TradingPostModel
            id={system.station.id}
            color={factionTint(system.station.factionId)}
            size={TRADING_POST}
          />
        </group>
      )}

      {/* Stations du joueur : la silhouette est celle qu'il a bâtie, cellule par cellule.
          `StationModel` existait depuis le chantier 31.21 mais n'était utilisé qu'en
          aperçu — ce qu'on construit apparaissait nulle part sur la carte. */}
      {here(stations).map((station) => {
        const body = bodyById.get(station.bodyId);
        if (!body) return null;
        return (
          <InOrbitOf
            key={station.id}
            system={system}
            body={body}
            tickAt={tickAt}
            offset={bodyRadiusOf(body) * 2.2}
          >
            <StationModel station={station} size={STATION} />
          </InOrbitOf>
        );
      })}

      {/* Stations étrangères : même place, teinte du propriétaire, silhouette générique —
          le modèle redacté ne porte pas les zones. */}
      {here(foreignStations).map((station) => {
        const body = bodyById.get(station.bodyId);
        if (!body) return null;
        return (
          <InOrbitOf
            key={station.id}
            system={system}
            body={body}
            tickAt={tickAt}
            offset={bodyRadiusOf(body) * 2.2}
          >
            <TradingPostModel
              id={station.id}
              color={station.ownerColor}
              size={STATION}
            />
          </InOrbitOf>
        );
      })}

      {/* Avant-postes miniers, sur la ceinture qu'ils exploitent. */}
      {outposts.map((outpost) => {
        const belt = beltById.get(outpost.beltId);
        if (!belt) return null;
        const angle = seedOf(`${outpost.id}:angle`) * Math.PI * 2;
        return (
          <group
            key={outpost.id}
            rotation={[belt.inclination, 0, belt.ascendingNode]}
          >
            <mesh
              position={[
                Math.cos(angle) * belt.orbitRadius,
                Math.sin(angle) * belt.orbitRadius,
                0,
              ]}
            >
              <boxGeometry args={[OUTPOST, OUTPOST, OUTPOST * 1.6]} />
              <meshStandardMaterial color="#9a8f6a" roughness={0.9} />
            </mesh>
          </group>
        );
      })}

      {/* Flottes stationnées, siennes et étrangères. En transit elles vivent au palier
          galaxie : un déplacement va d'un système à un autre. */}
      {[
        ...here(fleets).map((f) => ({ id: f.id, color: "#4fc1ff" })),
        ...here(foreignFleets).map((f) => ({ id: f.id, color: f.ownerColor })),
      ].map((fleet) => (
        <mesh
          key={fleet.id}
          position={
            derivedOrbit(`fleet:${fleet.id}`, extent * 0.4) as [
              number,
              number,
              number,
            ]
          }
        >
          <coneGeometry args={[FLEET * 0.5, FLEET * 1.6, 6]} />
          <meshStandardMaterial color={fleet.color} roughness={0.5} />
        </mesh>
      ))}

      {/* Sites du scan : figés, une épave à la dérive n'a pas de période utile. */}
      {sites.map((site) => {
        const p = sitePosition(site);
        return (
          <mesh
            key={site.id}
            position={[p.x, p.y, p.z]}
            rotation={[
              seedOf(site.id) * 6.283,
              seedOf(`${site.id}:r`) * 6.283,
              0,
            ]}
          >
            {/* Une forme par nature (chantier 35.10) : les trois ne se distinguaient que
                par leur teinte, ce qui ne se lit pas de loin. */}
            {site.kind === "wreck" ? (
              <boxGeometry args={[12, 3, 3]} />
            ) : site.kind === "cache" ? (
              <boxGeometry args={[5, 5, 5]} />
            ) : (
              <octahedronGeometry args={[5]} />
            )}
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
