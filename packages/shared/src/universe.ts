import {
  GALAXY_RADIUS_PER_ROOT_SYSTEM,
  GALAXY_SPACING,
  INITIAL_GALAXIES,
  MAP_DEPTH,
  MIN_SYSTEM_DISTANCE,
  UNIVERSE_CENTER_X,
  UNIVERSE_CENTER_Y,
  UNIVERSE_DISC_THICKNESS,
} from "./constants.js";
import { FACTION_IDS } from "./content/factions.js";
import {
  createRng,
  hashSeed,
  pick,
  pickWeighted,
  randInt,
  type Rng,
} from "./rng.js";
import {
  galaxyAppearance,
  galaxyMorphology,
  type GalaxyAppearance,
  type GalaxyMorphology,
} from "./sim/exploration/stars.js";
import type {
  AsteroidBelt,
  ClientUniverse,
  Deposits,
  Galaxy,
  Planet,
  PlanetType,
  StarSystem,
  TradingPost,
  Universe,
} from "./model/universe.js";

/**
 * Version du flux de sortie du générateur. À incrémenter à CHAQUE changement qui
 * modifie ce que produit `generateGalaxyAt` (tirages RNG, ids, champs, géométrie) —
 * la fixture `universe.fixture.json` le verrouille : la régénérer (`vitest -u`) et
 * bumper cette version vont ensemble, dans le même commit. Les galaxies déjà
 * matérialisées en DB gardent la version qui les a produites et ne changent jamais.
 */
export const GENERATOR_VERSION = 3;

/** Part des systèmes accueillant un comptoir commercial PNJ. */
const TRADING_POST_PROBABILITY = 0.35;

/**
 * Systèmes par galaxie (chantier 37).
 *
 * Ils étaient 7 à 14 : de quoi peupler une région, pas de quoi dessiner une galaxie. Le
 * palier univers en peignait cent soixante, et la descente démentait la promesse. À 300-520,
 * une spirale se lit sans ambiguïté — l'ordre de grandeur d'une galaxie « Medium » de
 * Stellaris, réparti sur un disque dont le rayon suit `√n` pour que la densité, elle, ne
 * bouge pas.
 *
 * Le berceau reste strictement le plus grand (520 > 500) : `universe.test.ts` en fait un
 * invariant, et c'est ce qui donne aux premiers empires de la place avant la frontière.
 */
const HOME_GALAXY_SYSTEMS = 520;
const MIN_GALAXY_SYSTEMS = 300;
const MAX_GALAXY_SYSTEMS = 500;

/**
 * Inclinaison orbitale maximale des corps, en radians (chantier 31.2). Faible à dessein :
 * un système doit lire comme un plan légèrement gauchi, pas comme un essaim.
 */
const MAX_INCLINATION = 0.15;

/** Angle d'or : pose les galaxies en spirale de tournesol (densité constante, extension infinie). */
const GOLDEN_ANGLE = 2.399963229728653;

// ── Noms procéduraux ─────────────────────────────────────────────────────────
// L'univers est extensible à l'infini : plus de pool de noms partagé et mutable
// (il imposait de générer les galaxies dans l'ordre). Les noms se calculent par
// combinaison de syllabes, indexée de façon bijective — deux indices distincts
// donnent deux noms distincts, sans consulter les galaxies déjà générées.

const NAME_HEADS = [
  "Al",
  "Bac",
  "Cyg",
  "Dre",
  "Elo",
  "Fer",
  "Ghe",
  "Hya",
  "Il",
  "Jar",
  "Kae",
  "Lor",
  "Mer",
  "Nyx",
  "Ost",
  "Pel",
  "Quor",
  "Rha",
  "Sel",
  "Tal",
  "Umb",
  "Vens",
  "Wre",
  "Xan",
  "Yso",
  "Zer",
  "Aph",
  "Bor",
  "Cin",
  "Dag",
  "Ere",
  "Fom",
  "Gal",
  "Hes",
  "Ith",
  "Jor",
  "Kres",
  "Lum",
  "Mor",
  "Nad",
  "Oph",
  "Pyr",
  "Quil",
  "Rhes",
  "Sar",
  "Tyb",
  "Ull",
  "Ves",
  "Kha",
  "Ely",
] as const;

const NAME_JOINTS = [
  "",
  "d",
  "l",
  "n",
  "r",
  "s",
  "th",
  "v",
  "m",
  "st",
  "rn",
] as const;

const NAME_TAILS = [
  "a",
  "is",
  "us",
  "on",
  "ar",
  "en",
  "or",
  "ia",
  "yn",
  "ess",
  "um",
  "ae",
  "os",
  "ix",
] as const;

/** Nombre de noms distincts formables (50 × 11 × 14). */
const NAME_SPACE = NAME_HEADS.length * NAME_JOINTS.length * NAME_TAILS.length;

/**
 * Pas de parcours de l'espace de noms : premier avec `NAME_SPACE` (2117 = 29 × 73),
 * donc `i ↦ i × STRIDE` est une bijection modulo `NAME_SPACE` — aucun doublon, sans
 * garder mémoire des noms déjà tirés. Le pas est choisi grand devant le nombre de
 * syllabes initiales pour que deux noms consécutifs ne se ressemblent pas.
 */
const NAME_STRIDE = 2117;

/** Nom composé à partir d'un index — injectif sur [0, NAME_SPACE). */
function syllabicName(index: number): string {
  const n = ((index % NAME_SPACE) + NAME_SPACE) % NAME_SPACE;
  const head = NAME_HEADS[n % NAME_HEADS.length]!;
  const joint =
    NAME_JOINTS[Math.floor(n / NAME_HEADS.length) % NAME_JOINTS.length]!;
  const tail =
    NAME_TAILS[
      Math.floor(n / (NAME_HEADS.length * NAME_JOINTS.length)) %
        NAME_TAILS.length
    ]!;
  const name = `${head}${joint}${tail}`;
  return name.charAt(0).toUpperCase() + name.slice(1);
}

/**
 * Nom d'une suite d'éléments (galaxies, ou systèmes d'une même galaxie) : le pas
 * bijectif évite tout doublon à l'intérieur de la suite. Au-delà de `NAME_SPACE`
 * éléments, un numéro de catalogue prend le relais.
 */
function seriesName(offset: number, index: number): string {
  const name = syllabicName(offset + index * NAME_STRIDE);
  const lap = Math.floor(index / NAME_SPACE);
  return lap === 0 ? name : `${name} ${lap + 1}`;
}

const TYPE_WEIGHTS: readonly (readonly [PlanetType, number])[] = [
  ["telluric", 3],
  ["oceanic", 2],
  ["arid", 3],
  ["frozen", 3],
  ["volcanic", 2],
  ["gas", 3],
];

const MOON_TYPE_WEIGHTS: readonly (readonly [PlanetType, number])[] = [
  ["frozen", 4],
  ["arid", 3],
  ["volcanic", 2],
  ["telluric", 1],
];

/** [min, max] d'habitabilité par type de planète. */
const HABITABILITY: Record<PlanetType, [number, number]> = {
  telluric: [55, 90],
  oceanic: [45, 80],
  arid: [25, 55],
  frozen: [10, 40],
  volcanic: [5, 30],
  gas: [0, 0],
};

/** Tendance des gisements par type : [ressource, proba, min, max]. */
const DEPOSIT_TENDENCIES: Record<
  PlanetType,
  readonly (readonly ["ore" | "energy" | "food", number, number, number])[]
> = {
  telluric: [
    ["ore", 0.8, 0.7, 1.2],
    ["food", 0.9, 0.9, 1.4],
    ["energy", 0.6, 0.8, 1.1],
  ],
  oceanic: [
    ["food", 0.95, 1.1, 1.6],
    ["ore", 0.4, 0.5, 0.9],
    ["energy", 0.6, 0.8, 1.2],
  ],
  arid: [
    ["ore", 0.85, 0.9, 1.4],
    ["energy", 0.85, 1.0, 1.5],
    ["food", 0.3, 0.4, 0.8],
  ],
  frozen: [
    ["ore", 0.8, 0.9, 1.5],
    ["energy", 0.4, 0.5, 0.9],
    ["food", 0.2, 0.3, 0.6],
  ],
  volcanic: [
    ["ore", 0.95, 1.2, 1.8],
    ["energy", 0.9, 1.1, 1.6],
    ["food", 0.1, 0.2, 0.4],
  ],
  gas: [["energy", 1.0, 1.3, 2.0]],
};

function romanNumeral(n: number): string {
  return ["I", "II", "III", "IV", "V", "VI"][n - 1] ?? String(n);
}

function generateDeposits(rng: Rng, type: PlanetType, bonus = 1): Deposits {
  const deposits: Deposits = {};
  for (const [resource, prob, min, max] of DEPOSIT_TENDENCIES[type]) {
    if (rng() < prob) {
      deposits[resource] =
        Math.round((min + rng() * (max - min)) * bonus * 100) / 100;
    }
  }
  return deposits;
}

function generateMoons(
  rng: Rng,
  planet: Planet,
  depositBonus: number,
): Planet[] {
  const maxMoons = planet.type === "gas" ? 3 : 2;
  const count = Math.max(
    0,
    randInt(rng, planet.type === "gas" ? 1 : -1, maxMoons),
  );
  const moons: Planet[] = [];
  const letters = ["a", "b", "c"];
  for (let i = 0; i < count; i++) {
    const type = pickWeighted(rng, MOON_TYPE_WEIGHTS);
    const [hMin, hMax] = HABITABILITY[type];
    moons.push({
      id: `${planet.id}-m${i + 1}`,
      systemId: planet.systemId,
      name: `${planet.name} ${letters[i]}`,
      kind: "moon",
      parentPlanetId: planet.id,
      type,
      habitability: Math.min(40, randInt(rng, hMin, hMax)),
      slots: randInt(rng, 2, 5),
      deposits: generateDeposits(rng, type, depositBonus),
      orbitRadius: 16 + i * 10,
      orbitAngle: rng() * Math.PI * 2,
      inclination: (rng() - 0.5) * 2 * MAX_INCLINATION,
      ascendingNode: rng() * Math.PI * 2,
    });
  }
  return moons;
}

function generateBodies(
  rng: Rng,
  system: Pick<StarSystem, "id" | "name">,
  depositBonus: number,
): {
  planets: Planet[];
  belts: AsteroidBelt[];
} {
  const count = randInt(rng, 2, 5);
  const planets: Planet[] = [];
  for (let i = 1; i <= count; i++) {
    const type = pickWeighted(rng, TYPE_WEIGHTS);
    const [hMin, hMax] = HABITABILITY[type];
    const planet: Planet = {
      id: `${system.id}-p${i}`,
      systemId: system.id,
      name: `${system.name} ${romanNumeral(i)}`,
      kind: "planet",
      type,
      habitability: randInt(rng, hMin, hMax),
      slots: type === "gas" ? randInt(rng, 2, 4) : randInt(rng, 6, 14),
      deposits: generateDeposits(rng, type, depositBonus),
      orbitRadius: 70 + (i - 1) * 55 + randInt(rng, -8, 8),
      orbitAngle: rng() * Math.PI * 2,
      inclination: (rng() - 0.5) * 2 * MAX_INCLINATION,
      ascendingNode: rng() * Math.PI * 2,
    };
    planets.push(planet, ...generateMoons(rng, planet, depositBonus));
  }

  const belts: AsteroidBelt[] = [];
  const beltCount = randInt(rng, 0, 2);
  for (let i = 1; i <= beltCount; i++) {
    belts.push({
      id: `${system.id}-b${i}`,
      systemId: system.id,
      name: `Ceinture ${system.name} ${romanNumeral(i)}`,
      orbitRadius: 70 + count * 55 + i * 40 + randInt(rng, -10, 10),
      inclination: (rng() - 0.5) * 2 * MAX_INCLINATION,
      ascendingNode: rng() * Math.PI * 2,
      deposits: {
        ore: Math.round((1.2 + rng() * 0.8) * depositBonus * 100) / 100,
      },
    });
  }

  return { planets, belts };
}

/**
 * Tirage gaussien centré réduit (Box-Muller), borné à ±3σ pour éviter les valeurs
 * aberrantes. Consomme deux valeurs du flux RNG.
 */
/**
 * Arrondi normalisant le zéro négatif. `Math.round(-0.3)` vaut `-0` en JavaScript ;
 * persisté puis relu, il revient en `0`, et l'égalité stricte des tests de round-trip
 * distingue les deux. Un `z` légèrement négatif suffisait donc à faire échouer le
 * rechargement d'univers de façon intermittente.
 */
function roundCoord(value: number): number {
  return Math.round(value) || 0;
}

function gaussian(rng: Rng): number {
  const u = Math.max(1e-9, rng());
  const v = rng();
  const g = Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  return Math.max(-3, Math.min(3, g));
}

/**
 * Grille spatiale à cellules cubiques, arête `cell`. Deux points distants de moins de `cell`
 * sont toujours dans deux cellules voisines (au sens des 27 cellules du cube 3×3×3), ce qui
 * ramène « chercher les voisins proches » d'un balayage de tous les systèmes à la lecture
 * d'une poignée de cellules.
 *
 * C'est la structure qui permet à une galaxie de passer de 14 à 500 systèmes : le placement
 * comme le graphe de sauts étaient quadratiques, et `growUniverse()` les exécute DANS le
 * tick — trois galaxies de frontière auraient gelé la boucle d'événements du serveur.
 */
class SpatialGrid {
  private readonly cells = new Map<string, number[]>();

  constructor(private readonly cell: number) {}

  add(index: number, p: Point): void {
    const k = `${Math.floor(p.x / this.cell)}|${Math.floor(p.y / this.cell)}|${Math.floor(p.z / this.cell)}`;
    const bucket = this.cells.get(k);
    if (bucket) bucket.push(index);
    else this.cells.set(k, [index]);
  }

  /** Indices présents dans le cube de `ring` cellules autour de `p` (ring 1 = 27 cellules). */
  around(p: Point, ring = 1): number[] {
    const cx = Math.floor(p.x / this.cell);
    const cy = Math.floor(p.y / this.cell);
    const cz = Math.floor(p.z / this.cell);
    const out: number[] = [];
    for (let dx = -ring; dx <= ring; dx++)
      for (let dy = -ring; dy <= ring; dy++)
        for (let dz = -ring; dz <= ring; dz++) {
          const bucket = this.cells.get(`${cx + dx}|${cy + dy}|${cz + dz}`);
          if (bucket) out.push(...bucket);
        }
    return out;
  }
}

interface Point {
  x: number;
  y: number;
  z: number;
}

const distance = (a: Point, b: Point) =>
  Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);

/**
 * Passes de relaxation : combien de fois on repousse les systèmes trop proches. Le placement
 * spiral peut en superposer deux quand la dispersion d'un bras croise celle du bras voisin ;
 * trois passes suffisent à les séparer, et le compte est FIXE — jamais un `while` qui
 * attendrait un état parfait.
 */
const RELAX_PASSES = 3;

/**
 * Sépare les systèmes trop proches en les repoussant l'un de l'autre.
 *
 * Remplace le rejet-et-retire d'avant le chantier 37, qui tirait une position au hasard tant
 * qu'elle tombait trop près d'une autre : cette boucle n'avait aucun plafond et saturait vers
 * 45 systèmes dans le pavé d'alors. Elle aurait figé le générateur sans un message, à 400.
 * Repousser plutôt que retirer préserve en prime la forme : un système reste sur son bras.
 */
function relaxPositions(points: Point[], minDist: number): void {
  for (let pass = 0; pass < RELAX_PASSES; pass++) {
    const grid = new SpatialGrid(minDist);
    points.forEach((p, i) => grid.add(i, p));
    for (let i = 0; i < points.length; i++) {
      const a = points[i]!;
      for (const j of grid.around(a)) {
        if (j <= i) continue;
        const b = points[j]!;
        const d = distance(a, b);
        if (d >= minDist) continue;
        // Deux systèmes exactement confondus n'ont pas de direction de séparation : on les
        // écarte sur x, arbitrairement mais de façon déterministe.
        const push = (minDist - d) / 2;
        const ux = d > 1e-6 ? (a.x - b.x) / d : 1;
        const uy = d > 1e-6 ? (a.y - b.y) / d : 0;
        const uz = d > 1e-6 ? (a.z - b.z) / d : 0;
        a.x += ux * push;
        a.y += uy * push;
        a.z += uz * push;
        b.x -= ux * push;
        b.y -= uy * push;
        b.z -= uz * push;
      }
    }
  }
}

/**
 * Positions des systèmes, posées SUR la forme de la galaxie (chantier 37.2).
 *
 * Avant, elles étaient tirées uniformément au hasard dans un pavé : le palier univers peignait
 * une spirale de cent soixante étoiles, on zoomait dedans, et on atterrissait sur dix points
 * sans structure. La morphologie ne décidait de rien. Elle décide maintenant d'où sont les
 * systèmes, et le nuage du palier univers se dessine de ces positions-là — la correspondance
 * entre les deux paliers est acquise par construction, plus par ressemblance.
 *
 * Le rayon suit `√n` (`GALAXY_RADIUS_PER_ROOT_SYSTEM`) : la densité, donc la longueur d'arête
 * moyenne, donc le prix d'un saut, ne bougent pas quand la galaxie grossit.
 *
 * Le `rng` reçu ici est celui de la **géométrie** (`layout:<id>`), jamais celui du contenu :
 * voir `generateGalaxy`.
 */
function generatePositions(
  rng: Rng,
  count: number,
  look: GalaxyAppearance,
): Point[] {
  const radius = GALAXY_RADIUS_PER_ROOT_SYSTEM * Math.sqrt(count);
  // Orientation propre à la galaxie : sans elle, toutes les spirales de l'univers partiraient
  // du même angle.
  const turn = rng() * Math.PI * 2;
  const halfDepth = MAP_DEPTH / 2;
  const points: Point[] = [];

  for (let i = 0; i < count; i++) {
    const t = (i + 0.5) / count;

    if (look.arms === 0) {
      // Elliptique : aucun bras, un ellipsoïde dont la densité décroît vers le bord. Trois
      // tirages indépendants, sinon le nuage se range sur une diagonale.
      const r = radius * (0.1 + t ** 0.6 * 0.9);
      const theta = rng() * Math.PI * 2;
      const phi = Math.acos(2 * rng() - 1);
      points.push({
        x: Math.sin(phi) * Math.cos(theta) * r,
        y: Math.sin(phi) * Math.sin(theta) * r * 0.78,
        z: Math.cos(phi) * r * 0.5,
      });
      continue;
    }

    if (rng() >= ARM_SHARE) {
      // Inter-bras : réparti sur tout le disque, densité décroissante vers le bord. C'est
      // lui qui relie les bras entre eux, et qui fait du graphe de sauts un réseau.
      const r = radius * (0.08 + 0.92 * Math.sqrt(t));
      const theta = rng() * Math.PI * 2;
      points.push({
        x: Math.cos(theta) * r,
        y: Math.sin(theta) * r,
        z: gaussian(rng) * halfDepth * 0.5 * (1.6 - t),
      });
      continue;
    }

    const arm = (i % look.arms) * ((Math.PI * 2) / look.arms);
    const angle = t * look.winding + arm + turn;
    // Dispersion perpendiculaire au bras, gaussienne et croissante vers l'extérieur : c'est
    // elle qui donne au bras un bord mou plutôt qu'un trait.
    const spread = gaussian(rng) * radius * look.scatter * t * 0.5;
    let r = radius * (0.12 + 0.88 * t ** 0.65);
    let x = Math.cos(angle) * r + Math.cos(angle + Math.PI / 2) * spread;
    let y = Math.sin(angle) * r + Math.sin(angle + Math.PI / 2) * spread;

    // Barre centrale : la part interne du bras se tire sur une droite au lieu de s'enrouler.
    // C'est ce qui distingue une spirale barrée d'une spirale simple.
    if (look.bar > 0 && t < look.bar) {
      const along = (t / look.bar) * 2 - 1;
      r = radius * look.bar * along;
      x = Math.cos(turn) * r + Math.cos(turn + Math.PI / 2) * spread * 0.4;
      y = Math.sin(turn) * r + Math.sin(turn + Math.PI / 2) * spread * 0.4;
    }

    points.push({
      x,
      y,
      // Le disque s'aplatit vers l'extérieur : bulbe épais au centre, tranche fine au bord.
      z: gaussian(rng) * halfDepth * 0.5 * (1.6 - t),
    });
  }

  relaxPositions(points, MIN_SYSTEM_DISTANCE);

  // Recentrage sur l'origine du repère de galaxie : le client y ramène déjà les coordonnées
  // (`systemScenePosition`), et les galaxies matérialisées avant le chantier 37 y sont.
  return points.map((p) => ({
    x: roundCoord(UNIVERSE_CENTER_X + p.x),
    y: roundCoord(UNIVERSE_CENTER_Y + p.y),
    z: roundCoord(p.z),
  }));
}

/**
 * Part des systèmes posés SUR un bras. Le reste peuple l'inter-bras.
 *
 * Un bras de galaxie est une onde de densité, pas un ruban de matière dans le vide : entre
 * deux bras, il y a des étoiles, simplement moins. Les poser tous sur les bras donnait deux
 * longues chaînes de systèmes que le graphe de sauts suivait en file indienne — diamètre
 * mesuré 276 sauts sur 520 systèmes, soit un corridor et non un réseau. Avec 40 % d'inter-bras
 * le graphe redevient un maillage à deux dimensions, et le contraste (≈ 4,5 pour 1 en densité)
 * laisse la spirale parfaitement lisible.
 */
const ARM_SHARE = 0.6;

/** Voisins retenus par système pour amorcer le graphe de sauts. */
const JUMP_NEIGHBORS = 3;
/**
 * Voisins candidats retenus par système pour recoller les composantes. Plus large que
 * `JUMP_NEIGHBORS` : ces arêtes ne sont pas posées, elles servent de réservoir au Kruskal qui
 * suit, et un réservoir trop maigre laisserait des composantes isolées.
 */
const MERGE_CANDIDATES = 8;

/** Les `k` plus proches voisins de `points[i]`, cherchés par anneaux de cellules. */
function nearestNeighbors(
  points: readonly Point[],
  grid: SpatialGrid,
  i: number,
  k: number,
  cell: number,
): number[] {
  const self = points[i]!;
  for (let ring = 1; ring <= 32; ring++) {
    const found = grid
      .around(self, ring)
      .filter((j) => j !== i)
      .map((j) => ({ j, d: distance(self, points[j]!) }))
      .sort((a, b) => a.d - b.d);
    // L'anneau ne garantit d'avoir vu TOUS les voisins que jusqu'à `ring × cell` : au-delà,
    // un point d'un anneau plus lointain pourrait encore être plus proche. On n'arrête donc
    // que quand le k-ième trouvé est à portée garantie — ou qu'on les a tous vus.
    if (found.length >= k && found[k - 1]!.d <= ring * cell)
      return found.slice(0, k).map((f) => f.j);
    if (found.length >= points.length - 1)
      return found.slice(0, k).map((f) => f.j);
  }
  return [];
}

/**
 * Relie chaque système à ses 2 plus proches voisins puis force la connexité du graphe.
 *
 * Réécrit au chantier 37.3 : la version d'avant triait tous les systèmes pour chacun d'eux
 * (O(n² log n)), puis recollait les composantes par un balayage `compA × compB` rejoué à
 * chaque tour. Correct à 14 systèmes, plusieurs centaines de millisecondes à 500 — dans le
 * tick, pour tous les joueurs connectés. Les voisins passent maintenant par la grille, et le
 * recollage par un Kruskal sur les arêtes candidates qu'elle fournit déjà.
 */
function generateLinks(systems: StarSystem[]): [string, string][] {
  const links = new Set<string>();
  const key = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`);
  const cell = MIN_SYSTEM_DISTANCE * 2;
  const grid = new SpatialGrid(cell);
  systems.forEach((s, i) => grid.add(i, s));

  const candidates: { a: number; b: number; d: number }[] = [];
  for (let i = 0; i < systems.length; i++) {
    const neighbors = nearestNeighbors(
      systems,
      grid,
      i,
      MERGE_CANDIDATES,
      cell,
    );
    neighbors.forEach((j, rank) => {
      if (rank < JUMP_NEIGHBORS) links.add(key(systems[i]!.id, systems[j]!.id));
      if (j > i)
        candidates.push({ a: i, b: j, d: distance(systems[i]!, systems[j]!) });
    });
  }

  const parent = new Map<string, string>(systems.map((s) => [s.id, s.id]));
  const find = (x: string): string => {
    let root = x;
    while (parent.get(root) !== root) root = parent.get(root)!;
    parent.set(x, root);
    return root;
  };
  const union = (a: string, b: string) => parent.set(find(a), find(b));
  for (const l of links) {
    const [a, b] = l.split("|") as [string, string];
    union(a, b);
  }

  // Kruskal sur le réservoir de la grille : la plus courte arête qui joint deux composantes
  // encore séparées, puis la suivante, jusqu'à épuisement.
  candidates.sort((x, y) => x.d - y.d);
  for (const c of candidates) {
    const a = systems[c.a]!;
    const b = systems[c.b]!;
    if (find(a.id) === find(b.id)) continue;
    links.add(key(a.id, b.id));
    union(a.id, b.id);
  }

  // Filet de sécurité : deux amas plus éloignés que le réservoir de la grille resteraient
  // séparés. Rare — le placement spiral est continu — mais la connexité est un invariant
  // (`universe.test.ts`), pas une probabilité.
  for (;;) {
    const roots = new Set(systems.map((s) => find(s.id)));
    if (roots.size <= 1) break;
    const [firstRoot] = roots;
    const compA = systems.filter((s) => find(s.id) === firstRoot);
    const compB = systems.filter((s) => find(s.id) !== firstRoot);
    let best: [StarSystem, StarSystem] | null = null;
    let bestDist = Infinity;
    for (const a of compA) {
      for (const b of compB) {
        const d = distance(a, b);
        if (d < bestDist) {
          bestDist = d;
          best = [a, b];
        }
      }
    }
    const [a, b] = best!;
    links.add(key(a.id, b.id));
    union(a.id, b.id);
  }

  return [...links].map((l) => l.split("|") as [string, string]);
}

/** Définition d'une galaxie : ce qui se déduit de sa seule position dans l'univers. */
export interface GalaxyDef {
  index: number;
  name: string;
  /** Position sur la spirale d'univers. */
  x: number;
  y: number;
  /** Écart au plan de l'univers (chantier 31.2). */
  z: number;
  systems: number;
  /**
   * Forme de la galaxie. Entrée du générateur depuis le chantier 37 : c'est elle qui décide
   * où sont posés les systèmes, plus seulement à quoi ressemble le nuage qui les figure.
   */
  morphology: GalaxyMorphology;
  depositBonus: number;
}

/**
 * Décrit la galaxie `index` sans la générer (nom, position, taille, richesse).
 *
 * Position : spirale d'angle d'or `r = ESPACEMENT × √index`, qui garde une densité
 * constante et s'étend sans borne — la galaxie 0 est au centre. Depuis le chantier 31.2,
 * `z` écarte la galaxie du plan selon une gaussienne dont l'amplitude **décroît** avec le
 * rayon : bulbe épais au centre, disque mince en périphérie. Ce tirage a son propre flux
 * RNG dérivé de seed+index (même idiome que `galaxy-size`) et jamais le flux partagé —
 * c'est ce qui permet de matérialiser une galaxie de frontière sans dépendre des
 * précédentes (ADR 0002).
 * Richesse : croît avec l'éloignement (les anneaux lointains sont la récompense).
 */
export function galaxyDefAt(seed: string, index: number): GalaxyDef {
  const radius = GALAXY_SPACING * Math.sqrt(index);
  const angle = index * GOLDEN_ANGLE;
  // Décalage de nommage propre à la seed : deux parties ne nomment pas pareil.
  const nameOffset = hashSeed(`${seed}:galaxies`) % NAME_SPACE;
  const thickness =
    UNIVERSE_DISC_THICKNESS / (1 + (0.35 * radius) / GALAXY_SPACING);
  const systems =
    index === 0
      ? HOME_GALAXY_SYSTEMS
      : randInt(
          createRng(`${seed}:galaxy-size:${index}`),
          MIN_GALAXY_SYSTEMS,
          MAX_GALAXY_SYSTEMS,
        );
  return {
    index,
    name: seriesName(nameOffset, index),
    x: Math.round(UNIVERSE_CENTER_X + Math.cos(angle) * radius),
    y: Math.round(UNIVERSE_CENTER_Y + Math.sin(angle) * radius),
    z: roundCoord(gaussian(createRng(`${seed}:galaxy-z:${index}`)) * thickness),
    systems,
    morphology: galaxyMorphology(`gal-${index}`, systems),
    depositBonus:
      index === 0
        ? 1
        : Math.round(Math.min(3, 1 + 0.5 * Math.sqrt(index)) * 100) / 100,
  };
}

/**
 * Génère la galaxie `index` **indépendamment des autres** : son RNG dérive de la seed
 * et de l'index, jamais d'un flux séquentiel partagé. C'est ce qui permet d'étendre
 * l'univers à la demande sans régénérer (ni décaler) les galaxies existantes.
 */
export function generateGalaxyAt(seed: string, index: number): Galaxy {
  return generateGalaxy(
    createRng(`${seed}:galaxy:${index}`),
    galaxyDefAt(seed, index),
  );
}

function generateGalaxy(rng: Rng, def: GalaxyDef): Galaxy {
  const index = def.index;
  const galaxyId = `gal-${index}`;
  // Deux flux, et non un (chantier 37.2). La GÉOMÉTRIE se tire de l'identifiant seul, le
  // CONTENU (noms, planètes, gisements, comptoirs) du flux dérivé de la seed de partie.
  // C'est ce qui rendra les positions re-dérivables par le client sans lui livrer la seed —
  // et donc l'univers lointain transmissible en condensé plutôt qu'en entier.
  const positions = generatePositions(
    createRng(`layout:${galaxyId}`),
    def.systems,
    galaxyAppearance(def.morphology),
  );
  const nameOffset = Math.floor(rng() * NAME_SPACE);
  const systems: StarSystem[] = positions.map((pos, i) => {
    const name = seriesName(nameOffset, i);
    const id = `${galaxyId}-sys-${i}`;
    const system: StarSystem = {
      id,
      name,
      x: pos.x,
      y: pos.y,
      z: pos.z,
      planets: [],
      belts: [],
    };
    const bodies = generateBodies(rng, system, def.depositBonus);
    system.planets = bodies.planets;
    system.belts = bodies.belts;
    if (rng() < TRADING_POST_PROBABILITY) {
      system.station = makeTradingPost(rng, system);
    }
    return system;
  });

  // Au moins un comptoir par galaxie : le commerce doit toujours être accessible.
  if (!systems.some((s) => s.station)) {
    const host = systems[Math.floor(rng() * systems.length)]!;
    host.station = makeTradingPost(rng, host);
  }

  // Ancrage de portail : le système le plus excentré (bord de galaxie), en volume.
  const cx = systems.reduce((s, sys) => s + sys.x, 0) / systems.length;
  const cy = systems.reduce((s, sys) => s + sys.y, 0) / systems.length;
  const cz = systems.reduce((s, sys) => s + sys.z, 0) / systems.length;
  const anchor = systems.reduce((best, sys) =>
    Math.hypot(sys.x - cx, sys.y - cy, sys.z - cz) >
    Math.hypot(best.x - cx, best.y - cy, best.z - cz)
      ? sys
      : best,
  );

  return {
    id: galaxyId,
    name: def.name,
    x: def.x,
    y: def.y,
    z: def.z,
    systems,
    links: generateLinks(systems),
    anchorSystemId: anchor.id,
    depositBonus: def.depositBonus,
  };
}

function makeTradingPost(
  rng: Rng,
  system: Pick<StarSystem, "id" | "name">,
): TradingPost {
  return {
    id: `${system.id}-st`,
    systemId: system.id,
    factionId: pick(rng, FACTION_IDS),
    name: `Comptoir ${system.name}`,
  };
}

/**
 * Univers = les `galaxyCount` premières galaxies de la suite infinie de la seed.
 * Étendre l'univers, c'est simplement générer les indices suivants : les précédents
 * sont inchangés (chaque galaxie a son propre RNG dérivé).
 */
export function generateUniverse(
  seed: string,
  galaxyCount = INITIAL_GALAXIES,
): Universe {
  const count = Math.max(1, Math.floor(galaxyCount));
  const galaxies: Galaxy[] = [];
  for (let i = 0; i < count; i++) galaxies.push(generateGalaxyAt(seed, i));
  return { seed, galaxies };
}

/** Tous les systèmes de l'univers, toutes galaxies confondues. */
export function allSystems(universe: ClientUniverse): StarSystem[] {
  return universe.galaxies.flatMap((g) => g.systems);
}

/** Tous les comptoirs commerciaux de l'univers. */
export function allTradingPosts(universe: ClientUniverse): TradingPost[] {
  return allSystems(universe)
    .map((s) => s.station)
    .filter((st): st is TradingPost => st !== undefined);
}

/** Tous les corps colonisables (planètes + lunes). */
export function allPlanets(universe: ClientUniverse): Planet[] {
  return allSystems(universe).flatMap((s) => s.planets);
}

export function findGalaxyOfSystem(
  universe: ClientUniverse,
  systemId: string,
): Galaxy | undefined {
  return universe.galaxies.find((g) =>
    g.systems.some((s) => s.id === systemId),
  );
}

/** Toutes les ceintures d'astéroïdes de l'univers. */
export function allBelts(universe: ClientUniverse): AsteroidBelt[] {
  return allSystems(universe).flatMap((s) => s.belts);
}
