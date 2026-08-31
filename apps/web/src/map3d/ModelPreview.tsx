import { OrbitControls } from "@react-three/drei";
import { Canvas, useThree } from "@react-three/fiber";
import {
  useEffect,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from "react";
import { useTranslation } from "react-i18next";
import {
  Box3,
  type Group,
  type PerspectiveCamera,
  Sphere,
  type Vector3,
} from "three";
import { gridColor } from "./theme.js";

/** Surface d'`OrbitControls` réellement utilisée — typée structurellement plutôt
 *  qu'importée de `three-stdlib`, même geste que dans `MapCanvas`. */
interface ControlsHandle {
  target: Vector3;
  update: () => void;
}

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

type Vec3 = [number, number, number];

function normalize([x, y, z]: Vec3): Vec3 {
  const n = Math.hypot(x, y, z) || 1;
  return [x / n, y / n, z / n];
}

function cross(a: Vec3, b: Vec3): Vec3 {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ];
}

function dot(a: Vec3, b: Vec3): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

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
  host,
  children,
}: {
  fitKey: string;
  host: RefObject<HTMLElement | null>;
  children: ReactNode;
}) {
  const group = useRef<Group>(null);
  const camera = useThree((s) => s.camera) as PerspectiveCamera;
  const size = useThree((s) => s.size);
  const controls = useThree((s) => s.controls) as ControlsHandle | null;
  /** Rayon mesuré : sert aussi à dimensionner le repère d'assise sous l'objet. */
  const [radius, setRadius] = useState(1);
  const fits = useRef(0);
  const applied = useRef("");

  useEffect(() => {
    if (!group.current) return;
    // Garde d'idempotence, même patron que `FitCamera` dans `MapCanvas` : l'effet est
    // rejoué par des changements d'identité qui ne changent rien au cadrage (la mesure
    // de R3F arrive en plusieurs temps, et poser `radius` re-rend ce composant). Sans
    // cette garde il se rejouait plusieurs fois par seconde, et chaque passage
    // repositionnait la caméra en pleine rotation — l'à-coup avant/arrière.
    const signature = `${fitKey}|${size.width}x${size.height}`;
    if (applied.current === signature) return;
    applied.current = signature;
    const box = new Box3().setFromObject(group.current);
    if (box.isEmpty()) return;
    const sphere = box.getBoundingSphere(new Sphere());
    const aspect = size.width / Math.max(1, size.height);
    const tanY = Math.tan(((FOV / 2) * Math.PI) / 180);
    const tanX = tanY * Math.max(0.1, aspect);

    // Cadrage sur les huit coins de la BOÎTE, pas sur la sphère englobante. Une station
    // est large et plate : sa sphère a le rayon de sa largeur, et la cadrer verticalement
    // la laissait minuscule dans un bandeau très allongé. Même calcul que `MapCanvas`,
    // pour la même raison.
    const norm = Math.hypot(...VIEW);
    const forward: [number, number, number] = [
      -VIEW[0] / norm,
      -VIEW[1] / norm,
      -VIEW[2] / norm,
    ];
    const right = normalize(cross(forward, [0, 0, 1]));
    const up = cross(right, forward);
    const half: [number, number, number] = [
      (box.max.x - box.min.x) / 2,
      (box.max.y - box.min.y) / 2,
      (box.max.z - box.min.z) / 2,
    ];
    let distance = 0;
    for (const sx of [-1, 1])
      for (const sy of [-1, 1])
        for (const sz of [-1, 1]) {
          const corner: [number, number, number] = [
            sx * half[0],
            sy * half[1],
            sz * half[2],
          ];
          const depth = dot(corner, forward);
          distance = Math.max(
            distance,
            Math.abs(dot(corner, up)) / tanY - depth,
            Math.abs(dot(corner, right)) / tanX - depth,
          );
        }
    distance = Math.max(sphere.radius * 0.6, distance * MARGIN);

    camera.position.set(
      sphere.center.x + (VIEW[0] / norm) * distance,
      sphere.center.y + (VIEW[1] / norm) * distance,
      sphere.center.z + (VIEW[2] / norm) * distance,
    );
    camera.near = Math.max(0.01, distance * 0.05);
    camera.far = distance * 12;
    camera.updateProjectionMatrix();
    // On pose la CIBLE des contrôles, jamais `camera.lookAt`. `OrbitControls` possède la
    // caméra : il recalcule sa position à chaque image depuis ses propres coordonnées
    // sphériques autour de sa cible. Une orientation posée dans le dos des contrôles est
    // défaite à l'image suivante, et l'aller-retour se voit — c'était l'à-coup
    // avant/arrière de la rotation automatique.
    controls?.target.copy(sphere.center);
    controls?.update();
    setRadius(sphere.radius);
    // Compteur de recadrages exposé sur l'hôte, comme `data-map-fits` sur la carte : une
    // caméra 3D ne laisse aucune trace dans le DOM, et c'est précisément un recadrage
    // qui se rejoue tout seul qui produisait l'à-coup. Seul point vérifiable de
    // l'extérieur.
    fits.current += 1;
    host.current?.setAttribute("data-preview-fits", String(fits.current));
    // `fitKey` et non l'identité des enfants : celle-ci change à chaque rendu, et un
    // recadrage à chaque rendu annulerait la rotation en cours.
  }, [camera, controls, host, size, fitKey]);

  return (
    <>
      <group ref={group}>{children}</group>
      {/* Repère d'assise, DANS la scène et non derrière le canvas : la vignette qui
          jouait ce rôle était figée en coordonnées d'écran et ne tournait pas avec la
          caméra — même défaut que celui corrigé sur `.map-canvas` au chantier 31.24.
          Dimensionné sur l'objet mesuré, et volontairement discret : il donne l'échelle,
          il ne doit pas concurrencer la silhouette. */}
      <gridHelper
        args={[radius * 2.8, 5, gridColor(), gridColor()]}
        position={[0, 0, -radius * 1.2]}
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
  const host = useRef<HTMLElement>(null);
  return (
    <section ref={host} className="model-preview" aria-label={ariaLabel}>
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
        <FitPreview fitKey={fitKey} host={host}>
          {children}
        </FitPreview>
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
