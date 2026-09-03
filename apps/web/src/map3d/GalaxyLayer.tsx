import {
  galacticCoreDisc,
  galacticCoreHorizon,
  MAP_HEIGHT,
  MAP_WIDTH,
  systemCountOf,
  type Fleet,
  type ForeignStation,
  type Galaxy,
  type StarSystem,
  type Station,
  type Territory,
} from "@spacesim/shared";
import { useFrame, type ThreeEvent } from "@react-three/fiber";
import { useLayoutEffect, useMemo, useRef } from "react";
import {
  AdditiveBlending,
  Color,
  InstancedBufferAttribute,
  InstancedMesh,
  Matrix4,
  Sphere,
  Vector3,
  type Intersection,
  type Raycaster,
} from "three";
import { starAppearance } from "./appearance.js";
import { BlackHole } from "./BlackHole.js";
import { focusOf, type Focus } from "./bounds.js";
import { FOV } from "./MapCanvas.js";
import { worldPerPixel, type Vec3 } from "./tiers.js";

/**
 * Emprise d'un système dans le repère de la galaxie — ce que le palier système remplit
 * quand on y descend (chantier 37.13).
 *
 * Elle valait 11 pour une galaxie de quatorze systèmes espacés de ~150 unités : un système
 * occupait 7 % de la distance à son voisin, si bien qu'une fois l'étoile au centre de
 * l'écran, ses voisines tenaient encore dans le cadre. Le rapport était faux d'un facteur
 * énorme — dans le ciel réel, un système est de l'ordre du cent-millième de l'écart entre
 * deux étoiles.
 *
 * À 3, le voisin est à ~50 emprises : il sort du champ avant que l'étoile ne grossisse, et
 * la descente demande le zoom qu'elle devrait demander. Ne pas descendre plus bas sans
 * revoir `clipPlanesFor` : le rapport `far/near` croît comme `rayon du système / cette
 * valeur`, et il doit rester sous 1e5 sous peine de perdre la précision du tampon de
 * profondeur (verrou : `tiers.test.ts`).
 */
export const SYSTEM_NODE = 3;

/**
 * Emprise servant au seuil d'ÉTIQUETTE, distincte de l'emprise géométrique ci-dessus.
 *
 * Le nœud n'a pas la taille d'un système : il garde une taille d'écran plancher pour rester
 * visible de loin. Son seuil de nommage suit donc ce qu'on voit, pas ce que le modèle
 * mesure — sans quoi réduire `SYSTEM_NODE` aurait fait disparaître tous les noms.
 */
export const SYSTEM_LABEL_EXTENT = 11;

/** Taille du marqueur d'une flotte en transit, indépendante de l'emprise d'un système. */
const FLEET_MARK = 6;

/**
 * PLANCHER de taille d'un point de système à l'écran, en pixels (chantiers 36.6 puis 37.13).
 *
 * Le nœud a d'abord eu une taille fixe en unités monde — il cédait alors la place à une
 * étoile trente-cinq fois plus petite —, puis une taille fixe à l'écran tout le palier, ce
 * qui le figeait : on zoomait sans que rien ne grossisse jusqu'à basculer d'un coup dans le
 * système.
 *
 * Il vaut désormais `max(taille réelle de l'étoile, ce plancher)`. Loin, le plancher domine
 * et la galaxie reste un champ d'étoiles lisibles ; en approchant, la taille réelle le
 * dépasse et l'étoile grossit d'elle-même, comme n'importe quel objet. Le fondu vers
 * `StarBody` n'échange plus deux tailles différentes : c'est la même.
 */
const NODE_PIXELS = 2.5;

// Objets de travail du raycast, alloués une fois : il tourne à chaque événement pointeur.
const pickMatrix = new Matrix4();
const pickSphere = new Sphere();
const pickPoint = new Vector3();

/**
 * Intersection nœud par nœud, en test rayon-SPHÈRE plutôt que rayon-triangles.
 *
 * `InstancedMesh.raycast` teste la géométrie complète de chaque instance : cinq cents
 * nœuds de quatre-vingts triangles font quarante mille tests par événement pointeur, et le
 * navigateur en émet à la cadence de la souris. Ces nœuds SONT des sphères : leur
 * intersection exacte tient en une racine carrée, et la géométrie n'a plus à être
 * consultée du tout.
 */
function raycastNodes(
  this: InstancedMesh,
  raycaster: Raycaster,
  intersects: Intersection[],
): void {
  for (let i = 0; i < this.count; i++) {
    this.getMatrixAt(i, pickMatrix);
    pickPoint
      .set(
        pickMatrix.elements[12]!,
        pickMatrix.elements[13]!,
        pickMatrix.elements[14]!,
      )
      .applyMatrix4(this.matrixWorld);
    const local = Math.hypot(
      pickMatrix.elements[0]!,
      pickMatrix.elements[1]!,
      pickMatrix.elements[2]!,
    );
    const world = Math.hypot(
      this.matrixWorld.elements[0]!,
      this.matrixWorld.elements[1]!,
      this.matrixWorld.elements[2]!,
    );
    pickSphere.set(pickPoint, local * world);
    const hit = raycaster.ray.intersectSphere(pickSphere, new Vector3());
    if (!hit) continue;
    intersects.push({
      distance: raycaster.ray.origin.distanceTo(hit),
      point: hit,
      object: this,
      instanceId: i,
    });
  }
}

/** Écrit les teintes dans le tampon d'instances et demande son renvoi au GPU. */
function paint(mesh: InstancedMesh, colors: readonly string[]): void {
  const tint = new Color();
  colors.forEach((color, i) => mesh.setColorAt(i, tint.set(color)));
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
}

/** Facteur de taille d'un système revendiqué : il se voit d'un tiers plus gros. */
const CLAIMED_SCALE = 1.3;

/**
 * Tient les nœuds de système à taille écran constante, puis les fait converger vers la
 * taille de l'étoile réelle pendant la bande de transition.
 *
 * Une seule boucle pour tous les nœuds, et une écriture directe dans le tampon de matrices
 * de l'`InstancedMesh` : la taille change à chaque image, et la faire passer par React
 * re-rendrait la galaxie entière soixante fois par seconde.
 *
 * Écrit dans `instanceMatrix` depuis le chantier 37.6. Il y avait un `<mesh>` par système —
 * tenable à quatorze, plus du tout à cinq cents, où s'ajoutent encore un millier d'arêtes.
 * Le facteur « revendiqué » repasse d'ailleurs par ici : posé en prop React, il était
 * écrasé à chaque image par l'ancienne écriture directe, et la distinction avait disparu de
 * la carte sans que rien ne le signale.
 */
function useNodeScale(
  core: { current: InstancedMesh | null },
  locals: { current: Float32Array },
  factors: { current: Float32Array },
  starRadius: number,
): void {
  // Alloués une fois pour toutes : la boucle tourne sur cinq cents instances à soixante
  // images par seconde, et un `new Vector3` par instance et par image suffisait à faire
  // tomber la transition à dix images par seconde (mesuré, `map-zoom.spec.ts`).
  const matrix = useMemo(() => new Matrix4(), []);
  const inverse = useMemo(() => new Matrix4(), []);
  const at = useMemo(() => new Vector3(), []);
  const eye = useMemo(() => new Vector3(), []);

  useFrame(({ camera, size }) => {
    const instanced = core.current;
    const points = locals.current;
    const claimed = factors.current;
    if (!instanced || !points) return;
    const e = instanced.matrixWorld.elements;
    const scale = Math.hypot(e[0]!, e[1]!, e[2]!) || 1;

    // La caméra passe UNE fois dans le repère de la galaxie, au lieu que chaque système
    // passe dans celui du monde. La transformation étant à échelle uniforme, la distance
    // monde vaut la distance locale multipliée par l'échelle — exactement, pas
    // approximativement.
    inverse.copy(instanced.matrixWorld).invert();
    eye.copy(camera.position).applyMatrix4(inverse);

    for (let i = 0; i < instanced.count; i++) {
      at.set(points[i * 3]!, points[i * 3 + 1]!, points[i * 3 + 2]!);
      const distance = eye.distanceTo(at) * scale;
      // Plancher d'écran, exprimé dans le repère local.
      const floor =
        (worldPerPixel(distance, size.height, FOV) * NODE_PIXELS) / scale;
      const target = Math.max(starRadius, floor) * claimed[i]!;
      matrix.makeScale(target, target, target);
      matrix.setPosition(at);
      instanced.setMatrixAt(i, matrix);
    }
    instanced.instanceMatrix.needsUpdate = true;
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
  // Une galaxie condensée n'a pas de systèmes (chantier 37.10) : son nuage porte alors le
  // cadrage. Sans lui, `focusOf` retomberait sur son plancher et le disque du palier
  // univers serait dimensionné au hasard.
  const points: [number, number, number][] = galaxy.systems.length
    ? galaxy.systems.map(
        (s) => systemScenePosition(s) as [number, number, number],
      )
    : cloudPoints(galaxy);
  return focusOf(galaxy.id, points, SYSTEM_NODE * 3, MAP_HEIGHT / 5);
}

/** Positions du nuage condensé, dans le repère de scène de la galaxie. */
export function cloudPoints(galaxy: Galaxy): [number, number, number][] {
  const out: [number, number, number][] = [];
  const cloud = galaxy.cloud ?? [];
  for (let i = 0; i + 2 < cloud.length; i += 3)
    out.push(
      systemScenePosition({
        x: cloud[i]!,
        y: cloud[i + 1]!,
        z: cloud[i + 2]!,
      }) as [number, number, number],
    );
  return out;
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
  /** Sélection et ouverture du cœur galactique (chantier 39), sur le modèle des systèmes. */
  onSelectCore: () => void;
  onOpenCore: () => void;
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
  starRadius,
  onSelect,
  onOpenSystem,
  onSelectCore,
  onOpenCore,
}: Props) {
  const nodes = useRef<InstancedMesh | null>(null);

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

  /**
   * Positions locales des nœuds, et facteur de taille de chacun. Deux tampons plats plutôt
   * que des objets : `useNodeScale` les relit à chaque image, et c'est le seul endroit du
   * rendu où le coût par système compte vraiment.
   */
  const layout = useMemo(() => {
    const locals = new Float32Array(galaxy.systems.length * 3);
    galaxy.systems.forEach((system, i) => {
      const at = systemScenePosition(system);
      locals[i * 3] = at[0];
      locals[i * 3 + 1] = at[1];
      locals[i * 3 + 2] = at[2];
    });
    return locals;
  }, [galaxy]);

  const factors = useMemo(() => {
    const out = new Float32Array(galaxy.systems.length);
    galaxy.systems.forEach((system, i) => {
      out[i] = claimed.has(system.id) ? CLAIMED_SCALE : 1;
    });
    return out;
  }, [galaxy, claimed]);

  /**
   * Teintes des nœuds. Un nœud EST une étoile : il doit se lire comme une lumière, pas
   * comme une pastille (chantier 37.12).
   *
   * Les deux teintes neutres ont été relevées. Elles valaient `#7f95ad` et `#3a4757` quand
   * une galaxie comptait quatorze systèmes largement espacés ; à cinq cents, la vue se
   * remplit surtout d'inexplorés, et un gris ardoise à 22 % de luminance rendait la galaxie
   * éteinte. L'ORDRE est conservé — un système exploré reste plus clair qu'un inexploré,
   * c'est ce que la couleur dit ici — mais le plancher se situe désormais au-dessus du seuil
   * où un point cesse de ressembler à une étoile.
   */
  const colors = useMemo(
    () =>
      galaxy.systems.map((system) =>
        system.id === selectedId
          ? "#8fd8ff"
          : colonized.has(system.id)
            ? "#7cf09a"
            : withStation.has(system.id)
              ? "#f5cf7a"
              : (territoryColor.get(system.id) ??
                (explored.has(system.id) ? "#dce8f5" : "#8ea4bb")),
      ),
    [galaxy, selectedId, colonized, withStation, territoryColor, explored],
  );

  /**
   * Teintes par instance.
   *
   * Le tampon est alloué DANS LA RÉFÉRENCE, et non dans un effet : `vertexColors` fait
   * déclarer `USE_COLOR` au shader, et sans source de couleur l'attribut vaut (0,0,0) —
   * `vColor` tombe à zéro et **tout rend en noir**. Il faut donc que `instanceColor` existe
   * avant que le matériau ne compile, c'est-à-dire avant la première image, ce qu'un
   * `useLayoutEffect` ne garantit pas ici (`FadingGroup` et `useNodeScale` touchent déjà
   * l'objet entre-temps). L'effet qui suit ne fait plus que rafraîchir les valeurs.
   */
  const attach = (
    slot: { current: InstancedMesh | null },
    mesh: InstancedMesh | null,
  ) => {
    slot.current = mesh;
    if (!mesh) return;
    if (mesh.instanceColor?.count !== mesh.count)
      mesh.instanceColor = new InstancedBufferAttribute(
        new Float32Array(mesh.count * 3).fill(1),
        3,
      );
    paint(mesh, colors);
  };

  useLayoutEffect(() => {
    if (nodes.current) paint(nodes.current, colors);
  }, [colors]);

  /**
   * Toutes les arêtes en UNE géométrie : sauts entre systèmes, puis rappel de chaque
   * système au plan galactique. Il y avait un objet de scène par segment — plus d'un
   * millier à cinq cents systèmes, là où quatorze en produisaient trente-cinq.
   */
  const edges = useMemo(() => {
    const points: number[] = [];
    const tints: number[] = [];
    const tint = new Color();
    const push = (from: Vec3, to: Vec3, color: string) => {
      points.push(from[0], from[1], from[2], to[0], to[1], to[2]);
      tint.set(color);
      tints.push(tint.r, tint.g, tint.b, tint.r, tint.g, tint.b);
    };
    for (const [a, b] of galaxy.links) {
      const sa = byId.get(a);
      const sb = byId.get(b);
      if (!sa || !sb) continue;
      const key = a < b ? `${a}|${b}` : `${b}|${a}`;
      // L'itinéraire retenu ressort ; le reste du graphe s'efface.
      push(
        systemScenePosition(sa),
        systemScenePosition(sb),
        routePairs.has(key) ? "#4fc1ff" : "#223148",
      );
    }
    // Plus de trait de rappel au plan (chantier 37.13) : lisible à quatorze systèmes, il
    // faisait cinq cents hachures verticales dans une galaxie qui en compte autant, et
    // brouillait la seule chose que ce palier doit montrer — la forme et le réseau. La
    // profondeur reste lisible par la grille et par la parallaxe de l'orbite.
    return {
      positions: new Float32Array(points),
      colors: new Float32Array(tints),
    };
  }, [galaxy, byId, routePairs]);

  useNodeScale(nodes, { current: layout }, { current: factors }, starRadius);

  // `systemCountOf` et non `galaxy.systems.length` : une galaxie condensée n'a pas ses
  // systèmes, mais elle a son compte — et donc son cœur, quand tout le reste est redacté.
  const systemCount = systemCountOf(galaxy);

  const systemAt = (event: ThreeEvent<MouseEvent>): StarSystem | null =>
    event.instanceId === undefined
      ? null
      : (galaxy.systems[event.instanceId] ?? null);

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
      <lineSegments key={`${galaxy.id}:${edges.positions.length}`}>
        <bufferGeometry>
          <bufferAttribute
            attach="attributes-position"
            args={[edges.positions, 3]}
          />
          <bufferAttribute attach="attributes-color" args={[edges.colors, 3]} />
        </bufferGeometry>
        <lineBasicMaterial vertexColors />
      </lineSegments>
      {/* Trou noir supermassif, au centre (chantier 39).
          Pas de position : l'origine de ce repère EST le centre de la galaxie depuis le
          chantier 37 — `systemScenePosition` y ramène (`MAP_WIDTH / 2`, `MAP_HEIGHT / 2`),
          le point autour duquel `generatePositions` pose les systèmes.
          `light={false}` : rien ici n'est éclairé, les nœuds sont en `meshBasicMaterial`.
          `tilt={0}` : le disque d'accrétion d'un cœur galactique est le plan de la galaxie,
          là où celui d'un trou noir stellaire se présente de biais. */}
      {/* biome-ignore lint/a11y/useKeyWithClickEvents: objet de scène three.js — le chemin
          accessible est la liste DOM parallèle rendue par `MapScene`. */}
      <group onClick={onSelectCore} onDoubleClick={onOpenCore}>
        <BlackHole
          id={`${galaxy.id}:core`}
          radius={galacticCoreHorizon(systemCount)}
          discRadius={galacticCoreDisc(systemCount)}
          color={starAppearance("blackHole").halo}
          light={false}
          tilt={0}
        />
      </group>
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
            <coneGeometry args={[FLEET_MARK * 0.4, FLEET_MARK * 1.2, 6]} />
            <meshBasicMaterial color="#4fc1ff" />
          </mesh>
        );
      })}
      {/* biome-ignore lint/a11y/useKeyWithClickEvents: objet de scène three.js, ni
          focusable ni clavier — le chemin accessible est la liste DOM parallèle rendue à
          côté (chantier 31.16). */}
      <instancedMesh
        // La clé force le remontage quand le compte change : `InstancedMesh` fige son
        // `count` et ses tampons à la construction.
        key={`${galaxy.id}:${galaxy.systems.length}`}
        ref={(mesh) => attach(nodes, mesh)}
        args={[undefined, undefined, galaxy.systems.length]}
        raycast={raycastNodes}
        onClick={(event) => {
          const system = systemAt(event);
          if (system) onSelect(system);
        }}
        onDoubleClick={(event) => {
          const system = systemAt(event);
          if (system) onOpenSystem(system);
        }}
      >
        {/* Géométrie unitaire : c'est l'échelle, écrite à chaque image, qui donne sa
            taille au point. Grossière à dessein (chantier 37.6) : un nœud fait cinq pixels
            de rayon, et 16×16 segments le payaient 480 triangles — 250 000 pour une
            galaxie, de quoi faire tomber le palier à dix images par seconde. À 8×6 il en
            coûte 80, et rien ne se voit à cette taille. */}
        <sphereGeometry args={[1, 8, 6]} />
        {/* `toneMapped={false}` : le rendu applique par défaut la courbe ACES, calée pour
            des surfaces éclairées. Une étoile n'en est pas une — c'est une source, et la
            courbe l'assombrissait jusqu'au noir. `StarBody` y échappait déjà, étant un
            shader brut : c'est ce qui rendait la transition du point vers le soleil si
            brutale, on passait d'une pastille éteinte à une étoile pleine. */}
        {/* PAS de `vertexColors` : il déclare `USE_COLOR` au shader, et la géométrie
            n'ayant pas d'attribut `color`, WebGL en fournit (0,0,0) — `vColor` tombe à zéro
            AVANT que `instanceColor` ne le multiplie, et tout rend en noir. La teinte par
            instance suffit à elle seule : three.js déclare `USE_INSTANCING_COLOR` dès que
            `instanceColor` existe sur l'objet. */}
        {/* Mélange ADDITIF (chantier 37.13) : c'est lui qui fait qu'un point rayonne au
            lieu de se poser comme une pastille — le nuage du palier univers doit sa lueur
            au même procédé. Deux étoiles qui se recouvrent s'additionnent et forment une
            lueur, ce qu'aucune couleur unie ne sait faire.

            Essayé avant : une seconde coque plus large en surimpression. Plus beau, mais
            cinq cents sphères de plus et six fois la surface à remplir — le palier tombait
            à quinze images par seconde sous rendu logiciel. Une seule coque suffit.

            `depthWrite={false}` : une étoile n'occulte pas ce qui la suit, elle s'y ajoute.
            `toneMapped={false}` : le rendu applique par défaut la courbe ACES, calée pour
            des surfaces éclairées. Une étoile n'en est pas une — c'est une source, et la
            courbe l'assombrissait jusqu'au noir. */}
        <meshBasicMaterial
          transparent
          opacity={0.92}
          depthWrite={false}
          blending={AdditiveBlending}
          toneMapped={false}
        />
      </instancedMesh>
    </>
  );
}
