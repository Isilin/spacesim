import { describe, expect, it } from "vitest";
import { generateUniverse } from "../../universe.js";
import { contiguousClaims, isFrontierSystem, systemNeighbors } from "./territory.js";

describe("territoire — adjacence & contiguïté", () => {
  const universe = generateUniverse("terr-seed");
  const galaxy = universe.galaxies[0]!;

  it("systemNeighbors est symétrique avec les links de la galaxie", () => {
    const [a, b] = galaxy.links[0]!;
    expect(systemNeighbors(galaxy, a)).toContain(b);
    expect(systemNeighbors(galaxy, b)).toContain(a);
  });

  it("deux systèmes reliés et revendiqués sont contigus ; un isolé ne l'est pas", () => {
    const [a, b] = galaxy.links[0]!;
    // Un système non relié à a/b (au pire, lui-même sans voisin revendiqué).
    const isolated = galaxy.systems.find((s) => s.id !== a && s.id !== b)!.id;

    const contiguous = contiguousClaims(universe, [a, b, isolated]);
    expect(contiguous.has(a)).toBe(true);
    expect(contiguous.has(b)).toBe(true);
    // `isolated` n'est contigu que s'il jouxte par hasard a ou b ; sinon exclu.
    const neighborsOfIsolated = systemNeighbors(galaxy, isolated);
    const touchesClaim = neighborsOfIsolated.includes(a) || neighborsOfIsolated.includes(b);
    expect(contiguous.has(isolated)).toBe(touchesClaim);
  });

  it("un seul système revendiqué n'est jamais contigu", () => {
    const only = galaxy.systems[0]!.id;
    expect(contiguousClaims(universe, [only]).size).toBe(0);
  });

  it("un système revendiqué au bord du territoire est une frontière", () => {
    const only = galaxy.systems.find((s) => systemNeighbors(galaxy, s.id).length > 0)!.id;
    // Revendiqué seul → tous ses voisins sont non-revendiqués → frontière.
    expect(isFrontierSystem(universe, [only], only)).toBe(true);
  });
});
