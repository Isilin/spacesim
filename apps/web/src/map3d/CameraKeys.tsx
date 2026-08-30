import { useThree } from "@react-three/fiber";
import { useEffect } from "react";
import type { Camera, Vector3 } from "three";

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
 * de la scène et peut recevoir le focus.
 *
 * Ce pilotage ne remplace pas la liste DOM parallèle : déplacer une caméra ne dit rien
 * à un lecteur d'écran de ce que contient la scène. Les deux sont nécessaires.
 */
export function CameraKeys({ distance }: { distance: number }) {
  const controls = useThree((s) => s.controls) as Controls | null;
  const gl = useThree((s) => s.gl);

  useEffect(() => {
    const host = gl.domElement.parentElement;
    if (!host || !controls) return;

    const step = distance * 0.08;
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
        case "+":
        case "=":
          camera.position.multiplyScalar(0.85);
          break;
        case "-":
          camera.position.multiplyScalar(1.18);
          break;
        case "0":
          controls.target.set(0, 0, 0);
          camera.position.set(0, -distance * 0.6, distance * 0.8);
          break;
        default:
          handled = false;
      }
      if (!handled) return;
      // Les flèches font défiler la page par défaut : la scène a la main tant qu'elle
      // a le focus.
      event.preventDefault();
      controls.update();
    };

    host.addEventListener("keydown", onKeyDown);
    return () => host.removeEventListener("keydown", onKeyDown);
  }, [controls, gl, distance]);

  return null;
}
