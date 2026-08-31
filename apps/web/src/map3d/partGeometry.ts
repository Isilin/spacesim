import {
  BoxGeometry,
  type BufferGeometry,
  CapsuleGeometry,
  ConeGeometry,
  CylinderGeometry,
  SphereGeometry,
  TorusGeometry,
} from "three";
import type { PartShape } from "./shipLayout.js";

/**
 * Traduit une forme décrite par une fonction de composition en géométrie three.js
 * (chantier 33.4).
 *
 * Seul point du rendu qui connaît three : c'est ce qui permet à `shipLayout` et
 * `stationLayout` de rester purs et testables sans navigateur (ADR 0013).
 *
 * Le `prism` est un `CylinderGeometry` à peu de côtés, jamais un profil lissé : ce choix
 * est dicté par la passe d'ARÊTES, pas par les faces. Les coutures d'un volume à huit ou
 * douze faces **sont** les lignes de panneau qu'on veut voir ; un profil lissé les
 * ferait toutes disparaître sous le seuil d'angle, ou toutes ressortir en fil de fer.
 */
export function buildGeometry(shape: PartShape): BufferGeometry {
  switch (shape.kind) {
    case "prism":
      return new CylinderGeometry(
        shape.rFore,
        shape.rAft,
        shape.length,
        shape.sides,
      );
    case "cone":
      return new ConeGeometry(shape.radius, shape.height, shape.sides);
    case "box":
      return new BoxGeometry(...shape.size);
    case "torus":
      return new TorusGeometry(shape.radius, shape.tube, 6, shape.segments * 2);
    case "capsule":
      return new CapsuleGeometry(shape.radius, shape.length, 4, 8);
    case "sphere":
      return new SphereGeometry(shape.radius, 12, 8);
  }
}
