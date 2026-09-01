import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import { AdditiveBlending, BackSide, Color, type ShaderMaterial } from "three";
import { seedOf } from "./appearance.js";

/**
 * Trou noir (chantier 35.10).
 *
 * ## Ce qui est rendu
 *
 * Un horizon **absolument noir** — pas une sphère sombre : un `meshBasicMaterial` que
 * l'éclairage n'atteint pas, sans quoi la chose la plus noire de l'univers réfléchirait la
 * lumière de son propre disque. Autour, un disque d'accrétion à rotation différentielle :
 * l'intérieur tourne plus vite et vire au blanc-bleu, l'extérieur traîne et vire au rouge
 * sombre. Un liseré fin marque la sphère de photons.
 *
 * ## Ce qui est délibérément absent
 *
 * **La lentille gravitationnelle.** L'effet demande un post-traitement qui échantillonne
 * l'arrière-plan pour le courber ; or le canvas est rendu en `alpha: true` et n'a pas
 * d'arrière-plan — le fond vient du thème CSS, derrière le canvas. Il n'y a rien à courber.
 * Le coût — une passe de rendu supplémentaire sur toute la carte — ne s'échangerait contre
 * rien de visible.
 */

const DISC_VERTEX = /* glsl */ `
  varying vec2 vUv;
  varying vec3 vPos;
  void main() {
    vUv = uv;
    vPos = position;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

/**
 * Rotation différentielle : la vitesse angulaire décroît avec le rayon, comme une orbite
 * képlérienne. C'est ce qui distingue un disque d'accrétion d'un simple anneau — les
 * filaments s'enroulent au lieu de tourner en bloc.
 */
const DISC_FRAGMENT = /* glsl */ `
  uniform vec3 uInner;
  uniform vec3 uOuter;
  uniform float uTime;
  uniform float uSeed;
  uniform float uOpacity;
  uniform float uInnerR;
  varying vec3 vPos;

  float hash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7)) + uSeed * 43.0) * 43758.5453);
  }

  float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(
      mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x),
      mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x),
      f.y);
  }

  void main() {
    float r = length(vPos.xy);
    float angle = atan(vPos.y, vPos.x);
    // r^-1.5 : la loi de Kepler, la même que celle qui fait tourner les planètes.
    float spin = uTime * 0.9 * pow(max(r, 0.2), -1.5);
    float filaments = noise(vec2(angle * 3.0 + spin, r * 5.0)) * 0.6
                    + noise(vec2(angle * 9.0 + spin * 1.7, r * 11.0)) * 0.4;

    // Chaud et serré à l'intérieur, froid et diffus au bord.
    float heat = clamp(1.2 - r, 0.0, 1.0);
    vec3 tint = mix(uOuter, uInner, heat * heat);
    // Le disque s'éteint à ses deux bords, sinon l'anneau se voit comme un anneau.
    float edge = smoothstep(0.0, 0.12, r - uInnerR) * (1.0 - smoothstep(0.75, 1.0, r));
    float glow = edge * (0.35 + filaments * 0.9);
    gl_FragColor = vec4(tint * (0.6 + heat * 1.6), glow * uOpacity);
  }
`;

const RIM_VERTEX = /* glsl */ `
  varying vec3 vNormal;
  varying vec3 vView;
  void main() {
    vNormal = normalize(normalMatrix * normal);
    vec4 viewPos = modelViewMatrix * vec4(position, 1.0);
    vView = normalize(-viewPos.xyz);
    gl_Position = projectionMatrix * viewPos;
  }
`;

const RIM_FRAGMENT = /* glsl */ `
  uniform vec3 uColor;
  uniform float uOpacity;
  varying vec3 vNormal;
  varying vec3 vView;
  void main() {
    // Puissance élevée : le liseré ne doit tenir que sur la tranche, la sphère de photons
    // est fine.
    float rim = pow(1.0 - abs(dot(normalize(vNormal), normalize(vView))), 6.0);
    gl_FragColor = vec4(uColor, rim * uOpacity);
  }
`;

export function BlackHole({
  id,
  radius,
  discRadius,
  color,
}: {
  id: string;
  /** Rayon de l'horizon. */
  radius: number;
  /** Rayon externe du disque d'accrétion. */
  discRadius: number;
  color: string;
}) {
  const disc = useRef<ShaderMaterial>(null);
  const seed = seedOf(id);

  const discUniforms = useMemo(
    () => ({
      uInner: { value: new Color("#dfe9ff") },
      uOuter: { value: new Color(color) },
      uTime: { value: 0 },
      uSeed: { value: seed },
      uOpacity: { value: 1 },
      uInnerR: { value: (radius * 1.05) / discRadius },
    }),
    [color, seed, radius, discRadius],
  );
  const rimUniforms = useMemo(
    () => ({ uColor: { value: new Color(color) }, uOpacity: { value: 1 } }),
    [color],
  );

  useFrame((state) => {
    const time = disc.current?.uniforms.uTime;
    if (time) time.value = state.clock.elapsedTime;
  });

  return (
    <group rotation={[seed * 0.5 - 0.25, seed * 1.3, 0]}>
      {/* Horizon : `meshBasicMaterial` et non `standard`, pour qu'aucune lumière ne
          l'atteigne. Une sphère noire éclairée n'est pas noire. */}
      <mesh>
        <sphereGeometry args={[radius, 32, 32]} />
        <meshBasicMaterial color="#000000" />
      </mesh>

      {/* Sphère de photons : un liseré, pas un halo. */}
      <mesh>
        <sphereGeometry args={[radius * 1.18, 32, 32]} />
        <shaderMaterial
          vertexShader={RIM_VERTEX}
          fragmentShader={RIM_FRAGMENT}
          uniforms={rimUniforms}
          transparent
          depthWrite={false}
          side={BackSide}
          blending={AdditiveBlending}
        />
      </mesh>

      {/* Disque d'accrétion, incliné : vu de face il ne dirait rien de sa rotation.
          Construit en rayon UNITAIRE puis mis à l'échelle — le shader raisonne en parts du
          disque, pas en unités de scène, et n'a donc pas à connaître la taille du système. */}
      <mesh rotation={[1.15, 0, 0]} scale={discRadius}>
        <ringGeometry args={[(radius * 1.05) / discRadius, 1, 96, 8]} />
        <shaderMaterial
          ref={disc}
          vertexShader={DISC_VERTEX}
          fragmentShader={DISC_FRAGMENT}
          uniforms={discUniforms}
          transparent
          depthWrite={false}
          blending={AdditiveBlending}
        />
      </mesh>

      {/* La lumière du système vient du disque, pas d'une étoile absente. */}
      <pointLight color={color} intensity={1.1} decay={0.4} />
    </group>
  );
}
