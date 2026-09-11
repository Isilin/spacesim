import { describe, expect, it } from "vite-plus/test";
import { allSystems, generateUniverse } from "../../universe.js";
import { crossersOf } from "./crossers.js";

describe("crossersOf (chantier 50.8)", () => {
  const systems = allSystems(generateUniverse("geocroiseurs", 1));
  const peopled = systems.find((s) => s.planets.length > 0)!;

  it("est déterministe : même système, mêmes géocroiseurs", () => {
    expect(crossersOf(peopled)).toEqual(crossersOf(peopled));
  });

  it("chacun coupe l'orbite de sa planète, du périastre à l'apoastre", () => {
    let seen = 0;
    for (const system of systems) {
      for (const crosser of crossersOf(system)) {
        seen++;
        const target = system.planets.find((p) => p.id === crosser.crossesId)!;
        const { orbitRadius: a, eccentricity: e } = crosser;
        expect(a * (1 - e)).toBeLessThan(target.orbitRadius);
        expect(a * (1 + e)).toBeGreaterThan(target.orbitRadius);
        expect(e).toBeGreaterThanOrEqual(0.15 - 1e-9);
        expect(e).toBeLessThanOrEqual(0.4 + 1e-9);
      }
    }
    // Sans quoi le cas précédent passerait à vide.
    expect(seen).toBeGreaterThan(systems.length / 2);
  });

  it("au plus deux par système, et aucun là où il n'y a pas de planète", () => {
    for (const system of systems) {
      expect(crossersOf(system).length).toBeLessThanOrEqual(2);
      if (!system.planets.some((p) => p.kind === "planet")) {
        expect(crossersOf(system)).toEqual([]);
      }
    }
  });

  it("n'en révèle aucun dans un système que le brouillard vide de ses planètes", () => {
    expect(crossersOf({ ...peopled, planets: [] })).toEqual([]);
  });
});
