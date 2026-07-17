import { MAP_HEIGHT, MAP_WIDTH } from "./constants.js";
import { FACTION_IDS } from "./content/factions.js";
import { createRng, pick, pickWeighted, randInt, type Rng } from "./rng.js";
import type {
  AsteroidBelt,
  Deposits,
  Galaxy,
  Planet,
  PlanetType,
  StarSystem,
  TradeStation,
  Universe,
} from "./types.js";

/** Part des systèmes accueillant une station de commerce PNJ. */
const STATION_PROBABILITY = 0.35;

/**
 * La première galaxie est celle du joueur ; les autres s'ouvrent par portail.
 * Les galaxies lointaines ont des gisements plus riches — la récompense de l'end-game.
 */
const GALAXY_DEFS = [
  { name: "Elyssia", systems: 14, x: 300, y: 380, depositBonus: 1 },
  { name: "Kharon", systems: 8, x: 640, y: 180, depositBonus: 1.5 },
  { name: "Vestige", systems: 8, x: 760, y: 520, depositBonus: 1.5 },
] as const;

const SYSTEM_NAMES = [
  "Aldera", "Bactria", "Cygnis", "Drenn", "Eloran", "Ferros", "Ghesa", "Hyadum",
  "Ilion", "Jarnis", "Kaelun", "Lorvath", "Meridia", "Nyx Prime", "Ostara",
  "Pellae", "Quorren", "Rhagan", "Selvane", "Talos", "Umbra", "Vensk", "Wrenn",
  "Xanthe", "Ysolde", "Zerath", "Aphel", "Boreas", "Cinder", "Dagon", "Erebos",
  "Fomor", "Gallien", "Hesper", "Ithil", "Jorun", "Kressa", "Lumen", "Morvan",
  "Nadir", "Ophion", "Pyrrhus", "Quilla", "Rhessa", "Sarnak", "Tyburn", "Ullis",
] as const;

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
const DEPOSIT_TENDENCIES: Record<PlanetType, readonly (readonly ["ore" | "energy" | "food", number, number, number])[]> = {
  telluric: [["ore", 0.8, 0.7, 1.2], ["food", 0.9, 0.9, 1.4], ["energy", 0.6, 0.8, 1.1]],
  oceanic: [["food", 0.95, 1.1, 1.6], ["ore", 0.4, 0.5, 0.9], ["energy", 0.6, 0.8, 1.2]],
  arid: [["ore", 0.85, 0.9, 1.4], ["energy", 0.85, 1.0, 1.5], ["food", 0.3, 0.4, 0.8]],
  frozen: [["ore", 0.8, 0.9, 1.5], ["energy", 0.4, 0.5, 0.9], ["food", 0.2, 0.3, 0.6]],
  volcanic: [["ore", 0.95, 1.2, 1.8], ["energy", 0.9, 1.1, 1.6], ["food", 0.1, 0.2, 0.4]],
  gas: [["energy", 1.0, 1.3, 2.0]],
};

function romanNumeral(n: number): string {
  return ["I", "II", "III", "IV", "V", "VI"][n - 1] ?? String(n);
}

function generateDeposits(rng: Rng, type: PlanetType, bonus = 1): Deposits {
  const deposits: Deposits = {};
  for (const [resource, prob, min, max] of DEPOSIT_TENDENCIES[type]) {
    if (rng() < prob) {
      deposits[resource] = Math.round((min + rng() * (max - min)) * bonus * 100) / 100;
    }
  }
  return deposits;
}

function generateMoons(rng: Rng, planet: Planet, depositBonus: number): Planet[] {
  const maxMoons = planet.type === "gas" ? 3 : 2;
  const count = Math.max(0, randInt(rng, planet.type === "gas" ? 1 : -1, maxMoons));
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
      deposits: { ore: Math.round((1.2 + rng() * 0.8) * depositBonus * 100) / 100 },
    });
  }

  return { planets, belts };
}

/** Positions avec distance minimale entre systèmes (rejection sampling déterministe). */
function generatePositions(rng: Rng, count: number): { x: number; y: number }[] {
  const margin = 60;
  const minDist = 90;
  const positions: { x: number; y: number }[] = [];
  while (positions.length < count) {
    const x = margin + rng() * (MAP_WIDTH - 2 * margin);
    const y = margin + rng() * (MAP_HEIGHT - 2 * margin);
    const tooClose = positions.some((p) => Math.hypot(p.x - x, p.y - y) < minDist);
    if (!tooClose) positions.push({ x: Math.round(x), y: Math.round(y) });
  }
  return positions;
}

/** Relie chaque système à ses 2 plus proches voisins puis force la connexité du graphe. */
function generateLinks(systems: StarSystem[]): [string, string][] {
  const links = new Set<string>();
  const key = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`);
  const dist = (a: StarSystem, b: StarSystem) => Math.hypot(a.x - b.x, a.y - b.y);

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

function generateGalaxy(
  rng: Rng,
  index: number,
  def: (typeof GALAXY_DEFS)[number],
  namePool: string[],
): Galaxy {
  const galaxyId = `gal-${index}`;
  const positions = generatePositions(rng, def.systems);
  const systems: StarSystem[] = positions.map((pos, i) => {
    const name =
      namePool.length > 0
        ? namePool.splice(Math.floor(rng() * namePool.length), 1)[0]!
        : `SX-${index}${100 + i}`;
    const id = `${galaxyId}-sys-${i}`;
    const system: StarSystem = { id, name, x: pos.x, y: pos.y, planets: [], belts: [] };
    const bodies = generateBodies(rng, system, def.depositBonus);
    system.planets = bodies.planets;
    system.belts = bodies.belts;
    if (rng() < STATION_PROBABILITY) {
      system.station = makeStation(rng, system);
    }
    return system;
  });

  // Au moins une station par galaxie : le commerce doit toujours être accessible.
  if (!systems.some((s) => s.station)) {
    const host = systems[Math.floor(rng() * systems.length)]!;
    host.station = makeStation(rng, host);
  }

  // Ancrage de portail : le système le plus excentré (bord de galaxie).
  const cx = systems.reduce((s, sys) => s + sys.x, 0) / systems.length;
  const cy = systems.reduce((s, sys) => s + sys.y, 0) / systems.length;
  const anchor = systems.reduce((best, sys) =>
    Math.hypot(sys.x - cx, sys.y - cy) > Math.hypot(best.x - cx, best.y - cy) ? sys : best,
  );

  return {
    id: galaxyId,
    name: def.name,
    x: def.x,
    y: def.y,
    systems,
    links: generateLinks(systems),
    anchorSystemId: anchor.id,
    depositBonus: def.depositBonus,
  };
}

function makeStation(rng: Rng, system: Pick<StarSystem, "id" | "name">): TradeStation {
  return {
    id: `${system.id}-st`,
    systemId: system.id,
    factionId: pick(rng, FACTION_IDS),
    name: `Comptoir ${system.name}`,
  };
}

export function generateUniverse(seed: string): Universe {
  const rng = createRng(seed);
  const namePool = [...SYSTEM_NAMES];
  const galaxies = GALAXY_DEFS.map((def, i) => generateGalaxy(rng, i, def, namePool));
  return { seed, galaxies };
}

/** Tous les systèmes de l'univers, toutes galaxies confondues. */
export function allSystems(universe: Universe): StarSystem[] {
  return universe.galaxies.flatMap((g) => g.systems);
}

/** Toutes les stations de commerce de l'univers. */
export function allStations(universe: Universe): TradeStation[] {
  return allSystems(universe)
    .map((s) => s.station)
    .filter((st): st is TradeStation => st !== undefined);
}

/** Tous les corps colonisables (planètes + lunes). */
export function allPlanets(universe: Universe): Planet[] {
  return allSystems(universe).flatMap((s) => s.planets);
}

export function findGalaxyOfSystem(universe: Universe, systemId: string): Galaxy | undefined {
  return universe.galaxies.find((g) => g.systems.some((s) => s.id === systemId));
}

/** Toutes les ceintures d'astéroïdes de l'univers. */
export function allBelts(universe: Universe): AsteroidBelt[] {
  return allSystems(universe).flatMap((s) => s.belts);
}
