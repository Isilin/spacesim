import { useThree } from "@react-three/fiber";
import { useEffect, type RefObject } from "react";
import type { Camera, Vector3 } from "three";
import type { Focus } from "./bounds.js";
import { cameraPositionFor } from "./MapCanvas.js";

/**
 * Surface des contrôles réellement utilisée ici. Typée structurellement plutôt
 * qu'importée de `three-stdlib` : ce paquet n'est qu'une dépendance transitive de drei,
 * l'ajouter en direct pour un seul type serait payer cher un confort d'écriture.
 */
interface Controls {
  object: Camera;
  target: Vector3;
  update: () => void;
}

/**
 * Pilotage de la caméra au clavier (chantier 31.16), avec les raccourcis déjà appris
 * sur `ZoomableSvg` au chantier 27.21 : flèches pour se déplacer, `+`/`-` pour zoomer,
 * `0` pour recadrer.
 *
 * Écoute sur la **section** qui entoure le canvas plutôt que sur le canvas lui-même :
 * ce dernier est `aria-hidden` et non focusable, alors que la section porte le libellé
 * de la scène et peut recevoir le focus. La section arrive par `ref` et non par
 * `gl.domElement.parentElement` : R3F intercale ses propres div, et l'écouteur se posait
 * sur un descendant de l'élément focusé, où un `keydown` ne remonte jamais.
 *
 * Ce pilotage ne remplace pas la liste DOM parallèle : déplacer une caméra ne dit rien
 * à un lecteur d'écran de ce que contient la scène. Les deux sont nécessaires.
 */
export function CameraKeys({
  focus,
  host,
}: {
  focus: Focus;
  host: RefObject<HTMLElement | null>;
}) {
  const controls = useThree((s) => s.controls) as Controls | null;
  const size = useThree((s) => s.size);

  useEffect(() => {
    const node = host.current;
    if (!node || !controls) return;

    const step = focus.radius * 0.15;
    let taken = 0;
    const onKeyDown = (event: KeyboardEvent) => {
      const camera = controls.object;
      let handled = true;
      switch (event.key) {
        case "ArrowLeft":
          camera.position.x -= step;
          controls.target.x -= step;
          break;
        case "ArrowRight":
          camera.position.x += step;
          controls.target.x += step;
          break;
        case "ArrowUp":
          camera.position.y += step;
          controls.target.y += step;
          break;
        case "ArrowDown":
          camera.position.y -= step;
          controls.target.y -= step;
          break;
        // Zoom relatif à la CIBLE, pas à l'origine du monde : une scène cadrée
        // ailleurs qu'en (0,0,0) partait sinon de travers à chaque pression.
        case "+":
        case "=":
          camera.position.lerp(controls.target, 0.15);
          break;
        case "-":
          camera.position.lerp(controls.target, -0.18);
          break;
        case "0": {
          const [tx, ty, tz] = focus.center;
          controls.target.set(tx, ty, tz);
          const [px, py, pz] = cameraPositionFor(
            focus,
            size.width / Math.max(1, size.height),
          );
          camera.position.set(px, py, pz);
          break;
        }
        default:
          handled = false;
      }
      if (!handled) return;
      // Les flèches font défiler la page par défaut : la scène a la main tant qu'elle
      // a le focus.
      event.preventDefault();
      controls.update();
      // Compteur de touches traitées, exposé sur l'hôte : une caméra 3D ne laisse rien
      // dans le DOM, et l'écouteur avait été posé sur le mauvais nœud sans que rien ne
      // le signale. C'est le seul point vérifiable de l'extérieur (`map3d.spec.ts`).
      taken += 1;
      node.setAttribute("data-map-keys", String(taken));
    };

    node.addEventListener("keydown", onKeyDown);
    return () => node.removeEventListener("keydown", onKeyDown);
  }, [controls, host, focus, size]);

  return null;
}
