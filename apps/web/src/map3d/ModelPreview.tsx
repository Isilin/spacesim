import { OrbitControls } from "@react-three/drei";
import { Canvas, useThree } from "@react-three/fiber";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Box3, type Group, type PerspectiveCamera, Sphere } from "three";
import { gridColor } from "./theme.js";

/**
 * Petit canvas de présentation pour un objet manufacturé (chantiers 31.20-31.21, cadrage
 * revu au 33.6) — vaisseau ou station.
 *
 * Il **complète** les diagrammes 2D plutôt qu'il ne les remplace : `ShipHullDiagram` et
 * `StationDiagram` sont des éditeurs — on y clique un emplacement ou un point de
 * croissance. Une vue 3D est une vue ; lui confier l'édition ferait perdre le geste.
 */

/** Champ vertical. Nettement plus étroit que le défaut de R3F (75°), qui écrasait les
 *  coques en perspective sur un cadre de 220 px — un objet se photographie au téléobjectif. */
const FOV = 34;

/** Part de l'image laissée libre autour de l'objet. */
const MARGIN = 1.25;

/** Direction de vue : trois quarts, légèrement au-dessus. */
const VIEW = [0.75, -0.62, 0.42] as const;

/**
 * Cadre la caméra sur le contenu RÉEL, mesuré après montage.
 *
 * Les appelants passaient jusqu'ici une distance calculée à la main —
 * `Math.max(8, zones.length * 2.4)` pour une station, dont le rayon croît en √n, et une
 * constante `7` pour tout vaisseau quelle que soit sa taille. Une boîte englobante ne peut
 * pas se tromper, et elle vaut pour tout objet ajouté plus tard.
 */
function FitPreview({
  fitKey,
  children,
}: {
  fitKey: string;
  children: ReactNode;
}) {
  const group = useRef<Group>(null);
  const camera = useThree((s) => s.camera) as PerspectiveCamera;
  const size = useThree((s) => s.size);
  /** Rayon mesuré : sert aussi à dimensionner le repère d'assise sous l'objet. */
  const [radius, setRadius] = useState(1);

  useEffect(() => {
    if (!group.current) return;
    const box = new Box3().setFromObject(group.current);
    if (box.isEmpty()) return;
    const sphere = box.getBoundingSphere(new Sphere());
    const aspect = size.width / Math.max(1, size.height);
    const tanY = Math.tan(((FOV / 2) * Math.PI) / 180);
    // Cadrage sur le champ le plus CONTRAINT : sur un aperçu presque carré, un cadrage
    // vertical seul coupe les bords d'un vaisseau, qui est long et fin.
    const distance =
      (sphere.radius * MARGIN) / Math.min(tanY, tanY * Math.max(0.1, aspect));
    const norm = Math.hypot(...VIEW);
    camera.position.set(
      sphere.center.x + (VIEW[0] / norm) * distance,
      sphere.center.y + (VIEW[1] / norm) * distance,
      sphere.center.z + (VIEW[2] / norm) * distance,
    );
    camera.near = Math.max(0.01, distance * 0.05);
    camera.far = distance * 12;
    camera.lookAt(sphere.center);
    camera.updateProjectionMatrix();
    setRadius(sphere.radius);
    // `fitKey` et non l'identité des enfants : celle-ci change à chaque rendu, et un
    // recadrage à chaque rendu annulerait la rotation en cours.
  }, [camera, size, fitKey]);

  return (
    <>
      <group ref={group}>{children}</group>
      {/* Repère d'assise, DANS la scène et non derrière le canvas : la vignette qui
          jouait ce rôle était figée en coordonnées d'écran et ne tournait pas avec la
          caméra — même défaut que celui corrigé sur `.map-canvas` au chantier 31.24.
          Dimensionné sur l'objet mesuré, et volontairement discret : il donne l'échelle,
          il ne doit pas concurrencer la silhouette. */}
      <gridHelper
        args={[radius * 4, 6, gridColor(), gridColor()]}
        position={[0, 0, -radius * 1.35]}
        rotation={[Math.PI / 2, 0, 0]}
      />
    </>
  );
}

export function ModelPreview({
  ariaLabel,
  fitKey,
  children,
}: {
  ariaLabel: string;
  /** Signature du contenu : un cadrage se rejoue quand l'objet change, jamais autrement. */
  fitKey: string;
  children: ReactNode;
}) {
  const { t } = useTranslation();
  return (
    <section className="model-preview" aria-label={ariaLabel}>
      <p className="visually-hidden">{t("modelPreview.hint")}</p>
      <Canvas
        aria-hidden="true"
        camera={{ fov: FOV, position: [4, -3, 2] }}
        gl={{ antialias: true, alpha: true }}
        // Le rendu holographique est un empilement de translucides : c'est la seule vue
        // limitée par le remplissage. Plafonner la densité de pixels y coûte deux fois
        // moins cher sur un écran à trois pixels par point, sans rien changer à 220 px.
        dpr={[1, 2]}
      >
        {/* Aucune lumière : le registre holographique ne s'éclaire pas, il rayonne
            (ADR 0013). Les trois lampes d'avant faisaient lire du plastique fumé. */}
        <FitPreview fitKey={fitKey}>{children}</FitPreview>
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
