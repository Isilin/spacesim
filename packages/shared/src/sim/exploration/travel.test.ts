import { describe, expect, it } from "vitest";
import {
  GATEWAY_JUMP_WEIGHT,
  JUMP_REFERENCE_LENGTH,
  TRANSFER_BASE_MS,
  TRANSFER_MS_PER_JUMP,
} from "../../constants.js";
import { SHIPS } from "../../content/ships.js";
import type { Galaxy, Universe } from "../../model/universe.js";
import {
  convoyCapacity,
  convoyDurationMs,
  convoyFees,
  convoyFuel,
  travelCostInGalaxy,
  travelCostInUniverse,
  legacyConvoyStat,
  transferCostCredits,
  transferDurationMs,
} from "./travel.js";

type SystemSpec = { id: string; x: number; y?: number; z?: number };

function makeGalaxy(
  id: string,
  specs: SystemSpec[],
  links: [string, string][],
): Galaxy {
  return {
    id,
    name: id,
    x: 0,
    y: 0,
    z: 0,
    systems: specs.map((s) => ({
      id: s.id,
      name: s.id,
      x: s.x,
      y: s.y ?? 0,
      z: s.z ?? 0,
      planets: [],
      belts: [],
    })),
    links,
    anchorSystemId: specs[0]!.id,
    depositBonus: 1,
  };
}

const R = JUMP_REFERENCE_LENGTH;

/**
 * Chaîne a—b—c—d dont chaque arête mesure exactement `JUMP_REFERENCE_LENGTH` : chaque
 * saut pèse donc 1, et le coût pondéré doit retomber sur le compte de sauts d'avant le
 * chantier 31.6. C'est le harnais de non-régression du passage BFS → Dijkstra.
 */
const uniforme = makeGalaxy(
  "g1",
  [
    { id: "a", x: 0 },
    { id: "b", x: R },
    { id: "c", x: 2 * R },
    { id: "d", x: 3 * R },
  ],
  [
    ["a", "b"],
    ["b", "c"],
    ["c", "d"],
  ],
);

const universe: Universe = {
  seed: "t",
  galaxies: [uniforme, makeGalaxy("g2", [{ id: "z", x: 500_000 }], [])],
};

describe("travelCostInGalaxy", () => {
  it("même système = 0", () => {
    expect(travelCostInGalaxy(uniforme, "a", "a")).toBe(0);
  });

  it("arêtes toutes unitaires : le coût pondéré retombe sur le compte de sauts", () => {
    expect(travelCostInGalaxy(uniforme, "a", "b")).toBeCloseTo(1, 9);
    expect(travelCostInGalaxy(uniforme, "a", "c")).toBeCloseTo(2, 9);
    expect(travelCostInGalaxy(uniforme, "a", "d")).toBeCloseTo(3, 9);
  });

  it("-1 si inaccessible", () => {
    expect(travelCostInGalaxy(uniforme, "a", "zzz")).toBe(-1);
  });

  it("une arête courte coûte moins qu'une longue — la géométrie pèse", () => {
    const inegale = makeGalaxy(
      "gi",
      [
        { id: "s", x: 0 },
        { id: "proche", x: R / 2 },
        { id: "loin", x: -2 * R },
      ],
      [
        ["s", "proche"],
        ["s", "loin"],
      ],
    );
    expect(travelCostInGalaxy(inegale, "s", "proche")).toBeCloseTo(0.5, 9);
    expect(travelCostInGalaxy(inegale, "s", "loin")).toBeCloseTo(2, 9);
  });

  it("préfère un détour de 4 sauts courts à un saut unique très long", () => {
    // Un BFS aurait choisi s→ecart→t (2 sauts) ; le coût réel le disqualifie.
    const detour = makeGalaxy(
      "gd",
      [
        { id: "s", x: 0 },
        { id: "m1", x: 100 },
        { id: "m2", x: 200 },
        { id: "m3", x: 300 },
        { id: "t", x: 400 },
        { id: "ecart", x: 0, z: 3000 },
      ],
      [
        ["s", "m1"],
        ["m1", "m2"],
        ["m2", "m3"],
        ["m3", "t"],
        ["s", "ecart"],
        ["ecart", "t"],
      ],
    );
    expect(travelCostInGalaxy(detour, "s", "t")).toBeCloseTo(400 / R, 9);
  });

  it("compte la troisième dimension : deux systèmes ne différant que par z", () => {
    const vertical = makeGalaxy(
      "gv",
      [
        { id: "bas", x: 0, z: 0 },
        { id: "haut", x: 0, z: R },
      ],
      [["bas", "haut"]],
    );
    expect(travelCostInGalaxy(vertical, "bas", "haut")).toBeCloseTo(1, 9);
  });
});

describe("travelCostInUniverse", () => {
  it("route dans la même galaxie", () => {
    expect(travelCostInUniverse(universe, "a", "d")).toBeCloseTo(3, 9);
  });

  it("-1 entre galaxies sans portail", () => {
    expect(travelCostInUniverse(universe, "a", "z")).toBe(-1);
  });

  it("un portail coûte un forfait, jamais sa longueur réelle", () => {
    // `z` est à 500 000 unités : facturé au réel, il serait inatteignable.
    expect(travelCostInUniverse(universe, "a", "z", [["a", "z"]])).toBeCloseTo(
      GATEWAY_JUMP_WEIGHT,
      9,
    );
    expect(travelCostInUniverse(universe, "b", "z", [["a", "z"]])).toBeCloseTo(
      1 + GATEWAY_JUMP_WEIGHT,
      9,
    );
  });
});

describe("transferDurationMs", () => {
  it("croît avec la distance", () => {
    expect(transferDurationMs(0)).toBe(TRANSFER_BASE_MS);
    expect(transferDurationMs(3)).toBe(
      TRANSFER_BASE_MS + 3 * TRANSFER_MS_PER_JUMP,
    );
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
    expect(convoyFees(5, 2) - convoyFees(5, 1)).toBe(
      convoyFees(5, 1) - sansPortail,
    );
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

  it("accepte une table de vaisseaux injectée (chantier 23.8) — id inconnu de SHIPS", () => {
    const customShips = {
      ...SHIPS,
      freshly_minted: { ...SHIPS.hauler, capacity: 9999 },
    };
    expect(legacyConvoyStat("freshly_minted", customShips).capacity).toBe(9999);
    expect(
      convoyCapacity({ freshly_minted: 1 }, (id) =>
        legacyConvoyStat(id, customShips),
      ),
    ).toBe(9999);
  });
});
