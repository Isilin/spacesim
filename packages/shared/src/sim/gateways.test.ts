import { describe, expect, it } from "vitest";
import { generateUniverse } from "../universe.js";
import type { Gateway } from "../model/universe.js";
import {
  GATEWAY_COST,
  galaxyLinks,
  galaxyParentIndex,
  gatewayCovered,
  gatewayLinks,
  gatewayProgressRatio,
  gatewayRemaining,
} from "./gateways.js";

function makeGateway(overrides: Partial<Gateway> = {}): Gateway {
  return { galaxyId: "gal-1", progress: {}, activatesAt: null, active: false, ...overrides };
}

describe("gatewayRemaining / gatewayCovered", () => {
  it("neuf : tout reste à livrer", () => {
    const gateway = makeGateway();
    expect(gatewayRemaining(gateway)).toEqual(GATEWAY_COST);
    expect(gatewayCovered(gateway)).toBe(false);
    expect(gatewayProgressRatio(gateway)).toBe(0);
  });

  it("couvert quand toutes les ressources sont livrées", () => {
    const gateway = makeGateway({ progress: { ...GATEWAY_COST } });
    expect(gatewayCovered(gateway)).toBe(true);
    expect(gatewayProgressRatio(gateway)).toBe(1);
  });

  it("progression partielle pondérée", () => {
    const gateway = makeGateway({ progress: { metals: GATEWAY_COST.metals } });
    expect(gatewayCovered(gateway)).toBe(false);
    const ratio = gatewayProgressRatio(gateway);
    expect(ratio).toBeGreaterThan(0);
    expect(ratio).toBeLessThan(1);
  });
});

describe("arbre inter-galactique", () => {
  it("la mère n'a pas de parente, chaque autre galaxie en a une d'index inférieur", () => {
    const universe = generateUniverse("tree", 12);
    expect(galaxyParentIndex(universe, 0)).toBeNull();
    for (let i = 1; i < universe.galaxies.length; i++) {
      const parent = galaxyParentIndex(universe, i);
      expect(parent).not.toBeNull();
      expect(parent!).toBeLessThan(i);
    }
  });

  it("en remontant les parents on atteint toujours la mère (arbre connexe)", () => {
    const universe = generateUniverse("connexe", 20);
    for (let i = 1; i < universe.galaxies.length; i++) {
      let cur = i;
      let hops = 0;
      while (cur !== 0 && hops <= universe.galaxies.length) {
        cur = galaxyParentIndex(universe, cur)!;
        hops++;
      }
      expect(cur).toBe(0);
    }
  });

  it("galaxyLinks : une arête par galaxie (hors mère), reliant des voisines", () => {
    const universe = generateUniverse("liens", 8);
    const links = galaxyLinks(universe);
    expect(links).toHaveLength(7);
    for (const link of links) {
      expect(link.parentIndex).toBeLessThan(link.childIndex);
      expect(link.parent.id).toBe(universe.galaxies[link.parentIndex]!.id);
    }
  });
});

describe("gatewayLinks", () => {
  it("un portail actif relie l'ancrage de la galaxie à celui de sa PARENTE", () => {
    const universe = generateUniverse("gates", 5);
    const inactive = makeGateway({ galaxyId: universe.galaxies[1]!.id });
    expect(gatewayLinks(universe, [inactive])).toEqual([]);

    // Galaxie 1 : sa parente est forcément la mère (seul index inférieur).
    const active1 = makeGateway({ galaxyId: universe.galaxies[1]!.id, active: true });
    expect(gatewayLinks(universe, [active1])).toEqual([
      [universe.galaxies[0]!.anchorSystemId, universe.galaxies[1]!.anchorSystemId],
    ]);

    // Une galaxie plus lointaine relie sa propre parente, pas nécessairement la mère.
    const far = 4;
    const parent = galaxyParentIndex(universe, far)!;
    const active = makeGateway({ galaxyId: universe.galaxies[far]!.id, active: true });
    expect(gatewayLinks(universe, [active])).toEqual([
      [universe.galaxies[parent]!.anchorSystemId, universe.galaxies[far]!.anchorSystemId],
    ]);
  });
});

describe("génération — galaxies lointaines plus riches", () => {
  it("depositBonus appliqué", () => {
    const universe = generateUniverse("rich");
    expect(universe.galaxies[0]!.depositBonus).toBe(1);
    expect(universe.galaxies[1]!.depositBonus).toBe(1.5);
    // Moyenne des gisements de minerai nettement supérieure dans la galaxie bonus.
    const avg = (gi: number) => {
      const values = universe.galaxies[gi]!.systems.flatMap((s) => s.planets)
        .map((p) => p.deposits.ore ?? 0)
        .filter((v) => v > 0);
      return values.reduce((a, b) => a + b, 0) / values.length;
    };
    expect(avg(1)).toBeGreaterThan(avg(0) * 1.2);
  });

  it("chaque galaxie a un ancrage valide", () => {
    const universe = generateUniverse("anchor");
    for (const galaxy of universe.galaxies) {
      expect(galaxy.systems.some((s) => s.id === galaxy.anchorSystemId)).toBe(true);
    }
  });
});
