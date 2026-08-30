import { OrbitControls } from "@react-three/drei";
import { Canvas } from "@react-three/fiber";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { CameraKeys } from "./CameraKeys.js";

interface Props {
  /** Décrit la scène pour les lecteurs d'écran — le canvas leur est opaque. */
  ariaLabel: string;
  /**
   * Distance initiale de la caméra. Chaque niveau de carte a sa propre échelle : de
   * quelques centaines d'unités pour un système à plusieurs milliers pour l'univers.
   */
  distance: number;
  /**
   * Registre visuel (chantier 31.18). `schematic` aux niveaux univers et galaxie —
   * c'est une carte de commandement ; `lit` au niveau système, où l'étoile éclaire
   * réellement la scène.
   */
  register?: "schematic" | "lit";
  children: ReactNode;
}

/**
 * Socle de rendu 3D partagé par les trois niveaux de carte (chantier 31.12).
 *
 * Le canvas est **masqué aux technologies d'assistance** : WebGL n'expose aucune
 * structure, et laisser un `role="img"` sans contenu ferait croire à une image
 * décrite. La navigation accessible passe par la liste DOM parallèle que chaque vue
 * rend à côté (chantier 31.16) — porter les raccourcis clavier de `ZoomableSvg` sur la
 * caméra n'y suffirait pas.
 */
export function MapCanvas({
  ariaLabel,
  distance,
  register = "schematic",
  children,
}: Props) {
  const { t } = useTranslation();
  return (
    // `tabIndex` : la section doit pouvoir recevoir le focus pour que les raccourcis
    // clavier de la caméra s'appliquent. Le canvas, lui, reste hors du parcours.
    // `role="application"` : la section capte les touches pour piloter la caméra, donc
    // le lecteur d'écran doit lui laisser le clavier plutôt que d'appliquer ses propres
    // raccourcis. Même geste qu'au chantier 27.24 sur `ZoomableSvg` devenu interactif.
    <section
      className="map-canvas"
      role="application"
      aria-label={ariaLabel}
      aria-describedby="map-canvas-keys"
      // biome-ignore lint/a11y/noNoninteractiveTabindex: `section` n'est pas nativement interactive, mais le `role="application"` ci-dessus en fait un widget clavier à part entière (déplacement/zoom de caméra) — le tabIndex est l'affordance requise. Même geste que sur `ZoomableSvg` au chantier 27.24.
      tabIndex={0}
    >
      <p id="map-canvas-keys" className="visually-hidden">
        {t("mapCanvas.keyboardHint")}
      </p>
      <Canvas
        aria-hidden="true"
        camera={{ position: [0, -distance * 0.6, distance * 0.8], fov: 50 }}
        // Le fond vient du thème, pas d'une couleur codée ici.
        gl={{ antialias: true, alpha: true }}
      >
        {register === "lit" ? (
          <>
            {/* L'étoile est au centre du système : une lumière ponctuelle à l'origine
                suffit à donner leur relief aux corps. */}
            <pointLight position={[0, 0, 0]} intensity={3} decay={0.4} />
            <ambientLight intensity={0.15} />
          </>
        ) : (
          // Registre schématique : éclairage plat, la lisibilité prime sur le relief.
          <ambientLight intensity={1} />
        )}
        {children}
        <CameraKeys distance={distance} />
        <OrbitControls
          makeDefault
          enablePan
          enableDamping
          dampingFactor={0.15}
          maxDistance={distance * 4}
          minDistance={distance * 0.05}
        />
      </Canvas>
    </section>
  );
}
