import { useFrame } from "@react-three/fiber";
import { useRef, type ReactNode, type RefObject } from "react";
import type { Group, Material, ShaderMaterial } from "three";
import { tierBlend, tierIndex, type TierName, type Vec3 } from "./tiers.js";

/** Opacité en deçà de laquelle on cesse purement et simplement de dessiner la couche. */
const INVISIBLE = 0.004;

interface Tinted extends Material {
  opacity: number;
  /**
   * État d'origine, mémorisé au premier passage. L'opacité est **multipliée** et non
   * remplacée — un disque de saisie à 0,12 et un anneau d'orbite à 0,85 doivent garder
   * leur poids relatif tout du long — et la transparence doit revenir à ce qu'elle était
   * une fois le fondu terminé, faute de quoi toute la carte finirait par passer dans la
   * passe triée alors qu'elle est opaque.
   */
  userData: { baseOpacity?: number; baseTransparent?: boolean };
}

function isShader(material: Material): material is ShaderMaterial {
  return (material as ShaderMaterial).uniforms !== undefined;
}

/**
 * Opacité de la couche à une profondeur donnée.
 *
 * Une couche est soit le palier courant — elle s'efface à mesure qu'on s'enfonce — soit
 * l'enfant de ce palier — elle apparaît. Tout le reste est hors champ et rend zéro :
 * `MapScene` ne monte jamais plus de deux paliers voisins, mais rendre 1 pour une couche
 * franchie ferait réapparaître l'univers en pleine galaxie au moindre décalage d'une image
 * entre l'état React et la profondeur écrite par la caméra.
 */
export function layerOpacity(tier: TierName, depth: number): number {
  const index = tierIndex(tier);
  const current = Math.floor(Math.max(0, depth));
  if (index !== current && index !== current + 1) return 0;
  const blend = tierBlend(depth - current);
  return index === current ? blend.parentOpacity : blend.childOpacity;
}

interface Props {
  tier: TierName;
  /** Profondeur continue, écrite par `TierCamera` à chaque image. */
  depthRef: RefObject<number>;
  position?: Vec3;
  scale?: number;
  children: ReactNode;
}

/**
 * Couche de carte qui s'efface et réapparaît avec la profondeur (chantier 35.4).
 *
 * Sans elle, le franchissement d'un palier faisait disparaître d'un coup tout ce que le
 * palier quitté dessinait — au niveau univers, un disque de saisie devenu une plaque grise
 * en travers de la galaxie, puis plus rien. Les seuils de `tierBlend` sont calés pour que
 * la couche démontée soit déjà entièrement transparente : le fondu ne masque pas le
 * franchissement, il le rend sans objet.
 *
 * L'opacité s'applique **par mutation directe des matériaux**, jamais par une prop React :
 * elle change à chaque image, et la faire passer par un rendu re-monterait tout l'arbre
 * soixante fois par seconde. Les matériaux ne sont reparcourus que lorsque la valeur a
 * bougé — au repos, ce composant ne coûte rien.
 */
export function FadingGroup({
  tier,
  depthRef,
  position,
  scale,
  children,
}: Props) {
  const ref = useRef<Group>(null);
  const applied = useRef(Number.NaN);

  useFrame(() => {
    const group = ref.current;
    if (!group) return;
    const opacity = layerOpacity(tier, depthRef.current);
    if (opacity === applied.current) return;
    applied.current = opacity;

    group.visible = opacity > INVISIBLE;
    if (!group.visible) return;

    group.traverse((object) => {
      const material = (object as { material?: Material | Material[] })
        .material;
      if (!material) return;
      for (const one of Array.isArray(material) ? material : [material]) {
        const tinted = one as Tinted;
        tinted.userData.baseTransparent ??= tinted.transparent;
        tinted.transparent = tinted.userData.baseTransparent || opacity < 0.999;
        if (isShader(one)) {
          // Les deux shaders de corps portent un `uOpacity` : un `material.opacity` ne
          // veut rien dire pour eux, leur alpha est écrit par le fragment.
          const uniform = one.uniforms.uOpacity;
          if (uniform) uniform.value = opacity;
          continue;
        }
        tinted.userData.baseOpacity ??= tinted.opacity;
        tinted.opacity = tinted.userData.baseOpacity * opacity;
      }
    });
  });

  return (
    <group
      ref={ref}
      position={position ? [position[0], position[1], position[2]] : undefined}
      scale={scale}
    >
      {children}
    </group>
  );
}
