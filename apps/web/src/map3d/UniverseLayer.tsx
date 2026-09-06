import {
  GALAXY_SPACING,
  UNIVERSE_CENTER_X,
  UNIVERSE_CENTER_Y,
  type Galaxy,
  type Gateway,
  type ClientUniverse,
} from "@spacesim/shared";
import { useMemo } from "react";
import { AdditiveBlending } from "three";
import { seedOf } from "./appearance.js";
import { focusOf, type Focus } from "./bounds.js";
import { galaxyFocus, systemScenePosition } from "./GalaxyLayer.js";
import { nestingScale, type Vec3 } from "./tiers.js";

/** Rayon du disque d'une galaxie dans la scène. */
export const GALAXY_DISC = 55;
/**
 * Étoiles figurées par galaxie (chantiers 31.23 puis 37.5). Le compte DÉCROÎT avec la
 * taille de l'univers : on borne le total plutôt que le détail unitaire — une galaxie
 * isolée reste dense, un amas reste lisible, et le budget d'images du chantier 31.17 tient
 * dans les deux cas.
 *
 * Relevé de 6 000 à 60 000 au chantier 37 : le plafond datait d'un temps où ces points
 * portaient `sizeAttenuation` et où une galaxie comptait quatorze systèmes. Ils sont
 * désormais dimensionnés en pixels (chantier 36.7), donc bien moins coûteux, et une galaxie
 * en compte trois à cinq cents — les rogner à 160 aurait sous-échantillonné la spirale
 * qu'on vient précisément de rendre réelle. Le juge du plafond est le test de budget
 * d'images, pas l'estime.
 */
const STAR_BUDGET = 60_000;
/** Points d'une nébuleuse : larges et très transparents, quelques dizaines suffisent. */
const NEBULA_POINTS = 40;
const MIN_STARS = 40;

function starsPerGalaxy(galaxyCount: number): number {
  return Math.max(
    MIN_STARS,
    Math.floor(STAR_BUDGET / Math.max(1, galaxyCount)),
  );
}

/**
 * Échelle qui ramène le contenu d'une galaxie dans son disque, au palier univers.
 *
 * Une seule définition pour deux usages : `MapScene` la pose sur le groupe du palier
 * galaxie, `GalaxyCloud` l'applique aux positions qu'il dessine. C'est ce partage qui fait
 * que les points du nuage et les nœuds de systèmes occupent EXACTEMENT la même place à
 * l'écran pendant le fondu — la correspondance entre les deux paliers n'est plus une
 * ressemblance, c'est la même arithmétique.
 */
export function galaxyContentScale(galaxy: Galaxy): number {
  return nestingScale(GALAXY_DISC, galaxyFocus(galaxy).radius);
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
export function universeFocus(universe: ClientUniverse): Focus {
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
 * Nuage d'étoiles d'une galaxie (chantiers 31.19 puis 37.5) : ses systèmes RÉELS, ramenés
 * à l'échelle du disque.
 *
 * Il dessinait jusqu'ici sa propre spirale, dérivée de l'identifiant de la galaxie et sans
 * aucun rapport avec les positions que le générateur avait posées. On zoomait sur une
 * spirale de cent soixante étoiles pour atterrir sur dix points au hasard : le palier
 * univers promettait une galaxie que le palier galaxie ne livrait pas.
 *
 * Depuis que le générateur pose les systèmes sur les bras (chantier 37.2), la promesse peut
 * être tenue littéralement — c'est le même nuage de part et d'autre du fondu. Les galaxies
 * matérialisées AVANT ce chantier, aux positions uniformes, restent cohérentes avec
 * elles-mêmes pour la même raison : ce qui est peint est ce qui est là.
 */
function GalaxyCloud({
  galaxy,
  color,
  stars,
}: {
  galaxy: Galaxy;
  color: string;
  stars: number;
}) {
  const positions = useMemo(() => {
    // Galaxie condensée (chantier 37.10) : le serveur n'a transmis qu'un nuage
    // sous-échantillonné, dans les coordonnées de la galaxie. Il se projette exactement
    // comme les vrais systèmes — c'est le même repère.
    if (galaxy.systems.length === 0 && galaxy.cloud?.length) {
      const scale = galaxyContentScale(galaxy);
      const out = new Float32Array(galaxy.cloud.length);
      for (let i = 0; i + 2 < galaxy.cloud.length; i += 3) {
        const at = systemScenePosition({
          x: galaxy.cloud[i]!,
          y: galaxy.cloud[i + 1]!,
          z: galaxy.cloud[i + 2]!,
        });
        out[i] = at[0] * scale;
        out[i + 1] = at[1] * scale;
        out[i + 2] = at[2] * scale;
      }
      return out;
    }

    const scale = galaxyContentScale(galaxy);
    const systems = galaxy.systems;
    // Sous-échantillonnage régulier quand l'amas est trop peuplé pour le budget. Le pas
    // est fractionnaire (`i × n / stars` arrondi) et non entier : un pas entier risquerait
    // de tomber en phase avec l'alternance des bras du générateur et de n'en dessiner
    // qu'un. À ce compte de galaxies, une spirale ne fait de toute façon que quelques
    // pixels.
    const count = Math.min(systems.length, stars);
    const out = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      const system = systems[Math.floor(((i + 0.5) * systems.length) / count)];
      if (!system) continue;
      const at = systemScenePosition(system);
      out[i * 3] = at[0] * scale;
      out[i * 3 + 1] = at[1] * scale;
      out[i * 3 + 2] = at[2] * scale;
    }
    return out;
  }, [galaxy, stars]);

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
  universe: ClientUniverse;
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
            {/* Nébuleuse : une galaxie sur trois, tirée de son identifiant. Toutes en
                porter noierait l'amas. */}
            {seedOf(`${galaxy.id}:neb`) > 0.66 && (
              <Nebula id={galaxy.id} color="#3f5f8a" />
            )}
            <GalaxyCloud
              stars={stars}
              galaxy={galaxy}
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
            {/* Volume de saisie : plus peint du tout depuis le chantier 36.7, mais
                toujours là pour porter le clic — le nuage de points est trop épars pour
                être visé au pixel près.

                Une SPHÈRE et non un disque (chantier 40.10). Le disque vivait dans le plan
                galactique : vu par la tranche il se réduisait à un trait, et la galaxie
                devenait impossible à cliquer sous l'angle où l'on regarde le plus souvent
                l'amas. Une sphère présente le même cercle sous tous les angles, sans rien
                coûter par image — là où orienter un disque vers la caméra aurait demandé une
                référence et un quaternion par galaxie, jusqu'à deux cents.

                `colorWrite={false}` et non `visible={false}` : three.js retire du raycast
                tout objet invisible, et les galaxies deviendraient incliquables.
                `depthWrite={false}` avec : un volume qui n'écrit rien en couleur mais
                écrit en profondeur masquerait les étoiles derrière lui. */}
            {/* biome-ignore lint/a11y/useKeyWithClickEvents: `mesh` est un objet de
                scène three.js, pas un nœud DOM — il ne peut recevoir ni focus ni
                événement clavier. Le chemin accessible est la liste DOM parallèle
                rendue à côté (chantier 31.16), qui porte les mêmes actions. */}
            <mesh
              onClick={() => onSelect(galaxy)}
              onDoubleClick={() => onOpenGalaxy(galaxy)}
            >
              {/* Peu de segments : la géométrie ne sert qu'au raycast, qui la teste
                  triangle par triangle sur toutes les galaxies à chaque clic. */}
              <sphereGeometry args={[GALAXY_DISC, 12, 8]} />
              <meshBasicMaterial colorWrite={false} depthWrite={false} />
            </mesh>
          </group>
        );
      })}
    </>
  );
}
