import { useFrame } from "@react-three/fiber";
import { useMemo, useRef, type RefObject } from "react";
import { CanvasTexture, LinearFilter, type Sprite } from "three";
import { layerOpacity } from "./FadingGroup.js";
import { themeColor } from "./theme.js";
import { labelOpacity, type TierName, type Vec3 } from "./tiers.js";

/**
 * Étiquettes posées sur les objets de la carte (chantier 36.3).
 *
 * Les noms vivaient dans une liste latérale : lire la carte demandait un aller-retour
 * permanent entre le canvas et une colonne de 210 px. Ils se posent désormais sur les
 * objets eux-mêmes, et n'apparaissent que quand l'objet est assez gros pour qu'un nom ait
 * un sens à côté de lui.
 *
 * ## Pourquoi des sprites et non le `<Html>` de drei
 *
 * Les étiquettes doivent être **cliquables**. Un élément DOM cliquable est opaque aux
 * événements, molette comprise — c'est exactement le défaut corrigé au chantier 35.12 sur
 * l'infobox, où une seule boîte suffisait à rendre la carte insensible au zoom là où le
 * joueur regardait. Multiplié par des dizaines d'étiquettes posées sur les objets qu'on
 * vise, il rendrait la carte impraticable.
 *
 * Un sprite se clique par le raycast de R3F et laisse la molette au canvas, puisqu'il EST
 * le canvas. Il évite en prime le repositionnement DOM que drei fait à chaque image pour
 * chaque `<Html>`.
 *
 * ## Une seule boucle, à la racine de la scène
 *
 * Un `useFrame` par étiquette ferait deux cents rappels par image au palier univers d'un
 * univers plein. Ce composant tient un seul rappel et écrit directement sur les sprites,
 * même doctrine que `TierCamera` et `OrbitingBody` : ce qui se calcule par image ne
 * traverse pas React.
 *
 * Il vit **hors des couches**, en coordonnées de scène, et porte lui-même le fondu de
 * palier : `FadingGroup` mémorise l'opacité d'origine de chaque matériau au premier
 * passage, ce qui entrerait en conflit avec une opacité déjà pilotée par image. Une seule
 * autorité par sprite.
 */

export interface LabelItem {
  id: string;
  text: string;
  /** Palier auquel l'objet appartient — décide du fondu quand deux paliers coexistent. */
  tier: TierName;
  /** Position en coordonnées de SCÈNE, relue à chaque image : les corps orbitent. */
  at: () => Vec3;
  /** Rayon de l'objet nommé, en unités de scène — décide du seuil d'apparition. */
  radius: number;
}

/** Hauteur du texte à l'écran, en pixels. Constante : c'est tout l'intérêt du sprite. */
const PIXEL_HEIGHT = 13;

/** Champ de vision vertical de la carte, en radians — doit suivre `MapCanvas`. */
const HALF_FOV = ((50 / 2) * Math.PI) / 180;

/**
 * Hauteur de la texture, en pixels de texture. Plus haute que l'affichage : un texte
 * crénelé se lit mal sur le fond noir de la carte.
 */
const TEXTURE_HEIGHT = 48;

/** Opacité en deçà de laquelle le sprite est retiré du rendu — et donc du raycast. */
const INVISIBLE = 0.02;

/**
 * Cache de textures, par texte.
 *
 * Rastériser un nom coûte un canvas 2D et un transfert GPU. Deux objets homonymes — ce que
 * le générateur produit à foison — partagent la même texture, et un nom déjà vu n'est
 * jamais rastérisé deux fois. Le cache est de module : il survit au démontage d'une couche,
 * qui arrive à chaque franchissement de palier.
 */
const textures = new Map<string, CanvasTexture>();

/**
 * Texture d'un texte, mémoïsée.
 *
 * Rend une texture même quand le canvas 2D n'est pas disponible — c'est le cas sous jsdom,
 * où `getContext` rend `null`. Le rendu y est vide, mais rien ne lève : un test de carte
 * ne doit pas échouer parce qu'une étiquette n'a pas pu se dessiner.
 */
export function labelTexture(text: string): CanvasTexture {
  const cached = textures.get(text);
  if (cached) return cached;

  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d");
  const font = `600 ${Math.round(TEXTURE_HEIGHT * 0.62)}px "JetBrains Mono", ui-monospace, monospace`;

  if (context) {
    context.font = font;
    const width = Math.max(8, Math.ceil(context.measureText(text).width) + 16);
    canvas.width = width;
    canvas.height = TEXTURE_HEIGHT;
    // Redimensionner un canvas réinitialise son contexte : la police doit être reposée.
    context.font = font;
    context.textAlign = "center";
    context.textBaseline = "middle";
    // Contour sombre avant le texte : la carte n'a pas de fond uniforme, un nom clair sur
    // une étoile claire serait illisible.
    context.lineWidth = 4;
    context.strokeStyle = "rgba(2, 6, 12, 0.9)";
    context.strokeText(text, width / 2, TEXTURE_HEIGHT / 2);
    context.fillStyle = themeColor("--text", "#dbe7f3");
    context.fillText(text, width / 2, TEXTURE_HEIGHT / 2);
  } else {
    canvas.width = 8;
    canvas.height = TEXTURE_HEIGHT;
  }

  const texture = new CanvasTexture(canvas);
  // Pas de mipmaps : une étiquette est toujours vue de face et à taille fixe, les générer
  // coûterait de la mémoire pour un niveau qui ne sert jamais.
  texture.generateMipmaps = false;
  texture.minFilter = LinearFilter;
  texture.magFilter = LinearFilter;
  textures.set(text, texture);
  return texture;
}

/** Vide le cache — pour les tests, qui vérifient justement qu'il mémoïse. */
export function resetLabelTextures(): void {
  for (const texture of textures.values()) texture.dispose();
  textures.clear();
}

interface Props {
  items: readonly LabelItem[];
  /** Profondeur continue, écrite par `TierCamera` à chaque image. */
  depthRef: RefObject<number>;
  onSelect: (id: string) => void;
  onOpen: (id: string) => void;
  /** Compte d'étiquettes lisibles, publié dans le DOM — seule trace observable. */
  onVisibleCount: (count: number) => void;
}

export function MapLabels({
  items,
  depthRef,
  onSelect,
  onOpen,
  onVisibleCount,
}: Props) {
  const sprites = useRef<(Sprite | null)[]>([]);
  const published = useRef(-1);
  const sized = useMemo(
    () =>
      items.map((item) => {
        const texture = labelTexture(item.text);
        const image = texture.image as { width: number; height: number };
        return {
          item,
          texture,
          ratio: image.width / Math.max(1, image.height),
        };
      }),
    [items],
  );

  useFrame(({ camera, size }) => {
    // Axe « haut de l'écran », lu de la matrice caméra : `camera.up` reste (0,1,0) quoi que
    // fasse `OrbitControls`, et décaler l'étiquette selon lui la ferait glisser de côté dès
    // qu'on tourne la vue.
    const cam = camera.matrixWorld.elements;
    const upX = cam[4]!;
    const upY = cam[5]!;
    const upZ = cam[6]!;

    // Hauteur d'un pixel écran en unités de scène, à distance 1 : le reste est
    // proportionnel à la distance.
    const perPixel = (2 * Math.tan(HALF_FOV)) / Math.max(1, size.height);
    const depth = depthRef.current;
    let visible = 0;

    for (let i = 0; i < sized.length; i++) {
      const sprite = sprites.current[i];
      const entry = sized[i];
      if (!sprite || !entry) continue;
      const { item, ratio } = entry;

      const [x, y, z] = item.at();
      const distance = Math.hypot(
        camera.position.x - x,
        camera.position.y - y,
        camera.position.z - z,
      );
      if (distance <= 0) {
        sprite.visible = false;
        continue;
      }

      const opacity =
        labelOpacity(item.radius / distance) * layerOpacity(item.tier, depth);
      // Un sprite invisible sort aussi du raycast : c'est three.js qui l'ignore, et c'est
      // ce qui empêche une étiquette effacée de rester cliquable.
      sprite.visible = opacity > INVISIBLE;
      if (!sprite.visible) continue;
      visible++;

      (sprite.material as { opacity: number }).opacity = opacity;

      // Taille écran constante : la hauteur en unités de scène suit la distance.
      const height = distance * perPixel * PIXEL_HEIGHT;
      sprite.scale.set(height * ratio, height, 1);

      // Posée au-dessus de l'objet, d'un rayon et demi plus la demi-hauteur du texte —
      // assez pour dégager un corps qui remplit déjà l'écran, sans décrocher l'étiquette
      // de ce qu'elle nomme.
      const lift = item.radius * 1.5 + height / 2;
      sprite.position.set(x + upX * lift, y + upY * lift, z + upZ * lift);
    }

    if (visible !== published.current) {
      published.current = visible;
      onVisibleCount(visible);
    }
  });

  return (
    <>
      {sized.map((entry, index) => (
        // biome-ignore lint/a11y/useKeyWithClickEvents: objet de scène three.js, ni
        // focusable ni clavier — le chemin accessible est la liste DOM parallèle
        // (chantier 31.16), qui porte les mêmes actions.
        <sprite
          key={entry.item.id}
          ref={(node) => {
            sprites.current[index] = node;
          }}
          visible={false}
          onClick={() => onSelect(entry.item.id)}
          onDoubleClick={() => onOpen(entry.item.id)}
        >
          <spriteMaterial
            map={entry.texture}
            transparent
            // Une étiquette se lit par-dessus ce qu'elle nomme : écrire dans le tampon de
            // profondeur la ferait découper par le corps qu'elle surplombe.
            depthWrite={false}
            depthTest={false}
          />
        </sprite>
      ))}
    </>
  );
}
