import { describe, expect, it } from "vitest";
import { TRANSFER_BASE_MS, TRANSFER_MS_PER_JUMP } from "../constants.js";
import { SHIPS } from "../content/ships.js";
import type { Galaxy, Universe } from "../types.js";
import {
  convoyCapacity,
  convoyDurationMs,
  convoyFees,
  convoyFuel,
  jumpDistance,
  jumpDistanceInUniverse,
  transferCostCredits,
  transferDurationMs,
} from "./travel.js";

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

describe("convois (chantier 12)", () => {
  it("un convoi avance à l'allure de son vaisseau le plus lent", () => {
    const rapide = convoyDurationMs(3, { courier: 1 });
    const lourd = convoyDurationMs(3, { hauler: 1 });
    const mixte = convoyDurationMs(3, { courier: 1, hauler: 1 });
    expect(rapide).toBeLessThan(lourd);
    // Le courrier ne tire pas le transporteur : c'est le plus lent qui impose le rythme.
    expect(mixte).toBe(lourd);
  });

  it("sans vaisseau précisé, on retombe sur le barème abstrait", () => {
    expect(convoyDurationMs(4)).toBe(transferDurationMs(4));
  });

  it("le carburant croît avec la distance, la flotte et la masse", () => {
    const base = convoyFuel(1, { cargo_small: 1 });
    expect(convoyFuel(3, { cargo_small: 1 })).toBeGreaterThan(base);
    expect(convoyFuel(1, { cargo_small: 2 })).toBeGreaterThan(base);
    expect(convoyFuel(1, { cargo_small: 1 }, 500)).toBeGreaterThan(base);
    // Un convoi vide ne consomme rien.
    expect(convoyFuel(3, {})).toBe(0);
  });

  it("les péages de portail s'ajoutent aux frais de distance", () => {
    const sansPortail = convoyFees(5);
    expect(convoyFees(5, 1)).toBeGreaterThan(sansPortail);
    expect(convoyFees(5, 2) - convoyFees(5, 1)).toBe(convoyFees(5, 1) - sansPortail);
    expect(sansPortail).toBe(transferCostCredits(5));
  });

  it("la capacité additionne les soutes du convoi", () => {
    expect(convoyCapacity({ cargo_small: 2, hauler: 1 })).toBe(
      2 * SHIPS.cargo_small.capacity + SHIPS.hauler.capacity,
    );
    expect(convoyCapacity({})).toBe(0);
  });

  it("les classes arbitrent volume contre vitesse", () => {
    // Le transporteur emporte le plus, le courrier arrive le premier.
    expect(SHIPS.hauler.capacity).toBeGreaterThan(SHIPS.cargo_large.capacity);
    expect(SHIPS.courier.speedMult).toBeLessThan(SHIPS.cargo_small.speedMult);
    expect(SHIPS.hauler.fuelPerJump).toBeGreaterThan(SHIPS.courier.fuelPerJump);
  });
});
