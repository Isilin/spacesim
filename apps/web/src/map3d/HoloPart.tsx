import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo } from "react";
import {
  AdditiveBlending,
  type BufferGeometry,
  Color,
  DoubleSide,
} from "three";

/**
 * Registre holographique des objets manufacturés (chantier 33.3) : volume translucide
 * teinté, frange de Fresnel, bandes de balayage, arêtes vives par-dessus.
 *
 * Voir [ADR 0013](../../../../docs/adr/0013-registre-holographique-des-apercus.md). Un
 * vaisseau en cours de conception n'a pas été construit : le montrer éclairé par une
 * lumière physique est un contresens, c'est un plan qu'on inspecte. Le shader n'a donc
 * **aucun terme d'éclairage** — la luminosité vient de l'angle de vue, pas d'une lampe.
 *
 * GLSL en constantes de module et uniformes mémoïsés : même organisation que
 * `ProceduralBody.tsx`, le seul autre shader du dépôt.
 */

const VERTEX = /* glsl */ `
  varying vec3 vNormalView;
  varying vec3 vPosView;
  varying vec3 vPosLocal;
  void main() {
    vNormalView = normalize(normalMatrix * normal);
    vec4 posView = modelViewMatrix * vec4(position, 1.0);
    vPosView = posView.xyz;
    vPosLocal = position;
    gl_Position = projectionMatrix * posView;
  }
`;

/**
 * Deux effets, et pas un de plus.
 *
 * La **frange de Fresnel** allume les faces vues de biais et laisse translucides celles
 * vues de face : c'est elle qui restitue le volume, là où une opacité uniforme aplatirait
 * la silhouette. `abs()` sur le produit scalaire pour que les faces ARRIÈRE s'allument
 * aussi — voir à travers la coque est ce qui fait lire un volume plutôt qu'une écaille.
 *
 * Les **bandes de balayage** montent le long de l'axe local. Elles **modulent** la frange
 * au lieu de s'y ajouter : elles ne peuvent donc jamais dépasser le budget de lueur que
 * le `ui-brief` fixe à « une seule intensité, réservée aux accents ».
 *
 * L'axe est LOCAL et non vue : `OrbitControls autoRotate` fait tourner la caméra, pas
 * l'objet — des bandes en espace vue glisseraient sur la coque à chaque tour.
 */
const FRAGMENT = /* glsl */ `
  uniform vec3 uColor;
  uniform float uTime;
  uniform float uBandFreq;
  varying vec3 vNormalView;
  varying vec3 vPosView;
  varying vec3 vPosLocal;

  void main() {
    vec3 viewDir = normalize(-vPosView);
    float facing = abs(dot(normalize(vNormalView), viewDir));
    // Puissance 2.5 : une frange nette, pas un halo diffus sur toute la face.
    float rim = pow(1.0 - facing, 2.5);

    float band = 0.5 + 0.5 * sin(vPosLocal.y * uBandFreq - uTime * 1.6);
    float alpha = (0.08 + 0.55 * rim) * (0.85 + 0.15 * band);

    gl_FragColor = vec4(uColor * (0.55 + 0.9 * rim), alpha);
  }
`;

/** Densité des bandes le long de l'axe local. */
const BAND_FREQ = 4;

/** Seuil d'angle des arêtes conservées. En deçà, la tessellation d'un cylindre à douze
 *  faces ressortirait entière au lieu de sa seule silhouette. */
const DEFAULT_EDGE_ANGLE = 18;

/**
 * Horloge partagée. **Un seul** objet d'uniforme de temps pour tout l'arbre : les
 * matériaux le référencent, une écriture les met tous à jour. Un `useFrame` par pièce
 * ferait autant de rappels par image qu'un vaisseau a de morceaux.
 */
const timeUniform = { value: 0 };

/** À monter une fois dans la scène. Écrit directement dans l'uniforme, jamais par un état
 *  React — un `setState` par image re-rendrait tout l'arbre soixante fois par seconde. */
export function HoloClock() {
  useFrame((state) => {
    timeUniform.value = state.clock.elapsedTime;
  });
  return null;
}

interface Props {
  /**
   * Géométrie de la pièce, construite par l'appelant. **Une géométrie par pièce** : la
   * pièce en assume la libération, et deux pièces qui la partageraient se la feraient
   * détruire sous les pieds.
   */
  geometry: BufferGeometry;
  color: string;
  position?: [number, number, number];
  rotation?: [number, number, number];
  /** `0` désactive la passe d'arêtes — sur une sphère ou un profil lissé, elle
   *  dégénérerait en fil de fer complet. */
  edgeAngle?: number;
  /** La seule lueur autorisée par objet (`ui-brief`) : rendue à pleine teinte, opaque, au
   *  lieu de la translucidité holographique. */
  emissive?: boolean;
  /**
   * Pièce provisoire — une zone en file de construction. Arêtes seules, sans faces : elle
   * doit se lire comme une intention, pas comme une structure. Même convention que le
   * pointillé du diagramme 2D et des liens de portail potentiels sur la carte.
   */
  ghost?: boolean;
}

/**
 * Une pièce : faces holographiques + arêtes.
 *
 * **Mélange additif**, et c'est la décision structurante. Un vaisseau garni compte des
 * dizaines de morceaux translucides qui s'interpénètrent ; three trie les objets
 * transparents par distance de centroïde, ce qui est faux pour des volumes emboîtés et se
 * réordonne à chaque image pendant que la caméra tourne — avec un mélange normal, la
 * silhouette clignote en pleine rotation. L'additif est **indépendant de l'ordre**, donc
 * immunisé. Le prix, assumé : la densité tire vers le blanc au centre, d'où une opacité de
 * base très basse — c'est la frange qui porte la lecture.
 *
 * Les faces n'écrivent pas la profondeur ; les **arêtes** si. Les arêtes portent la
 * lisibilité, les faces l'atmosphère.
 */
export function HoloPart({
  geometry,
  color,
  position,
  rotation,
  edgeAngle = DEFAULT_EDGE_ANGLE,
  emissive,
  ghost,
}: Props) {
  const uniforms = useMemo(
    () => ({
      uColor: { value: new Color(color) },
      uTime: timeUniform,
      uBandFreq: { value: BAND_FREQ },
    }),
    [color],
  );

  // R3F ne libère automatiquement que les géométries qu'il a créées lui-même depuis des
  // `args` JSX, jamais celles passées par prop. Sans ceci, chaque modification d'un plan
  // dans le concepteur abandonnerait une génération entière de tampons GPU.
  useEffect(() => () => geometry.dispose(), [geometry]);

  return (
    <group position={position} rotation={rotation}>
      {!ghost && (
        <mesh geometry={geometry}>
          {emissive ? (
            // Une tuyère ne se lit pas comme un hologramme : c'est la seule pièce qui
            // « brûle ». Teinte pleine et opaque, pas de frange.
            <meshBasicMaterial color={color} toneMapped={false} />
          ) : (
            <shaderMaterial
              vertexShader={VERTEX}
              fragmentShader={FRAGMENT}
              uniforms={uniforms}
              transparent
              depthWrite={false}
              side={DoubleSide}
              blending={AdditiveBlending}
              toneMapped={false}
            />
          )}
        </mesh>
      )}
      {edgeAngle > 0 && (
        // `lineSegments` plutôt que `<Edges>` de drei : celui-ci passe par `Line2` et
        // `three-stdlib`, dont le dépôt refuse la dépendance directe (voir le typage
        // structurel d'`OrbitControls` dans `MapCanvas`). L'épaisseur reste d'un pixel —
        // `linewidth` est ignoré par WebGL — ce qui donne une arête franche qui
        // n'épaissit jamais au zoom.
        <lineSegments>
          <edgesGeometry args={[geometry, edgeAngle]} />
          <lineBasicMaterial
            color={color}
            transparent
            opacity={ghost ? 0.5 : 0.9}
            depthWrite={false}
            toneMapped={false}
          />
        </lineSegments>
      )}
    </group>
  );
}
