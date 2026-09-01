import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import { AdditiveBlending, BackSide, Color, type ShaderMaterial } from "three";
import { seedOf, starAppearance } from "./appearance.js";

/**
 * Étoile procédurale (chantier 33.8).
 *
 * Elle était trois sphères de couleur plate empilées, à côté de planètes qui ont un vrai
 * shader de surface : la seule chose qu'on regarde vraiment au centre du système était la
 * moins soignée de la vue. Même famille de bruit que `ProceduralBody`, donc même propriété
 * — dérivée du seed, stable d'une session à l'autre, sans rien persister (ADR 0007).
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
 * Granulation + assombrissement centre-bord.
 *
 * Le bruit défile **lentement** sur deux échelles à des vitesses différentes : c'est ce
 * qui donne l'impression d'une surface qui bout plutôt que d'une texture qui glisse. Le
 * bord s'éclaircit au lieu de s'assombrir — l'inverse d'une planète — parce qu'une étoile
 * est un volume émissif dont on voit plus d'épaisseur sur la tranche.
 */
const FRAGMENT = /* glsl */ `
  uniform vec3 uCore;
  uniform vec3 uEdge;
  uniform float uTime;
  uniform float uSeed;
  uniform float uChurn;
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
    float granules =
      noise(p * 5.0 + vec3(0.0, uTime * 0.05 * uChurn, 0.0)) * 0.6 +
      noise(p * 13.0 - vec3(uTime * 0.09 * uChurn, 0.0, 0.0)) * 0.4;

    // Assombrissement inversé : le bord d'une étoile est plus lumineux que son centre.
    float limb = pow(1.0 - abs(dot(vNormal, vec3(0.0, 0.0, 1.0))), 1.6);
    vec3 base = mix(uCore, uEdge, clamp(granules * 0.9, 0.0, 1.0));
    gl_FragColor = vec4(base * (0.85 + 0.6 * limb), uOpacity);
  }
`;

/** Halo : une coque vue de l'intérieur, dont l'opacité suit la tranche. */
const HALO_VERTEX = /* glsl */ `
  varying vec3 vNormal;
  varying vec3 vView;
  void main() {
    vNormal = normalize(normalMatrix * normal);
    vec4 viewPos = modelViewMatrix * vec4(position, 1.0);
    vView = normalize(-viewPos.xyz);
    gl_Position = projectionMatrix * viewPos;
  }
`;

const HALO_FRAGMENT = /* glsl */ `
  uniform vec3 uColor;
  uniform float uOpacity;
  varying vec3 vNormal;
  varying vec3 vView;
  void main() {
    float rim = pow(1.0 - abs(dot(normalize(vNormal), normalize(vView))), 2.0);
    gl_FragColor = vec4(uColor, rim * 0.55 * uOpacity);
  }
`;

export function StarBody({
  id,
  radius,
  coronaRadius,
  starClass = "mainSequence",
}: {
  id: string;
  radius: number;
  coronaRadius: number;
  /**
   * Classe de l'étoile (chantier 35.10), dérivée du système par `starClassOf`. Elle règle
   * la teinte, la taille, l'étendue de la couronne et la vitesse de la granulation — une
   * géante bout lentement, une naine blanche vibre.
   */
  starClass?: string;
}) {
  const surface = useRef<ShaderMaterial>(null);
  const look = starAppearance(starClass);
  const uniforms = useMemo(
    () => ({
      uCore: { value: new Color(look.core) },
      uEdge: { value: new Color(look.edge) },
      uTime: { value: 0 },
      uSeed: { value: seedOf(id) },
      uChurn: { value: look.churn },
      // Piloté par `FadingGroup` (chantier 35.4).
      uOpacity: { value: 1 },
    }),
    [id, look.core, look.edge, look.churn],
  );
  const haloUniforms = useMemo(
    () => ({
      uColor: { value: new Color(look.halo) },
      uOpacity: { value: 1 },
    }),
    [look.halo],
  );

  useFrame((state) => {
    const time = surface.current?.uniforms.uTime;
    if (time) time.value = state.clock.elapsedTime;
  });

  return (
    <>
      <mesh>
        <sphereGeometry args={[radius * look.radius, 48, 48]} />
        <shaderMaterial
          ref={surface}
          vertexShader={VERTEX}
          fragmentShader={FRAGMENT}
          uniforms={uniforms}
          transparent
        />
      </mesh>
      {/* Halo additif rendu sur la face INTERNE : la coque ne masque donc jamais l'étoile
          qu'elle entoure, quel que soit l'angle. */}
      <mesh>
        <sphereGeometry args={[coronaRadius * look.corona, 32, 32]} />
        <shaderMaterial
          vertexShader={HALO_VERTEX}
          fragmentShader={HALO_FRAGMENT}
          uniforms={haloUniforms}
          transparent
          depthWrite={false}
          side={BackSide}
          blending={AdditiveBlending}
        />
      </mesh>
    </>
  );
}
