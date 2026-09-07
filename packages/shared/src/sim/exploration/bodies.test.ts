import { describe, expect, it } from "vitest";
import {
  ATMOSPHERES,
  type CentralBody,
  type Planet,
  starsOf,
} from "../../model/universe.js";
import { allPlanets, allSystems, generateUniverse } from "../../universe.js";
import { bodyPhysicals, isBreathable } from "./bodies.js";

/**
 * Fiche physique d'un corps (chantier 10, réécrite au chantier 45.2).
 *
 * Ce que ces cas protégeaient a changé de nature. Ils vérifiaient que la fiche **corroborait**
 * l'habitabilité — parce que celle-ci était tirée à part et qu'il fallait éviter d'annoncer
 * une planète toxique à 90 d'habitabilité. La corroboration n'a plus lieu d'être : les deux
 * viennent de la même chaîne. Ce qui se vérifie ici est donc que la fiche suit la PHYSIQUE,
 * et non plus qu'elle s'accorde à une valeur décidée ailleurs.
 */

const star = (typeId: string, mass: number): CentralBody => ({
  id: "gal-0-sys-0-s1",
  systemId: "gal-0-sys-0",
  name: "Test A",
  kind: "star",
  typeId,
  rank: 0,
  mass,
  orbitRadius: 0,
  orbitAngle: 0,
  inclination: 0,
  ascendingNode: 0,
});

const SUN = [star("yellow_dwarf", 0.92)];

/** Corps de test : seuls l'id, le type et l'orbite influent sur la fiche. */
function body(
  over: Partial<Planet> & { id: string; classId: string; variantId: string },
): Planet {
  return {
    systemId: "gal-0-sys-0",
    name: "Test",
    kind: "planet",
    habitability: 50,
    slots: 8,
    deposits: {},
    orbitRadius: 130,
    orbitAngle: 0,
    inclination: 0,
    ascendingNode: 0,
    ...over,
  };
}

describe("bodyPhysicals", () => {
  it("est déterministe : même corps, même fiche", () => {
    const planet = body({
      id: "gal-0-sys-1-p2",
      classId: "rocky",
      variantId: "temperate",
    });
    expect(bodyPhysicals(planet, SUN)).toEqual(bodyPhysicals(planet, SUN));
  });

  it("deux corps du même type diffèrent par leur identifiant", () => {
    const a = bodyPhysicals(
      body({ id: "gal-0-sys-1-p1", classId: "rocky", variantId: "temperate" }),
      SUN,
    );
    const b = bodyPhysicals(
      body({ id: "gal-0-sys-1-p2", classId: "rocky", variantId: "temperate" }),
      SUN,
    );
    expect(a).not.toEqual(b);
  });

  it("une gazeuse est immense et peu dense", () => {
    const gas = bodyPhysicals(
      body({ id: "g", classId: "gas_giant", variantId: "frozen" }),
      SUN,
    );
    const telluric = bodyPhysicals(
      body({ id: "t", classId: "rocky", variantId: "temperate" }),
      SUN,
    );
    expect(gas.radiusKm).toBeGreaterThan(telluric.radiusKm * 4);
    // Peu dense, mais si grande que sa vitesse de libération écrase celle d'un monde rocheux.
    expect(gas.escapeVelocityKms).toBeGreaterThan(telluric.escapeVelocityKms);
  });
});

describe("la température vient de l'étoile, plus d'une table par type", () => {
  it("le même corps est brûlant près et gelé loin", () => {
    // La béquille supprimée bornait cet écart à ±45 °C « pour que le type reste lisible ».
    // Une orbite quatre fois plus proche reçoit seize fois plus de flux : l'écart doit être
    // spectaculaire, et c'est la physique qui le dit.
    const near = bodyPhysicals(
      body({
        id: "n",
        classId: "rocky",
        variantId: "temperate",
        orbitRadius: 40,
      }),
      SUN,
    );
    const far = bodyPhysicals(
      body({
        id: "n",
        classId: "rocky",
        variantId: "temperate",
        orbitRadius: 400,
      }),
      SUN,
    );
    expect(near.meanTempC).toBeGreaterThan(far.meanTempC + 150);
  });

  it("la même orbite est tempérée sous une naine rouge et brûlante sous une géante", () => {
    // C'est l'inverse qu'on pourrait croire : à 130 unités on est au MILIEU de la zone
    // habitable des deux, par construction de l'échelle. La différence tient à l'orbite
    // réelle, pas à la classe — et c'est ce que ce cas vérifie.
    const dwarf = bodyPhysicals(
      body({ id: "d", classId: "rocky", variantId: "temperate" }),
      [star("red_dwarf", 0.26)],
    );
    const giant = bodyPhysicals(
      body({ id: "d", classId: "rocky", variantId: "temperate" }),
      [star("blue_giant", 30)],
    );
    expect(Math.abs(dwarf.meanTempC - giant.meanTempC)).toBeLessThan(30);
  });

  it("un système sans étoile est glacé", () => {
    // Un errant n'éclaire rien : c'est la bonne réponse, pas un cas dégénéré.
    const dark = bodyPhysicals(
      body({ id: "x", classId: "rocky", variantId: "temperate" }),
      [],
    );
    expect(dark.meanTempC).toBeLessThan(-200);
    expect(dark.irradiance).toBe(0);
  });

  it("la serre écarte la surface de l'équilibre, et seulement là où il y a une atmosphère", () => {
    const volcanic = bodyPhysicals(
      body({ id: "v", classId: "rocky", variantId: "volcanic" }),
      SUN,
    );
    expect(volcanic.meanTempC).toBeGreaterThan(volcanic.equilibriumTempC);
    expect(volcanic.pressureBar).toBeGreaterThan(0);
  });
});

describe("l'atmosphère est retenue, plus tirée", () => {
  it("une lune retient bien moins qu'une planète de même nature", () => {
    // Le couplage qu'aucune table par type ne pouvait exprimer : c'est le rayon réduit
    // d'une lune qui abaisse sa vitesse de libération, donc sa rétention.
    const planet = bodyPhysicals(
      body({ id: "p", classId: "rocky", variantId: "temperate" }),
      SUN,
    );
    const moon = bodyPhysicals(
      body({
        id: "p",
        classId: "rocky",
        variantId: "temperate",
        kind: "moon",
        orbitRadius: 20,
      }),
      SUN,
      130,
    );
    expect(moon.radiusKm).toBeLessThan(planet.radiusKm);
    expect(moon.gravityG).toBeLessThan(planet.gravityG);
    expect(moon.escapeVelocityKms).toBeLessThan(planet.escapeVelocityKms);
    expect(moon.pressureBar).toBeLessThan(planet.pressureBar);
  });

  it("une lune suit la température de sa planète, pas son orbite propre", () => {
    const warm = bodyPhysicals(
      body({
        id: "m",
        classId: "dwarf",
        variantId: "frozen",
        kind: "moon",
        orbitRadius: 20,
      }),
      SUN,
      100,
    );
    const cold = bodyPhysicals(
      body({
        id: "m",
        classId: "dwarf",
        variantId: "frozen",
        kind: "moon",
        orbitRadius: 20,
      }),
      SUN,
      600,
    );
    expect(cold.meanTempC).toBeLessThan(warm.meanTempC);
  });

  it("un corps trop chaud et trop léger reste nu, quoi qu'il dégaze", () => {
    // Une volcanique dégaze une atmosphère toxique épaisse ; en orbite très serrée une
    // naine n'en garde rien. C'est la rétention qui tranche, pas le type.
    //
    // La classe porte la légèreté depuis la séparation des deux axes : une rocheuse de
    // masse terrestre au même endroit garderait une trace, et ce serait juste.
    const scorched = bodyPhysicals(
      body({
        id: "s",
        classId: "dwarf",
        variantId: "volcanic",
        orbitRadius: 12,
      }),
      SUN,
    );
    expect(scorched.atmosphere).toBe("none");
    expect(scorched.pressureBar).toBe(0);
  });
});

describe("sur tout un univers généré", () => {
  const universe = generateUniverse("physique", 3);
  const starsOfSystem = new Map(
    allSystems(universe).map((s) => [s.id, starsOf(s)]),
  );

  it("produit des valeurs plausibles partout", () => {
    for (const planet of allPlanets(universe)) {
      const p = bodyPhysicals(planet, starsOfSystem.get(planet.systemId) ?? []);
      expect(p.radiusKm).toBeGreaterThan(0);
      expect(p.gravityG).toBeGreaterThan(0);
      expect(p.gravityG).toBeLessThan(20);
      expect(p.escapeVelocityKms).toBeGreaterThan(0);
      expect(p.meanTempC).toBeGreaterThan(-274);
      expect(ATMOSPHERES).toContain(p.atmosphere);
      expect(p.pressureBar).toBeGreaterThanOrEqual(0);
      expect(p.dayLengthHours).toBeGreaterThan(0);
      expect(p.orbitPeriodDays).toBeGreaterThan(0);
    }
  });

  it("les meilleurs mondes sont plus tempérés que les pires, sans qu'on l'y force", () => {
    // La béquille `temperatePull` tirait la fiche vers 15 °C pour obtenir cet accord. Il
    // tombe maintenant tout seul, l'habitabilité étant CALCULÉE depuis cette température —
    // et il se vérifie sur la tendance plutôt que corps par corps, puisque la pression, la
    // gravité et le rayonnement pèsent aussi.
    const tempOf = (p: (typeof planets)[number]) =>
      bodyPhysicals(p, starsOfSystem.get(p.systemId) ?? []).meanTempC;
    const planets = allPlanets(universe);
    const prime = planets.filter((p) => p.habitability >= 70);
    const poor = planets.filter(
      (p) => p.habitability > 0 && p.habitability < 15,
    );
    expect(prime.length).toBeGreaterThan(0);
    const spread = (list: typeof prime) =>
      list.reduce((s, p) => s + Math.abs(tempOf(p) - 12), 0) / list.length;
    expect(spread(prime)).toBeLessThan(spread(poor));
  });
});

describe("isBreathable", () => {
  it("exige une atmosphère respirable ET une température vivable", () => {
    const base = bodyPhysicals(
      body({ id: "b", classId: "rocky", variantId: "temperate" }),
      SUN,
    );
    expect(
      isBreathable({ ...base, atmosphere: "breathable", meanTempC: 18 }),
    ).toBe(true);
    expect(isBreathable({ ...base, atmosphere: "toxic", meanTempC: 18 })).toBe(
      false,
    );
    expect(
      isBreathable({ ...base, atmosphere: "breathable", meanTempC: 120 }),
    ).toBe(false);
  });
});
