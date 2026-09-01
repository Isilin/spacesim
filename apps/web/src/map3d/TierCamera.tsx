import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useRef, type RefObject } from "react";
import type { PerspectiveCamera, Vector3 } from "three";
import type { Focus } from "./bounds.js";
import { fitDistance } from "./MapCanvas.js";
import {
  clipPlanesFor,
  distanceForProgress,
  electAnchor,
  tierBlend,
  tierIndex,
  tierProgress,
  type TierName,
  type Vec3,
} from "./tiers.js";

/**
 * Surface d'`OrbitControls` réellement utilisée — typée structurellement plutôt
 * qu'importée de `three-stdlib`, même choix qu'en 31.16 et dans `MapCanvas`.
 */
interface ControlsHandle {
  target: Vector3;
  minDistance: number;
  maxDistance: number;
}

export interface AnchorCandidate {
  id: string;
  position: Vec3;
}

interface Props {
  /** `<section class="map-canvas">` : le seul point du DOM où une caméra 3D peut laisser
   *  une trace observable de l'extérieur. */
  host: RefObject<HTMLElement | null>;
  tier: TierName;
  /** Cadrage du palier courant, en unités de scène. */
  parentFocus: Focus;
  /**
   * Cadrage de l'enfant ancré, **déjà imbriqué** en unités de scène (`nestedFocus`).
   * `null` quand rien n'est visé, ou au dernier palier : il n'y a alors pas de bande,
   * donc pas de descente possible.
   */
  childFocus: Focus | null;
  /** Candidats à l'ancrage, en unités de scène. */
  candidates: readonly AnchorCandidate[];
  /** Emprise d'un candidat dans la scène — cale le rayon d'élection. */
  candidateFootprint: number;
  anchorId: string | null;
  onAnchor: (id: string | null) => void;
  onCross: (delta: 1 | -1) => void;
  onChildMount: (mounted: boolean) => void;
}

/**
 * Pilotage du zoom continu (chantier 35.2).
 *
 * Tout ce qui doit être su à chaque image est calculé ici et **n'entre jamais dans l'état
 * React** : la profondeur change soixante fois par seconde, un `setState` par image
 * re-rendrait l'arbre entier. Même geste qu'`OrbitingBody`, qui écrit sa position
 * directement sur son `group`.
 *
 * Seules trois décisions **discrètes** remontent, et seulement quand elles changent :
 * quel enfant est visé (`onAnchor`), quand il faut le monter (`onChildMount`), et quand
 * le palier courant est franchi (`onCross`). Elles se comptent sur les doigts d'une main
 * pour une traversée complète.
 *
 * Ce composant ne touche pas au dolly : c'est `OrbitControls` qui produit la distance, et
 * on la lit. Reprendre la molette à la main aurait coûté l'inertie et le zoom-au-curseur
 * qu'il donne déjà.
 */
export function TierCamera({
  host,
  tier,
  parentFocus,
  childFocus,
  candidates,
  candidateFootprint,
  anchorId,
  onAnchor,
  onCross,
  onChildMount,
}: Props) {
  const camera = useThree((s) => s.camera) as PerspectiveCamera;
  const controls = useThree((s) => s.controls) as ControlsHandle | null;
  const size = useThree((s) => s.size);

  const mounted = useRef(false);
  const anchored = useRef<string | null>(anchorId);
  const depthAttr = useRef("");
  /**
   * Verrou de franchissement : `onCross` déclenche un rendu React, et `useFrame` tourne
   * plusieurs fois avant que le nouveau palier n'arrive. Sans lui, un seul franchissement
   * en déclencherait une poignée et la carte traverserait deux paliers d'un coup.
   */
  const crossing = useRef(false);

  useEffect(() => {
    anchored.current = anchorId;
  }, [anchorId]);

  useEffect(() => {
    host.current?.setAttribute("data-map-tier", tier);
  }, [host, tier]);

  useFrame(() => {
    if (!controls) return;
    const aspect = size.width / Math.max(1, size.height);
    const parentFrame = fitDistance(parentFocus, aspect);
    const distance = camera.position.distanceTo(controls.target);

    // Plans de coupe. Indispensable et pas cosmétique : `MapCanvas` ne fixe que `far`,
    // donc `near` vaut le défaut de three.js (0,1) — au palier corps, où la caméra
    // regarde à quelques centièmes d'unité, toute la scène passerait devant lui.
    const { near, far } = clipPlanesFor(distance, parentFrame);
    // Seuil de 2 % : recalculer la matrice de projection à chaque image serait payer un
    // recalcul complet pour un changement invisible.
    if (
      Math.abs(camera.near - near) > near * 0.02 ||
      Math.abs(camera.far - far) > far * 0.02
    ) {
      camera.near = near;
      camera.far = far;
      camera.updateProjectionMatrix();
    }

    const childFrame = childFocus ? fitDistance(childFocus, aspect) : 0;
    const progress =
      childFrame > 0 ? tierProgress(distance, parentFrame, childFrame) : 0;

    // Bornes de dolly, refaites à chaque palier. `OrbitControls` les tient de props
    // calculées sur un cadrage fixe ; laissées telles quelles, un cran de molette
    // sauterait deux frontières au palier profond et se bloquerait au palier large.
    controls.maxDistance = parentFrame * 3;
    controls.minDistance =
      childFrame > 0
        ? // Un peu au-delà de la frontière, sinon le franchissement n'est jamais atteint.
          distanceForProgress(parentFrame, childFrame, 1.15)
        : // Rien à viser : on ne plonge pas dans le vide, la descente s'arrête ici.
          parentFrame * 0.15;

    const blend = tierBlend(progress);

    // L'ancre se réélit tant que l'enfant n'est pas monté, puis se fige : changer de cible
    // en plein fondu échangerait une galaxie contre une autre sous les yeux du joueur.
    if (!blend.childMounted && candidates.length > 0) {
      const reach = Math.max(candidateFootprint * 6, distance * 0.3);
      const t = controls.target;
      const elected = electAnchor([t.x, t.y, t.z], candidates, reach);
      const next = elected?.id ?? null;
      if (next !== anchored.current) {
        anchored.current = next;
        onAnchor(next);
      }
    }

    if (blend.childMounted !== mounted.current) {
      mounted.current = blend.childMounted;
      onChildMount(blend.childMounted);
    }

    // La remontée se teste sur la distance et non sur la progression : au dernier palier
    // il n'y a pas d'enfant, donc pas de bande, donc pas de progression — et sans cela on
    // pourrait descendre dans un système sans jamais pouvoir en ressortir.
    const descending = childFrame > 0 && progress >= 1 && anchored.current;
    const ascending = distance > parentFrame * 1.02;
    // Le verrou se relâche de lui-même dès que la vue est revenue franchement dans la
    // bande. Le lier au palier ne suffirait pas : au sommet de l'échelle la remontée est
    // refusée, le palier ne change pas, et le verrou resterait fermé pour toujours.
    if (!descending && !ascending) crossing.current = false;
    else if (!crossing.current) {
      crossing.current = true;
      onCross(descending ? 1 : -1);
    }

    // Profondeur publiée dans le DOM : une caméra 3D n'y laisse rien, et c'est le seul
    // point sur lequel un test de bout en bout peut affirmer que la traversée a eu lieu.
    const depth = (
      tierIndex(tier) + Math.min(1, Math.max(0, progress))
    ).toFixed(2);
    if (depth !== depthAttr.current) {
      depthAttr.current = depth;
      host.current?.setAttribute("data-map-depth", depth);
    }
  });

  return null;
}
