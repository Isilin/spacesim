import {
  GALAXY_SPACING,
  UNIVERSE_CENTER_X,
  UNIVERSE_CENTER_Y,
  galaxyMorphologyOf,
  type Galaxy,
  type Gateway,
  type Universe,
} from "@spacesim/shared";
import { useMemo } from "react";
import { AdditiveBlending } from "three";
import { galaxyAppearance, seedOf } from "./appearance.js";
import { focusOf, type Focus } from "./bounds.js";
import type { Vec3 } from "./tiers.js";

/** Rayon du disque d'une galaxie dans la scène. */
export const GALAXY_DISC = 55;
/**
 * Étoiles figurées par galaxie (chantier 31.23). Le compte DÉCROÎT avec la taille de
 * l'univers : à 160 étoiles fixes, les 200 galaxies d'un univers plein en dessineraient
 * 32 000 alors qu'aucune n'occupe plus de quelques pixels à cette distance. On borne le
 * total plutôt que le détail unitaire — une galaxie isolée reste dense, un amas reste
 * lisible, et le budget d'images du chantier 31.17 tient dans les deux cas.
 */
const STAR_BUDGET = 6000;
/** Points d'une nébuleuse : larges et très transparents, quelques dizaines suffisent. */
const NEBULA_POINTS = 40;
const MIN_STARS = 40;
const MAX_STARS = 160;

function starsPerGalaxy(galaxyCount: number): number {
  return Math.max(
    MIN_STARS,
    Math.min(MAX_STARS, Math.floor(STAR_BUDGET / Math.max(1, galaxyCount))),
  );
}

/**
 * Repère de scène : le générateur pose les galaxies autour de
 * (`UNIVERSE_CENTER_X`, `UNIVERSE_CENTER_Y`) avec un `z` centré sur 0. On recentre pour
 * que l'origine de la scène soit le centre de l'amas — la caméra orbite autour de lui.
 */
export function galaxyScenePosition(g: {
  x: number;
  y: number;
  z: number;
}): Vec3 {
  return [g.x - UNIVERSE_CENTER_X, g.y - UNIVERSE_CENTER_Y, g.z];
}

/**
 * Cadrage sur l'amas réellement peuplé. La spirale d'or ne remplit pas un rayon
 * prévisible : quatre galaxies tiennent dans quelques centaines d'unités, deux cents
 * s'étalent sur plusieurs milliers. Déduire la distance de `GALAXY_SPACING` plaçait la
 * caméra très au-delà d'un petit amas, qui se réduisait alors à quelques pixels.
 */
export function universeFocus(universe: Universe): Focus {
  return focusOf(
    "universe",
    universe.galaxies.map(
      (g) => galaxyScenePosition(g) as [number, number, number],
    ),
    GALAXY_DISC,
    GALAXY_SPACING,
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
  morphology,
}: {
  id: string;
  color: string;
  stars: number;
  morphology: string;
}) {
  const positions = useMemo(() => {
    const seed = seedOf(id);
    const look = galaxyAppearance(morphology);
    const out = new Float32Array(stars * 3);
    for (let i = 0; i < stars; i++) {
      const t = i / stars;
      const jitter =
        (seedOf(`${id}:${i}`) - 0.5) * GALAXY_DISC * look.scatter * t;

      if (look.arms === 0) {
        // Elliptique : aucun bras, un ellipsoïde dont la densité décroît vers le bord.
        // Trois graines indépendantes, sinon le nuage se range sur une diagonale.
        const r = GALAXY_DISC * (0.1 + t ** 0.6 * 0.9);
        const theta = seedOf(`${id}:t${i}`) * Math.PI * 2;
        const phi = Math.acos(2 * seedOf(`${id}:p${i}`) - 1);
        out[i * 3] = Math.sin(phi) * Math.cos(theta) * r;
        out[i * 3 + 1] = Math.sin(phi) * Math.sin(theta) * r * 0.78;
        out[i * 3 + 2] = Math.cos(phi) * r * 0.5;
        continue;
      }

      const arm = (i % look.arms) * ((Math.PI * 2) / look.arms);
      const angle = t * look.winding + arm + seed * 6.283;
      let radius = GALAXY_DISC * (0.15 + t * 0.85);
      let x = Math.cos(angle) * radius + jitter;
      let y = Math.sin(angle) * radius + jitter;

      // Barre centrale : la part interne du bras est tirée sur une droite au lieu de
      // s'enrouler. C'est ce qui distingue une spirale barrée d'une spirale simple.
      if (look.bar > 0 && t < look.bar) {
        const along = (t / look.bar) * 2 - 1;
        const barAngle = seed * 6.283;
        radius = GALAXY_DISC * look.bar * along;
        x = Math.cos(barAngle) * radius + jitter * 0.4;
        y = Math.sin(barAngle) * radius + jitter * 0.4;
      }

      out[i * 3] = x;
      out[i * 3 + 1] = y;
      // Le disque s'aplatit vers l'extérieur : bulbe épais au centre.
      out[i * 3 + 2] =
        (seedOf(`${id}:z${i}`) - 0.5) * GALAXY_DISC * 0.3 * (1 - t);
    }
    return out;
  }, [id, stars, morphology]);

  return (
    <points>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
      </bufferGeometry>
      {/* Taille en PIXELS, pas en unités monde (chantier 36.7). C'est ce qui fait que les
          étoiles se mêlent d'elles-mêmes : en dézoomant, elles se resserrent à l'écran
          sans rapetisser, et le mélange additif les fond en une lueur. Avec l'atténuation
          par la distance, elles auraient rapetissé jusqu'à disparaître, ce qui obligeait à
          peindre un disque par-dessus pour que la galaxie reste visible. */}
      <pointsMaterial
        color={color}
        size={2}
        sizeAttenuation={false}
        transparent
        opacity={0.55}
        depthWrite={false}
        blending={AdditiveBlending}
      />
    </points>
  );
}

/**
 * Nébuleuse (chantier 35.10) : un nuage additif teinté, posé sur le plan galactique.
 *
 * Le palier univers n'était que des points gris sur une grille — rien n'y disait la
 * profondeur autrement que par la grille elle-même. Ces nuages sont larges, très
 * transparents et peu nombreux : ils donnent de la matière au vide sans rien y cacher.
 */
function Nebula({ id, color }: { id: string; color: string }) {
  const positions = useMemo(() => {
    const out = new Float32Array(NEBULA_POINTS * 3);
    for (let i = 0; i < NEBULA_POINTS; i++) {
      const r = GALAXY_DISC * (1.4 + seedOf(`${id}:nr${i}`) * 2.2);
      const theta = seedOf(`${id}:nt${i}`) * Math.PI * 2;
      out[i * 3] = Math.cos(theta) * r;
      out[i * 3 + 1] = Math.sin(theta) * r * 0.6;
      out[i * 3 + 2] = (seedOf(`${id}:nz${i}`) - 0.5) * GALAXY_DISC;
    }
    return out;
  }, [id]);

  return (
    <points>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
      </bufferGeometry>
      <pointsMaterial
        color={color}
        size={26}
        sizeAttenuation
        transparent
        opacity={0.05}
        depthWrite={false}
        blending={AdditiveBlending}
      />
    </points>
  );
}

interface Props {
  universe: Universe;
  /**
   * Galaxies où le joueur a une colonie. Calculé par `MapScene` et non ici : depuis que
   * la couche et la liste DOM sont deux composants distincts, les deux en ont besoin, et
   * le parcours `colonies × galaxies × systèmes × planètes` ne mérite pas d'être fait
   * deux fois par rendu.
   */
  colonizedGalaxyIds: ReadonlySet<string>;
  gateways: Gateway[];
  /** Cadrage de l'amas, calculé par `MapScene` — il lui sert aussi à cadrer la caméra. */
  focus: Focus;
  selectedId: string | null;
  onSelect: (galaxy: Galaxy) => void;
  onOpenGalaxy: (galaxy: Galaxy) => void;
}

/**
 * Contenu du palier univers (chantiers 31.13 puis 35.2). Registre schématique : c'est une
 * carte de commandement, pas une photographie — disques plats, halos d'accent, aucun
 * relief.
 *
 * Depuis le chantier 35 ce composant ne porte plus ni canvas ni liste : il n'est qu'une
 * **couche** parmi celles que `MapScene` monte et démonte au fil du zoom. Les paliers ne
 * s'excluent plus, ils coexistent le temps d'une transition.
 */
export function UniverseLayer({
  universe,
  colonizedGalaxyIds,
  gateways,
  focus,
  selectedId,
  onSelect,
  onOpenGalaxy,
}: Props) {
  const activeGatewayIds = useMemo(
    () => new Set(gateways.filter((g) => g.active).map((g) => g.galaxyId)),
    [gateways],
  );

  const stars = starsPerGalaxy(universe.galaxies.length);

  return (
    <>
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
        const position = galaxyScenePosition(galaxy);
        const colonized = colonizedGalaxyIds.has(galaxy.id);
        const selected = galaxy.id === selectedId;
        return (
          <group
            key={galaxy.id}
            position={[position[0], position[1], position[2]]}
          >
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
            {/* Nébuleuse : une galaxie sur trois, tirée de son identifiant. Toutes en
                porter noierait l'amas. */}
            {seedOf(`${galaxy.id}:neb`) > 0.66 && (
              <Nebula id={galaxy.id} color="#3f5f8a" />
            )}
            <GalaxyCloud
              stars={stars}
              morphology={galaxyMorphologyOf(galaxy)}
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
            {/* Disque de saisie : plus peint du tout depuis le chantier 36.7, mais
                toujours là pour porter le clic — le nuage de points est trop épars pour
                être visé au pixel près.

                `colorWrite={false}` et non `visible={false}` : three.js retire du raycast
                tout objet invisible, et les galaxies deviendraient incliquables.
                `depthWrite={false}` avec : un disque qui n'écrit rien en couleur mais
                écrit en profondeur masquerait les étoiles derrière lui. */}
            {/* biome-ignore lint/a11y/useKeyWithClickEvents: `mesh` est un objet de
                scène three.js, pas un nœud DOM — il ne peut recevoir ni focus ni
                événement clavier. Le chemin accessible est la liste DOM parallèle
                rendue à côté (chantier 31.16), qui porte les mêmes actions. */}
            <mesh
              onClick={() => onSelect(galaxy)}
              onDoubleClick={() => onOpenGalaxy(galaxy)}
            >
              <circleGeometry args={[GALAXY_DISC, 32]} />
              <meshBasicMaterial colorWrite={false} depthWrite={false} />
            </mesh>
          </group>
        );
      })}
    </>
  );
}
