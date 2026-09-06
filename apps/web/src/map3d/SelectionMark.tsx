import { useFrame } from "@react-three/fiber";
import { useRef } from "react";
import { CanvasTexture, type Sprite } from "three";
import { FOV } from "./MapCanvas.js";
import { worldPerPixel, type Vec3 } from "./tiers.js";

/** Côté de la texture d'une équerre, en pixels de texture. Suréchantillonné : le trait reste
 *  net de près. */
const TEXTURE_SIZE = 64;

/** Épaisseur du trait, en pixels de texture. */
const STROKE = 8;

/**
 * Côté d'une équerre à l'écran, en pixels. **Constant, quelle que soit la taille du cadre.**
 *
 * C'est tout l'intérêt de dessiner quatre équerres plutôt qu'un cadre d'un seul tenant : un
 * sprite unique met sa texture à l'échelle, donc son trait épaissit avec lui — à pleine taille
 * il faisait une quinzaine de pixels de large. Ici seul l'ÉCARTEMENT des équerres suit l'objet.
 */
const CORNER_PIXELS = 16;

/** Côté minimal du cadre à l'écran, en pixels — un objet minuscule reste montré du doigt. */
const MIN_PIXELS = 30;

/**
 * Côté maximal, en fraction de la hauteur du cadre.
 *
 * Le repère précédent était un grillage sphérique à 1,35 fois le rayon du corps, qu'il a
 * fallu désactiver en dur au palier corps parce qu'il recouvrait l'écran. Un plafond règle
 * le problème une fois pour toutes : au-delà, un cadre ne désigne plus rien.
 */
const MAX_HEIGHT_RATIO = 0.4;

/** Marge autour de l'objet, en fraction de son diamètre apparent. */
const AROUND = 2.4;

/**
 * Les quatre coins, en signes d'écran : `x` vers la droite, `y` vers le haut. La rotation
 * amène l'équerre — dessinée coin en haut à gauche — à pointer vers l'extérieur.
 */
const CORNERS = [
  { sx: -1, sy: 1, rotation: 0 },
  { sx: 1, sy: 1, rotation: -Math.PI / 2 },
  { sx: 1, sy: -1, rotation: Math.PI },
  { sx: -1, sy: -1, rotation: Math.PI / 2 },
] as const;

let cached: CanvasTexture | null = null;

/**
 * L'équerre, rasterisée une fois pour toute la session.
 *
 * Une seule image sert les quatre coins, et un seul objet est sélectionné à la fois :
 * contrairement aux étiquettes, il n'y a rien à mémoïser par contenu.
 */
function cornerTexture(): CanvasTexture | null {
  if (cached) return cached;
  const canvas = document.createElement("canvas");
  canvas.width = TEXTURE_SIZE;
  canvas.height = TEXTURE_SIZE;
  // jsdom ne rend pas de 2D : les tests unitaires montent la scène sans contexte, et une
  // texture absente vaut mieux qu'une exception (même geste que `labelTexture`).
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;

  const edge = STROKE / 2;
  const far = TEXTURE_SIZE - edge;
  ctx.strokeStyle = "#4fc1ff";
  ctx.lineWidth = STROKE;
  ctx.lineCap = "square";
  ctx.beginPath();
  // Un L, coin en haut à gauche, bras vers la droite et vers le bas.
  ctx.moveTo(far, edge);
  ctx.lineTo(edge, edge);
  ctx.lineTo(edge, far);
  ctx.stroke();

  cached = new CanvasTexture(canvas);
  return cached;
}

interface Props {
  /** Où est l'objet sélectionné, à l'instant présent. `null` quand rien ne l'est. */
  at: (() => Vec3) | null;
  /** Emprise de l'objet dans la scène : le cadre l'entoure au lieu de le recouvrir. */
  radius: number;
}

/**
 * Le repère de l'objet sélectionné (chantier 40).
 *
 * Quatre sprites, comme les étiquettes, et pour les mêmes raisons : ils sont alignés sur
 * l'écran par construction, ne coûtent aucun repositionnement DOM par image, et laissent
 * passer la molette — un élément DOM posé sur l'objet qu'on vise la bloquerait, ce que le
 * chantier 35.12 avait déjà appris à ses dépens.
 *
 * Il remplace le grillage sphérique des planètes, qui ne valait que pour elles : stations,
 * comptoirs, ceintures et sites n'avaient aucun repère visuel du tout. Un seul, pour tous.
 *
 * L'écartement des équerres suit la taille de l'objet à l'écran, entre un plancher — pour
 * qu'un objet de trois pixels reste désigné — et un plafond, pour qu'un corps qui remplit le
 * cadre ne fasse pas déborder son repère. Les équerres, elles, ne changent jamais de taille.
 */
export function SelectionMark({ at, radius }: Props) {
  const corners = useRef<(Sprite | null)[]>([]);
  const texture = cornerTexture();

  useFrame(({ camera, size }) => {
    const marks = corners.current;
    const hide = !at || !texture;
    const [x, y, z] = hide ? [0, 0, 0] : at!();

    const distance = Math.hypot(
      camera.position.x - x,
      camera.position.y - y,
      camera.position.z - z,
    );
    const perPixel = worldPerPixel(distance, size.height, FOV);
    if (hide || perPixel <= 0) {
      for (const mark of marks) if (mark) mark.visible = false;
      return;
    }

    // Axes « droite » et « haut » de l'ÉCRAN, lus de la matrice caméra : les équerres se
    // posent aux coins d'un carré d'écran, pas d'un carré du monde.
    const cam = camera.matrixWorld.elements;
    const rightX = cam[0]!;
    const rightY = cam[1]!;
    const rightZ = cam[2]!;
    const upX = cam[4]!;
    const upY = cam[5]!;
    const upZ = cam[6]!;

    const apparent = radius / perPixel;
    const side = Math.min(
      size.height * MAX_HEIGHT_RATIO,
      Math.max(MIN_PIXELS, apparent * AROUND),
    );
    const glyph = CORNER_PIXELS * perPixel;
    // Le centre d'une équerre est en retrait d'une demi-équerre, pour que son ANGLE tombe
    // exactement sur le coin du carré.
    const reach = (side * perPixel - glyph) / 2;

    for (let i = 0; i < CORNERS.length; i++) {
      const mark = marks[i];
      if (!mark) continue;
      const { sx, sy } = CORNERS[i]!;
      mark.visible = true;
      mark.position.set(
        x + (rightX * sx + upX * sy) * reach,
        y + (rightY * sx + upY * sy) * reach,
        z + (rightZ * sx + upZ * sy) * reach,
      );
      mark.scale.set(glyph, glyph, 1);
    }
  });

  return (
    <>
      {CORNERS.map(({ sx, sy, rotation }, index) => (
        <sprite
          key={`${sx}:${sy}`}
          ref={(node) => {
            corners.current[index] = node;
          }}
          visible={false}
          renderOrder={2}
        >
          <spriteMaterial
            transparent
            // Le repère se lit par-dessus ce qu'il entoure : écrire dans le tampon de
            // profondeur le ferait découper par le corps qu'il désigne.
            depthWrite={false}
            depthTest={false}
            rotation={rotation}
            map={texture}
          />
        </sprite>
      ))}
    </>
  );
}
