import { useFrame } from "@react-three/fiber";
import {
  crossersOf,
  eccentricPointAt,
  eccentricPositionAt,
  type Crosser,
  type StarSystem,
} from "@spacesim/shared";
import { useMemo, useRef } from "react";
import {
  BufferGeometry,
  Float32BufferAttribute,
  type Group,
  type Mesh,
} from "three";
import { useReducedMotion } from "../hooks/useReducedMotion.js";
import { asteroidGeometry } from "./asteroids.js";
import { seedOf } from "./appearance.js";
import { orbitColor } from "./theme.js";

/**
 * Géocroiseurs du palier système (chantier 50.8) : un caillou sur une ellipse qui coupe
 * l'orbite d'une planète, et l'ellipse elle-même.
 *
 * C'est le tracé qui se lit. Le caillou suit la loi de Kepler des planètes qu'il croise — il
 * avance donc aussi lentement qu'elles, un degré par minute au plus —, et seule sa culbute se
 * voit bouger. L'ellipse dit ce qu'il est : une route qui entre dans l'orbite d'un monde et en
 * ressort.
 */

/** Rayon de lecture, en unités système : l'ordre d'un gros rocher de ceinture. */
const CROSSER = 1.4;

/** Points de l'ellipse tracée : assez pour qu'elle reste lisse au périastre. */
const ORBIT_POINTS = 128;

/** Culbute d'un caillou que nulle marée ne freine : deux à huit minutes par tour. */
const TUMBLE_TICKS = [24, 96] as const;

/** L'ellipse, échantillonnée en anomalie excentrique — même formule que le mouvement. */
function orbitGeometry(crosser: Crosser): BufferGeometry {
  const positions = new Float32Array(ORBIT_POINTS * 3);
  for (let i = 0; i < ORBIT_POINTS; i++) {
    const p = eccentricPointAt(crosser, (i / ORBIT_POINTS) * Math.PI * 2);
    positions.set([p.x, p.y, p.z], i * 3);
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new Float32BufferAttribute(positions, 3));
  return geometry;
}

function CrosserBody({
  crosser,
  tickAt,
}: {
  crosser: Crosser;
  tickAt: () => number;
}) {
  const place = useRef<Group>(null);
  const rock = useRef<Mesh>(null);
  const orbit = useMemo(() => orbitGeometry(crosser), [crosser]);
  const shape = useMemo(
    () => asteroidGeometry(`${crosser.id}:shape`, CROSSER),
    [crosser.id],
  );
  const tumbleTicks =
    TUMBLE_TICKS[0] +
    seedOf(`${crosser.id}:tumble`) * (TUMBLE_TICKS[1] - TUMBLE_TICKS[0]);
  // La culbute est un décor : elle se fige sous « réduire les animations » (chantier 50.13).
  const still = useReducedMotion();

  useFrame(() => {
    const tick = tickAt();
    const p = eccentricPositionAt(crosser, tick);
    place.current?.position.set(p.x, p.y, p.z);
    if (rock.current && !still) {
      const turn = (2 * Math.PI * tick) / tumbleTicks;
      // Deux axes à des rythmes différents : une culbute, pas une rotation propre.
      rock.current.rotation.set(turn, turn * 0.61, 0);
    }
  });

  return (
    <>
      <lineLoop geometry={orbit}>
        <lineBasicMaterial color={orbitColor()} transparent opacity={0.4} />
      </lineLoop>
      <group ref={place}>
        <mesh ref={rock} geometry={shape}>
          <meshStandardMaterial color="#8d8272" roughness={1} />
        </mesh>
      </group>
    </>
  );
}

/** Les géocroiseurs d'un système, dérivés de son identifiant (voir `crossersOf`). */
export function Crossers({
  system,
  tickAt,
}: {
  system: StarSystem;
  tickAt: () => number;
}) {
  const crossers = useMemo(() => crossersOf(system), [system]);
  return (
    <>
      {crossers.map((crosser) => (
        <CrosserBody key={crosser.id} crosser={crosser} tickAt={tickAt} />
      ))}
    </>
  );
}
