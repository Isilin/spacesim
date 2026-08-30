import { OrbitControls } from "@react-three/drei";
import { Canvas } from "@react-three/fiber";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";

/**
 * Petit canvas de présentation pour un objet manufacturé (chantiers 31.20-31.21) —
 * vaisseau ou station. Distinct de `MapCanvas` : on tourne autour d'un objet unique,
 * pas d'une scène, donc pas de grille, pas de déplacement latéral, et une distance fixe.
 *
 * Il **complète** les diagrammes 2D plutôt qu'il ne les remplace : `ShipHullDiagram` et
 * `StationDiagram` sont des éditeurs — on y clique un emplacement ou un point de
 * croissance. Une vue 3D est une vue ; lui confier l'édition ferait perdre le geste.
 */
export function ModelPreview({
  ariaLabel,
  distance,
  children,
}: {
  ariaLabel: string;
  distance: number;
  children: ReactNode;
}) {
  const { t } = useTranslation();
  return (
    <section className="model-preview" aria-label={ariaLabel}>
      <p className="visually-hidden">{t("modelPreview.hint")}</p>
      <Canvas
        aria-hidden="true"
        camera={{ position: [distance * 0.8, -distance * 0.7, distance * 0.5] }}
        gl={{ antialias: true, alpha: true }}
      >
        <ambientLight intensity={0.5} />
        <directionalLight position={[1, 1, 1]} intensity={2.2} />
        <directionalLight position={[-1, -0.5, -1]} intensity={0.6} />
        {children}
        <OrbitControls
          makeDefault
          enablePan={false}
          enableDamping
          autoRotate
          autoRotateSpeed={0.8}
        />
      </Canvas>
    </section>
  );
}
