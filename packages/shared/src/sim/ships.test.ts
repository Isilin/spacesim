import { describe, expect, it } from "vitest";
import { SHIPS } from "../content/ships.js";
import type { Colony, Route } from "../types.js";
import { emptyResources } from "./colony.js";
import { enqueueShip, fleetCapacity, idleShips, pickShip, resolveShips } from "./ships.js";
import { routeCargoQuantity } from "./routes.js";

function makeColony(overrides: Partial<Colony> = {}): Colony {
  return {
    id: "col-1",
    planetId: "p1",
    name: "Base",
    resources: { ...emptyResources(), metals: 500, components: 100 },
    buildings: { shipyard: 1 },
    queue: [],
    population: 100,
    satisfaction: 80,
    ships: {},
    shipsBusy: [],
    shipQueue: [],
    ...overrides,
  };
}

function makeRoute(overrides: Partial<Route> = {}): Route {
  return {
    id: "r1",
    ownerColonyId: "col-1",
    fromId: "col-1",
    fromKind: "colony",
    toId: "col-2",
    toKind: "colony",
    resource: "ore",
    rule: { type: "surplus", keepAtSource: 100 },
    ships: {},
    activeCycle: null,
    paused: false,
    ...overrides,
  };
}

describe("enqueueShip / resolveShips", () => {
  it("paie le coût, produit après le timer", () => {
    const colony = makeColony();
    const r = enqueueShip(colony, "cargo_small", 1000, []);
    if (!r.ok) throw new Error(r.reason);
    expect(r.colony.resources.metals).toBe(500 - SHIPS.cargo_small.cost.metals!);
    const done = resolveShips(r.colony, 1000 + SHIPS.cargo_small.buildMs);
    expect(done.ships.cargo_small).toBe(1);
    expect(done.shipQueue).toHaveLength(0);
  });

  it("refuse sans chantier naval", () => {
    const colony = makeColony({ buildings: {} });
    expect(enqueueShip(colony, "cargo_small", 0, []).ok).toBe(false);
  });

  it("cargo_large gaté par la tech logistique orbitale", () => {
    const colony = makeColony();
    expect(enqueueShip(colony, "cargo_large", 0, []).ok).toBe(false);
    expect(enqueueShip(colony, "cargo_large", 0, ["orbital_logistics"]).ok).toBe(true);
  });

  it("libère les vaisseaux revenus de convoi", () => {
    const colony = makeColony({
      ships: { cargo_small: 2 },
      shipsBusy: [{ shipId: "cargo_small", freeAt: 5000 }],
    });
    expect(idleShips(colony, []).cargo_small).toBe(1);
    const after = resolveShips(colony, 6000);
    expect(after.shipsBusy).toHaveLength(0);
    expect(idleShips(after, []).cargo_small).toBe(2);
  });
});

describe("idleShips", () => {
  it("déduit occupés et réservés aux routes", () => {
    const colony = makeColony({
      ships: { cargo_small: 3, cargo_large: 1 },
      shipsBusy: [{ shipId: "cargo_small", freeAt: 99999 }],
    });
    const route = makeRoute({ ships: { cargo_small: 1, cargo_large: 1 } });
    const idle = idleShips(colony, [route]);
    expect(idle.cargo_small).toBe(1);
    expect(idle.cargo_large).toBe(0);
  });
});

describe("fleetCapacity / pickShip", () => {
  it("additionne les soutes", () => {
    expect(fleetCapacity({ cargo_small: 2, cargo_large: 1 })).toBe(
      2 * SHIPS.cargo_small.capacity + SHIPS.cargo_large.capacity,
    );
  });

  it("choisit le plus gros disponible", () => {
    expect(pickShip({ cargo_small: 1, cargo_large: 1 })).toBe("cargo_large");
    expect(pickShip({ cargo_small: 1, cargo_large: 0 })).toBe("cargo_small");
    expect(pickShip({ cargo_small: 0, cargo_large: 0 })).toBeNull();
  });
});

describe("routeCargoQuantity", () => {
  it("maintain : comble la destination sans vider la source", () => {
    const rule = { type: "maintain", minAtDestination: 300, keepAtSource: 100 } as const;
    expect(routeCargoQuantity(rule, 1000, 250, 200)).toBe(50);
    expect(routeCargoQuantity(rule, 1000, 300, 200)).toBe(0); // destination servie
    expect(routeCargoQuantity(rule, 120, 0, 200)).toBe(20); // garde 100 à la source
  });

  it("fixed : attend le lot complet", () => {
    const rule = { type: "fixed", amount: 150 } as const;
    expect(routeCargoQuantity(rule, 100, 0, 200)).toBe(0);
    expect(routeCargoQuantity(rule, 500, 0, 200)).toBe(150);
  });

  it("surplus : exporte au-dessus du seuil", () => {
    const rule = { type: "surplus", keepAtSource: 400 } as const;
    expect(routeCargoQuantity(rule, 1000, 0, 200)).toBe(200); // borné par la soute
    expect(routeCargoQuantity(rule, 450, 0, 200)).toBe(50);
    expect(routeCargoQuantity(rule, 300, 0, 200)).toBe(0);
  });

  it("capacité nulle : jamais de départ", () => {
    expect(routeCargoQuantity({ type: "surplus", keepAtSource: 0 }, 1000, 0, 0)).toBe(0);
  });
});
