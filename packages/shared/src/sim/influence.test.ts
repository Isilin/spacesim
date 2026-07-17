import { describe, expect, it } from "vitest";
import type { Colony } from "../types.js";
import { emptyResources } from "./colony.js";
import {
  CLAIM_UPKEEP,
  colonizeInfluenceCost,
  influencePerTick,
  INFLUENCE_PER_COLONIST,
  MONUMENT_INFLUENCE,
  repBonus,
} from "./influence.js";

function makeColony(overrides: Partial<Colony> = {}): Colony {
  return {
    id: "c1",
    planetId: "p1",
    name: "Base",
    resources: emptyResources(),
    buildings: {},
    queue: [],
    population: 100,
    satisfaction: 80,
    ships: {},
    shipsBusy: [],
    shipQueue: [],
    ...overrides,
  };
}

describe("colonizeInfluenceCost", () => {
  it("première colonie gratuite, puis coût croissant", () => {
    expect(colonizeInfluenceCost(0)).toBe(0);
    expect(colonizeInfluenceCost(1)).toBe(20);
    expect(colonizeInfluenceCost(2)).toBe(30);
    expect(colonizeInfluenceCost(3)).toBe(45);
    expect(colonizeInfluenceCost(4)).toBeGreaterThan(colonizeInfluenceCost(3));
  });
});

describe("influencePerTick", () => {
  it("population satisfaite + monuments − entretien des claims", () => {
    const colony = makeColony({ buildings: { monument: 2 } });
    const net = influencePerTick([colony], 3);
    const expected = 100 * 0.8 * INFLUENCE_PER_COLONIST + 2 * MONUMENT_INFLUENCE - 3 * CLAIM_UPKEEP;
    expect(net).toBeCloseTo(expected);
  });

  it("peut être négative (trop de claims pour l'assise)", () => {
    const colony = makeColony({ population: 1, satisfaction: 50 });
    expect(influencePerTick([colony], 10)).toBeLessThan(0);
  });
});

describe("repBonus", () => {
  it("paliers de remise", () => {
    expect(repBonus(0)).toBe(0);
    expect(repBonus(99)).toBe(0);
    expect(repBonus(100)).toBe(0.05);
    expect(repBonus(300)).toBe(0.1);
    expect(repBonus(799)).toBe(0.1);
    expect(repBonus(800)).toBe(0.15);
    expect(repBonus(5000)).toBe(0.15);
  });
});
