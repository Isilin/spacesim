import { OrbitControls } from "@react-three/drei";
import { Canvas, useThree } from "@react-three/fiber";
import { useEffect, useRef, type ReactNode, type RefObject } from "react";
import { useTranslation } from "react-i18next";
import type { PerspectiveCamera, Vector3 } from "three";
import type { Focus } from "./bounds.js";
import { CameraKeys } from "./CameraKeys.js";

/** Champ vertical de la caméra, en degrés. */
const FOV = 50;

/** Part de l'image laissée libre autour du contenu. */
const MARGIN = 1.12;

/** Direction de vue : trois quarts au-dessus du plan galactique. */
const VIEW_DIRECTION = [0, -0.6, 0.8] as const;

type Vec3 = [number, number, number];

/** Surface d'`OrbitControls` réellement utilisée — même choix qu'en 31.16 : typer ce
 *  qu'on appelle plutôt que dépendre en direct de `three-stdlib`. */
interface ControlsHandle {
  target: Vector3;
  update: () => void;
  addEventListener?: (type: string, listener: () => void) => void;
  removeEventListener?: (type: string, listener: () => void) => void;
}

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
 * Recul qui fait tenir la boîte englobante de `focus` dans le cadre, aux DEUX axes.
 *
 * Le rapport d'image entre pour de bon dans le calcul : sur téléphone la scène est plus
 * haute que large (27.22), et un cadrage qui ne tient que le vertical y couperait les
 * bords d'une carte, précisément là où l'écran est le plus rare.
 */
export function fitDistance(focus: Focus, aspect: number): number {
  const forward = normalize([
    -VIEW_DIRECTION[0],
    -VIEW_DIRECTION[1],
    -VIEW_DIRECTION[2],
  ]);
  const right = normalize(cross(forward, [0, 1, 0]));
  const up = cross(right, forward);

  const tanY = Math.tan(((FOV / 2) * Math.PI) / 180);
  const tanX = tanY * Math.max(0.1, aspect);

  let distance = 0;
  const [hx, hy, hz] = focus.half;
  for (const sx of [-1, 1]) {
    for (const sy of [-1, 1]) {
      for (const sz of [-1, 1]) {
        const corner: Vec3 = [sx * hx, sy * hy, sz * hz];
        // Profondeur du coin depuis une caméra reculée de `distance` : le coin est vu
        // si sa demi-hauteur tient dans le cône à cette profondeur.
        const depth = dot(corner, forward);
        distance = Math.max(
          distance,
          Math.abs(dot(corner, up)) / tanY - depth,
          Math.abs(dot(corner, right)) / tanX - depth,
        );
      }
    }
  }
  return Math.max(focus.radius * 0.5, distance * MARGIN);
}

/** Position de caméra qui cadre `focus` sous l'angle de vue standard. */
export function cameraPositionFor(focus: Focus, aspect: number): Vec3 {
  const [dx, dy, dz] = normalize([...VIEW_DIRECTION] as Vec3);
  const d = fitDistance(focus, aspect);
  return [
    focus.center[0] + dx * d,
    focus.center[1] + dy * d,
    focus.center[2] + dz * d,
  ];
}

/**
 * Applique le cadrage une fois la taille du canvas connue, et à chaque redimensionnement.
 *
 * Indispensable ici et pas seulement au montage : R3F mesure son canvas par
 * `ResizeObserver`, donc APRÈS le premier rendu. La caméra passée en prop à `<Canvas>`
 * est donc toujours calculée sur un rapport d'image provisoire.
 */
function FitCamera({
  focus,
  host,
}: {
  focus: Focus;
  host: RefObject<HTMLElement | null>;
}) {
  const camera = useThree((s) => s.camera) as PerspectiveCamera;
  const size = useThree((s) => s.size);
  const controls = useThree((s) => s.controls) as ControlsHandle | null;

  // Signature de VALEUR : les vues recalculent leur `Focus` à chaque rendu, et le rendu
  // se rejoue à chaque tick serveur. Sur l'identité de l'objet, le recadrage se rejouait
  // en boucle.
  const { id, radius } = focus;
  const [cx, cy, cz] = focus.center;
  const [hx, hy, hz] = focus.half;
  const signature = `${id}|${cx},${cy},${cz}|${hx},${hy},${hz}`;

  const applied = useRef("");
  const handled = useRef(false);
  const fits = useRef(0);
  /**
   * Dernière position que ce composant a lui-même posée. Sert à reconnaître qu'un autre
   * l'a déplacée depuis (chantier 35.2).
   */
  const placed = useRef<[number, number, number] | null>(null);

  // La caméra appartient au joueur dès qu'il y touche. Le cadrage automatique ne vaut
  // que tant qu'il n'a rien fait : R3F mesure son canvas en plusieurs temps, et un
  // recadrage tardif annulait la rotation qu'on venait de faire à la souris.
  useEffect(() => {
    if (!controls?.addEventListener) return;
    const onStart = () => {
      handled.current = true;
    };
    controls.addEventListener("start", onStart);
    return () => controls.removeEventListener?.("start", onStart);
  }, [controls]);

  useEffect(() => {
    const isNewScene = applied.current !== signature;
    /**
     * La caméra n'appartient plus au cadrage automatique dès que **quiconque** l'a
     * déplacée, pas seulement le joueur à la souris (chantier 35.2).
     *
     * L'événement `start` d'`OrbitControls` ne dit rien d'un déplacement programmatique :
     * un saut de palier posait la caméra sur une galaxie, puis la mesure suivante de R3F
     * — qui en fait plusieurs — rejouait ce cadrage et ramenait la vue à l'amas. La
     * descente ne se produisait jamais, et rien ne le signalait.
     */
    const moved =
      placed.current !== null &&
      // Tolérance relative au cadrage, pas égalité stricte : `OrbitControls` recompose la
      // position par un aller-retour en coordonnées sphériques à chaque image, ce qui la
      // fait bouger de quelques 10⁻¹⁰ même immobile. Sur l'égalité, la caméra aurait été
      // déclarée « déplacée » dès la première image et le recadrage tardif — celui qui
      // corrige le rapport d'image mesuré par R3F — n'aurait plus jamais eu lieu.
      Math.hypot(
        camera.position.x - placed.current[0],
        camera.position.y - placed.current[1],
        camera.position.z - placed.current[2],
      ) >
        radius * 1e-3;
    if (!isNewScene && (handled.current || moved)) return;
    applied.current = signature;
    if (isNewScene) handled.current = false;

    const target: Focus = {
      id,
      center: [cx, cy, cz],
      half: [hx, hy, hz],
      radius,
    };
    const aspect = size.width / Math.max(1, size.height);
    const [x, y, z] = cameraPositionFor(target, aspect);
    camera.position.set(x, y, z);
    placed.current = [x, y, z];
    camera.far = fitDistance(target, aspect) * 12;
    camera.updateProjectionMatrix();
    controls?.target.set(cx, cy, cz);
    controls?.update();

    // Compteur de recadrages, exposé sur l'hôte du canvas. C'est le seul point
    // observable de l'extérieur : une caméra 3D n'a pas de trace dans le DOM, et le
    // recadrage intempestif qui annulait la rotation du joueur ne se voyait qu'à l'œil.
    // Un test peut désormais l'affirmer (`map3d.spec.ts`).
    fits.current += 1;
    host.current?.setAttribute("data-map-fits", String(fits.current));
    // `size` volontairement présent : c'est le signal de mesure de R3F.
  }, [
    camera,
    controls,
    host,
    size,
    signature,
    id,
    cx,
    cy,
    cz,
    hx,
    hy,
    hz,
    radius,
  ]);

  return null;
}

interface Props {
  /** Décrit la scène pour les lecteurs d'écran — le canvas leur est opaque. */
  ariaLabel: string;
  /**
   * Sphère englobante du contenu. La caméra en dérive sa distance ET sa cible : viser
   * l'origine ne marche que si le contenu y est, ce qui n'est vrai d'aucune des trois
   * vues.
   */
  focus: Focus;
  /**
   * Hôte du canvas, quand l'appelant a besoin d'y écrire lui-même (chantier 35.2).
   *
   * `TierCamera` publie la profondeur de zoom sur cette section, et il vit **dans** le
   * canvas : le contexte React ne traverse pas la frontière du réconciliateur de R3F, il
   * faut donc que la référence descende par les props. Absente, `MapCanvas` garde la
   * sienne et rien ne change.
   */
  hostRef?: RefObject<HTMLElement | null>;
  /**
   * Clic dans le vide (chantier 35.5). API de R3F prévue pour exactement cela : elle ne se
   * déclenche que si le rayon n'a rencontré aucun objet de la scène, ce qu'aucun
   * gestionnaire posé sur le DOM ne saurait distinguer.
   */
  onPointerMissed?: () => void;
  /**
   * Surcouche DOM au-dessus du canvas (chantier 35.5), hors du conteneur de R3F.
   *
   * Ce conteneur porte `aria-hidden` — WebGL n'expose aucune structure. Une infobox
   * portalisée dedans par drei héritait donc de cet attribut : invisible aux lecteurs
   * d'écran, et introuvable par son rôle. La surcouche est le seul endroit du canvas où du
   * DOM annoncé peut vivre.
   */
  overlayRef?: RefObject<HTMLDivElement | null>;
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
  focus,
  hostRef: providedRef,
  onPointerMissed,
  overlayRef,
  children,
}: Props) {
  const { t } = useTranslation();
  // Cadrage provisoire : `FitCamera` le refait dès que R3F a mesuré le canvas.
  const distance = fitDistance(focus, 1);
  /**
   * La `<section>` elle-même, et non `gl.domElement.parentElement` : R3F intercale ses
   * propres div entre la section et le canvas. Viser le parent immédiat posait donc
   * l'écouteur clavier sur un descendant de l'élément focusé — où un `keydown` ne
   * remonte jamais.
   */
  const ownRef = useRef<HTMLElement>(null);
  const hostRef = providedRef ?? ownRef;
  return (
    // `tabIndex` : la section doit pouvoir recevoir le focus pour que les raccourcis
    // clavier de la caméra s'appliquent. Le canvas, lui, reste hors du parcours.
    // `role="application"` : la section capte les touches pour piloter la caméra, donc
    // le lecteur d'écran doit lui laisser le clavier plutôt que d'appliquer ses propres
    // raccourcis. Même geste qu'au chantier 27.24 sur `ZoomableSvg` devenu interactif.
    <section
      ref={hostRef}
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
        camera={{
          position: cameraPositionFor(focus, 1),
          fov: FOV,
          far: distance * 12,
        }}
        // Le fond vient du thème, pas d'une couleur codée ici.
        gl={{ antialias: true, alpha: true }}
        onPointerMissed={onPointerMissed}
      >
        {children}
        {/* Après `OrbitControls` : le cadrage a besoin des contrôles pour poser la
            cible, et `makeDefault` ne les publie qu'une fois montés. */}
        <OrbitControls
          makeDefault
          // Navigation orbitale (chantier 36.2) : on tourne autour de ce qu'on regarde,
          // on ne dérive pas. Le panoramique et le zoom-au-curseur déplaçaient la cible
          // n'importe où, y compris dans le vide entre deux objets — on perdait son objet
          // de vue en zoomant dessus.
          enablePan={false}
          // Le zoom est repris à la main par `TierCamera` : `OrbitControls` amortit la
          // rotation mais applique le dolly d'un bloc, et son pas fixe demandait ~35 crans
          // par palier. Le nôtre est amorti et calibré sur la bande à traverser.
          enableZoom={false}
          enableDamping
          dampingFactor={0.15}
          // Bornes de dolly volontairement absentes (chantier 35.3) : `TierCamera` les
          // recalcule à chaque image sur le palier courant. Les poser ici, sur le cadrage
          // du montage, les faisait réapparaître à chaque rendu React et ramener la caméra
          // au palier de départ — au palier corps, la borne héritée de l'univers valait
          // près de cent fois la distance de vue.
        />
        <FitCamera focus={focus} host={hostRef} />
        <CameraKeys focus={focus} host={hostRef} />
      </Canvas>
      {overlayRef && <div ref={overlayRef} className="map-overlay" />}
    </section>
  );
}
