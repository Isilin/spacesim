import {
  GALAXY_SPACING,
  INITIAL_GALAXIES,
  MAP_DEPTH,
  MAP_HEIGHT,
  MAP_WIDTH,
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
import type {
  AsteroidBelt,
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
export const GENERATOR_VERSION = 2;

/** Part des systèmes accueillant un comptoir commercial PNJ. */
const TRADING_POST_PROBABILITY = 0.35;

/** Systèmes de la galaxie d'origine (index 0) : plus vaste, c'est le berceau des empires. */
const HOME_GALAXY_SYSTEMS = 14;

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
 * Positions avec distance minimale entre systèmes (rejection sampling déterministe).
 * Volumétrique depuis le chantier 31.2 : `z` est centré sur 0 (le plan galactique) et
 * borné par `MAP_DEPTH`, très inférieur à la largeur — une galaxie est un disque.
 */
function generatePositions(
  rng: Rng,
  count: number,
): { x: number; y: number; z: number }[] {
  const margin = 60;
  const minDist = 90;
  const positions: { x: number; y: number; z: number }[] = [];
  while (positions.length < count) {
    const x = margin + rng() * (MAP_WIDTH - 2 * margin);
    const y = margin + rng() * (MAP_HEIGHT - 2 * margin);
    const z = (rng() - 0.5) * MAP_DEPTH;
    const tooClose = positions.some(
      (p) => Math.hypot(p.x - x, p.y - y, p.z - z) < minDist,
    );
    if (!tooClose)
      positions.push({
        x: roundCoord(x),
        y: roundCoord(y),
        z: roundCoord(z),
      });
  }
  return positions;
}

/** Relie chaque système à ses 2 plus proches voisins puis force la connexité du graphe. */
function generateLinks(systems: StarSystem[]): [string, string][] {
  const links = new Set<string>();
  const key = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`);
  const dist = (a: StarSystem, b: StarSystem) =>
    Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);

  for (const sys of systems) {
    const neighbors = systems
      .filter((s) => s.id !== sys.id)
      .sort((a, b) => dist(sys, a) - dist(sys, b))
      .slice(0, 2);
    for (const n of neighbors) links.add(key(sys.id, n.id));
  }

  // Union-find : fusionne les composantes en reliant leurs systèmes les plus proches.
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
        const d = dist(a, b);
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
  return {
    index,
    name: seriesName(nameOffset, index),
    x: Math.round(UNIVERSE_CENTER_X + Math.cos(angle) * radius),
    y: Math.round(UNIVERSE_CENTER_Y + Math.sin(angle) * radius),
    z: roundCoord(gaussian(createRng(`${seed}:galaxy-z:${index}`)) * thickness),
    systems:
      index === 0
        ? HOME_GALAXY_SYSTEMS
        : randInt(createRng(`${seed}:galaxy-size:${index}`), 7, 13),
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
  const positions = generatePositions(rng, def.systems);
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
export function allSystems(universe: Universe): StarSystem[] {
  return universe.galaxies.flatMap((g) => g.systems);
}

/** Tous les comptoirs commerciaux de l'univers. */
export function allTradingPosts(universe: Universe): TradingPost[] {
  return allSystems(universe)
    .map((s) => s.station)
    .filter((st): st is TradingPost => st !== undefined);
}

/** Tous les corps colonisables (planètes + lunes). */
export function allPlanets(universe: Universe): Planet[] {
  return allSystems(universe).flatMap((s) => s.planets);
}

export function findGalaxyOfSystem(
  universe: Universe,
  systemId: string,
): Galaxy | undefined {
  return universe.galaxies.find((g) =>
    g.systems.some((s) => s.id === systemId),
  );
}

/** Toutes les ceintures d'astéroïdes de l'univers. */
export function allBelts(universe: Universe): AsteroidBelt[] {
  return allSystems(universe).flatMap((s) => s.belts);
}
