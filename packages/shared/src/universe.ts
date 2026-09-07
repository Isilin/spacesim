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
import {
  BLACK_HOLE_TYPES,
  type BlackHolePlacement,
} from "./content/astro/black-hole-types.js";
import { beltType, beltTypesForZone } from "./content/astro/belt-types.js";
import {
  GALAXY_TYPE_WEIGHTS,
  galaxyType,
  type GalaxyTypeDef,
  type GalaxyTypeId,
} from "./content/astro/galaxy-types.js";
import {
  WHITE_HOLE_TYPES,
  whiteHoleType,
} from "./content/astro/white-hole-types.js";
import {
  planetClass,
  planetClassesForZone,
} from "./content/astro/planet-classes.js";
import { variantsFor } from "./content/astro/planet-variants.js";
import {
  type BodyRef,
  bodyEnvironment,
  bodyStructure,
} from "./content/astro/body-defs.js";
import {
  moonClass,
  moonClassesForParent,
} from "./content/astro/moon-classes.js";
import { moonVariantsFor } from "./content/astro/moon-variants.js";
import {
  STAR_COMPANION_WEIGHTS,
  STAR_PRIMARY_WEIGHTS,
  starClass,
} from "./content/astro/star-classes.js";
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
  atmosphereRetention,
  auAt,
  equilibriumTempK,
  escapeVelocity,
  flareErosion,
  greenhouseK,
  habitabilityOf,
  irradianceAt,
  lightingFor,
  radiationAt,
  surfaceGravity,
  surfaceTempC,
  zoneAt,
} from "./sim/exploration/physics.js";
import type {
  AsteroidBelt,
  CentralBody,
  CentralBodyKind,
  ClientUniverse,
  Deposits,
  Galaxy,
  Planet,
  OrbitZone,
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
export const GENERATOR_VERSION = 12;

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

/**
 * Nombre de corps centraux d'un système.
 *
 * Environ la moitié des étoiles du ciel réel vivent en couple ou davantage. La table penche
 * vers le simple sans l'imposer : un tiers des systèmes sont multiples, assez pour que le cas
 * se rencontre, assez peu pour que la carte reste lisible.
 */
const STAR_COUNT_WEIGHTS: readonly (readonly [number, number])[] = [
  [1, 65],
  [2, 28],
  [3, 7],
];

/**
 * Séparation d'un compagnon, en unités de scène — et le trou délibéré entre les deux bandes.
 *
 * Une binaire serrée voit ses planètes tourner autour du **barycentre** (orbites P), une
 * binaire large voit chaque étoile garder les siennes (orbites S). Entre les deux, les orbites
 * planétaires ne sont pas stables : la bande intermédiaire n'est jamais tirée, et `orbitsBary`
 * devient non ambigu par construction plutôt que par prudence.
 *
 * La bande serrée s'arrête à 22 pour que trois fois la séparation reste sous la première
 * orbite planétaire (70) : toute planète du système est alors circumbinaire et stable.
 */
const TIGHT_BINARY = [10, 22] as const;
const WIDE_BINARY = [420, 900] as const;

/**
 * Part des systèmes dont l'ancre est une singularité, et part des compagnons qui en sont une
 * (chantier 45.5).
 *
 * Volontairement basses. Un trou noir primaire éteint son système : ses mondes gèlent et son
 * habitabilité tombe au plancher, si bien qu'un pour cent de plus se paie directement sur la
 * part de systèmes viables que `habitability.calibration.test.ts` verrouille. À 1,5 %, une
 * galaxie de cinq cents systèmes en compte sept ou huit — assez pour que le joueur en
 * rencontre, trop peu pour que l'expansion en souffre.
 *
 * Les errants restent la forme la plus fréquente : ce sont des objets à traverser, pas des
 * systèmes à exploiter.
 */
const SINGULARITY_PRIMARY_SHARE = 0.015;
const SINGULARITY_COMPANION_SHARE = 0.02;

function romanNumeral(n: number): string {
  return ["I", "II", "III", "IV", "V", "VI"][n - 1] ?? String(n);
}

/**
 * Corps centraux d'un système (chantier 45.2).
 *
 * Tirés **avant** les corps, et c'est tout le sujet : leur luminosité place la zone habitable
 * et la ligne des glaces, qui décident ensuite de ce qu'on trouve à chaque orbite. L'ADR 0016
 * faisait l'inverse — la classe d'étoile était lue d'après les planètes déjà posées, faute
 * de pouvoir les causer.
 */
function generateStars(
  rng: Rng,
  system: Pick<StarSystem, "id" | "name">,
): CentralBody[] {
  const count = pickWeighted(rng, STAR_COUNT_WEIGHTS);
  const letters = ["A", "B", "C", "D"];
  const stars: CentralBody[] = [];
  // La séparation est propre au SYSTÈME et non à chaque compagnon : deux étoiles d'une
  // binaire serrée ne peuvent pas être à la fois serrées et larges.
  const wide = count > 1 && rng() < 0.4;
  const [sepMin, sepMax] = wide ? WIDE_BINARY : TIGHT_BINARY;

  for (let i = 0; i < count; i++) {
    // Une singularité peut tenir la place d'une étoile (chantier 45.5). Les catalogues
    // déclaraient ces deux emplacements depuis le palier 1 et le générateur ne les produisait
    // pas : `microquasar` et `torrent` n'existaient nulle part, `stellar` non plus.
    //
    // Un système à trou noir primaire n'éclaire rien : ses mondes sont gelés et son
    // habitabilité tombe au plancher. C'est voulu — il ne se colonise pas pour sa population
    // mais pour ce que son disque d'accrétion crache, et c'est le seul endroit où l'on
    // extrait de la matière exotique sans quitter un système habitable.
    const singular =
      i === 0
        ? rng() < SINGULARITY_PRIMARY_SHARE && PRIMARY_SINGULARITIES.length > 0
        : rng() < SINGULARITY_COMPANION_SHARE &&
          COMPANION_SINGULARITIES.length > 0;
    if (singular) {
      const picked = pickWeighted(
        rng,
        i === 0 ? PRIMARY_SINGULARITIES : COMPANION_SINGULARITIES,
      );
      const [minMass, maxMass] = picked.massRange;
      stars.push({
        id: `${system.id}-s${i + 1}`,
        systemId: system.id,
        name: `${system.name} ${letters[i] ?? i + 1}`,
        kind: picked.kind,
        typeId: picked.typeId,
        rank: i,
        mass: Math.round((minMass + rng() * (maxMass - minMass)) * 1000) / 1000,
        orbitRadius:
          i === 0 ? 0 : Math.round(sepMin + rng() * (sepMax - sepMin)),
        orbitAngle: i === 0 ? 0 : rng() * Math.PI * 2,
        inclination: i === 0 ? 0 : (rng() - 0.5) * 2 * MAX_INCLINATION,
        ascendingNode: i === 0 ? 0 : rng() * Math.PI * 2,
      });
      continue;
    }
    const typeId = pickWeighted(
      rng,
      i === 0 ? STAR_PRIMARY_WEIGHTS : STAR_COMPANION_WEIGHTS,
    );
    const [minMass, maxMass] = starClass(typeId).massRange;
    stars.push({
      id: `${system.id}-s${i + 1}`,
      systemId: system.id,
      name: `${system.name} ${letters[i] ?? i + 1}`,
      kind: "star",
      typeId,
      rank: i,
      mass: Math.round((minMass + rng() * (maxMass - minMass)) * 1000) / 1000,
      // L'ancre est à l'origine du repère, ce que `bodyPositionAt` suppose déjà.
      orbitRadius: i === 0 ? 0 : Math.round(sepMin + rng() * (sepMax - sepMin)),
      orbitAngle: i === 0 ? 0 : rng() * Math.PI * 2,
      inclination: i === 0 ? 0 : (rng() - 0.5) * 2 * MAX_INCLINATION,
      ascendingNode: i === 0 ? 0 : rng() * Math.PI * 2,
    });
  }
  return stars;
}

/** Les gisements suivent l'ENVIRONNEMENT : c'est lui qui dit ce que la surface expose. */
function generateDeposits(rng: Rng, ref: BodyRef, bonus = 1): Deposits {
  return rollDeposits(rng, bodyEnvironment(ref).depositTendencies, bonus);
}

/**
 * Le tirage lui-même, partagé par les corps et les ceintures : les deux portent la même forme
 * de tendance — [ressource, probabilité, min, max] — sans partager de catalogue.
 */
function rollDeposits(
  rng: Rng,
  tendencies: readonly (readonly [
    "ore" | "energy" | "food",
    number,
    number,
    number,
  ])[],
  bonus = 1,
): Deposits {
  const deposits: Deposits = {};
  for (const [resource, prob, min, max] of tendencies) {
    if (rng() < prob) {
      deposits[resource] =
        Math.round((min + rng() * (max - min)) * bonus * 100) / 100;
    }
  }
  return deposits;
}

/**
 * Tire une classe puis une variante de PLANÈTE pour une zone donnée.
 *
 * L'ordre importe : la structure d'abord — c'est elle qui décide de ce que le corps peut
 * retenir — puis l'environnement parmi ceux que cette structure admet, pondéré par la zone.
 * L'inverse aurait permis une géante gazeuse océanique.
 */
function pickPlanetType(rng: Rng, zone: OrbitZone): BodyRef {
  const classes = planetClassesForZone(zone);
  const classId = classes.length > 0 ? pickWeighted(rng, classes) : "rocky";
  const variants = variantsFor(planetClass(classId).variants, zone);
  const variantId =
    variants.length > 0 ? pickWeighted(rng, variants) : "barren";
  return { kind: "planet", classId, variantId };
}

/**
 * Même tirage pour une LUNE, conditionné par sa planète et non par sa zone.
 *
 * C'est toute la différence entre les deux familles : une lune de géante est volcanique ou
 * porte un océan sous sa glace parce que sa planète la pétrit, quelle que soit la distance à
 * l'étoile. Tirer une lune dans les tables planétaires rendait tout cortège externe gelé.
 */
function pickMoonType(rng: Rng, parentClassId: string): BodyRef {
  const classes = moonClassesForParent(parentClassId);
  const classId = classes.length > 0 ? pickWeighted(rng, classes) : "regular";
  const variants = moonVariantsFor(moonClass(classId).variants, parentClassId);
  const variantId =
    variants.length > 0 ? pickWeighted(rng, variants) : "airless";
  return { kind: "moon", classId, variantId };
}

/**
 * Habitabilité d'un corps, **calculée** par la chaîne physique et non tirée.
 *
 * C'est le point d'arrivée du chantier. La table `HABITABILITY` qui vivait ici donnait une
 * fourchette par type de planète, indépendante de l'étoile : un monde tellurique naissait
 * entre 55 et 90 qu'il tourne autour d'une naine brune ou d'une supergéante. La valeur tombe
 * désormais de la température de surface, de la pression réellement retenue, de la gravité et
 * du rayonnement reçu.
 *
 * Le tirage ne disparaît pas pour autant : rayon et densité restent tirés dans la fourchette
 * du type, et c'est par eux que deux mondes du même type au même endroit ne se valent pas.
 */
function bodyHabitability(
  rng: Rng,
  ref: BodyRef,
  stars: readonly CentralBody[],
  orbitRadius: number,
  hostStarId?: string,
): { habitability: number; radiusEarth: number; density: number } {
  // La CLASSE donne la structure, la VARIANTE l'environnement : c'est le croisement des deux
  // qui décide, et c'est ce que l'énumération à plat ne pouvait pas exprimer. Planète ou lune,
  // la chaîne est la même — seules les tables où se lisent les deux définitions changent.
  const cls = bodyStructure(ref);
  const env = bodyEnvironment(ref);
  const radiusEarth = range(rng, cls.radiusRange);
  const density = range(rng, cls.densityRange);
  if (!cls.colonizable) return { habitability: 0, radiusEarth, density };

  // En binaire large, c'est l'étoile HÔTE qui chauffe, pas la somme des deux.
  const lighting = lightingFor(stars, hostStarId, orbitRadius);
  const au = auAt(lighting, orbitRadius);
  const equilibrium = equilibriumTempK(irradianceAt(lighting, au), env.albedo);
  // La magnétosphère de la classe protège du vent stellaire ce que les éruptions décaperaient.
  const shielded = 1 - (1 - flareErosion(lighting)) * (1 - cls.magnetosphere);
  const retention =
    atmosphereRetention(escapeVelocity(radiusEarth, density), equilibrium) *
    shielded;
  // Ce que le corps retient réellement de ce qu'il dégaze. Sous 0,15 il est nu quoi qu'il
  // tente : c'est ce couplage qui fait qu'une naine sans gravité reste stérile même au bon
  // endroit, et qu'un monde froid garde une atmosphère qu'un monde chaud aurait perdue.
  const pressure = env.outgassingBar * Math.min(1.5, Math.max(0, retention));
  const surface = surfaceTempC(
    equilibrium,
    greenhouseK(pressure, env.greenhousePerBar),
  );
  return {
    habitability: habitabilityOf({
      surfaceTempC: surface,
      pressureBar: pressure,
      gravityG: surfaceGravity(radiusEarth, density),
      radiation: Math.max(radiationAt(lighting, au), env.hazard),
      breathable: env.atmosphere === "breathable" && retention > 0.5,
    }),
    radiusEarth,
    density,
  };
}

function range(rng: Rng, [min, max]: readonly [number, number]): number {
  return min + rng() * (max - min);
}

function generateMoons(
  rng: Rng,
  planet: Planet,
  stars: readonly CentralBody[],
  depositBonus: number,
): Planet[] {
  // Le cortège dépend de la CLASSE de la planète : une géante en garde plusieurs, une naine
  // presque jamais.
  const [minMoons, maxMoons] = planetClass(planet.classId).moonRange;
  const count = randInt(rng, minMoons, maxMoons);
  const moons: Planet[] = [];
  const letters = ["a", "b", "c", "d", "e", "f"];

  for (let i = 0; i < count; i++) {
    // C'est la PLANÈTE qui décide de ce qu'une lune peut être, pas la zone thermique : une
    // géante pétrit ses lunes par effet de marée et les baigne dans sa ceinture de
    // radiations, phénomènes qu'aucune orbite stellaire ne reproduit.
    const ref = pickMoonType(rng, planet.classId);
    const body = bodyHabitability(
      rng,
      ref,
      stars,
      planet.orbitRadius,
      planet.hostStarId,
    );
    moons.push({
      id: `${planet.id}-m${i + 1}`,
      systemId: planet.systemId,
      name: `${planet.name} ${letters[i] ?? i + 1}`,
      kind: "moon",
      parentPlanetId: planet.id,
      classId: ref.classId,
      variantId: ref.variantId,
      ...(planet.hostStarId ? { hostStarId: planet.hostStarId } : {}),
      // Plus de plafond arbitraire : les classes de lunes sont assez petites pour que la
      // physique s'en charge seule. Mesuré sur trois galaxies, la meilleure lune de
      // l'univers sort à 17 — un Titan, à 0,14 g et −179 °C, ne se colonise que sous dôme.
      // Le `Math.min(40, …)` qui vivait ici ne se déclenchait plus jamais.
      habitability: body.habitability,
      slots: randInt(rng, ...moonClass(ref.classId).slotRange),
      deposits: generateDeposits(rng, ref, depositBonus),
      orbitRadius: 16 + i * 10,
      orbitAngle: rng() * Math.PI * 2,
      inclination: (rng() - 0.5) * 2 * MAX_INCLINATION,
      ascendingNode: rng() * Math.PI * 2,
    });
  }
  return moons;
}

/**
 * Corps d'un système, conditionnés par les étoiles qui l'éclairent (chantier 45.2).
 *
 * L'ordre s'est inversé : `stars` arrive en paramètre parce qu'il a été tiré avant. Chaque
 * créneau orbital est traduit en unités astronomiques par `auAt`, classé en zone thermique
 * par `zoneAt`, et c'est la zone qui décide des types tirables. Une orbite qui tombe dans la
 * zone habitable d'une naine rouge est à 0,16 UA, celle d'une géante bleue à 92 UA — même
 * créneau de scène, même zone, deux mondes possibles.
 *
 * L'échelle des orbites, elle, ne bouge pas : c'est le facteur de conversion qui porte la
 * différence, pas la géométrie. Voir `HABITABLE_SCENE_RADIUS`.
 */
function generateBodies(
  rng: Rng,
  system: Pick<StarSystem, "id" | "name">,
  stars: readonly CentralBody[],
  depositBonus: number,
): {
  planets: Planet[];
  belts: AsteroidBelt[];
} {
  const count = randInt(rng, 2, 5);
  const planets: Planet[] = [];

  // Qui héberge le cortège.
  //
  // Dans une binaire SERRÉE — séparation sous la première orbite — les planètes englobent les
  // deux étoiles et tournent autour du barycentre : leur hôte nominal est l'ancre, et
  // `orbitsBarycenter` le lit de la géométrie. Dans une binaire LARGE, chaque étoile garde son
  // propre cortège, et l'hôte se tire à la masse : une naine ne retient pas autant de mondes
  // que sa compagne massive.
  //
  // Le générateur ne tire jamais de séparation entre les deux bandes, où l'un et l'autre
  // seraient également plausibles — et où les orbites ne sont de toute façon pas stables.
  const wide = stars.some((s) => s.orbitRadius >= WIDE_BINARY[0]);
  const hostTable: readonly (readonly [string, number])[] = stars.map(
    (s) => [s.id, s.mass] as const,
  );

  for (let i = 1; i <= count; i++) {
    const host =
      wide && hostTable.length > 0
        ? pickWeighted(rng, hostTable)
        : stars[0]?.id;
    const orbitRadius = 70 + (i - 1) * 55 + randInt(rng, -8, 8);
    const zone = zoneAt(lightingFor(stars, host, orbitRadius), orbitRadius);
    const ref = pickPlanetType(rng, zone);
    const body = bodyHabitability(rng, ref, stars, orbitRadius, host);
    const cls = planetClass(ref.classId);
    const planet: Planet = {
      id: `${system.id}-p${i}`,
      systemId: system.id,
      name: `${system.name} ${romanNumeral(i)}`,
      kind: "planet",
      classId: ref.classId,
      variantId: ref.variantId,
      ...(host ? { hostStarId: host } : {}),
      habitability: body.habitability,
      slots: randInt(rng, cls.slotRange[0], cls.slotRange[1]),
      deposits: generateDeposits(rng, ref, depositBonus),
      orbitRadius,
      orbitAngle: rng() * Math.PI * 2,
      inclination: (rng() - 0.5) * 2 * MAX_INCLINATION,
      ascendingNode: rng() * Math.PI * 2,
    };
    planets.push(planet, ...generateMoons(rng, planet, stars, depositBonus));
  }

  const belts: AsteroidBelt[] = [];
  const beltCount = randInt(rng, 0, 2);
  for (let i = 1; i <= beltCount; i++) {
    const orbitRadius = 70 + count * 55 + i * 40 + randInt(rng, -10, 10);
    // Même conditionnement que les planètes : c'est la ligne des glaces qui sépare une
    // ceinture silicatée d'une ceinture glacée, comme la principale et celle de Kuiper.
    const zone = zoneAt(
      lightingFor(stars, stars[0]?.id, orbitRadius),
      orbitRadius,
    );
    const table = beltTypesForZone(zone);
    const typeId = table.length > 0 ? pickWeighted(rng, table) : "silicate";
    const def = beltType(typeId);
    belts.push({
      id: `${system.id}-b${i}`,
      systemId: system.id,
      name: `Ceinture ${system.name} ${romanNumeral(i)}`,
      typeId,
      orbitRadius,
      inclination: (rng() - 0.5) * 2 * MAX_INCLINATION,
      ascendingNode: rng() * Math.PI * 2,
      deposits: {
        // Le minerai reste à part des tendances : c'est lui que lit `beltRichness`, et le
        // seul chiffre qu'un avant-poste minier voie jamais.
        ore: Math.round(range(rng, def.richness) * depositBonus * 100) / 100,
        ...rollDeposits(rng, def.depositTendencies, depositBonus),
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
  look: GalaxyTypeDef,
  drifterCount = 0,
): { systems: Point[]; drifters: Point[] } {
  const radius = GALAXY_RADIUS_PER_ROOT_SYSTEM * Math.sqrt(count);
  // Orientation propre à la galaxie : sans elle, toutes les spirales de l'univers partiraient
  // du même angle.
  const turn = rng() * Math.PI * 2;
  const halfDepth = MAP_DEPTH / 2;
  const points: Point[] = [];

  for (let i = 0; i < count; i++) {
    const t = (i + 0.5) / count;

    if (look.ring > 0) {
      // Annulaire : une collision frontale a chassé la matière vers l'extérieur. Les
      // systèmes se concentrent sur un tore et le centre reste vide — ce qui en fait la
      // seule morphologie dont le graphe de sauts est un anneau, donc au diamètre bien
      // plus grand que sa taille ne le laisse croire.
      const r = radius * (look.ring + gaussian(rng) * look.scatter);
      const theta = rng() * Math.PI * 2;
      points.push({
        x: Math.cos(theta) * r,
        y: Math.sin(theta) * r,
        z: gaussian(rng) * halfDepth * 0.4,
      });
      continue;
    }

    if (look.arms === 0) {
      // Sans bras : un ellipsoïde dont la densité décroît vers le bord. Trois tirages
      // indépendants, sinon le nuage se range sur une diagonale.
      //
      // `scatter` sert ici d'APLATISSEMENT, et non de dispersion perpendiculaire comme
      // dans la branche des bras : c'est la seule grandeur qui distingue les trois
      // morphologies sans bras l'une de l'autre. À 1 l'objet est sphéroïdal (elliptique),
      // à 0,3 c'est un disque épais sans bras (lenticulaire). Sans cet usage, elliptique,
      // naine et lenticulaire rendaient exactement la même forme.
      const flatten = look.scatter;
      const r = radius * (0.1 + t ** 0.6 * 0.9);
      const theta = rng() * Math.PI * 2;
      const phi = Math.acos(2 * rng() - 1);
      points.push({
        x: Math.sin(phi) * Math.cos(theta) * r,
        y: Math.sin(phi) * Math.sin(theta) * r * 0.78,
        z: Math.cos(phi) * r * 0.5 * flatten,
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

    // Queue de marée : une galaxie en interaction projette une partie de son disque
    // externe très loin, en un filament. Réservé aux plus excentrés — une queue part du
    // bord, jamais du bulbe — et tiré après la barre, sur laquelle il ne s'applique pas.
    if (look.tidalTails && t > 0.75 && rng() < 0.25) {
      const stretch = 1.6 + rng() * 1.2;
      x *= stretch;
      y *= stretch;
    }

    points.push({
      x,
      y,
      // Le disque s'aplatit vers l'extérieur : bulbe épais au centre, tranche fine au bord.
      z: gaussian(rng) * halfDepth * 0.5 * (1.6 - t),
    });
  }

  relaxPositions(points, MIN_SYSTEM_DISTANCE);

  // Les errants se posent APRÈS la relaxation, sur les positions définitives : les
  // repousser avec les systèmes les aurait ramenés dans le disque, alors que tout leur
  // intérêt est d'être ailleurs.
  const drifters = placeDrifters(rng, drifterCount, points, radius, halfDepth);

  // Recentrage sur l'origine du repère de galaxie : le client y ramène déjà les coordonnées
  // (`systemScenePosition`), et les galaxies matérialisées avant le chantier 37 y sont.
  const toGalaxyFrame = (p: Point) => ({
    x: roundCoord(UNIVERSE_CENTER_X + p.x),
    y: roundCoord(UNIVERSE_CENTER_Y + p.y),
    z: roundCoord(p.z),
  });
  return {
    systems: points.map(toGalaxyFrame),
    drifters: drifters.map(toGalaxyFrame),
  };
}

/**
 * Tentatives avant d'accepter une position d'errant trop proche d'un système.
 *
 * Plafonné, comme `RELAX_PASSES` et pour la même raison : le rejet-et-retire sans borne
 * d'avant le chantier 37 saturait sans un message. Huit essais suffisent très largement
 * dans un halo bien plus vaste que le disque ; au neuvième on accepte, parce qu'un errant
 * un peu trop près reste préférable à une galaxie qui ne se génère pas.
 */
const DRIFTER_TRIES = 8;

/**
 * Positions des singularités errantes — hors des bras, dans le halo.
 *
 * Un errant n'est pas une entité nouvelle : c'est un **système** sans étoile ni monde, ce
 * qui lui donne gratuitement tout ce qu'on attend de lui. `generateLinks` l'absorbe sans
 * modification, l'invariant de connexité tient, le graphe de sauts le voit comme une
 * destination, la carte le rend et la base le stocke. Aucune machinerie parallèle.
 *
 * Ce qui le distingue tient donc à sa position et à son contenu, pas à son statut : posé
 * entre 0,55 et 1,25 rayon, sur une épaisseur trois fois celle du disque, il se lit comme
 * étant à l'écart — et il l'est aussi dans le graphe, puisque les liaisons se tirent des
 * distances réelles.
 */
function placeDrifters(
  rng: Rng,
  count: number,
  systems: readonly Point[],
  radius: number,
  halfDepth: number,
): Point[] {
  if (count <= 0) return [];
  const grid = new SpatialGrid(MIN_SYSTEM_DISTANCE);
  systems.forEach((p, i) => grid.add(i, p));

  const out: Point[] = [];
  for (let i = 0; i < count; i++) {
    let candidate: Point | null = null;
    for (let attempt = 0; attempt < DRIFTER_TRIES; attempt++) {
      const r = radius * (0.55 + rng() * 0.7);
      const theta = rng() * Math.PI * 2;
      const p = {
        x: Math.cos(theta) * r,
        y: Math.sin(theta) * r,
        z: gaussian(rng) * halfDepth * 1.5,
      };
      candidate = p;
      const tooClose = grid
        .around(p)
        .some((j) => distance(p, systems[j]!) < MIN_SYSTEM_DISTANCE);
      if (!tooClose) break;
    }
    out.push(candidate!);
  }
  return out;
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
   * Type de la galaxie. Entrée du générateur depuis le chantier 37 pour sa forme, et
   * **antérieur à la taille** depuis le chantier 45 : le type est tiré d'abord, et sa
   * `systemRange` contraint le nombre de systèmes. C'est l'inverse de `galaxyMorphology`,
   * qui déduisait la forme d'une taille déjà tirée.
   */
  typeId: GalaxyTypeId;
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
/**
 * Type de la galaxie `index`, sur son propre flux RNG.
 *
 * La galaxie mère compte 520 systèmes (`HOME_GALAXY_SYSTEMS`) : son type se tire parmi les
 * seuls qui admettent cette taille, faute de quoi elle n'aurait aucune forme possible. Une
 * naine sphéroïdale à 520 systèmes n'est pas une naine. Les autres tirent dans toute la
 * table — `astro.test.ts` vérifie qu'elle n'est jamais vide.
 */
function pickGalaxyType(seed: string, index: number): GalaxyTypeId {
  const rng = createRng(`${seed}:galaxy-type:${index}`);
  if (index !== 0) return pickWeighted(rng, GALAXY_TYPE_WEIGHTS);
  const admits = GALAXY_TYPE_WEIGHTS.filter(([id]) => {
    const [min, max] = galaxyType(id).systemRange;
    return HOME_GALAXY_SYSTEMS >= min && HOME_GALAXY_SYSTEMS <= max;
  });
  return pickWeighted(rng, admits);
}

export function galaxyDefAt(seed: string, index: number): GalaxyDef {
  const radius = GALAXY_SPACING * Math.sqrt(index);
  const angle = index * GOLDEN_ANGLE;
  // Décalage de nommage propre à la seed : deux parties ne nomment pas pareil.
  const nameOffset = hashSeed(`${seed}:galaxies`) % NAME_SPACE;
  const thickness =
    UNIVERSE_DISC_THICKNESS / (1 + (0.35 * radius) / GALAXY_SPACING);
  // Le type se tire AVANT la taille, sur son propre flux — même idiome que `galaxy-size`,
  // et pour la même raison : matérialiser une galaxie de frontière ne doit dépendre
  // d'aucune de celles déjà tirées (ADR 0002).
  const typeId = pickGalaxyType(seed, index);
  const [typeMin, typeMax] = galaxyType(typeId).systemRange;
  const systems =
    index === 0
      ? HOME_GALAXY_SYSTEMS
      : randInt(
          createRng(`${seed}:galaxy-size:${index}`),
          Math.max(MIN_GALAXY_SYSTEMS, typeMin),
          Math.min(MAX_GALAXY_SYSTEMS, typeMax),
        );
  return {
    index,
    name: seriesName(nameOffset, index),
    x: Math.round(UNIVERSE_CENTER_X + Math.cos(angle) * radius),
    y: Math.round(UNIVERSE_CENTER_Y + Math.sin(angle) * radius),
    z: roundCoord(gaussian(createRng(`${seed}:galaxy-z:${index}`)) * thickness),
    systems,
    typeId,
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
  const type = galaxyType(def.typeId);
  const drifterCount = Math.round(
    (type.singularityDensity * def.systems) / 100,
  );
  const layout = generatePositions(
    createRng(`layout:${galaxyId}`),
    def.systems,
    type,
    drifterCount,
  );
  const nameOffset = Math.floor(rng() * NAME_SPACE);
  const systems: StarSystem[] = layout.systems.map((pos, i) => {
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
    // Les étoiles AVANT les corps : c'est l'inversion de causalité de l'ADR 0021. Leur
    // luminosité place la zone habitable, qui décide de ce qu'on trouve à chaque orbite.
    const stars = generateStars(rng, system);
    system.stars = stars;
    const bodies = generateBodies(rng, system, stars, def.depositBonus);
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

  // Les errants s'ajoutent APRÈS l'ancre et le barycentre, et AVANT `generateLinks`.
  //
  // Après, parce qu'ils vivent dans le halo : le plus excentré des systèmes serait presque
  // toujours l'un d'eux, et le point d'arrivée des portails inter-galactiques deviendrait
  // un trou noir sans monde ni comptoir.
  //
  // Avant, parce que ce sont des destinations et non du décor — c'est le graphe de sauts
  // qui le rend vrai. Leurs noms continuent la même suite bijective que les systèmes
  // ordinaires, donc sans doublon.
  const drifters = layout.drifters.map((pos, i) =>
    makeDrifter(rng, galaxyId, seriesName(nameOffset, def.systems + i), pos, i),
  );
  systems.push(...drifters);
  const links = generateLinks(systems);

  return {
    id: galaxyId,
    name: def.name,
    x: def.x,
    y: def.y,
    z: def.z,
    typeId: def.typeId,
    systems,
    links,
    bridges: pairBridges(drifters, links),
    anchorSystemId: anchor.id,
    depositBonus: def.depositBonus,
  };
}

/**
 * Types tirables pour un errant, **dérivés des catalogues** plutôt que redéclarés à côté
 * d'eux : ajouter un type à `black-hole-types.ts` ou `white-hole-types.ts` avec un poids
 * `drifter` suffit à le rendre tirable, sans penser à un second endroit.
 */
type SingularityDraw = readonly (readonly [
  {
    kind: CentralBodyKind;
    typeId: string;
    massRange: readonly [number, number];
  },
  number,
])[];

function singularitiesFor(placement: BlackHolePlacement): SingularityDraw {
  return [
    ...Object.values(BLACK_HOLE_TYPES)
      .filter((d) => d.placements.includes(placement))
      .map(
        (d) =>
          [
            {
              kind: "blackHole" as const,
              typeId: d.id,
              massRange: d.massRange,
            },
            d.weights[placement] ?? 0,
          ] as const,
      ),
    ...Object.values(WHITE_HOLE_TYPES)
      .filter((d) => d.placements.includes(placement))
      .map(
        (d) =>
          [
            {
              kind: "whiteHole" as const,
              typeId: d.id,
              massRange: d.massRange,
            },
            d.weights[placement] ?? 0,
          ] as const,
      ),
  ];
}

const DRIFTER_WEIGHTS = singularitiesFor("drifter");
const PRIMARY_SINGULARITIES = singularitiesFor("primary");
const COMPANION_SINGULARITIES = singularitiesFor("companion");

/**
 * Un errant : système sans étoile, sans monde et sans comptoir, dont l'unique corps central
 * est une singularité.
 *
 * Il n'a ni planète ni ceinture à dessein — ce n'est pas un système appauvri mais un objet
 * d'une autre nature, qui se traverse et s'exploite au lieu de se coloniser. Le brouillard
 * le traite comme n'importe quel système : inexploré, il n'annonce rien de ce qu'il abrite.
 */
function makeDrifter(
  rng: Rng,
  galaxyId: string,
  name: string,
  pos: Point,
  index: number,
): StarSystem {
  const pickedType = pickWeighted(rng, DRIFTER_WEIGHTS);
  const id = `${galaxyId}-drift-${index}`;
  const [minMass, maxMass] = pickedType.massRange;
  return {
    id,
    name,
    x: pos.x,
    y: pos.y,
    z: pos.z,
    stars: [
      {
        id: `${id}-s1`,
        systemId: id,
        // Convention astronomique des systèmes multiples, tenue dès le premier corps :
        // le palier 2 ajoutera B et C sans rien renommer.
        name: `${name} A`,
        kind: pickedType.kind,
        typeId: pickedType.typeId,
        rank: 0,
        mass: Math.round((minMass + rng() * (maxMass - minMass)) * 100) / 100,
        // Ancre : à l'origine du repère du système, ce que `bodyPositionAt` suppose déjà.
        orbitRadius: 0,
        orbitAngle: 0,
        inclination: 0,
        ascendingNode: 0,
      },
    ],
    planets: [],
    belts: [],
  };
}

/**
 * Apparie les bouches d'errants en ponts d'Einstein-Rosen.
 *
 * Un pont relie une fontaine blanche à un trou noir **de la même galaxie**, séparés d'un
 * nombre de sauts qui tombe dans la `wormholeRange` du type de la fontaine : c'est ce qui
 * fait qu'un pont est un raccourci et non un doublon d'une liaison existante. Sur un
 * diamètre médian de 59 sauts (ADR 0018), une fontaine « stable » cherche entre 20 et 40.
 *
 * La distance se mesure en sauts et non en unités d'espace, parce que c'est en sauts que le
 * joueur paie. Un BFS par fontaine, sur quelques fontaines et cinq cents nœuds : le coût
 * est négligeable devant le reste de la génération, et il évite d'apparier deux bouches que
 * trois sauts séparent déjà.
 *
 * Une fontaine sans partenaire à portée reste une fontaine — elle rend sa matière exotique
 * sans ouvrir de passage. C'est un résultat acceptable, pas un échec à réessayer.
 */
function pairBridges(
  drifters: readonly StarSystem[],
  links: readonly [string, string][],
): [string, string][] {
  const mouths = drifters.filter((d) => d.stars?.[0]?.kind === "whiteHole");
  const sinks = drifters.filter((d) => d.stars?.[0]?.kind === "blackHole");
  if (mouths.length === 0 || sinks.length === 0) return [];

  const adjacency = new Map<string, string[]>();
  for (const [a, b] of links) {
    (adjacency.get(a) ?? adjacency.set(a, []).get(a)!).push(b);
    (adjacency.get(b) ?? adjacency.set(b, []).get(b)!).push(a);
  }

  const taken = new Set<string>();
  const bridges: [string, string][] = [];
  for (const mouth of mouths) {
    const [minHops, maxHops] = whiteHoleType(
      mouth.stars![0]!.typeId,
    ).wormholeRange;
    const candidates = new Set(
      sinks.filter((s) => !taken.has(s.id)).map((s) => s.id),
    );
    if (candidates.size === 0) break;

    // BFS borné : au-delà de `maxHops` aucun candidat ne convient plus, inutile de
    // parcourir le reste de la galaxie.
    const seen = new Set([mouth.id]);
    let frontier = [mouth.id];
    let hops = 0;
    let partner: string | null = null;
    while (frontier.length > 0 && hops < maxHops && partner === null) {
      hops++;
      const next: string[] = [];
      for (const id of frontier) {
        for (const neighbor of adjacency.get(id) ?? []) {
          if (seen.has(neighbor)) continue;
          seen.add(neighbor);
          if (hops >= minHops && candidates.has(neighbor)) {
            partner = neighbor;
            break;
          }
          next.push(neighbor);
        }
        if (partner !== null) break;
      }
      frontier = next;
    }

    if (partner !== null) {
      taken.add(partner);
      // Paire canonique (a < b), comme `generateLinks` la produit — la clé primaire de
      // `universe_bridges` en dépend.
      bridges.push(
        mouth.id < partner ? [mouth.id, partner] : [partner, mouth.id],
      );
    }
  }
  return bridges;
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
