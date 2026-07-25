import { describe, expect, it } from "vitest";
import type { Contract } from "../types.js";
import { generateUniverse } from "../universe.js";
import { galaxyActivity, normalizedActivity } from "./economicZones.js";

const universe = generateUniverse("zones-test", 3);

function makeContract(overrides: Partial<Contract> = {}): Contract {
  return {
    id: "c1",
    issuerId: "empire-1",
    issuerName: "Empire",
    issuerColor: "#fff",
    colonyId: "colony-1",
    colonyName: "Colonie",
    systemId: universe.galaxies[0]!.systems[0]!.id,
    resource: "metals",
    quantity: 10,
    remaining: 10,
    pricePerUnit: 5,
    createdAt: 0,
    deadline: 100_000,
    status: "open",
    ...overrides,
  };
}

describe("galaxyActivity", () => {
  it("ignore les contrats non ouverts", () => {
    const contracts = [makeContract({ status: "fulfilled" }), makeContract({ status: "expired" })];
    expect(galaxyActivity(contracts, universe).size).toBe(0);
  });

  it("somme la valeur (reliquat × prix) des contrats ouverts d'une galaxie", () => {
    const galaxy0System = universe.galaxies[0]!.systems[0]!.id;
    const contracts = [
      makeContract({ systemId: galaxy0System, remaining: 10, pricePerUnit: 5 }),
      makeContract({ id: "c2", systemId: galaxy0System, remaining: 4, pricePerUnit: 2 }),
    ];
    const activity = galaxyActivity(contracts, universe);
    expect(activity.get(universe.galaxies[0]!.id)).toBe(10 * 5 + 4 * 2);
  });

  it("distingue les galaxies entre elles", () => {
    const contracts = [
      makeContract({
        systemId: universe.galaxies[0]!.systems[0]!.id,
        remaining: 10,
        pricePerUnit: 1,
      }),
      makeContract({
        id: "c2",
        systemId: universe.galaxies[1]!.systems[0]!.id,
        remaining: 20,
        pricePerUnit: 1,
      }),
    ];
    const activity = galaxyActivity(contracts, universe);
    expect(activity.get(universe.galaxies[0]!.id)).toBe(10);
    expect(activity.get(universe.galaxies[1]!.id)).toBe(20);
  });

  it("ignore un systemId qui n'appartient à aucune galaxie connue", () => {
    const contracts = [makeContract({ systemId: "systeme-fantome" })];
    expect(galaxyActivity(contracts, universe).size).toBe(0);
  });
});

describe("normalizedActivity", () => {
  it("carte vide sans activité", () => {
    expect(normalizedActivity(new Map()).size).toBe(0);
  });

  it("la galaxie la plus active vaut 1, les autres une fraction", () => {
    const activity = new Map([
      ["gal-a", 100],
      ["gal-b", 25],
    ]);
    const normalized = normalizedActivity(activity);
    expect(normalized.get("gal-a")).toBe(1);
    expect(normalized.get("gal-b")).toBe(0.25);
  });
});
