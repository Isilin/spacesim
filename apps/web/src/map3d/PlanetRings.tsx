import type { Planet } from "@spacesim/shared";
import { useMemo } from "react";
import { Color, DoubleSide } from "three";
import { seedOf } from "./appearance.js";

const RING_VERTEX = /* glsl */ `
  varying vec3 vPos;
  void main() {
    vPos = position;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

/** Bandes concentriques et lacunes, tirées du seul rayon. */
const RING_FRAGMENT = /* glsl */ `
  uniform vec3 uColor;
  uniform float uSeed;
  uniform float uOpacity;
  varying vec3 vPos;
  void main() {
    float r = length(vPos.xy);
    float bands = 0.45
      + 0.35 * sin(r * 5.5 + uSeed * 30.0)
      + 0.2 * sin(r * 17.0 + uSeed * 11.0);
    // Une lacune franche, comme la division de Cassini : c'est elle qui fait lire un
    // système d'anneaux plutôt qu'un disque uni.
    float gap = smoothstep(0.02, 0.06, abs(fract(r * 1.7 + uSeed) - 0.5));
    gl_FragColor = vec4(uColor, clamp(bands, 0.0, 1.0) * gap * 0.7 * uOpacity);
  }
`;

/**
 * Une géante gazeuse sur deux porte des anneaux, tirée de son identifiant.
 *
 * Exporté (chantier 35.12) parce que deux paliers dessinent le même corps : la passe
 * visuelle a montré une géante cerclée d'anneaux au palier système qui les perdait au
 * palier corps, c'est-à-dire au moment précis où l'on s'approche assez pour les voir. Le
 * prédicat vit ici pour que les deux couches ne puissent pas en donner deux versions.
 */
export function hasRings(body: Planet): boolean {
  return body.type === "gas" && seedOf(`${body.id}:rings`) > 0.5;
}

/**
 * Anneaux d'une géante gazeuse (chantier 35.10) : des bandes radiales avec leurs lacunes,
 * ce que trois anneaux concentriques ne rendraient pas.
 */
export function PlanetRings({
  body,
  radius,
}: {
  body: Planet;
  radius: number;
}) {
  const uniforms = useMemo(
    () => ({
      uColor: { value: new Color("#c9b79a") },
      uSeed: { value: seedOf(`${body.id}:rings`) },
      uOpacity: { value: 1 },
    }),
    [body.id],
  );
  return (
    <mesh rotation={[1.2 + seedOf(`${body.id}:tilt`) * 0.4, 0, 0]}>
      {/* Un seul segment radial : c'est le fragment qui calcule le rayon, subdiviser dans
          cette direction n'ajoute aucun détail et multiplie les triangles d'un anneau
          transparent — donc trié à chaque image. */}
      <ringGeometry args={[radius * 1.5, radius * 2.6, 64, 1]} />
      <shaderMaterial
        vertexShader={RING_VERTEX}
        fragmentShader={RING_FRAGMENT}
        uniforms={uniforms}
        transparent
        depthWrite={false}
        side={DoubleSide}
      />
    </mesh>
  );
}
