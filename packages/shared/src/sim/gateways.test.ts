import { describe, expect, it } from "vitest";
import { generateUniverse } from "../universe.js";
import type { Gateway } from "../types.js";
import {
  GATEWAY_COST,
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

describe("gatewayLinks", () => {
  it("relie les ancrages quand le portail est actif", () => {
    const universe = generateUniverse("gates");
    const inactive = makeGateway({ galaxyId: universe.galaxies[1]!.id });
    expect(gatewayLinks(universe, [inactive])).toEqual([]);
    const active = makeGateway({ galaxyId: universe.galaxies[1]!.id, active: true });
    expect(gatewayLinks(universe, [active])).toEqual([
      [universe.galaxies[0]!.anchorSystemId, universe.galaxies[1]!.anchorSystemId],
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
      const values = universe.galaxies[gi]!.systems
        .flatMap((s) => s.planets)
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
