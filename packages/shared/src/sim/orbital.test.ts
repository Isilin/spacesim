import { describe, expect, it } from "vitest";
import { LIFT_ENERGY_PER_UNIT, LIFT_PER_DOCK, ORBITAL_CAP_PER_DOCK } from "../constants.js";
import type { Colony } from "../model/industry.js";
import type { ResourceId } from "../model/resources.js";
import { emptyResources } from "./colony.js";
import {
  applyLift,
  deliverToOrbit,
  emptyOrbital,
  liftThroughput,
  orbitalCap,
  orbitalUsed,
  takeFromOrbit,
} from "./orbital.js";
import { computeEffects } from "./research.js";

function colony(over: Partial<Colony> = {}): Colony {
  return {
    id: "c1",
    planetId: "gal-0-sys-0-p1",
    name: "Test",
    resources: { ...emptyResources(), ore: 500, energy: 500, food: 200 },
    orbitalResources: emptyOrbital(),
    liftRules: {},
    buildings: { orbital_dock: 1 },
    queue: [],
    population: 20,
    satisfaction: 70,
    ships: {},
    shipsBusy: [],
    shipQueue: [],
    ...over,
  };
}

describe("capacité et débit", () => {
  it("sans dock, rien n'est entreposable ni déplaçable", () => {
    const c = colony({ buildings: {}, liftRules: { ore: { keepGround: 0, direction: "up" } } });
    expect(orbitalCap(c)).toBe(0);
    expect(liftThroughput(c)).toBe(0);
    // Même avec une consigne d'ascension, sans dock la colonie reste clouée au sol.
    expect(applyLift(c)).toEqual(c);
  });

  it("chaque dock ajoute capacité et débit", () => {
    expect(orbitalCap(colony({ buildings: { orbital_dock: 3 } }))).toBe(ORBITAL_CAP_PER_DOCK * 3);
    expect(liftThroughput(colony({ buildings: { orbital_dock: 3 } }))).toBe(LIFT_PER_DOCK * 3);
  });

  it("les techs d'ascenseur augmentent capacité et débit", () => {
    const effects = computeEffects([
      "metallurgy",
      "industrial_chains",
      "orbital_logistics",
      "astro_cartography",
      "colonial_engineering",
      "orbital_construction",
      "modular_construction",
      "space_elevator",
    ]);
    const c = colony();
    expect(orbitalCap(c, effects)).toBeGreaterThan(orbitalCap(c));
    expect(liftThroughput(c, effects)).toBeGreaterThan(liftThroughput(c));
  });
});

describe("applyLift", () => {
  it("monte le surplus au-delà de ce qu'on garde au sol, et paie l'énergie", () => {
    const before = colony({ liftRules: { ore: { keepGround: 400, direction: "up" } } });
    const after = applyLift(before);
    // Surplus de 100, mais le débit d'un dock plafonne à LIFT_PER_DOCK.
    expect(after.orbitalResources.ore).toBe(LIFT_PER_DOCK);
    expect(after.resources.ore).toBe(500 - LIFT_PER_DOCK);
    expect(after.resources.energy).toBeCloseTo(500 - LIFT_PER_DOCK * LIFT_ENERGY_PER_UNIT, 5);
  });

  it("ne touche pas à ce qui est sous le seuil de conservation", () => {
    const before = colony({ liftRules: { ore: { keepGround: 900, direction: "up" } } });
    expect(applyLift(before)).toEqual(before);
  });

  it("s'arrête à la capacité orbitale", () => {
    const before = colony({
      buildings: { orbital_dock: 1 },
      orbitalResources: { ...emptyOrbital(), metals: ORBITAL_CAP_PER_DOCK - 5 },
      liftRules: { ore: { keepGround: 0, direction: "up" } },
    });
    const after = applyLift(before);
    expect(orbitalUsed(after)).toBe(ORBITAL_CAP_PER_DOCK);
    expect(after.orbitalResources.ore).toBe(5);
  });

  it("sans énergie au sol, rien ne monte", () => {
    const before = colony({
      resources: { ...emptyResources(), ore: 500, energy: 0 },
      liftRules: { ore: { keepGround: 0, direction: "up" } },
    });
    expect(applyLift(before)).toEqual(before);
  });

  it("redescend l'orbite vers le sol quand la règle le demande, sans coût d'énergie", () => {
    const before = colony({
      resources: { ...emptyResources(), food: 10, energy: 100 },
      orbitalResources: { ...emptyOrbital(), food: 200 },
      liftRules: { food: { keepGround: 60, direction: "down" } },
    });
    const after = applyLift(before);
    expect(after.resources.food).toBe(10 + LIFT_PER_DOCK);
    expect(after.orbitalResources.food).toBe(200 - LIFT_PER_DOCK);
    expect(after.resources.energy).toBe(100);
  });

  it("le débit est partagé entre les ressources : un seul ascenseur", () => {
    const before = colony({
      resources: { ...emptyResources(), ore: 500, metals: 500, energy: 500 },
      liftRules: {
        ore: { keepGround: 0, direction: "up" },
        metals: { keepGround: 0, direction: "up" },
      },
    });
    const after = applyLift(before);
    const lifted = after.orbitalResources.ore + after.orbitalResources.metals;
    expect(lifted).toBe(LIFT_PER_DOCK);
  });

  it("une ressource sans règle reste au sol", () => {
    const before = colony({ liftRules: {} });
    expect(applyLift(before)).toEqual(before);
  });
});

describe("chargement et livraison", () => {
  it("charger puise en orbite, jamais au sol", () => {
    const c = colony({ orbitalResources: { ...emptyOrbital(), ore: 100 } });
    const loaded = takeFromOrbit(c, { ore: 60 });
    expect(loaded?.orbitalResources.ore).toBe(40);
    expect(loaded?.resources.ore).toBe(500);
    // Le stock au sol ne compense pas un manque en orbite.
    expect(takeFromOrbit(c, { ore: 200 })).toBeNull();
  });

  it("livrer remplit l'orbite dans la limite de la capacité", () => {
    const c = colony({ buildings: { orbital_dock: 1 } });
    const full = deliverToOrbit(c, { metals: ORBITAL_CAP_PER_DOCK + 500 } as Partial<
      Record<ResourceId, number>
    >);
    expect(orbitalUsed(full)).toBe(ORBITAL_CAP_PER_DOCK);
  });
});
