import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo } from "react";
import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  Color,
  DoubleSide,
  EdgesGeometry,
  Euler,
  Matrix4,
  Quaternion,
  Vector3,
} from "three";
import { buildGeometry } from "./partGeometry.js";
import type { PartShape } from "./shipLayout.js";

/**
 * Registre holographique des objets manufacturés (chantiers 33.3, 34.2) : volume
 * translucide teinté, frange de Fresnel, bandes de balayage, arêtes vives par-dessus —
 * mais **fusionné par teinte**.
 *
 * Voir [ADR 0013](../../../../docs/adr/0013-registre-holographique-des-apercus.md) pour le
 * registre, [ADR 0014](../../../../docs/adr/0014-densite-decorative-des-objets-manufactures.md)
 * pour la densité. Un vaisseau en compte désormais quelques centaines de pièces : les
 * rendre une par une ferait six cents appels de rendu et neuf cents matériaux pour un seul
 * objet. La fusion n'est pas une optimisation opportuniste, c'est ce qui rend la densité
 * atteignable.
 *
 * Le shader n'a **aucun terme d'éclairage** — un vaisseau en cours de conception n'a pas
 * été construit, le montrer éclairé par une lumière physique est un contresens. La
 * luminosité vient de l'angle de vue, pas d'une lampe.
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
 * au lieu de s'y ajouter : elles ne peuvent donc jamais dépasser le budget de lueur que le
 * `ui-brief` fixe à « une seule intensité, réservée aux accents ».
 *
 * Après fusion, l'axe local est celui de l'OBJET ENTIER et non plus d'une pièce : les
 * bandes parcourent le vaisseau au lieu de se répéter sur chaque morceau. C'est le bon
 * comportement, obtenu gratuitement.
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
    float alpha = (0.030 + 0.26 * rim) * (0.85 + 0.15 * band);

    gl_FragColor = vec4(uColor * (0.35 + 0.85 * rim), alpha);
  }
`;

/** Densité des bandes le long de l'axe local. */
const BAND_FREQ = 4;

/**
 * Horloge partagée. **Un seul** objet d'uniforme de temps pour tout l'arbre : les matériaux
 * le référencent, une écriture les met tous à jour.
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

/**
 * Une pièce à fusionner. `ShipPart` et `StationPart` s'y conforment structurellement : les
 * deux fonctions de composition restent pures et ignorent tout de three.js.
 */
export interface BatchPart {
  id: string;
  shape: PartShape;
  position: [number, number, number];
  rotation: [number, number, number];
  color: string;
  /** La seule lueur autorisée par objet (`ui-brief`) : teinte pleine, opaque, sans frange. */
  emissive?: boolean;
  /** Pièce provisoire — arêtes seules, sans faces : une intention, pas une structure. */
  ghost?: boolean;
  /** `0` supprime la passe d'arêtes — sur un volume lissé elle dégénère en fil de fer. */
  edgeAngle: number;
}

/** Un lot fusionné : tout ce qui partage teinte, lueur et statut de fantôme. */
export interface HoloGroup {
  key: string;
  color: string;
  emissive: boolean;
  ghost: boolean;
  faces: BufferGeometry | null;
  edges: BufferGeometry | null;
  /** Nombre de pièces fondues dans ce lot — poignée de test, jamais lue par le rendu. */
  count: number;
}

/**
 * Concaténation maison de géométries.
 *
 * Volontairement maison plutôt que `mergeGeometries` de `three/examples/jsm` : celui-ci
 * exige des jeux d'attributs strictement identiques et rend `null` au moindre écart — une
 * pièce perdue en silence, exactement le mode de défaillance que ce dépôt s'est déjà pris
 * plusieurs fois. Ici on ne garde QUE ce que le shader lit (`position`, `normal`), le cas
 * dégénéré est explicite, et jeter les `uv` inutilisées économise deux flottants par sommet
 * sur des dizaines de milliers.
 */
function concatGeometries(
  list: BufferGeometry[],
  withNormal: boolean,
): BufferGeometry {
  let vertexCount = 0;
  let indexCount = 0;
  for (const geometry of list) {
    const count = geometry.getAttribute("position").count;
    vertexCount += count;
    // Une géométrie non indexée (les arêtes) reçoit un index séquentiel : un lot ne mélange
    // jamais les deux en pratique, mais le supposer ferait disparaître des triangles.
    indexCount += geometry.getIndex()?.count ?? count;
  }

  const position = new Float32Array(vertexCount * 3);
  const normal = withNormal ? new Float32Array(vertexCount * 3) : null;
  const index = new Uint32Array(indexCount);

  let v = 0;
  let i = 0;
  for (const geometry of list) {
    const pos = geometry.getAttribute("position");
    position.set(pos.array as ArrayLike<number>, v * 3);
    if (normal) {
      const nrm = geometry.getAttribute("normal");
      if (nrm) normal.set(nrm.array as ArrayLike<number>, v * 3);
    }
    const idx = geometry.getIndex();
    if (idx) {
      for (let k = 0; k < idx.count; k++) index[i + k] = idx.getX(k) + v;
      i += idx.count;
    } else {
      for (let k = 0; k < pos.count; k++) index[i + k] = v + k;
      i += pos.count;
    }
    v += pos.count;
  }

  const merged = new BufferGeometry();
  merged.setAttribute("position", new BufferAttribute(position, 3));
  if (normal) merged.setAttribute("normal", new BufferAttribute(normal, 3));
  merged.setIndex(new BufferAttribute(index, 1));
  return merged;
}

/**
 * Fusionne une liste de pièces en un lot par teinte.
 *
 * Les arêtes de chaque pièce sont calculées **avant** la fusion, sur la pièce isolée : c'est
 * la seule façon de préserver le seuil d'angle propre à chacune, qui est ce qui distingue
 * une couture de panneau d'un fil de fer. Une fois fusionnées, toutes les faces d'un lot
 * partagent le même seuil et l'information serait perdue.
 */
export function buildBatches(parts: BatchPart[]): HoloGroup[] {
  const matrix = new Matrix4();
  const quaternion = new Quaternion();
  const euler = new Euler();
  const offset = new Vector3();
  const unit = new Vector3(1, 1, 1);

  interface Bucket {
    color: string;
    emissive: boolean;
    ghost: boolean;
    faces: BufferGeometry[];
    edges: BufferGeometry[];
    count: number;
  }
  const buckets = new Map<string, Bucket>();

  for (const part of parts) {
    const emissive = part.emissive === true;
    const ghost = part.ghost === true;
    const key = `${part.color}|${emissive ? 1 : 0}|${ghost ? 1 : 0}`;
    let bucket = buckets.get(key);
    if (!bucket) {
      bucket = {
        color: part.color,
        emissive,
        ghost,
        faces: [],
        edges: [],
        count: 0,
      };
      buckets.set(key, bucket);
    }
    bucket.count++;

    const geometry = buildGeometry(part.shape);
    euler.set(part.rotation[0], part.rotation[1], part.rotation[2]);
    quaternion.setFromEuler(euler);
    offset.set(part.position[0], part.position[1], part.position[2]);
    matrix.compose(offset, quaternion, unit);

    if (part.edgeAngle > 0) {
      const edges = new EdgesGeometry(geometry, part.edgeAngle);
      edges.applyMatrix4(matrix);
      bucket.edges.push(edges);
    }
    if (ghost) {
      // Une pièce fantôme n'a pas de faces : sa géométrie source ne sert qu'aux arêtes,
      // qui en ont déjà copié les sommets.
      geometry.dispose();
    } else {
      geometry.applyMatrix4(matrix);
      bucket.faces.push(geometry);
    }
  }

  const groups: HoloGroup[] = [];
  for (const [key, bucket] of buckets) {
    const faces =
      bucket.faces.length > 0 ? concatGeometries(bucket.faces, true) : null;
    const edges =
      bucket.edges.length > 0 ? concatGeometries(bucket.edges, false) : null;
    for (const geometry of bucket.faces) geometry.dispose();
    for (const geometry of bucket.edges) geometry.dispose();
    groups.push({
      key,
      color: bucket.color,
      emissive: bucket.emissive,
      ghost: bucket.ghost,
      faces,
      edges,
      count: bucket.count,
    });
  }
  return groups;
}

/**
 * Un lot : faces holographiques + arêtes.
 *
 * **Mélange additif**, et c'est la décision structurante. Un objet dense compte des
 * centaines de morceaux translucides qui s'interpénètrent ; three trie les objets
 * transparents par distance de centroïde, ce qui est faux pour des volumes emboîtés et se
 * réordonne à chaque image pendant que la caméra tourne — avec un mélange normal, la
 * silhouette clignote en pleine rotation. L'additif est **indépendant de l'ordre**, donc
 * immunisé. Le prix, assumé : la densité tire vers le blanc, d'où une opacité de base très
 * basse — c'est la frange, et surtout l'arête, qui portent la lecture.
 *
 * Les faces n'écrivent pas la profondeur ; les **arêtes** si. Les arêtes portent la
 * lisibilité, les faces l'atmosphère.
 */
function HoloGroupView({ group }: { group: HoloGroup }) {
  const uniforms = useMemo(
    () => ({
      uColor: { value: new Color(group.color) },
      uTime: timeUniform,
      uBandFreq: { value: BAND_FREQ },
    }),
    [group.color],
  );

  return (
    <>
      {group.faces &&
        (group.emissive ? (
          // Une tuyère ne se lit pas comme un hologramme : c'est la seule pièce qui
          // « brûle ». Teinte pleine et opaque, pas de frange.
          <mesh geometry={group.faces}>
            <meshBasicMaterial color={group.color} toneMapped={false} />
          </mesh>
        ) : (
          <mesh geometry={group.faces}>
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
          </mesh>
        ))}
      {group.edges && (
        // `lineSegments` plutôt que `<Edges>` de drei : celui-ci passe par `Line2` et
        // `three-stdlib`, dont le dépôt refuse la dépendance directe (voir le typage
        // structurel d'`OrbitControls` dans `MapCanvas`). L'épaisseur reste d'un pixel —
        // `linewidth` est ignoré par WebGL — ce qui donne une arête franche qui n'épaissit
        // jamais au zoom.
        <lineSegments geometry={group.edges}>
          <lineBasicMaterial
            color={group.color}
            transparent
            // Beaucoup plus d'arêtes qu'au chantier 33 : à 0,9 chacune, la densité vire au
            // fil de fer blanc. C'est leur NOMBRE qui porte la lecture, pas leur intensité.
            opacity={group.ghost ? 0.32 : 0.55}
            depthWrite={!group.ghost}
            toneMapped={false}
          />
        </lineSegments>
      )}
    </>
  );
}

/**
 * Rend un objet manufacturé entier en quelques appels de rendu.
 *
 * Les géométries fusionnées sont libérées à la sortie : R3F ne libère automatiquement que
 * ce qu'il a créé lui-même depuis des `args` JSX, jamais ce qui lui est passé par prop.
 * Sans ceci, chaque modification d'un plan dans le concepteur abandonnerait une génération
 * entière de tampons GPU.
 */
export function HoloBatch({ groups }: { groups: HoloGroup[] }) {
  useEffect(
    () => () => {
      for (const group of groups) {
        group.faces?.dispose();
        group.edges?.dispose();
      }
    },
    [groups],
  );

  return (
    <group>
      <HoloClock />
      {groups.map((group) => (
        <HoloGroupView key={group.key} group={group} />
      ))}
    </group>
  );
}
