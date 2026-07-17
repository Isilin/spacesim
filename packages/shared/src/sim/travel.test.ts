import { describe, expect, it } from "vitest";
import { TRANSFER_BASE_MS, TRANSFER_MS_PER_JUMP } from "../constants.js";
import type { Galaxy, Universe } from "../types.js";
import { jumpDistance, jumpDistanceInUniverse, transferDurationMs } from "./travel.js";

function makeGalaxy(id: string, systemIds: string[], links: [string, string][]): Galaxy {
  return {
    id,
    name: id,
    x: 0,
    y: 0,
    systems: systemIds.map((sid) => ({ id: sid, name: sid, x: 0, y: 0, planets: [], belts: [] })),
    links,
    anchorSystemId: systemIds[0]!,
    depositBonus: 1,
  };
}

// a—b—c—d, plus raccourci a—c
const galaxy = makeGalaxy("g1", ["a", "b", "c", "d"], [
  ["a", "b"],
  ["b", "c"],
  ["c", "d"],
  ["a", "c"],
]);

const universe: Universe = {
  seed: "t",
  galaxies: [galaxy, makeGalaxy("g2", ["z"], [])],
};

describe("jumpDistance", () => {
  it("même système = 0", () => {
    expect(jumpDistance(galaxy, "a", "a")).toBe(0);
  });

  it("prend le plus court chemin", () => {
    expect(jumpDistance(galaxy, "a", "d")).toBe(2); // a→c→d
    expect(jumpDistance(galaxy, "b", "d")).toBe(2);
  });

  it("-1 si inaccessible", () => {
    expect(jumpDistance(galaxy, "a", "zzz")).toBe(-1);
  });
});

describe("jumpDistanceInUniverse", () => {
  it("route dans la même galaxie", () => {
    expect(jumpDistanceInUniverse(universe, "a", "d")).toBe(2);
  });

  it("-1 entre galaxies sans portail", () => {
    expect(jumpDistanceInUniverse(universe, "a", "z")).toBe(-1);
  });

  it("traverse les galaxies via une liaison de portail", () => {
    // Portail a ↔ z : b → a → z = 2 sauts.
    expect(jumpDistanceInUniverse(universe, "b", "z", [["a", "z"]])).toBe(2);
    expect(jumpDistanceInUniverse(universe, "a", "z", [["a", "z"]])).toBe(1);
  });
});

describe("transferDurationMs", () => {
  it("croît avec la distance", () => {
    expect(transferDurationMs(0)).toBe(TRANSFER_BASE_MS);
    expect(transferDurationMs(3)).toBe(TRANSFER_BASE_MS + 3 * TRANSFER_MS_PER_JUMP);
  });
});
