import { describe, expect, it } from "vite-plus/test";
import type { StarSystem } from "../../model/universe.js";
import { distance3, orbitPosition } from "./geometry.js";
import { sitePosition, sitesOfSystem, sitesReward } from "./sites.js";

function system(id: string, orbits: number[] = [100, 200]): StarSystem {
  return {
    id,
    name: id,
    x: 0,
    y: 0,
    z: 0,
    stars: [],
    planets: orbits.map((orbitRadius, i) => ({
      id: `${id}-p${i}`,
      systemId: id,
      name: `${id} ${i}`,
      kind: "planet" as const,
      classId: "rocky",
      variantId: "temperate",
      habitability: 50,
      slots: 8,
      deposits: {},
      orbitRadius,
      orbitAngle: 0,
      inclination: 0,
      ascendingNode: 0,
    })),
    belts: [],
  };
}

describe("sitesOfSystem", () => {
  it("est déterministe : même seed et même système, mêmes sites", () => {
    const sys = system("s1");
    expect(sitesOfSystem("graine", sys)).toEqual(sitesOfSystem("graine", sys));
  });

  it("deux systèmes ne partagent pas leurs sites", () => {
    const a = sitesOfSystem("graine", system("s1"));
    const b = sitesOfSystem("graine", system("s2"));
    expect(a.map((s) => s.id)).not.toEqual(b.map((s) => s.id));
  });

  it("une autre seed produit un autre univers de sites", () => {
    // Comparé sur un échantillon : un système donné peut légitimement n'avoir aucun
    // site sous les deux seeds, ce qui ne dirait rien de la seed elle-même.
    const sample = (seed: string) =>
      JSON.stringify(
        Array.from({ length: 30 }, (_, i) =>
          sitesOfSystem(seed, system(`s${i}`)),
        ),
      );
    expect(sample("graine-a")).not.toEqual(sample("graine-b"));
  });

  it("certains systèmes n'ont rien : scanner reste un pari", () => {
    const counts = Array.from(
      { length: 40 },
      (_, i) => sitesOfSystem("graine", system(`s${i}`)).length,
    );
    expect(counts.some((n) => n === 0)).toBe(true);
    expect(counts.some((n) => n > 0)).toBe(true);
    expect(Math.max(...counts)).toBeLessThanOrEqual(3);
  });

  it("les sites se tiennent au-delà des orbites connues", () => {
    // C'est le vide entre les corps qu'on explore, pas les planètes catalogées.
    const sys = system("s1", [100, 200, 300]);
    for (const site of sitesOfSystem("graine", sys)) {
      expect(site.orbitRadius).toBeGreaterThan(300);
    }
  });

  it("le bonus de gisement enrichit le butin", () => {
    const sys = system("s1");
    const pauvre = sitesOfSystem("graine", sys, 1);
    const riche = sitesOfSystem("graine", sys, 2);
    if (pauvre.length === 0) return;
    const total = (xs: ReturnType<typeof sitesOfSystem>) =>
      Object.values(sitesReward(xs)).reduce((a, b) => a + b, 0);
    expect(total(riche)).toBeGreaterThan(total(pauvre));
  });
});

describe("sitePosition", () => {
  // Le premier site d'un échantillon : `system("s-fixe")` pouvait n'en avoir aucun, et le cas
  // qui le lisait sortait alors sans rien vérifier.
  const site = Array.from({ length: 40 }, (_, i) =>
    sitesOfSystem("graine", system(`s${i}`)),
  ).flat()[0]!;

  it("place le site à son rayon d'orbite, hors du plan quand il est incliné", () => {
    const sites = sitesOfSystem("graine", system("s-position"));
    for (const one of sites) {
      for (const tick of [0, 12_345]) {
        const pos = sitePosition(one, tick);
        expect(Math.hypot(pos.x, pos.y, pos.z)).toBeCloseTo(one.orbitRadius, 6);
      }
    }
  });

  it("à t=0, il est à sa position initiale (chantier 50.9)", () => {
    expect(sitePosition(site, 0)).toEqual(orbitPosition(site));
  });

  it("il orbite ensuite sous la loi des planètes, au lieu d'être figé", () => {
    const start = sitePosition(site, 0);
    expect(distance3(start, sitePosition(site, 5000))).toBeGreaterThan(1);
  });
});

describe("sitesReward", () => {
  it("additionne les butins ressource par ressource", () => {
    const reward = sitesReward([
      { reward: { metals: 10, credits: 5 } },
      { reward: { metals: 4 } },
    ] as never);
    expect(reward).toEqual({ metals: 14, credits: 5 });
  });

  it("aucun site, aucun butin", () => {
    expect(sitesReward([])).toEqual({});
  });
});
