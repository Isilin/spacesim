import { useFrame, useThree } from "@react-three/fiber";
import {
  useEffect,
  useRef,
  type MutableRefObject,
  type RefObject,
} from "react";
import type { PerspectiveCamera, Vector3 } from "three";
import type { Focus } from "./bounds.js";
import { fitDistance } from "./MapCanvas.js";
import {
  clipPlanesFor,
  distanceForProgress,
  dollyEase,
  electAnchor,
  tierBlend,
  tierIndex,
  tierProgress,
  zoomStep,
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

/**
 * Marge de dépassement tolérée sous la frontière d'un palier, en largeurs de bande.
 *
 * Le franchissement se déclenche dès la progression 1 : la caméra ne peut donc jamais
 * s'attarder au-delà. Cette marge n'existe que pour laisser passer un saut qui traverse
 * plusieurs bandes en une image, avant que la cascade de franchissements ne le rattrape.
 */
const OVERSHOOT = 4;

/**
 * Part de l'écart à la cible rattrapée par image, à pleine progression. Assez faible pour
 * qu'un panoramique volontaire reste possible en cours de descente, assez forte pour que
 * la frontière soit franchie avec l'enfant au centre du cadre.
 */
const RECENTER = 0.08;

/**
 * Au-delà de ce délai entre deux crans, le défilement n'est plus tenu pour continu et
 * l'accélération retombe.
 */
const STREAK_WINDOW = 180;

/**
 * Délai minimal entre deux incréments d'accélération.
 *
 * Une molette crantée envoie une dizaine d'événements par seconde, un pavé tactile en
 * envoie soixante : sans ce garde, le même geste accélérerait six fois plus vite sur l'un
 * que sur l'autre. Une seconde de défilement soutenu mène au plafond, quel que soit le
 * périphérique.
 */
const STREAK_TICK = 30;

/**
 * Poids d'un événement de molette, borné.
 *
 * `deltaY` vaut ~100 par cran sur une molette et quelques unités sur un pavé tactile.
 * Ignorer l'amplitude — ce que fait `OrbitControls` — rend le pavé tactile incontrôlable ;
 * la suivre sans borne rend une molette « à haute résolution » erratique.
 */
function wheelWeight(deltaY: number): number {
  if (!Number.isFinite(deltaY) || deltaY === 0) return 0;
  const magnitude = Math.min(1.5, Math.max(0.15, Math.abs(deltaY) / 100));
  return Math.sign(deltaY) * magnitude;
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
  /**
   * Profondeur continue, écrite à chaque image (chantier 35.3).
   *
   * Une référence mutable et non un état : c'est la seule façon de la partager avec
   * l'éclairage et les fondus, qui la lisent eux aussi par image. Un état la ferait
   * traverser React soixante fois par seconde.
   */
  depthRef: MutableRefObject<number>;
  /**
   * Point de la scène auquel la caméra doit rester collée (chantier 35.3).
   *
   * Les corps orbitent : sans cela, zoomer sur une planète la laisse glisser hors du cadre
   * en quelques secondes. Le décalage image à image est reporté sur la caméra ET sur sa
   * cible, ce qui conserve exactement le cadrage. La clé sert à ne pas reporter le saut
   * qu'on observe en changeant d'ancre.
   */
  follow: { key: string; at: () => Vec3 } | null;
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
 * Il produit aussi le dolly depuis le chantier 36.2. `OrbitControls` amortit la rotation
 * mais applique le zoom d'un bloc, et son pas fixe demandait une trentaine de crans par
 * palier : la molette est reprise ici, où la bande à traverser et les bornes du palier sont
 * déjà connues. Ce qui reste à `OrbitControls`, c'est la rotation — le seul geste souris
 * qui subsiste depuis que le panoramique a disparu.
 */
export function TierCamera({
  host,
  tier,
  parentFocus,
  childFocus,
  candidates,
  candidateFootprint,
  anchorId,
  depthRef,
  follow,
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
  const tierAttr = useRef("");
  const tracked = useRef<{ key: string; at: Vec3 } | null>(null);
  /** Progression de l'image précédente : sert à distinguer une descente d'un recul. */
  const advance = useRef(0);
  /**
   * Verrou de franchissement : `onCross` déclenche un rendu React, et `useFrame` tourne
   * plusieurs fois avant que le nouveau palier n'arrive. Sans lui, un seul franchissement
   * en déclencherait une poignée et la carte traverserait deux paliers d'un coup.
   *
   * Il retient le palier depuis lequel on a franchi, et non un simple booléen remis à zéro
   * par un effet : l'effet et la boucle d'images ne battent pas sur la même horloge, et une
   * cascade — un saut qui vise un système depuis l'univers — s'arrêtait par intermittence
   * au palier intermédiaire, le verrou n'ayant pas encore été rouvert quand l'image
   * suivante passait. Comparé au palier courant, il se rouvre au moment même où celui-ci
   * change.
   */
  const crossedFrom = useRef<TierName | null>(null);
  /** Direction de franchissement observée, et depuis combien d'images de suite. */
  const steady = useRef<{ direction: -1 | 0 | 1; frames: number }>({
    direction: 0,
    frames: 0,
  });

  /**
   * Distance visée par la molette, distance réellement posée à l'image précédente, et
   * crans en attente (chantier 36.2).
   *
   * `applied` est ce qui distingue un mouvement qu'on a produit d'un mouvement subi : vol,
   * cadrage, franchissement de palier déplacent tous la caméra sans passer par ici. Sans
   * cette comparaison, la visée d'avant survivrait au vol et ramènerait aussitôt la caméra
   * à l'endroit d'où elle vient.
   */
  const aim = useRef<number | null>(null);
  const applied = useRef<number | null>(null);
  const pending = useRef(0);
  const streak = useRef({ count: 0, at: 0 });

  useEffect(() => {
    anchored.current = anchorId;
  }, [anchorId]);

  useEffect(() => {
    const node = host.current;
    if (!node) return;
    const onWheel = (event: WheelEvent) => {
      // La liste et l'infobox appellent `stopPropagation` sur leur propre surface : ce qui
      // arrive ici est une molette destinée à la carte.
      event.preventDefault();
      const now = performance.now();
      const run = streak.current;
      if (now - run.at > STREAK_WINDOW) run.count = 0;
      else if (now - run.at >= STREAK_TICK) run.count += 1;
      run.at = now;
      pending.current += wheelWeight(event.deltaY);
    };
    // `passive: false` : sans quoi le navigateur refuse le `preventDefault` et la page
    // défile derrière la carte à chaque cran.
    node.addEventListener("wheel", onWheel, { passive: false });
    return () => node.removeEventListener("wheel", onWheel);
  }, [host]);

  useFrame((_, delta) => {
    if (!controls) return;

    // Suivi de l'ancre AVANT toute mesure : la distance caméra-cible doit être lue après
    // que les deux ont été recalées, sinon le déplacement de l'orbite se lit comme un
    // mouvement de zoom et fait franchir des paliers tout seul.
    if (follow) {
      const now = follow.at();
      const previous = tracked.current;
      if (previous && previous.key === follow.key) {
        camera.position.x += now[0] - previous.at[0];
        camera.position.y += now[1] - previous.at[1];
        camera.position.z += now[2] - previous.at[2];
        controls.target.x += now[0] - previous.at[0];
        controls.target.y += now[1] - previous.at[1];
        controls.target.z += now[2] - previous.at[2];
      }
      tracked.current = { key: follow.key, at: now };
    } else {
      tracked.current = null;
    }

    const aspect = size.width / Math.max(1, size.height);
    const parentFrame = fitDistance(parentFocus, aspect);
    const childFrame = childFocus ? fitDistance(childFocus, aspect) : 0;

    // Bornes de dolly, refaites à chaque palier. `OrbitControls` les tient de props
    // calculées sur un cadrage fixe ; laissées telles quelles, un cran de molette
    // sauterait deux frontières au palier profond et se bloquerait au palier large.
    //
    // Elles ne bornent que ce qui n'a **pas** de suite. Dès qu'un palier voisin existe,
    // la borne est repoussée très loin et c'est le franchissement qui fait la limite : un
    // saut explicite traverse plusieurs bandes d'un coup — « Ma capitale » vise un système
    // depuis l'univers — et serrer la borne au palier de départ ramenait la caméra à ce
    // palier avant que la cascade n'ait eu le temps d'aboutir.
    controls.minDistance =
      childFrame > 0
        ? distanceForProgress(parentFrame, childFrame, OVERSHOOT)
        : // Rien à viser : on ne plonge pas dans le vide, la descente s'arrête ici.
          parentFrame * 0.15;
    controls.maxDistance =
      tierIndex(tier) > 0 ? parentFrame * 1e4 : parentFrame * 3;

    // Dolly amorti (chantier 36.2). `OrbitControls` amortit la rotation mais applique le
    // zoom d'un bloc : chaque cran était un saut. La molette écrit ici une distance visée,
    // et l'image en cours s'en rapproche — le mouvement devient continu.
    const before = camera.position.distanceTo(controls.target);
    const moved =
      applied.current === null ||
      Math.abs(before - applied.current) > before * 1e-3;
    // Quelqu'un d'autre a bougé la caméra : vol, cadrage initial, franchissement. La visée
    // repart de là où la caméra se trouve réellement, sans quoi elle la rappellerait.
    if (moved) aim.current = before;
    if (pending.current !== 0) {
      const step = zoomStep(parentFrame, childFrame, streak.current.count);
      aim.current = (aim.current ?? before) * Math.exp(pending.current * step);
      pending.current = 0;
    }
    const goal = Math.min(
      controls.maxDistance,
      Math.max(controls.minDistance, aim.current ?? before),
    );
    aim.current = goal;
    const eased = dollyEase(before, goal, delta);
    if (Math.abs(eased - before) > before * 1e-6) {
      const dx = camera.position.x - controls.target.x;
      const dy = camera.position.y - controls.target.y;
      const dz = camera.position.z - controls.target.z;
      const length = Math.hypot(dx, dy, dz) || 1;
      camera.position.set(
        controls.target.x + (dx / length) * eased,
        controls.target.y + (dy / length) * eased,
        controls.target.z + (dz / length) * eased,
      );
    }
    applied.current = camera.position.distanceTo(controls.target);

    const distance = applied.current;

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

    const progress =
      childFrame > 0 ? tierProgress(distance, parentFrame, childFrame) : 0;

    // Recentrage progressif sur ce dans quoi on descend (chantier 35.4).
    //
    // C'est ce qui **réalise la visée** depuis le chantier 36.1 : la cible n'est plus
    // déplaçable à la souris, et sans ce glissement on franchirait la frontière avec le
    // contenu du palier atteint hors du cadre — la carte se viderait, le fondu ayant fait
    // disparaître le palier quitté sans que rien ne le remplace. La caméra ET sa cible se
    // décalent d'autant, ce qui préserve la distance et l'angle de vue.
    //
    // Uniquement en descente : se recoller à l'enfant qu'on est en train de quitter
    // annulerait une partie du recul, et remonter demanderait deux fois plus de crans.
    const rising = progress > advance.current + 1e-4;
    advance.current = progress;
    if (childFocus && progress > 0 && rising) {
      const pull = Math.min(RECENTER, RECENTER * progress);
      const dx = (childFocus.center[0] - controls.target.x) * pull;
      const dy = (childFocus.center[1] - controls.target.y) * pull;
      const dz = (childFocus.center[2] - controls.target.z) * pull;
      controls.target.x += dx;
      controls.target.y += dy;
      controls.target.z += dz;
      camera.position.x += dx;
      camera.position.y += dy;
      camera.position.z += dz;
    }

    const blend = tierBlend(progress);

    // L'ancre se réélit tant que l'enfant n'est pas monté, puis se fige : changer de cible
    // en plein fondu échangerait une galaxie contre une autre sous les yeux du joueur.
    if (!blend.childMounted && candidates.length > 0) {
      const reach = Math.max(candidateFootprint * 6, distance * 0.3);
      const t = controls.target;
      const elected = electAnchor([t.x, t.y, t.z], candidates, reach);
      // Élection COLLANTE : on remplace une ancre par une autre, jamais par rien. Un
      // panoramique qui éloigne un instant la cible de tout candidat effaçait sinon la
      // cible du joueur, et la carte se remettait à publier une ancre différente à chaque
      // image — pour rien, puisque descendre exige justement une ancre.
      if (elected && elected.id !== anchored.current) {
        anchored.current = elected.id;
        onAnchor(elected.id);
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
    // Un franchissement demande DEUX images de suite. R3F mesure son canvas après le
    // premier rendu : la caméra part d'un cadrage calculé sur un rapport d'image
    // provisoire, plus reculé que le bon, ce qui se lit une image durant comme un dézoom
    // au-delà de la frontière. Au chargement d'un lien profond, la carte remontait ainsi
    // d'un palier avant même d'avoir été mesurée.
    const direction = descending ? 1 : ascending ? -1 : 0;
    if (direction === 0 || direction !== steady.current.direction) {
      steady.current = { direction, frames: 1 };
    } else {
      steady.current.frames += 1;
    }
    if (direction === 0) crossedFrom.current = null;
    else if (steady.current.frames >= 2 && crossedFrom.current !== tier) {
      crossedFrom.current = tier;
      onCross(direction);
    }

    // Profondeur continue, partagée par référence avec l'éclairage et les fondus.
    depthRef.current = tierIndex(tier) + Math.min(1, Math.max(0, progress));

    // Palier et profondeur publiés dans le DOM, depuis la MÊME horloge. Une caméra 3D n'y
    // laisse rien, et c'est le seul point sur lequel un test de bout en bout peut affirmer
    // que la traversée a eu lieu. Le palier venait d'un effet React : il pouvait rester en
    // retard d'un commit sur la profondeur, et une cascade de franchissements — un saut
    // qui vise un système depuis l'univers — publiait alors un palier intermédiaire que
    // rien ne corrigeait ensuite, faute de nouveau changement à signaler.
    if (tier !== tierAttr.current) {
      tierAttr.current = tier;
      host.current?.setAttribute("data-map-tier", tier);
    }
    const depth = depthRef.current.toFixed(2);
    if (depth !== depthAttr.current) {
      depthAttr.current = depth;
      host.current?.setAttribute("data-map-depth", depth);
    }
  });

  return null;
}
