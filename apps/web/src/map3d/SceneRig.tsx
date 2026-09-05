import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useRef, type ReactNode, type RefObject } from "react";
import type { AmbientLight, Group, Vector3 } from "three";
import type { Focus } from "./bounds.js";
import { fitDistance } from "./MapCanvas.js";
import {
  distanceForProgress,
  tierIndex,
  type TierName,
  type Vec3,
} from "./tiers.js";

/**
 * Les pièces de scène que `MapScene` monte sans les décrire : le groupe qui suit un corps
 * en orbite, l'éclairage qui suit la profondeur, le vol de caméra et la publication de la
 * profondeur dans l'URL. Sorties de `MapScene.tsx` au chantier 43.8.
 *
 * Ce qui les réunit n'est pas un thème mais une PLACE : chacune est un composant sans rendu
 * visible — elles écrivent sur la caméra, sur une lumière ou sur l'URL depuis la boucle
 * d'images. Les garder dans le composant qui les monte mélangeait deux niveaux de lecture,
 * celui de la carte et celui de ses mécanismes.
 */

export interface ControlsHandle {
  target: Vector3;
  update: () => void;
}

/**
 * Groupe dont la position se recalcule à chaque image.
 *
 * Nécessaire au seul palier corps : une planète orbite, donc la place de son voisinage
 * dans la scène change en continu. Passer par une prop React la ferait re-rendre soixante
 * fois par seconde — même geste qu'`OrbitingBody`, qui écrit sur son `group`.
 */
export function MovingGroup({
  at,
  scale,
  children,
}: {
  at: () => Vec3;
  scale: number;
  children: ReactNode;
}) {
  const ref = useRef<Group>(null);
  useFrame(() => {
    const p = at();
    ref.current?.position.set(p[0], p[1], p[2]);
  });
  return (
    <group ref={ref} scale={scale}>
      {children}
    </group>
  );
}

/**
 * Éclairage piloté par la profondeur (chantier 35.3).
 *
 * Les deux registres visuels de l'ADR 0007 — schématique en haut, semi-réaliste dès le
 * système — étaient un booléen porté par `MapCanvas`. Sous un zoom continu, un booléen
 * produirait un saut de lumière au moment précis où le contenu du système devient
 * pleinement visible. L'ambiante s'interpole donc sur la bande galaxie → système, où la
 * ponctuelle de l'étoile prend le relais.
 */
export function LightRig({ depthRef }: { depthRef: RefObject<number> }) {
  const ambient = useRef<AmbientLight>(null);
  const from = tierIndex("system") - 1;
  useFrame(() => {
    if (!ambient.current) return;
    const t = Math.min(1, Math.max(0, depthRef.current - from));
    ambient.current.intensity = 1 - 0.85 * t;
  });
  return <ambientLight ref={ambient} intensity={1} />;
}

export interface JumpRequest {
  /**
   * Palier d'arrivée, posé en même temps que le cadrage.
   *
   * Un saut explicite peut traverser plusieurs bandes — « Ma capitale » vise un système
   * depuis l'univers. Laisser la caméra les redécouvrir une par une, à raison d'un
   * franchissement par image, faisait dépendre l'arrivée d'une course entre la boucle de
   * rendu et les rendus de React : la traversée s'arrêtait par intermittence au palier
   * intermédiaire. Un saut sait où il va ; il n'a pas à le redécouvrir.
   */
  tier: TierName;
  focus: Focus;
  /** Cadrage de l'enfant, quand la distance doit se poser DANS la bande. */
  child: Focus | null;
  /** Progression visée dans cette bande ; ignorée sans `child`. */
  progress: number;
}

/** Pool suspendu pendant un vol : une liste vide et stable, plutôt qu'un tableau par rendu. */
export const NOTHING_TO_PICK: { id: string; at: () => Vec3; radius: number }[] =
  [];

/** Durée d'un vol vers une cible, en ms. */
const FLIGHT_MS = 620;

/**
 * Vol de caméra vers une cible (chantiers 35.2, 35.3 puis 35.6).
 *
 * Sert aux gestes explicites — double-clic, recherche, raccourci — et à la restauration de
 * la profondeur portée par l'URL. Le recadrage était sec ; il est désormais animé, et c'est
 * ce qui donne au double-clic le sens que le joueur en attend : on **descend** vers l'objet
 * en traversant les paliers, on n'y est pas téléporté.
 *
 * Sans `child`, on cadre la cible à 95 % de sa distance de cadrage : ce n'est pas un détail
 * esthétique, cela pose la progression juste au-delà de 1 et déclenche le franchissement.
 */
export function CameraJump({
  request,
  onDone,
}: {
  request: JumpRequest;
  onDone: () => void;
}) {
  const camera = useThree((s) => s.camera);
  const controls = useThree((s) => s.controls) as ControlsHandle | null;
  const size = useThree((s) => s.size);
  // Lu par référence : un redimensionnement du canvas ne doit pas rejouer le vol et
  // reprendre au joueur la vue qu'il s'est donnée depuis.
  const measured = useRef(size);
  measured.current = size;

  const flight = useRef<{
    at: number;
    from: { target: Vec3; distance: number };
    to: { target: Vec3; distance: number };
    direction: Vec3;
  } | null>(null);

  useEffect(() => {
    if (!controls) return;
    const { width, height } = measured.current;
    const aspect = width / Math.max(1, height);
    const parent = fitDistance(request.focus, aspect);
    const distance =
      request.child && request.progress > 0
        ? distanceForProgress(
            parent,
            fitDistance(request.child, aspect),
            request.progress,
          )
        : parent * 0.95;

    // Direction de vue conservée : le joueur a peut-être tourné la caméra, un vol ne doit
    // pas lui reprendre son point de vue en même temps que sa position.
    const dx = camera.position.x - controls.target.x;
    const dy = camera.position.y - controls.target.y;
    const dz = camera.position.z - controls.target.z;
    const length = Math.hypot(dx, dy, dz) || 1;
    flight.current = {
      at: performance.now(),
      from: {
        target: [controls.target.x, controls.target.y, controls.target.z],
        distance: length,
      },
      to: { target: request.focus.center, distance },
      direction: [dx / length, dy / length, dz / length],
    };
  }, [request, camera, controls]);

  useFrame(() => {
    const flying = flight.current;
    if (!flying || !controls) return;
    const k = Math.min(1, (performance.now() - flying.at) / FLIGHT_MS);
    // Hermite : le vol démarre et s'arrête en douceur, il ne claque à aucun bout.
    const eased = k * k * (3 - 2 * k);

    const [tx, ty, tz] = flying.from.target;
    const [ux, uy, uz] = flying.to.target;
    const target: Vec3 = [
      tx + (ux - tx) * eased,
      ty + (uy - ty) * eased,
      tz + (uz - tz) * eased,
    ];
    // Distance interpolée **géométriquement**, pas linéairement : une carte dont les
    // paliers s'emboîtent par facteurs d'échelle se parcourt en octaves. Linéairement, le
    // vol traverserait toutes les bandes profondes dans les dernières images et l'arrivée
    // serait un à-coup.
    const distance =
      flying.from.distance *
      (flying.to.distance / flying.from.distance) ** eased;

    controls.target.set(target[0], target[1], target[2]);
    camera.position.set(
      target[0] + flying.direction[0] * distance,
      target[1] + flying.direction[1] * distance,
      target[2] + flying.direction[2] * distance,
    );
    controls.update();

    if (k >= 1) {
      flight.current = null;
      onDone();
    }
  });

  return null;
}

/** Intervalle minimal entre deux écritures d'URL, en ms. */
const PUBLISH_MS = 900;

/**
 * Publie la profondeur atteinte, sans réécrire l'URL à chaque image.
 *
 * La profondeur change soixante fois par seconde et l'URL est un état React : la publier
 * telle quelle re-rendrait tout l'arbre au même rythme. On la publie donc au repos, et
 * seulement quand elle a bougé assez pour valoir une entrée d'historique.
 */
export function DepthPublisher({
  depthRef,
  publish,
}: {
  depthRef: RefObject<number>;
  publish: () => void;
}) {
  const last = useRef({ at: 0, depth: depthRef.current });
  useFrame(() => {
    const now = performance.now();
    if (now - last.current.at < PUBLISH_MS) return;
    const depth = depthRef.current;
    if (Math.abs(depth - last.current.depth) < 0.02) {
      last.current.at = now;
      return;
    }
    last.current = { at: now, depth };
    publish();
  });
  return null;
}
