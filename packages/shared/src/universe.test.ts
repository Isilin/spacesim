import { describe, expect, it } from "vitest";
import { GALAXY_SPACING, INITIAL_GALAXIES } from "./constants.js";
import {
  allPlanets,
  allSystems,
  findGalaxyOfSystem,
  galaxyDefAt,
  generateGalaxyAt,
  generateUniverse,
} from "./universe.js";

describe("generateUniverse", () => {
  it("est déterministe pour une même seed", () => {
    const a = generateUniverse("alpha");
    const b = generateUniverse("alpha");
    expect(a).toEqual(b);
  });

  it("diffère selon la seed", () => {
    const a = generateUniverse("alpha");
    const b = generateUniverse("beta");
    expect(a).not.toEqual(b);
  });

  it("produit INITIAL_GALAXIES galaxies par défaut, avec des systèmes uniques", () => {
    const u = generateUniverse("gamma");
    expect(u.galaxies).toHaveLength(INITIAL_GALAXIES);
    const ids = allSystems(u).map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
    // La galaxie d'origine est la plus vaste : c'est le berceau des empires.
    expect(u.galaxies[0]!.systems.length).toBeGreaterThan(u.galaxies[1]!.systems.length);
  });

  it("génère planètes en orbite, lunes rattachées et ceintures", () => {
    const u = generateUniverse("gamma");
    const planets = allPlanets(u);
    const moons = planets.filter((p) => p.kind === "moon");
    expect(moons.length).toBeGreaterThan(0);
    for (const moon of moons) {
      const parent = planets.find((p) => p.id === moon.parentPlanetId);
      expect(parent).toBeDefined();
      expect(parent!.kind).toBe("planet");
      expect(moon.systemId).toBe(parent!.systemId);
      expect(moon.habitability).toBeLessThanOrEqual(40);
    }
    for (const p of planets) {
      expect(p.habitability).toBeGreaterThanOrEqual(0);
      expect(p.habitability).toBeLessThanOrEqual(100);
      expect(p.orbitRadius).toBeGreaterThan(0);
    }
    expect(allSystems(u).some((s) => s.belts.length > 0)).toBe(true);
  });

  it("chaque galaxie a un graphe connexe", () => {
    const u = generateUniverse("delta");
    for (const galaxy of u.galaxies) {
      const adjacency = new Map<string, string[]>();
      for (const [a, b] of galaxy.links) {
        adjacency.set(a, [...(adjacency.get(a) ?? []), b]);
        adjacency.set(b, [...(adjacency.get(b) ?? []), a]);
      }
      const visited = new Set<string>();
      const queue = [galaxy.systems[0]!.id];
      while (queue.length > 0) {
        const id = queue.pop()!;
        if (visited.has(id)) continue;
        visited.add(id);
        queue.push(...(adjacency.get(id) ?? []));
      }
      expect(visited.size).toBe(galaxy.systems.length);
    }
  });

  it("findGalaxyOfSystem retrouve la bonne galaxie", () => {
    const u = generateUniverse("delta");
    const sys = u.galaxies[1]!.systems[0]!;
    expect(findGalaxyOfSystem(u, sys.id)?.id).toBe(u.galaxies[1]!.id);
    expect(findGalaxyOfSystem(u, "nope")).toBeUndefined();
  });
});

describe("univers extensible (chantier 9)", () => {
  it("une galaxie se génère seule, identique à sa version dans l'univers complet", () => {
    const u = generateUniverse("epsilon", 5);
    for (let i = 0; i < 5; i++) {
      expect(generateGalaxyAt("epsilon", i)).toEqual(u.galaxies[i]);
    }
  });

  it("agrandir l'univers laisse les galaxies existantes strictement inchangées", () => {
    const small = generateUniverse("zeta", 3);
    const large = generateUniverse("zeta", 12);
    expect(large.galaxies).toHaveLength(12);
    expect(large.galaxies.slice(0, 3)).toEqual(small.galaxies);
  });

  it("s'étend loin sans collision : ids et noms de galaxie restent uniques", () => {
    const u = generateUniverse("eta", 40);
    const ids = u.galaxies.map((g) => g.id);
    const names = u.galaxies.map((g) => g.name);
    expect(new Set(ids).size).toBe(40);
    expect(new Set(names).size).toBe(40);
    // Systèmes : ids uniques dans tout l'univers, noms uniques dans chaque galaxie.
    const systemIds = allSystems(u).map((s) => s.id);
    expect(new Set(systemIds).size).toBe(systemIds.length);
    for (const galaxy of u.galaxies) {
      const systemNames = galaxy.systems.map((s) => s.name);
      expect(new Set(systemNames).size).toBe(systemNames.length);
    }
  });

  it("les galaxies s'espacent sur la spirale sans se chevaucher", () => {
    const defs = Array.from({ length: 60 }, (_, i) => galaxyDefAt("theta", i));
    let closest = Infinity;
    for (let i = 0; i < defs.length; i++) {
      for (let j = i + 1; j < defs.length; j++) {
        closest = Math.min(closest, Math.hypot(defs[i]!.x - defs[j]!.x, defs[i]!.y - defs[j]!.y));
      }
    }
    // Densité constante : les voisines restent à peu près à un espacement l'une de l'autre.
    expect(closest).toBeGreaterThan(GALAXY_SPACING * 0.7);
  });

  it("les gisements s'enrichissent avec l'éloignement, jusqu'à un plafond", () => {
    const home = galaxyDefAt("iota", 0);
    const near = galaxyDefAt("iota", 4);
    const far = galaxyDefAt("iota", 30);
    expect(home.depositBonus).toBe(1);
    expect(near.depositBonus).toBeGreaterThan(home.depositBonus);
    expect(far.depositBonus).toBeGreaterThan(near.depositBonus);
    expect(far.depositBonus).toBeLessThanOrEqual(3);
  });

  it("galaxyDefAt est déterministe et dépend de la seed", () => {
    expect(galaxyDefAt("kappa", 7)).toEqual(galaxyDefAt("kappa", 7));
    // Même géométrie (l'index fixe la position), mais nom et taille dépendent de la seed.
    expect(galaxyDefAt("kappa", 7).name).not.toBe(galaxyDefAt("lambda", 7).name);
  });
});
