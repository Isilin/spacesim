/**
 * Échelle continue de la carte (chantier 35.1).
 *
 * La carte n'a plus quatre niveaux mais une seule profondeur réelle. Ce module porte
 * toute l'arithmétique de cette profondeur — et rien d'autre : aucun import de `three`,
 * aucun composant, aucun état. Même doctrine que `bounds.ts` et `shipLayout.ts` : ce qui
 * décide est une fonction pure, donc testable sans contexte WebGL.
 *
 * ## Repères imbriqués, et pourquoi il n'y a PAS de rebasage
 *
 * Mesuré sur le générateur : l'amas de galaxies s'étend sur ~3 700 unités
 * (`GALAXY_SPACING` × √`MAX_GALAXIES`) alors qu'une lune se rend à un rayon de 5 dans le
 * repère de son système. Composés, les facteurs d'imbrication donnent un rapport d'échelle
 * de ~10⁶ entre les deux bouts de la carte. Chaque palier garde donc **son propre repère
 * local** et s'imbrique dans son parent par un `<group position scale>` — c'est ce que
 * calcule `nestingScale`.
 *
 * La parade classique à un tel rapport est le *floating origin* : rebaser la caméra à
 * chaque franchissement. **Ce module ne le fait pas, et c'est délibéré.** three.js ne
 * passe jamais de position monde au shader : il compose `modelViewMatrix =
 * matrixWorldInverse × matrixWorld` en float64 côté CPU, et n'envoie au GPU que le
 * résultat — une translation **relative à la caméra**, donc petite dès que l'objet est
 * regardé de près. La dérive de sommets que le rebasage devait éviter n'existe pas sur ce
 * chemin de rendu, et le rebasage, lui, coûterait un défaut bien réel : `setState` depuis
 * `useFrame` ne prend effet qu'à l'image suivante, si bien qu'une image serait rendue avec
 * la nouvelle caméra et l'ancien graphe — un éclair à chaque palier.
 *
 * Ce qui reste vraiment sensible à l'échelle, ce sont les **plans de coupe** :
 * `MapCanvas` ne fixe aujourd'hui que `far`, et le `near` par défaut de three.js (0,1)
 * découperait purement et simplement une lune regardée à 0,02 unité. D'où
 * `clipPlanesFor`, qui les fait suivre la distance de vue.
 *
 * Le franchissement se réduit alors à monter et démonter des couches — et les seuils de
 * `tierBlend` sont calés pour que cela n'arrive jamais que sur une couche transparente.
 */

export const TIER_ORDER = ["universe", "galaxy", "system", "body"] as const;

export type TierName = (typeof TIER_ORDER)[number];

export type Vec3 = readonly [number, number, number];

/** Pose de caméra dans le repère d'un palier : d'où l'on regarde, et quoi. */
export interface CameraPose {
  position: Vec3;
  target: Vec3;
}

/**
 * Bornes du facteur d'imbrication. Le plancher évite qu'un contenu dégénéré (une galaxie
 * à un seul système, un corps sans lune) n'aplatisse son groupe à l'échelle zéro, ce que
 * three.js accepte sans rien signaler. Le plafond est 1 : un enfant peut occuper tout le
 * repère de son parent — c'est le cas du palier corps, qui vit dans les coordonnées de son
 * système sans changement d'échelle — mais jamais davantage.
 */
const MIN_SCALE = 1e-4;
const MAX_SCALE = 1;

/**
 * Seuils de fondu, en progression dans la bande de transition.
 *
 * L'enfant se monte AVANT de commencer à apparaître : monter une scène coûte une image,
 * la faire apparaître au même instant rendrait ce coût visible. Le parent, lui, ne
 * commence à s'effacer qu'une fois l'enfant bien lisible, et atteint zéro exactement à
 * `progress = 1` — le franchissement démonte donc une couche déjà transparente, ce qui
 * est toute la raison pour laquelle il ne se voit pas.
 */
const CHILD_MOUNT_AT = 0.3;
const CHILD_FADE_FROM = 0.35;
const CHILD_FADE_TO = 0.75;
const PARENT_FADE_FROM = 0.6;
const PARENT_FADE_TO = 1;

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return value < 0 ? 0 : value > 1 ? 1 : value;
}

/** Interpolation de Hermite entre deux bords — la même que `smoothstep` en GLSL. */
function smoothstep(edge0: number, edge1: number, x: number): number {
  if (edge1 <= edge0) return x < edge0 ? 0 : 1;
  const t = clamp01((x - edge0) / (edge1 - edge0));
  return t * t * (3 - 2 * t);
}

/**
 * Facteur d'imbrication ramené dans ses bornes.
 *
 * Toutes les fonctions de ce module passent par ce filtre plutôt que de faire confiance à
 * leur appelant : une échelle nulle ou négative ne produit pas une image dégradée mais
 * une caméra à `NaN`, dont on ne revient pas.
 */
function safeScale(scale: number): number {
  if (!Number.isFinite(scale) || scale <= 0) return MAX_SCALE;
  return scale < MIN_SCALE ? MIN_SCALE : scale > MAX_SCALE ? MAX_SCALE : scale;
}

export function tierIndex(name: TierName): number {
  return TIER_ORDER.indexOf(name);
}

/**
 * Palier dans lequel se trouve une profondeur. La partie fractionnaire est la progression
 * vers le palier suivant : elle ne change pas de palier avant d'atteindre 1.
 */
export function tierAt(depth: number): TierName {
  if (!Number.isFinite(depth) || depth < 0) return TIER_ORDER[0];
  const index = Math.floor(depth);
  return TIER_ORDER[Math.min(index, TIER_ORDER.length - 1)]!;
}

/** Palier suivant, ou `null` au dernier — il n'y a rien sous le corps. */
export function childTierOf(name: TierName): TierName | null {
  return TIER_ORDER[tierIndex(name) + 1] ?? null;
}

/**
 * Facteur d'imbrication d'un palier enfant dans son parent.
 *
 * `footprint` est la place que l'enfant occupe dans le repère du parent — le disque d'une
 * galaxie vue de l'univers, le nœud d'un système vu de la galaxie, le rayon de rendu
 * d'une planète vue du système. `contentRadius` est l'étendue de ce que ce même enfant
 * contient, dans SON repère. Le rapport des deux est le facteur par lequel il faut
 * multiplier le repère enfant pour le poser dans le parent.
 */
export function nestingScale(footprint: number, contentRadius: number): number {
  if (
    !Number.isFinite(footprint) ||
    !Number.isFinite(contentRadius) ||
    footprint <= 0 ||
    contentRadius <= 0
  )
    return MAX_SCALE;
  return safeScale(footprint / contentRadius);
}

/**
 * Progression dans la bande de transition, à partir de la distance caméra.
 *
 * La bande est définie par ses **deux** distances de cadrage, toutes deux exprimées dans
 * les unités de la scène : `parentFrame` est la distance à laquelle le palier courant
 * remplit le cadre (progression 0), `childFrame` celle à laquelle l'enfant le remplit à
 * son tour (progression 1). Ce sont deux appels à `fitDistance()`, celui de l'enfant sur
 * son cadrage déjà imbriqué.
 *
 * Déduire `childFrame` du seul facteur d'échelle serait faux : cela reviendrait à
 * supposer que parent et enfant se cadrent à la même distance dans leurs repères
 * respectifs, ce qu'aucune paire de paliers ne vérifie — un système ne se cadre pas comme
 * la galaxie qui le contient.
 *
 * Le résultat n'est **pas borné** : c'est son débordement hors de [0, 1] qui signale à
 * l'appelant qu'il doit changer de palier. Le borner ici rendrait le franchissement
 * indétectable.
 */
export function tierProgress(
  distance: number,
  parentFrame: number,
  childFrame: number,
): number {
  const span = bandSpan(parentFrame, childFrame);
  if (span === 0 || !Number.isFinite(distance) || distance <= 0) return 0;
  return Math.log(parentFrame / distance) / span;
}

/** Réciproque de `tierProgress` : la distance caméra qu'appelle une progression donnée. */
export function distanceForProgress(
  parentFrame: number,
  childFrame: number,
  progress: number,
): number {
  if (!Number.isFinite(parentFrame) || parentFrame <= 0) return 0;
  if (bandSpan(parentFrame, childFrame) === 0 || !Number.isFinite(progress))
    return parentFrame;
  return parentFrame * (childFrame / parentFrame) ** progress;
}

/**
 * Largeur de la bande, en logarithme de distance. Zéro signale une bande dégénérée — un
 * enfant qui se cadre aussi loin que son parent, ou plus loin. L'appelant lit ce zéro
 * comme « pas de descente possible ici » plutôt que de diviser par lui.
 */
function bandSpan(parentFrame: number, childFrame: number): number {
  if (
    !Number.isFinite(parentFrame) ||
    !Number.isFinite(childFrame) ||
    parentFrame <= 0 ||
    childFrame <= 0 ||
    childFrame >= parentFrame
  )
    return 0;
  return Math.log(parentFrame / childFrame);
}

export interface TierBlend {
  /**
   * L'enfant doit-il être monté ? Faux hors de la bande : on ne paie pas le rendu d'une
   * scène qui ne couvre pas un pixel.
   */
  childMounted: boolean;
  childOpacity: number;
  parentOpacity: number;
}

export function tierBlend(progress: number): TierBlend {
  const p = Number.isFinite(progress) ? progress : 0;
  return {
    childMounted: p >= CHILD_MOUNT_AT,
    childOpacity: smoothstep(CHILD_FADE_FROM, CHILD_FADE_TO, p),
    parentOpacity: 1 - smoothstep(PARENT_FADE_FROM, PARENT_FADE_TO, p),
  };
}

/**
 * Fraction de la distance de vue placée devant la caméra. Assez petit pour qu'un objet
 * situé entre la caméra et sa cible ne soit pas tranché, assez grand pour que le rapport
 * `far / near` reste dans ce que tient un tampon de profondeur 24 bits.
 */
const NEAR_RATIO = 0.005;

export interface ClipPlanes {
  near: number;
  far: number;
}

/**
 * Plans de coupe qui suivent la profondeur de zoom.
 *
 * Indispensable ici et pas seulement confortable : `MapCanvas` ne fixe que `far`, donc
 * `near` vaut le défaut de three.js, 0,1. Au palier corps la caméra regarde sa cible à
 * ~0,02 unité — tout serait devant le plan proche, et la carte rendrait du vide.
 *
 * `far` tient le palier courant en entier (`frameDistance` est la distance à laquelle il
 * remplit le cadre) plus la marge de ce qui l'entoure, sans quoi le fond disparaîtrait
 * dès qu'on avance.
 */
export function clipPlanesFor(
  distance: number,
  frameDistance: number,
): ClipPlanes {
  const d = Number.isFinite(distance) && distance > 0 ? distance : 1;
  const frame =
    Number.isFinite(frameDistance) && frameDistance > 0 ? frameDistance : d;
  return { near: d * NEAR_RATIO, far: d + frame * 3 };
}

/**
 * Crans de molette visés pour traverser une bande entière (chantier 36.2).
 *
 * C'est le seul réglage de vitesse du zoom, et il est exprimé dans la seule unité qui ait
 * un sens pour le joueur : combien de crans pour passer d'un palier au suivant. Le pas en
 * distance s'en déduit, et **suit donc l'échelle** — une bande large donne des crans larges.
 * Régler une vitesse absolue aurait été régler la vitesse d'un seul palier.
 */
const NOTCHES_PER_BAND = 12;

/**
 * Pas de repli quand aucune bande n'est en vue : rien à viser, ou dernier palier. 15 % de
 * la distance par cran — assez pour se dégager, sans quoi le zoom se figerait là où il n'y
 * a précisément rien pour le calibrer.
 */
const FALLBACK_STEP = Math.log(1.15);

/** Plafond de l'accélération au défilement continu, et pente pour l'atteindre. */
const MAX_STREAK = 2.5;
const STREAK_SLOPE = 0.15;

/**
 * Demi-course du dolly, en secondes : au bout de ce délai, la moitié du chemin vers la
 * distance visée est faite. Valeur reprise de l'ancien facteur par image (0,18 à 60 Hz),
 * `ln 0,5 / (60 · ln 0,82)`, pour que le zoom garde exactement la vitesse qu'on lui connaît.
 */
const DOLLY_HALF_LIFE = 0.0582;

/** Demi-course du recentrage sur la visée (chantier 38). */
const AIM_HALF_LIFE = 0.2;

/**
 * Au-delà, `dt` ne décrit plus une image mais un onglet remis au premier plan : un lissage
 * qui l'honorerait téléporterait la caméra.
 */
const MAX_STEP = 0.25;

/**
 * Part de l'écart rattrapée en `dt` secondes, pour une demi-course donnée. Au bout de
 * `halfLife`, la moitié du chemin est faite — quelle que soit la cadence d'images.
 *
 * La demi-course est la seule unité de raideur qui ait un sens : un « facteur par image »
 * est deux fois et demie plus rapide sur un écran à 144 Hz que sur un écran à 60.
 *
 * C'est un filtre exponentiel et **pas un ressort amorti** — celui de `maath/easing`, par
 * exemple, qu'on aurait pu prendre tout fait. Les deux grandeurs lissées ici, la distance de
 * vue et la cible de la caméra, sont déplacées à chaque image par d'autres mécanismes : le
 * vol, le franchissement de palier, le suivi d'un corps en orbite. Un ressort retient une
 * vitesse d'une image à l'autre ; il lirait ces déplacements comme un mouvement qu'il a
 * produit, et rendrait cet élan dès qu'on le relâche.
 */
export function smoothFactor(halfLife: number, dt: number): number {
  if (!Number.isFinite(halfLife) || halfLife <= 0) return 1;
  const step = Number.isFinite(dt) && dt > 0 ? Math.min(dt, MAX_STEP) : 1 / 60;
  return 1 - 0.5 ** (step / halfLife);
}

/**
 * Accélération d'un défilement soutenu.
 *
 * `streak` est le nombre de crans déjà enchaînés sans pause — c'est l'appelant qui le tient,
 * la fonction reste pure. Traverser trois paliers d'un trait devient deux fois et demie plus
 * court, alors qu'un cran isolé garde sa précision : ce sont deux gestes différents, et le
 * même pas ne peut pas servir les deux.
 */
export function streakFactor(streak: number): number {
  if (!Number.isFinite(streak) || streak <= 0) return 1;
  return Math.min(MAX_STREAK, 1 + streak * STREAK_SLOPE);
}

/**
 * Pas d'un cran de molette, en logarithme de distance (chantier 36.2).
 *
 * Le pas se déduit de la bande à traverser, jamais d'une constante en unités de scène : la
 * carte couvre six ordres de grandeur, et un pas absolu serait à la fois imperceptible au
 * palier univers et brutal au palier corps.
 */
export function zoomStep(
  parentFrame: number,
  childFrame: number,
  streak: number,
): number {
  const span = bandSpan(parentFrame, childFrame);
  const base = span > 0 ? span / NOTCHES_PER_BAND : FALLBACK_STEP;
  return base * streakFactor(streak);
}

/**
 * Distance de l'image suivante, en route vers la distance visée (chantier 36.2).
 *
 * `OrbitControls` amortit la rotation mais applique le dolly d'un bloc : chaque cran est un
 * saut, et c'est ce qui donne au zoom son côté saccadé. La molette écrit désormais une
 * distance *visée* et c'est cette fonction qui l'approche.
 *
 * L'interpolation se fait **en logarithme** : un zoom se vit en octaves, pas en unités. Une
 * interpolation linéaire irait vite au loin et s'endormirait de près, dans une même course.
 *
 * Le facteur dépend du temps écoulé et non du nombre d'images : sur un écran à 144 Hz, un
 * amortissement par image serait deux fois plus rapide que sur un écran à 60.
 */
export function dollyEase(current: number, target: number, dt: number): number {
  if (!Number.isFinite(current) || current <= 0) return target;
  if (!Number.isFinite(target) || target <= 0) return current;
  const k = smoothFactor(DOLLY_HALF_LIFE, dt);
  const from = Math.log(current);
  return Math.exp(from + (Math.log(target) - from) * k);
}

/**
 * Déplacement de la cible vers ce qu'on vise, pour l'image en cours (chantier 38).
 *
 * Rend le **delta** et non le point d'arrivée : l'appelant le reporte sur la caméra ET sur sa
 * cible, ce qui conserve la distance de vue et l'angle. Rendre le point laisserait le choix
 * de n'en bouger qu'une, et c'est précisément le défaut qu'on ne veut pas pouvoir écrire.
 *
 * Interpolation **linéaire**, à la différence de `dollyEase` : une position n'est pas une
 * octave, et zéro doit être atteignable.
 *
 * `null` au repos, sous `rest` : sans seuil la cible frémit indéfiniment, et la carte
 * republierait sa profondeur pour un mouvement que personne ne voit.
 */
export function recenterStep(
  from: Vec3,
  to: Vec3,
  dt: number,
  rest: number,
): Vec3 | null {
  const dx = to[0] - from[0];
  const dy = to[1] - from[1];
  const dz = to[2] - from[2];
  if (!Number.isFinite(dx) || !Number.isFinite(dy) || !Number.isFinite(dz))
    return null;
  const gap = Math.hypot(dx, dy, dz);
  const floor = Number.isFinite(rest) && rest > 0 ? rest : 0;
  if (gap <= floor) return null;
  const k = smoothFactor(AIM_HALF_LIFE, dt);
  return [dx * k, dy * k, dz * k];
}

/**
 * Verticale du monde de la carte.
 *
 * Le plan galactique est XY et l'épaisseur est en Z (`MAP_DEPTH`) : les systèmes se posent en
 * `cos → x, sin → y`, et l'inclinaison d'une orbite est une rotation autour de X. C'est donc
 * Z, et pas le Y par défaut de three.js, qui est le haut de ce monde.
 */
const WORLD_UP: Vec3 = [0, 0, 1];

/**
 * Élévation maximale de la caméra au-dessus du plan galactique.
 *
 * Juste en deçà du pôle : à la verticale exacte, l'axe droit de la caméra n'est plus défini et
 * l'image bascule d'un demi-tour pour un pixel de glisser.
 */
const MAX_ELEVATION = (89 * Math.PI) / 180;

function sub3(a: Vec3, b: Vec3): Vec3 {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}

function add3(a: Vec3, b: Vec3): Vec3 {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
}

function dot3(a: Vec3, b: Vec3): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

function cross3(a: Vec3, b: Vec3): Vec3 {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ];
}

/** Vecteur unitaire, ou `null` s'il est dégénéré — l'appelant décide quoi faire du cas. */
function unit3(a: Vec3): Vec3 | null {
  const length = Math.hypot(a[0], a[1], a[2]);
  if (!Number.isFinite(length) || length < 1e-12) return null;
  return [a[0] / length, a[1] / length, a[2] / length];
}

/** Rotation d'un point autour d'un axe unitaire passant par un pivot (Rodrigues). */
function rotateAbout(
  point: Vec3,
  pivot: Vec3,
  axis: Vec3,
  angle: number,
): Vec3 {
  const v = sub3(point, pivot);
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  const d = dot3(axis, v);
  const k = cross3(axis, v);
  return add3(pivot, [
    v[0] * c + k[0] * s + axis[0] * d * (1 - c),
    v[1] * c + k[1] * s + axis[1] * d * (1 - c),
    v[2] * c + k[2] * s + axis[2] * d * (1 - c),
  ]);
}

/**
 * Fait tourner la caméra ET sa cible **rigidement** autour d'un pivot (chantier 40).
 *
 * `yaw` tourne autour de la verticale du monde : on fait le tour du pivot à élévation
 * constante, comme un satellite à latitude fixe. `pitch` est le changement d'élévation, positif
 * quand la caméra monte au-dessus du plan ; il tourne autour de l'axe **droit** de la caméra,
 * qui est horizontal par construction et perpendiculaire au vecteur de vue — c'est ce qui rend
 * le bornage exact plutôt qu'approché. Jamais de roulis : aucune rotation ne se fait autour de
 * l'axe de vue.
 *
 * Rigide, et c'est tout l'intérêt : `OrbitControls` appelle `lookAt(target)` à chaque image,
 * donc sa cible est toujours au centre de l'écran et il ne peut pas pivoter autour d'un point
 * décentré. En faisant tourner la PAIRE, leur vecteur tourne d'autant et le `lookAt` qui suit
 * rend exactement l'image tournée — le pivot, lui, reste où il est à l'écran.
 *
 * Le lacet s'applique d'abord, et l'axe droit est recalculé ensuite : le prendre avant le ferait
 * tourner d'un lacet de retard, et la vue partirait de biais sur un geste en diagonale.
 */
export function orbitAround(
  pose: CameraPose,
  pivot: Vec3,
  yaw: number,
  pitch: number,
): CameraPose {
  const safeYaw = Number.isFinite(yaw) ? yaw : 0;
  const safePitch = Number.isFinite(pitch) ? pitch : 0;
  const yawed: CameraPose =
    safeYaw === 0
      ? pose
      : {
          position: rotateAbout(pose.position, pivot, WORLD_UP, safeYaw),
          target: rotateAbout(pose.target, pivot, WORLD_UP, safeYaw),
        };
  if (safePitch === 0) return yawed;

  const offset = unit3(sub3(yawed.position, yawed.target));
  if (!offset) return yawed;
  // Axe droit à partir de la direction de VUE : `offset` pointe de la cible vers la caméra.
  const right = unit3(cross3(WORLD_UP, offset));
  // Caméra à la verticale exacte du pivot : plus d'axe droit, le lacet seul s'applique.
  if (!right) return yawed;

  const elevation = Math.asin(
    Math.min(1, Math.max(-1, dot3(offset, WORLD_UP))),
  );
  // Bornage EXACT et non approché : `offset` est perpendiculaire à `right`, donc la rotation
  // se fait dans le plan qui contient l'offset et la verticale, et change l'élévation d'autant.
  const applied = Math.min(
    MAX_ELEVATION - elevation,
    Math.max(-MAX_ELEVATION - elevation, safePitch),
  );
  if (applied === 0) return yawed;

  // Rotation de `-applied` : `right` est l'axe droit de l'écran, et tourner autour de lui
  // dans le sens direct fait DESCENDRE la caméra. On veut qu'un tangage positif la monte,
  // pour que le bornage se lise `elevation + pitch` sans changement de signe en route.
  return {
    position: rotateAbout(yawed.position, pivot, right, -applied),
    target: rotateAbout(yawed.target, pivot, right, -applied),
  };
}

/**
 * Homothétie de la caméra et de sa cible autour d'un pivot (chantier 40).
 *
 * Propriété recherchée : le pivot ne bouge pas à l'écran. C'est ce qui fait le zoom au curseur —
 * le point sous la souris reste sous la souris — par opposition au dolly, qui rapproche la
 * caméra de sa cible le long de l'axe de vue et laisse donc le CENTRE fixe.
 *
 * `ratio` est le même que celui du dolly : la distance caméra-cible est multipliée par lui, si
 * bien que les bornes de palier et le calibrage de la molette s'appliquent à l'identique.
 */
export function zoomAbout(
  pose: CameraPose,
  pivot: Vec3,
  ratio: number,
): CameraPose {
  if (!Number.isFinite(ratio) || ratio <= 0) return pose;
  const at = (p: Vec3): Vec3 => [
    pivot[0] + (p[0] - pivot[0]) * ratio,
    pivot[1] + (p[1] - pivot[1]) * ratio,
    pivot[2] + (p[2] - pivot[2]) * ratio,
  ];
  return { position: at(pose.position), target: at(pose.target) };
}

/**
 * Ce que vaut un pixel d'écran, en unités de scène, à une distance donnée.
 *
 * La carte couvre six ordres de grandeur : tout ce qui doit garder une taille à l'ÉCRAN — le
 * nœud d'un système, une étiquette, le cadre de sélection — passe par ce facteur. La formule
 * vivait en trois copies distinctes, chacune avec sa propre recopie du demi-champ de vision et
 * un commentaire « doit suivre `MapCanvas` ».
 */
export function worldPerPixel(
  distance: number,
  viewportHeight: number,
  fovDegrees: number,
): number {
  if (!Number.isFinite(distance) || distance <= 0) return 0;
  const half = (Math.max(1, Math.min(179, fovDegrees)) / 2) * (Math.PI / 180);
  return (2 * Math.tan(half) * distance) / Math.max(1, viewportHeight);
}

/**
 * Seuils d'apparition d'une étiquette, en taille apparente (rayon / distance).
 *
 * Calés sur le champ de vision : `FOV = 50°` donne une demi-hauteur visible de `0,466 · d`,
 * si bien qu'une taille apparente de 0,013 vaut un rayon d'environ dix pixels sur un canvas
 * de 700 px de haut. On nomme donc un objet dès qu'il fait une vingtaine de pixels de large,
 * et pas avant — c'est ce seuil qui empêche les deux cents galaxies d'un univers plein
 * d'écrire leur nom en même temps.
 */
const LABEL_MIN = 0.013;
const LABEL_FULL = 0.022;

/** Opacité d'une étiquette pour une taille apparente donnée (chantier 36.3). */
export function labelOpacity(apparent: number): number {
  if (!Number.isFinite(apparent) || apparent <= 0) return 0;
  return smoothstep(LABEL_MIN, LABEL_FULL, apparent);
}

/** Passage d'un point dans le repère de l'enfant : `p' = (p - ancre) / échelle`. */
export function toChildFrame(point: Vec3, anchor: Vec3, scale: number): Vec3 {
  const s = safeScale(scale);
  return [
    (point[0] - anchor[0]) / s,
    (point[1] - anchor[1]) / s,
    (point[2] - anchor[2]) / s,
  ];
}

/** Passage d'un point dans le repère du parent : `p = p' × échelle + ancre`. */
export function toParentFrame(point: Vec3, anchor: Vec3, scale: number): Vec3 {
  const s = safeScale(scale);
  return [
    point[0] * s + anchor[0],
    point[1] * s + anchor[1],
    point[2] * s + anchor[2],
  ];
}

/**
 * Pose de caméra exprimée dans le repère de l'enfant.
 *
 * Pas un rebasage de rendu — voir l'en-tête, il n'y en a pas — mais la conversion dont a
 * besoin tout ce qui **désigne** un point à travers les paliers : viser une lune depuis la
 * galaxie, restaurer une ancre depuis l'URL, animer un vol vers un corps. La projection
 * est conservée, ce que vérifie le test d'aller-retour.
 */
export function descend(
  pose: CameraPose,
  anchor: Vec3,
  scale: number,
): CameraPose {
  return {
    position: toChildFrame(pose.position, anchor, scale),
    target: toChildFrame(pose.target, anchor, scale),
  };
}

/** Pose de caméra exprimée dans le repère du parent — réciproque de `descend`. */
export function ascend(
  pose: CameraPose,
  anchor: Vec3,
  scale: number,
): CameraPose {
  return {
    position: toParentFrame(pose.position, anchor, scale),
    target: toParentFrame(pose.target, anchor, scale),
  };
}

/** Un candidat projeté à l'écran. */
export interface ScreenPoint {
  id: string;
  /** Position à l'écran, en **pixels**, dans le repère du cadre. */
  at: readonly [number, number];
  /** Profondeur NDC. Hors de `[-1, 1]`, le point est derrière la caméra ou au-delà du fond. */
  depth: number;
}

/**
 * Le plus proche du curseur à l'écran, dans un rayon donné (chantier 40).
 *
 * En **pixels** et non en coordonnées normalisées : celles-ci sont anisotropes — l'axe x
 * couvre la largeur du cadre, l'axe y sa hauteur — si bien qu'un rayon exprimé en NDC serait
 * plus large horizontalement sur un écran large. C'est l'appelant qui projette et convertit ;
 * cette fonction ne fait plus que trancher.
 *
 * C'est ce qui rend sélectionnable un objet de trois pixels : le clic n'a pas à toucher sa
 * géométrie, il lui suffit de passer à côté. Au-delà du rayon on rend `null`, et l'appelant y
 * lit « le joueur a cliqué dans le vide ».
 */
export function nearestToCursor<T extends ScreenPoint>(
  cursor: readonly [number, number],
  points: readonly T[],
  maxDistance: number,
): T | null {
  if (!Number.isFinite(maxDistance) || maxDistance <= 0) return null;
  // Comparaison au carré : la racine ne change pas l'ordre.
  const limit = maxDistance * maxDistance;
  let best: T | null = null;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const point of points) {
    const [x, y] = point.at;
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
    // Derrière la caméra, ou au-delà du plan lointain : la projection y rend des coordonnées
    // d'écran parfaitement plausibles, et pour un point qu'on ne voit pas.
    if (!(point.depth >= -1 && point.depth <= 1)) continue;
    const dx = x - cursor[0];
    const dy = y - cursor[1];
    const distance = dx * dx + dy * dy;
    if (distance < bestDistance && distance <= limit) {
      best = point;
      bestDistance = distance;
    }
  }
  return best;
}
