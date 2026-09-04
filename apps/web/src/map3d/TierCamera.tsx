import { useFrame, useThree } from "@react-three/fiber";
import { useGesture } from "@use-gesture/react";
import { useRef, type MutableRefObject, type RefObject } from "react";
import type { PerspectiveCamera, Vector3 } from "three";
import type { Focus } from "./bounds.js";
import { fitDistance } from "./MapCanvas.js";
import {
  clipPlanesFor,
  dollyEase,
  orbitAround,
  recenterStep,
  smoothFactor,
  tierBlend,
  tierIndex,
  tierProgress,
  zoomAbout,
  zoomStep,
  type CameraPose,
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
 * Plancher de dolly sous la frontière d'un palier, en fraction du cadrage de l'ENFANT.
 *
 * Le franchissement se déclenche dès la progression 1 : la caméra ne peut donc jamais
 * s'attarder au-delà. Ce plancher n'existe que pour laisser passer un saut qui traverse
 * plusieurs bandes en une image, avant que la cascade de franchissements ne le rattrape.
 *
 * Il valait quatre LARGEURS DE BANDE, et c'était le défaut : une bande n'a pas de largeur
 * fixe. Depuis le chantier 37 le cadrage d'une galaxie suit `√n` sur 300 à 520 systèmes,
 * si bien que la bande univers→galaxie s'est élargie devant la bande galaxie→système.
 * « Ma capitale » vise un système depuis l'univers, donc traverse DEUX bandes : il lui
 * fallait 4,08 largeurs et il n'en avait que 4. `OrbitControls.update()` clampait le vol
 * à 0,2188 quand il visait 0,1756 — deux pour cent trop court. La caméra atterrissait
 * juste au-dessus de la frontière, `ascending` la voyait au-delà du cadrage de son palier
 * et la renvoyait à la galaxie. Le palier système clignotait une fenêtre, puis disparaissait.
 *
 * Rapporté au cadrage de l'enfant, le plancher ne dépend plus du rapport entre deux
 * paliers — symétrique de `maxDistance`, qui est déjà `parentFrame * 1e4` dès qu'il existe
 * un palier au-dessus : quand un voisin existe, la borne cesse de décider et c'est le
 * franchissement qui fait la limite.
 */
const FLOOR_BELOW_CHILD = 1e-4;

/**
 * Repos du recentrage, en fraction de la distance de vue.
 *
 * Relatif et non absolu : la carte couvre six ordres de grandeur, et un seuil en unités de
 * scène serait grossier au palier corps — où la caméra regarde à quelques centièmes d'unité —
 * et d'une finesse inutile au palier univers. Un millième de la distance de vue vaut moins
 * d'un pixel à l'écran, quelle que soit l'échelle.
 */
const AIM_REST = 1e-3;

/**
 * Demi-course de l'amortissement de rotation, en secondes.
 *
 * `OrbitControls` amortissait la sienne à 0,15 par image ; il ne tourne plus (chantier 40) et
 * cette valeur reproduit sa vitesse à 60 Hz, en étant cette fois indépendante de la cadence.
 */
const ROTATE_HALF_LIFE = 0.07;

/** Sous cette rotation en attente, on s'arrête : sinon la vue frémit indéfiniment. */
const ROTATE_REST = 1e-5;

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
 * Poids d'un cran de molette, borné.
 *
 * `use-gesture` a déjà ramené l'événement en pixels quel que soit son `deltaMode` — Firefox
 * compte en LIGNES sur une molette, et la valeur brute y vaut trois au lieu de cent. Ce qui
 * reste ici est une décision, pas une normalisation : suivre l'amplitude sans borne rend une
 * molette « à haute résolution » erratique, l'ignorer — ce que fait `OrbitControls` — rend le
 * pavé tactile incontrôlable.
 */
function wheelWeight(deltaY: number): number {
  if (!Number.isFinite(deltaY) || deltaY === 0) return 0;
  const magnitude = Math.min(1.5, Math.max(0.15, Math.abs(deltaY) / 100));
  return Math.sign(deltaY) * magnitude;
}

interface Props {
  /** `<section class="map-canvas">` : le seul point du DOM où une caméra 3D peut laisser
   *  une trace observable de l'extérieur. */
  host: RefObject<HTMLElement | null>;
  tier: TierName;
  /** Cadrage du palier courant, en unités de scène. */
  parentFocus: Focus;
  /**
   * Cadrage de l'enfant visé, **déjà imbriqué** en unités de scène (`nestedFocus`).
   * `null` quand rien n'est visé, ou au dernier palier : il n'y a alors pas de bande,
   * donc pas de descente possible.
   */
  childFocus: Focus | null;
  /**
   * Ce que la caméra vise : la sélection, quand elle est l'enfant immédiat du palier courant
   * (chantier 38). `null` bascule la caméra en mode **libre** (chantier 40) — le zoom se fait
   * au curseur, la rotation autour du point cliqué, et le dolly est borné à la frontière du
   * palier : descendre demande de viser.
   */
  aimId: string | null;
  /**
   * Où se trouve la visée, à l'instant présent. Une fonction et non une position : un corps
   * orbite, et un point figé au dernier tick serveur ferait poursuivre au ressort une place
   * que la planète a quittée.
   */
  aimAt: (() => Vec3) | null;
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
   * qu'on observe en changeant de visée.
   */
  follow: { key: string; at: () => Vec3 } | null;
  onCross: (delta: 1 | -1) => void;
  onChildMount: (mounted: boolean) => void;
}

/**
 * Pilotage du zoom continu (chantier 35.2), qui ne décide plus de ce qu'on vise (chantier 38).
 *
 * Tout ce qui doit être su à chaque image est calculé ici et **n'entre jamais dans l'état
 * React** : la profondeur change soixante fois par seconde, un `setState` par image
 * re-rendrait l'arbre entier. Même geste qu'`OrbitingBody`, qui écrit sa position
 * directement sur son `group`.
 *
 * Seules des décisions **discrètes** remontent, et seulement quand elles changent : quand
 * monter l'enfant (`onChildMount`), quand le palier courant est franchi (`onCross`), et quand
 * le joueur désigne un objet (`onElect`). Elles se comptent sur les doigts d'une main pour
 * une traversée complète.
 *
 * Ce composant élisait autrefois lui-même sa cible, à chaque image, en prenant le candidat le
 * plus proche du centre du cadre — puis il tirait le cadre vers cette cible. Les deux se
 * nourrissaient : la traction déplaçait le point depuis lequel l'élection mesurait, l'élection
 * changeait de candidat, la traction s'inversait. C'est ce ballotage que le chantier 38
 * supprime, en confiant la visée à la seule sélection.
 *
 * Il produit aussi le dolly depuis le chantier 36.2. `OrbitControls` amortit la rotation
 * mais applique le zoom d'un bloc, et son pas fixe demandait une trentaine de crans par
 * palier : la molette est reprise ici, où la bande à traverser et les bornes du palier sont
 * déjà connues. Ce qui lui reste, c'est la rotation et le panoramique.
 */
export function TierCamera({
  host,
  tier,
  parentFocus,
  childFocus,
  aimId,
  aimAt,
  depthRef,
  follow,
  onCross,
  onChildMount,
}: Props) {
  const camera = useThree((s) => s.camera) as PerspectiveCamera;
  const controls = useThree((s) => s.controls) as ControlsHandle | null;
  const size = useThree((s) => s.size);

  const mounted = useRef(false);
  const depthAttr = useRef("");
  const tierAttr = useRef("");
  const aimAttr = useRef<string | null | undefined>(undefined);
  const elevationAttr = useRef("");
  const tracked = useRef<{ key: string; at: Vec3 } | null>(null);
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
   * à l'endroit d'où elle vient. Le recentrage, lui, translate caméra et cible du même
   * vecteur : il conserve la distance, donc il ne réveille pas ce garde.
   */
  const aim = useRef<number | null>(null);
  const applied = useRef<number | null>(null);
  const pending = useRef(0);
  const streak = useRef({ count: 0, at: 0 });

  /** Un geste souris est en cours : le ressort rend la main au joueur. */
  const gesture = useRef(false);
  /** Ce geste est une rotation (bouton gauche), et non un panoramique. */
  const rotating = useRef(false);
  /** Lacet et tangage en attente, en radians, vidés progressivement par le ressort. */
  const spin = useRef({ yaw: 0, pitch: 0 });
  /**
   * Autour de quoi on tourne et on zoome.
   *
   * En mode ciblé, la sélection : `orbitAround` se réduit alors à une orbite ordinaire, et
   * l'homothétie à un dolly. En mode libre, **le centre du palier où l'on est** — l'amas, la
   * galaxie, le système. La caméra fait le tour de ce qu'elle regarde, comme un tourne-disque.
   *
   * Ce fut un instant le point du plan focal sous le curseur, pour que le clic désigne ce
   * autour de quoi on tourne. Trop malin : le joueur ne savait plus autour de quoi il tournait,
   * et le centre d'un palier a l'avantage de ne pas bouger — il n'y a plus rien à figer au
   * début d'un geste, ni à reprendre à chaque cran de molette.
   */
  const pivotOf = (): Vec3 => {
    if (aimId === null) return parentFocus.center;
    // La position VIVE de l'objet, et non `controls.target` qui lui court après : un corps
    // orbite, et le ressort n'a pas forcément fini de converger. Pivoter sur la cible
    // conserverait l'écart au lieu de le résorber — l'objet sélectionné tournait alors
    // légèrement à côté du centre au lieu d'y rester.
    const at = aimAt?.();
    if (at) return at;
    const target = controls?.target;
    return target ? [target.x, target.y, target.z] : parentFocus.center;
  };

  useGesture(
    {
      onWheel: ({ delta: [, deltaY] }) => {
        if (deltaY === 0) return;
        const now = performance.now();
        const run = streak.current;
        if (now - run.at > STREAK_WINDOW) run.count = 0;
        else if (now - run.at >= STREAK_TICK) run.count += 1;
        run.at = now;
        pending.current += wheelWeight(deltaY);
      },
      onDrag: ({ first, last, buttons, delta: [dx, dy] }) => {
        if (first) {
          // Bouton gauche : la rotation, la nôtre — `OrbitControls` centre toujours sa cible
          // et ne sait donc pas pivoter autour d'un point décentré. Bouton droit : son
          // panoramique, qu'on lui laisse. Les deux suspendent le ressort : « le joueur a la
          // main » se tient mieux qu'une exception.
          rotating.current = buttons === 1;
          // Seul le PANORAMIQUE suspend le ressort : lui seul éloigne délibérément la cible de
          // ce qu'on vise. La rotation, elle, tourne AUTOUR de la visée : les deux vont dans
          // le même sens, et suspendre le ressort pendant tout le geste laissait l'objet
          // dériver hors du centre sans que rien ne l'y ramène.
          gesture.current = !rotating.current;
        } else if (rotating.current) {
          // Même sensibilité qu'`OrbitControls` : un tour complet pour une hauteur de cadre
          // traversée. Le lacet fait suivre la scène au curseur ; le tangage descend quand on
          // tire vers le bas, ce qui est le sens attendu et l'inverse de celui qu'on avait.
          const span = Math.max(1, size.height);
          spin.current.yaw -= (2 * Math.PI * dx) / span;
          spin.current.pitch += (2 * Math.PI * dy) / span;
        }
        if (last) {
          gesture.current = false;
          rotating.current = false;
        }
      },
    },
    {
      target: host,
      // `passive: false` : sans quoi le navigateur refuse le `preventDefault` et la page
      // défile derrière la carte à chaque cran.
      eventOptions: { passive: false },
      wheel: { preventDefault: true },
      drag: {
        // Purement observateur : on ne capture pas le pointeur — `OrbitControls` le fait et
        // c'est lui qui travaille — et on ne supprime aucun défaut du navigateur.
        pointer: { capture: false, buttons: [1, 2] },
        filterTaps: true,
      },
    },
  );

  useFrame((_, delta) => {
    if (!controls) return;

    /** La pose courante, telle que `orbitAround` et `zoomAbout` la prennent et la rendent. */
    const poseOf = (): CameraPose => ({
      position: [camera.position.x, camera.position.y, camera.position.z],
      target: [controls.target.x, controls.target.y, controls.target.z],
    });
    const apply = (pose: CameraPose) => {
      camera.position.set(...pose.position);
      controls.target.set(...pose.target);
    };

    // Suivi de la visée AVANT toute mesure : la distance caméra-cible doit être lue après
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
        ? childFrame * FLOOR_BELOW_CHILD
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
      if (aimId === null) {
        // Mode LIBRE : homothétie autour du centre du palier, qui reste donc immobile à
        // l'écran. Le rapport est celui du dolly, si bien que les bornes de palier et le
        // calibrage de la molette s'appliquent à l'identique.
        apply(zoomAbout(poseOf(), parentFocus.center, eased / before));
      } else {
        // Mode CIBLÉ : on se rapproche de la cible le long de l'axe de vue, elle ne bouge
        // pas. C'est ce qui fait tourner le zoom autour de l'objet visé.
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
    }

    // Rotation amortie (chantier 40). `OrbitControls` ne tourne plus : il appelle
    // `lookAt(target)` à chaque image, donc sa cible est toujours au centre de l'écran et il
    // ne sait pas pivoter autour d'un point décentré. La nôtre fait tourner la PAIRE
    // caméra/cible rigidement, ce qui laisse le pivot exactement où il est à l'écran.
    const turn = spin.current;
    if (
      Math.abs(turn.yaw) > ROTATE_REST ||
      Math.abs(turn.pitch) > ROTATE_REST
    ) {
      const k = smoothFactor(ROTATE_HALF_LIFE, delta);
      apply(orbitAround(poseOf(), pivotOf(), turn.yaw * k, turn.pitch * k));
      turn.yaw -= turn.yaw * k;
      turn.pitch -= turn.pitch * k;
    } else {
      turn.yaw = 0;
      turn.pitch = 0;
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

    // Recentrage continu sur ce qu'on vise (chantier 38).
    //
    // Il ne cherche plus un candidat : il suit la sélection, et **elle seule** — c'est tout
    // ce qui reste de recentrage depuis le chantier 40, où l'élection automatique a été
    // jugée non fiable. Sans sélection, la caméra ne se recentre sur rien.
    //
    // La caméra ET sa cible se décalent d'autant, ce qui préserve la distance et l'angle.
    const aimed = aimAt?.();
    if (aimed && !gesture.current) {
      const t = controls.target;
      const step = recenterStep(
        [t.x, t.y, t.z],
        aimed,
        delta,
        distance * AIM_REST,
      );
      if (step) {
        controls.target.x += step[0];
        controls.target.y += step[1];
        controls.target.z += step[2];
        camera.position.x += step[0];
        camera.position.y += step[1];
        camera.position.z += step[2];
      }
    }

    const progress =
      childFrame > 0 ? tierProgress(distance, parentFrame, childFrame) : 0;
    const blend = tierBlend(progress);

    if (blend.childMounted !== mounted.current) {
      mounted.current = blend.childMounted;
      onChildMount(blend.childMounted);
    }

    // La remontée se teste sur la distance et non sur la progression : au dernier palier
    // il n'y a pas d'enfant, donc pas de bande, donc pas de progression — et sans cela on
    // pourrait descendre dans un système sans jamais pouvoir en ressortir.
    const descending = childFrame > 0 && progress >= 1 && aimId !== null;
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

    // Palier, profondeur et visée publiés dans le DOM, depuis la MÊME horloge. Une caméra 3D
    // n'y laisse rien, et c'est le seul point sur lequel un test de bout en bout peut
    // affirmer que la traversée a eu lieu. Le palier venait d'un effet React : il pouvait
    // rester en retard d'un commit sur la profondeur, et une cascade de franchissements — un
    // saut qui vise un système depuis l'univers — publiait alors un palier intermédiaire que
    // rien ne corrigeait ensuite, faute de nouveau changement à signaler.
    //
    // `data-map-aim` est le seul témoin du chantier 38 : le ballotage qu'il corrige était un
    // changement de cible par image, et une cible ne laisse aucune trace dans le DOM.
    if (tier !== tierAttr.current) {
      tierAttr.current = tier;
      host.current?.setAttribute("data-map-tier", tier);
    }
    if (aimId !== aimAttr.current) {
      aimAttr.current = aimId;
      if (aimId) host.current?.setAttribute("data-map-aim", aimId);
      else host.current?.removeAttribute("data-map-aim");
    }
    // Élévation de la caméra au-dessus du plan galactique, en degrés. Seul témoin possible du
    // « yaw et non roll » du chantier 40 : un glisser HORIZONTAL doit la laisser intacte, un
    // glisser VERTICAL la changer. Un roulis n'a, lui, aucune trace observable.
    const rise = Math.round(
      (Math.asin(
        Math.min(
          1,
          Math.max(
            -1,
            (camera.position.z - controls.target.z) / (distance || 1),
          ),
        ),
      ) *
        180) /
        Math.PI,
    );
    const elevation = String(rise);
    if (elevation !== elevationAttr.current) {
      elevationAttr.current = elevation;
      host.current?.setAttribute("data-map-elevation", elevation);
    }

    const depth = depthRef.current.toFixed(2);
    if (depth !== depthAttr.current) {
      depthAttr.current = depth;
      host.current?.setAttribute("data-map-depth", depth);
    }

    // EN DERNIER, et c'est la seule place possible : drei met à jour `OrbitControls` en
    // priorité -1, donc AVANT cette boucle. Son `lookAt(target)` est fait sur la pose de
    // l'image précédente, et tout ce qu'on écrit ensuite — dolly, rotation, recentrage, suivi
    // d'orbite — déplace la caméra et sa cible sans réorienter la première. L'image était donc
    // rendue avec une orientation en retard d'une image sur la position : invisible à l'arrêt,
    // mais en rotation continue le retard varie avec le temps d'image et se voit comme des
    // à-coups — et la cible ne tombait jamais tout à fait au centre.
    camera.lookAt(controls.target.x, controls.target.y, controls.target.z);
  });

  return null;
}
