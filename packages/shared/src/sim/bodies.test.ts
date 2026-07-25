import { describe, expect, it } from "vitest";
import { allPlanets, generateUniverse } from "../universe.js";
import { ATMOSPHERES, bodyPhysicals, isBreathable } from "./bodies.js";
import type { Planet, PlanetType } from "../types.js";

/** Corps de test : seul l'id, le type et l'orbite influent sur la fiche. */
function body(over: Partial<Planet> & { id: string; type: PlanetType }): Planet {
  return {
    systemId: "gal-0-sys-0",
    name: "Test",
    kind: "planet",
    habitability: 50,
    slots: 8,
    deposits: {},
    orbitRadius: 180,
    orbitAngle: 0,
    ...over,
  };
}

describe("bodyPhysicals", () => {
  it("est déterministe : même corps, même fiche", () => {
    const planet = body({ id: "gal-0-sys-1-p2", type: "telluric" });
    expect(bodyPhysicals(planet)).toEqual(bodyPhysicals(planet));
  });

  it("dépend de l'id : deux corps identiques par ailleurs diffèrent", () => {
    const a = bodyPhysicals(body({ id: "gal-0-sys-1-p1", type: "telluric" }));
    const b = bodyPhysicals(body({ id: "gal-0-sys-1-p2", type: "telluric" }));
    expect(a).not.toEqual(b);
  });

  it("respecte la nature des types : une gazeuse est énorme et peu dense", () => {
    const gas = bodyPhysicals(body({ id: "g", type: "gas" }));
    const telluric = bodyPhysicals(body({ id: "t", type: "telluric" }));
    expect(gas.radiusKm).toBeGreaterThan(telluric.radiusKm * 4);
    expect(gas.atmosphere).toBe("dense");
  });

  it("une volcanique est brûlante, une glacée glaciale, à orbite égale", () => {
    const volcanic = bodyPhysicals(body({ id: "v", type: "volcanic" }));
    const frozen = bodyPhysicals(body({ id: "f", type: "frozen" }));
    expect(volcanic.meanTempC).toBeGreaterThan(150);
    expect(frozen.meanTempC).toBeLessThan(-40);
  });

  it("la température décroît avec l'éloignement de l'étoile", () => {
    const near = bodyPhysicals(body({ id: "x", type: "telluric", orbitRadius: 80 }));
    const far = bodyPhysicals(body({ id: "x", type: "telluric", orbitRadius: 600 }));
    expect(near.meanTempC).toBeGreaterThan(far.meanTempC);
  });

  it("la distance ne renverse jamais la nature du corps", () => {
    // Une glacée collée à son étoile reste glaciale, une volcanique lointaine brûlante :
    // sinon la carte afficherait des mondes gelés à 40 °C.
    for (const orbitRadius of [40, 70, 180, 400, 900]) {
      expect(
        bodyPhysicals(body({ id: `f${orbitRadius}`, type: "frozen", orbitRadius })).meanTempC,
      ).toBeLessThan(0);
      expect(
        bodyPhysicals(body({ id: `v${orbitRadius}`, type: "volcanic", orbitRadius })).meanTempC,
      ).toBeGreaterThan(100);
      const telluric = bodyPhysicals(
        body({ id: `t${orbitRadius}`, type: "telluric", orbitRadius }),
      );
      expect(telluric.meanTempC).toBeGreaterThan(-60);
      expect(telluric.meanTempC).toBeLessThan(80);
    }
  });

  it("une lune est plus petite que la planète de même type et suit l'orbite de sa parente", () => {
    const planet = bodyPhysicals(body({ id: "p", type: "arid" }));
    const moon = bodyPhysicals(body({ id: "m", type: "arid", kind: "moon", orbitRadius: 20 }));
    expect(moon.radiusKm).toBeLessThan(planet.radiusKm);
    expect(moon.gravityG).toBeLessThan(planet.gravityG);
    // Sans orbite parente connue, la lune retombe sur l'orbite de référence ; avec,
    // elle suit la température de sa planète.
    const cold = bodyPhysicals(body({ id: "m", type: "arid", kind: "moon", orbitRadius: 20 }), 900);
    expect(cold.meanTempC).toBeLessThan(moon.meanTempC);
  });

  it("produit des valeurs plausibles sur tout un univers généré", () => {
    const universe = generateUniverse("physique", 3);
    for (const planet of allPlanets(universe)) {
      const p = bodyPhysicals(planet);
      expect(p.radiusKm).toBeGreaterThan(0);
      expect(p.gravityG).toBeGreaterThan(0);
      expect(p.gravityG).toBeLessThan(20);
      expect(p.meanTempC).toBeGreaterThan(-273);
      expect(ATMOSPHERES).toContain(p.atmosphere);
      expect(p.dayLengthHours).toBeGreaterThan(0);
      expect(p.orbitPeriodDays).toBeGreaterThan(0);
    }
  });

  it("la fiche corrobore l'habitabilité au lieu de la contredire", () => {
    // Un monde très habitable respire et reste tempéré ; un monde hostile, non.
    const accueillant = Array.from({ length: 12 }, (_, i) =>
      bodyPhysicals(body({ id: `hab${i}`, type: "telluric", habitability: 90 })),
    );
    const hostile = Array.from({ length: 12 }, (_, i) =>
      bodyPhysicals(body({ id: `hab${i}`, type: "telluric", habitability: 10 })),
    );
    const respirables = (list: typeof accueillant) =>
      list.filter((p) => p.atmosphere === "breathable").length;
    expect(respirables(accueillant)).toBeGreaterThan(respirables(hostile));
    for (const p of accueillant) {
      expect(p.meanTempC).toBeGreaterThan(-15);
      expect(p.meanTempC).toBeLessThan(45);
    }
  });

  it("isBreathable exige une atmosphère respirable ET une température vivable", () => {
    const base = bodyPhysicals(body({ id: "b", type: "telluric" }));
    expect(isBreathable({ ...base, atmosphere: "breathable", meanTempC: 18 })).toBe(true);
    expect(isBreathable({ ...base, atmosphere: "toxic", meanTempC: 18 })).toBe(false);
    expect(isBreathable({ ...base, atmosphere: "breathable", meanTempC: 90 })).toBe(false);
    expect(isBreathable({ ...base, atmosphere: "breathable", meanTempC: -60 })).toBe(false);
  });
});
