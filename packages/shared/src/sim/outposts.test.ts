import { describe, expect, it } from "vitest";
import type { AsteroidBelt } from "../model/universe.js";
import { beltRichness, MINING_RATE, OUTPOST_STOCK_CAP, outpostTick } from "./outposts.js";
import { routeCargoQuantity } from "./routes.js";

const belt: AsteroidBelt = {
  id: "b1",
  systemId: "s1",
  name: "Ceinture Test",
  orbitRadius: 300,
  deposits: { ore: 1.6 },
};

describe("outpostTick", () => {
  it("extrait selon la richesse de la ceinture", () => {
    expect(outpostTick(0, beltRichness(belt), true)).toBe(MINING_RATE * 1.6);
  });

  it("plafonne au stock local", () => {
    expect(outpostTick(OUTPOST_STOCK_CAP - 1, 2, true)).toBe(OUTPOST_STOCK_CAP);
    expect(outpostTick(OUTPOST_STOCK_CAP, 2, true)).toBe(OUTPOST_STOCK_CAP);
  });

  it("entretien impayé : extraction stoppée", () => {
    expect(outpostTick(100, 2, false)).toBe(100);
  });

  it("richesse par défaut 1 sans gisement", () => {
    expect(beltRichness({ ...belt, deposits: {} })).toBe(1);
  });
});

describe("route depuis un avant-poste", () => {
  it("le surplus vide le stock local (borné par la soute)", () => {
    // Un avant-poste n'a pas besoin de garder de stock : keepAtSource 0.
    expect(routeCargoQuantity({ type: "surplus", keepAtSource: 0 }, 1200, 0, 400)).toBe(400);
    expect(routeCargoQuantity({ type: "surplus", keepAtSource: 0 }, 150, 0, 400)).toBe(150);
  });
});
