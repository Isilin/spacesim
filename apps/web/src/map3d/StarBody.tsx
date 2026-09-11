import { useFrame } from "@react-three/fiber";
import { spinAngleAt, type SpinElements } from "@spacesim/shared";
import { useMemo, useRef } from "react";
import {
  AdditiveBlending,
  BackSide,
  Color,
  type Mesh,
  type ShaderMaterial,
} from "three";
import { seedOf, starAppearance } from "./appearance.js";

/**
 * Rotation propre d'une étoile, en ticks : dix à quarante minutes par tour (chantier 50.10).
 * Plus lente que celle des planètes : une étoile est l'objet le plus gros de l'écran, et le
 * même angle y parcourt bien plus de pixels.
 */
const STAR_SPIN_TICKS = [120, 480] as const;

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
  starClass = "yellow_dwarf",
  tickAt,
}: {
  id: string;
  /**
   * Rayon de la sphère, en unités de scène — **déjà multiplié par le facteur de la classe**
   * (chantier 47).
   *
   * Il était relatif : le composant faisait `radius * look.radius` en interne, quand
   * `BlackHole`, son voisin immédiat, recevait un rayon absolu. Deux contrats opposés pour
   * deux composants qui rendent la même chose à la même place — c'est la même confusion
   * d'unités qui avait figé la taille des singularités.
   */
  radius: number;
  /** Rayon de la couronne, absolu lui aussi. */
  coronaRadius: number;
  /**
   * Classe de l'étoile (chantier 35.10), désormais un identifiant de catalogue persisté.
   * Elle règle la teinte et la vitesse de la granulation — une géante bout lentement, une
   * naine blanche vibre. La TAILLE, elle, est passée par l'appelant.
   */
  starClass?: string;
  /** Tick fractionnaire de la scène : c'est lui qui fait tourner l'étoile (chantier 50.10). */
  tickAt: () => number;
}) {
  const surface = useRef<ShaderMaterial>(null);
  const body = useRef<Mesh>(null);
  const look = starAppearance(starClass);
  // Sans obliquité : c'est le plan du système qui se forme sur l'équateur de son étoile.
  const spin = useMemo<SpinElements>(
    () => ({
      axialTilt: 0,
      axisNode: 0,
      periodTicks:
        STAR_SPIN_TICKS[0] +
        seedOf(`${id}:spin`) * (STAR_SPIN_TICKS[1] - STAR_SPIN_TICKS[0]),
      spinAngle: seedOf(id) * Math.PI * 2,
      retrograde: false,
    }),
    [id],
  );
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
    // La granulation est échantillonnée en coordonnées d'objet : tourner la sphère la fait
    // défiler d'un bloc, par-dessus son bouillonnement. Le halo, lui, n'a pas de face.
    if (body.current) body.current.rotation.z = spinAngleAt(spin, tickAt());
  });

  return (
    <>
      <mesh ref={body}>
        <sphereGeometry args={[radius, 48, 48]} />
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
        <sphereGeometry args={[coronaRadius, 32, 32]} />
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
