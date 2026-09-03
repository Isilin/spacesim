import { useMemo } from "react";
import { Color } from "three";
import { bodyAppearance, seedOf } from "./appearance.js";

/**
 * Surface de corps générée par shader (chantier 31.19). Aucun fichier de texture : le
 * relief et les taches naissent d'un bruit calculé sur la position du sommet, modulé par
 * une graine tirée de l'identifiant du corps.
 *
 * C'est la même propriété que la génération d'univers — dérivée du seed, donc stable
 * d'une session à l'autre sans rien persister, et gratuite pour les ~12 000 corps d'un
 * univers plein. Voir ADR
 * [0007](../../../../docs/adr/0007-habillage-3d-procedural-et-parametrique.md).
 */
const VERTEX = /* glsl */ `
  varying vec3 vPos;
  varying vec3 vNormal;
  void main() {
    vPos = position;
    vNormal = normalize(normalMatrix * normal);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

/**
 * Bruit de valeur à trois octaves. Volontairement court : il ne s'agit pas de simuler
 * une géologie mais de rompre l'uniformité d'une sphère, à un coût négligeable.
 */
const FRAGMENT = /* glsl */ `
  uniform vec3 uColor;
  uniform vec3 uAccent;
  uniform float uRelief;
  uniform float uSeed;
  uniform float uBands;
  uniform float uOpacity;
  varying vec3 vPos;
  varying vec3 vNormal;

  float hash(vec3 p) {
    p = fract(p * 0.3183099 + uSeed);
    p *= 17.0;
    return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
  }

  float noise(vec3 x) {
    vec3 i = floor(x);
    vec3 f = fract(x);
    f = f * f * (3.0 - 2.0 * f);
    return mix(
      mix(mix(hash(i), hash(i + vec3(1,0,0)), f.x),
          mix(hash(i + vec3(0,1,0)), hash(i + vec3(1,1,0)), f.x), f.y),
      mix(mix(hash(i + vec3(0,0,1)), hash(i + vec3(1,0,1)), f.x),
          mix(hash(i + vec3(0,1,1)), hash(i + vec3(1,1,1)), f.x), f.y),
      f.z);
  }

  void main() {
    vec3 p = normalize(vPos);
    float n = noise(p * 3.0) * 0.6 + noise(p * 7.0) * 0.3 + noise(p * 15.0) * 0.1;
    // Les géantes gazeuses sont bandées : le bruit module une latitude, pas des taches.
    float banded = mix(n, 0.5 + 0.5 * sin(p.y * 9.0 + n * 3.0), uBands);
    vec3 base = mix(uColor, uAccent, clamp(banded * uRelief * 1.6, 0.0, 1.0));
    // Éclairage diffus simple : l'étoile est à l'origine de la scène.
    float light = clamp(dot(vNormal, normalize(vec3(0.4, 0.4, 1.0))), 0.15, 1.0);
    gl_FragColor = vec4(base * light, uOpacity);
  }
`;

export function ProceduralBody({
  id,
  type,
  radius,
}: {
  id: string;
  type: string;
  radius: number;
}) {
  const look = bodyAppearance(type);
  const segments = radius < 4 ? 12 : radius < 8 ? 20 : 32;
  const uniforms = useMemo(
    () => ({
      uColor: { value: new Color(look.color) },
      uAccent: { value: new Color(look.accent) },
      uRelief: { value: look.relief },
      uSeed: { value: seedOf(id) },
      uBands: { value: type === "gas" ? 1 : 0 },
      // Piloté par `FadingGroup` (chantier 35.4) : un `material.opacity` ne veut rien
      // dire pour un shader dont le fragment écrit lui-même son alpha.
      uOpacity: { value: 1 },
    }),
    [look.color, look.accent, look.relief, id, type],
  );

  return (
    <>
      <mesh>
        {/* Détail proportionné au rayon (chantier 31.23) : une lune de 3 unités n'a pas
            besoin des 32 segments d'une géante gazeuse — à l'écran elle fait quelques
            pixels, et un système en compte jusqu'à une quinzaine. */}
        <sphereGeometry args={[radius, segments, segments]} />
        <shaderMaterial
          vertexShader={VERTEX}
          fragmentShader={FRAGMENT}
          uniforms={uniforms}
          transparent
        />
      </mesh>
    </>
  );
}
