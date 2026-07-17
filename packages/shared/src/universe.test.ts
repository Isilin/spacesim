import { describe, expect, it } from "vitest";
import { allPlanets, allSystems, findGalaxyOfSystem, generateUniverse } from "./universe.js";

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

  it("produit 3 galaxies avec des systèmes uniques", () => {
    const u = generateUniverse("gamma");
    expect(u.galaxies).toHaveLength(3);
    const ids = allSystems(u).map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
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
