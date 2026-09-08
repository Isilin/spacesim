import { describe, expect, it } from "vitest";
import { DEFAULT_BALANCE } from "../../balance.js";
import type { ClientUniverse, Galaxy } from "../../model/universe.js";
import { allSystems, generateUniverse } from "../../universe.js";
import {
  colonyShipDurationMs,
  probeDurationMs,
  redactUniverse,
} from "./fog.js";

describe("redactUniverse", () => {
  it("masque corps et ceintures des systèmes non explorés, garde nom et position", () => {
    const universe = generateUniverse("fog");
    const first = allSystems(universe)[0]!;
    const explored = new Set([first.id]);
    const redacted = redactUniverse(universe, explored);

    for (const sys of allSystems(redacted)) {
      if (sys.id === first.id) {
        expect(sys.planets.length).toBeGreaterThan(0);
      } else {
        expect(sys.planets).toHaveLength(0);
        expect(sys.belts).toHaveLength(0);
        expect(sys.name).toBeTruthy();
      }
    }
    // L'original n'est pas muté.
    expect(
      allSystems(universe).filter((s) => s.planets.length > 0).length,
    ).toBeGreaterThan(1);
  });
});

describe("durées injectées (chantier 23.8)", () => {
  it("probeDurationMs/colonyShipDurationMs suivent un bundle de constantes différent des défauts", () => {
    const customBalance = {
      ...DEFAULT_BALANCE,
      probeBaseMs: 1,
      colonyShipBaseMs: 2,
    };
    expect(probeDurationMs(0, customBalance)).toBe(1);
    expect(colonyShipDurationMs(0, customBalance)).toBe(2);
    expect(probeDurationMs(0)).toBe(DEFAULT_BALANCE.probeBaseMs);
  });
});

describe("brouillard des singularités (chantier 45.1)", () => {
  /**
   * La variété du ciel est une récompense d'exploration, pas un décor offert au premier
   * regard (chantier 35). Un errant est un système comme un autre de ce point de vue :
   * tant qu'il n'est pas exploré, rien ne doit dire qu'il abrite un trou noir — et la
   * teinte de son nœud sur la carte le dirait, puisqu'elle se lit de `stars`.
   */
  const universe = generateUniverse("brouillard-45", 2);
  const client: ClientUniverse = { galaxies: universe.galaxies };
  const drifterOf = (galaxy: Galaxy) =>
    galaxy.systems.find((s) => (s.stars?.length ?? 0) > 0)!;

  it("un système inexploré ne montre aucun corps central", () => {
    const cut = redactUniverse(client, new Set());
    for (const galaxy of cut.galaxies) {
      for (const system of galaxy.systems) {
        expect(system.stars, system.id).toBeUndefined();
      }
    }
  });

  it("un errant exploré montre le sien", () => {
    const drifter = drifterOf(universe.galaxies[0]!);
    const cut = redactUniverse(client, new Set([drifter.id]));
    const seen = cut.galaxies[0]!.systems.find((s) => s.id === drifter.id)!;
    expect(seen.stars).toHaveLength(1);
    expect(seen.stars![0]!.typeId).toBe(drifter.stars![0]!.typeId);
  });

  it("une galaxie condensée ne livre pas ses ponts", () => {
    // Ils pointeraient vers des systèmes qui ne sont plus transmis, et diraient où sont
    // les singularités d'une galaxie qu'on ne peut même pas atteindre.
    const home = new Set([universe.galaxies[0]!.id]);
    const cut = redactUniverse(client, new Set(), home);
    const distant = cut.galaxies.find(
      (g) => g.id !== universe.galaxies[0]!.id,
    )!;
    expect(distant.bridges).toHaveLength(0);
  });
});
