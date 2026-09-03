import { useThree } from "@react-three/fiber";
import {
  useEffect,
  useRef,
  type MutableRefObject,
  type RefObject,
} from "react";
import { Vector3, type PerspectiveCamera } from "three";
import { nearestToCursor, type ScreenPoint, type Vec3 } from "./tiers.js";

/**
 * Rayon de tolérance du clic, en pixels.
 *
 * Ce n'est pas un confort : en dézoomant, une station ou un site de scan ne fait plus que
 * quelques pixels, et la moitié du contenu d'un système n'a de toute façon aucune géométrie
 * cliquable — comptoir, avant-postes, flottes, ceintures ne portent aucun gestionnaire. Sans
 * cette tolérance, ils ne sont atteignables que par leur étiquette ou par la liste DOM.
 */
const PICK_RADIUS = 18;

export interface Pickable {
  id: string;
  /** Où il est, à l'instant présent — un corps orbite. */
  at: () => Vec3;
}

interface Props {
  /** `<section class="map-canvas">`, dont le rectangle donne l'origine des pixels. */
  host: RefObject<HTMLElement | null>;
  selectables: readonly Pickable[];
  /**
   * Le gestionnaire, publié à l'appelant.
   *
   * `onPointerMissed` est une prop de `<Canvas>`, donc posée depuis l'extérieur de la scène,
   * là où il n'y a ni caméra ni cadre. Ce composant vit dedans et a les deux : il dépose sa
   * fonction dans cette référence, que l'appelant appelle avec l'événement natif.
   */
  bind: MutableRefObject<((event: MouseEvent) => void) | null>;
  /** `null` quand le clic est tombé dans le vide. */
  onPick: (id: string | null) => void;
}

/**
 * Sélection au clic, tolérante aux objets minuscules (chantier 40).
 *
 * Le chemin **exact** reste celui de R3F : les gestionnaires posés sur les objets attrapent
 * les gros — cliquer le bord d'une planète qui remplit l'écran doit la sélectionner, ce qu'un
 * critère « le centre le plus proche » manquerait de loin. Ce composant est le **repli** :
 * `onPointerMissed` ne se déclenche que si le rayon n'a rencontré aucun objet gestionnaire, et
 * c'est là qu'on rattrape ce qui est trop petit, ou dépourvu de géométrie cliquable.
 *
 * Au-delà du rayon, on rend `null` : le joueur a cliqué dans le vide, et cela désélectionne.
 */
export function Picker({ host, selectables, bind, onPick }: Props) {
  const camera = useThree((s) => s.camera) as PerspectiveCamera;

  /** Le pool courant, lu par un gestionnaire installé une seule fois. */
  const latest = useRef(selectables);
  latest.current = selectables;

  useEffect(() => {
    const at = new Vector3();
    bind.current = (event: MouseEvent) => {
      const node = host.current;
      if (!node) return;
      const rect = node.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return;
      const points: ScreenPoint[] = [];
      for (const item of latest.current) {
        const [x, y, z] = item.at();
        at.set(x, y, z).project(camera);
        points.push({
          id: item.id,
          // NDC → pixels du cadre. C'est ici que l'anisotropie disparaît : les deux axes
          // sont ramenés à la même unité avant toute comparaison de distance.
          at: [((at.x + 1) / 2) * rect.width, ((1 - at.y) / 2) * rect.height],
          depth: at.z,
        });
      }
      const cursor: [number, number] = [
        event.clientX - rect.left,
        event.clientY - rect.top,
      ];
      onPick(nearestToCursor(cursor, points, PICK_RADIUS)?.id ?? null);
    };
    return () => {
      bind.current = null;
    };
  }, [bind, host, camera, onPick]);

  return null;
}
