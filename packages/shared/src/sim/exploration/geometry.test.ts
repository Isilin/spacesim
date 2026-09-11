import { describe, expect, it } from "vite-plus/test";
import {
  MOON_KEPLER_CONSTANT,
  PLANET_KEPLER_CONSTANT,
} from "../../constants.js";
import type { CentralBody, Planet, StarSystem } from "../../model/universe.js";
import {
  angularSpeedAt,
  angularSpeedOf,
  bodyPositionAt,
  centralBodyPositionAt,
  distance3,
  eccentricPointAt,
  eccentricPositionAt,
  orbitalPeriodTicks,
  orbitPosition,
  spinAngleAt,
  type EccentricElements,
  type SpinElements,
  type Vec3,
} from "./geometry.js";

function planet(over: Partial<Planet> & { id: string }): Planet {
  return {
    systemId: "sys-0",
    name: "Test",
    kind: "planet",
    classId: "rocky",
    variantId: "temperate",
    habitability: 50,
    slots: 8,
    deposits: {},
    orbitRadius: 100,
    orbitAngle: 0,
    inclination: 0,
    ascendingNode: 0,
    ...over,
  };
}

function system(planets: Planet[]): StarSystem {
  return {
    id: "sys-0",
    name: "Test",
    x: 0,
    y: 0,
    z: 0,
    stars: [],
    planets,
    belts: [],
  };
}

describe("angularSpeedOf", () => {
  it("décroît avec le rayon d'orbite : les corps lointains tournent lentement", () => {
    const proche = planet({ id: "p1", orbitRadius: 70 });
    const lointain = planet({ id: "p2", orbitRadius: 290 });
    expect(angularSpeedOf(proche)).toBeGreaterThan(angularSpeedOf(lointain));
  });

  it("suit la loi en r^-1.5 : quadrupler le rayon divise la vitesse par 8", () => {
    const a = planet({ id: "p1", orbitRadius: 50 });
    const b = planet({ id: "p2", orbitRadius: 200 });
    expect(angularSpeedOf(a) / angularSpeedOf(b)).toBeCloseTo(8, 6);
  });

  it("une lune a sa propre constante, distincte de celle des planètes", () => {
    const lune = planet({ id: "m1", kind: "moon", orbitRadius: 100 });
    const planete = planet({ id: "p1", orbitRadius: 100 });
    expect(angularSpeedOf(lune)).not.toBeCloseTo(angularSpeedOf(planete), 6);
  });
});

describe("bodyPositionAt", () => {
  it("à t=0, la position est celle de l'angle initial persisté", () => {
    const p = planet({ id: "p1", orbitRadius: 100, orbitAngle: 0 });
    const pos = bodyPositionAt(system([p]), p, 0);
    expect(pos.x).toBeCloseTo(100, 9);
    expect(pos.y).toBeCloseTo(0, 9);
    expect(pos.z).toBeCloseTo(0, 9);
  });

  it("revient au même point après une période orbitale complète", () => {
    const p = planet({ id: "p1", orbitRadius: 137, orbitAngle: 1.2 });
    const sys = system([p]);
    const debut = bodyPositionAt(sys, p, 0);
    const apres = bodyPositionAt(sys, p, orbitalPeriodTicks(p));
    expect(apres.x).toBeCloseTo(debut.x, 6);
    expect(apres.y).toBeCloseTo(debut.y, 6);
    expect(apres.z).toBeCloseTo(debut.z, 6);
  });

  it("bouge réellement entre deux ticks : la position dépend du temps", () => {
    const p = planet({ id: "p1", orbitRadius: 70 });
    const sys = system([p]);
    const t0 = bodyPositionAt(sys, p, 0);
    const t1 = bodyPositionAt(sys, p, 500);
    expect(distance3(t0, t1)).toBeGreaterThan(1);
  });

  it("garde le rayon d'orbite constant quelles que soient inclinaison et orientation", () => {
    const p = planet({
      id: "p1",
      orbitRadius: 180,
      inclination: 0.14,
      ascendingNode: 2.7,
    });
    const sys = system([p]);
    for (const tick of [0, 137, 4000, 51_234]) {
      const pos = bodyPositionAt(sys, p, tick);
      expect(Math.hypot(pos.x, pos.y, pos.z)).toBeCloseTo(180, 6);
    }
  });

  it("une inclinaison nulle laisse le corps dans le plan du système", () => {
    const p = planet({ id: "p1", inclination: 0, ascendingNode: 1.1 });
    const sys = system([p]);
    expect(bodyPositionAt(sys, p, 9999).z).toBeCloseTo(0, 9);
  });

  it("une inclinaison non nulle sort le corps du plan", () => {
    const p = planet({ id: "p1", orbitRadius: 200, inclination: 0.15 });
    const sys = system([p]);
    const zMax = Math.max(
      ...[0, 250, 500, 750, 1000].map((t) =>
        Math.abs(bodyPositionAt(sys, p, t).z),
      ),
    );
    expect(zMax).toBeGreaterThan(1);
  });

  it("une lune compose son orbite avec celle de sa planète parente", () => {
    const parente = planet({ id: "p1", orbitRadius: 100, orbitAngle: 0 });
    const lune = planet({
      id: "p1-m1",
      kind: "moon",
      parentPlanetId: "p1",
      orbitRadius: 16,
      orbitAngle: 0,
    });
    const sys = system([parente, lune]);
    // À t=0 : parente en (100,0,0), lune à +16 sur le même axe.
    expect(bodyPositionAt(sys, lune, 0).x).toBeCloseTo(116, 9);
  });

  it("la lune reste à portée de sa parente au fil du temps", () => {
    const parente = planet({ id: "p1", orbitRadius: 100, orbitAngle: 0.5 });
    const lune = planet({
      id: "p1-m1",
      kind: "moon",
      parentPlanetId: "p1",
      orbitRadius: 16,
      orbitAngle: 2.0,
    });
    const sys = system([parente, lune]);
    for (const tick of [0, 300, 1500, 20_000]) {
      const d = distance3(
        bodyPositionAt(sys, parente, tick),
        bodyPositionAt(sys, lune, tick),
      );
      expect(d).toBeCloseTo(16, 6);
    }
  });

  it("parente introuvable : la lune retombe sur une orbite stellaire plutôt que de casser", () => {
    const orpheline = planet({
      id: "m1",
      kind: "moon",
      parentPlanetId: "absente",
      orbitRadius: 16,
      orbitAngle: 0,
    });
    const pos = bodyPositionAt(system([orpheline]), orpheline, 0);
    expect(pos.x).toBeCloseTo(16, 9);
  });
});

describe("distance3", () => {
  it("mesure en volume, pas seulement dans le plan", () => {
    expect(distance3({ x: 0, y: 0, z: 0 }, { x: 3, y: 4, z: 12 })).toBeCloseTo(
      13,
      9,
    );
  });

  it("accepte structurellement un système (x/y/z déjà portés)", () => {
    const a = system([]);
    const b = { ...system([]), x: 6, y: 8, z: 0 };
    expect(distance3(a, b)).toBeCloseTo(10, 9);
  });
});

describe("orbites S et P (chantier 45.2)", () => {
  /**
   * Les deux régimes d'un système multiple. Le générateur ne tire jamais de séparation dans
   * la bande intermédiaire, si bien que `orbitsBarycenter` tranche sans ambiguïté — ces cas
   * vérifient que la géométrie suit cette lecture, et non un second champ qui pourrait la
   * contredire.
   */
  const companion = (id: string, orbitRadius: number): CentralBody => ({
    id,
    systemId: "sys-0",
    name: id,
    kind: "star",
    typeId: "yellow_dwarf",
    rank: 1,
    mass: 1,
    orbitRadius,
    orbitAngle: 0,
    inclination: 0,
    ascendingNode: 0,
  });
  const anchor = { ...companion("sys-0-s1", 0), rank: 0 };

  const world = (over: Partial<Planet>): Planet =>
    ({
      id: "p",
      systemId: "sys-0",
      name: "P",
      kind: "planet",
      classId: "rocky",
      variantId: "temperate",
      habitability: 50,
      slots: 8,
      deposits: {},
      orbitRadius: 130,
      orbitAngle: 0,
      inclination: 0,
      ascendingNode: 0,
      ...over,
    }) as Planet;

  const systemOf = (stars: CentralBody[], planets: Planet[]): StarSystem =>
    ({
      id: "sys-0",
      name: "Sys",
      x: 0,
      y: 0,
      z: 0,
      stars,
      planets,
      belts: [],
    }) as StarSystem;

  it("en binaire serrée, la planète tourne autour du barycentre", () => {
    // Son orbite englobe les deux étoiles : elle part donc de l'origine, comme avant le
    // chantier, et le compagnon ne la décale pas.
    const planet = world({ hostStarId: "sys-0-s1" });
    const tight = systemOf([anchor, companion("sys-0-s2", 18)], [planet]);
    const single = systemOf([anchor], [world({})]);
    expect(bodyPositionAt(tight, planet, 0)).toEqual(
      bodyPositionAt(single, single.planets[0]!, 0),
    );
  });

  it("en binaire large, la planète suit son étoile hôte", () => {
    const host = companion("sys-0-s2", 600);
    const planet = world({ hostStarId: "sys-0-s2" });
    const wide = systemOf([anchor, host], [planet]);
    const at = bodyPositionAt(wide, planet, 0);
    const hostAt = centralBodyPositionAt(host, 0);
    // Le corps est à son rayon d'orbite de son HÔTE, pas de l'origine.
    expect(
      Math.hypot(at.x - hostAt.x, at.y - hostAt.y, at.z - hostAt.z),
    ).toBeCloseTo(planet.orbitRadius, 5);
    expect(Math.hypot(at.x, at.y, at.z)).toBeGreaterThan(
      planet.orbitRadius * 2,
    );
  });

  it("une lune suit sa planète, elle-même autour de son hôte", () => {
    // La composition va à trois niveaux : barycentre → étoile hôte → planète → lune.
    const host = companion("sys-0-s2", 600);
    const planet = world({ id: "p1", hostStarId: "sys-0-s2" });
    const moon = world({
      id: "p1-m1",
      kind: "moon",
      parentPlanetId: "p1",
      orbitRadius: 20,
      hostStarId: "sys-0-s2",
    });
    const wide = systemOf([anchor, host], [planet, moon]);
    const planetAt = bodyPositionAt(wide, planet, 0);
    const moonAt = bodyPositionAt(wide, moon, 0);
    expect(
      Math.hypot(
        moonAt.x - planetAt.x,
        moonAt.y - planetAt.y,
        moonAt.z - planetAt.z,
      ),
    ).toBeCloseTo(moon.orbitRadius, 5);
  });

  it("l'ancre ne bouge pas, un compagnon oui", () => {
    expect(centralBodyPositionAt(anchor, 500)).toEqual({ x: 0, y: 0, z: 0 });
    const moving = centralBodyPositionAt(companion("s", 600), 500);
    expect(Math.hypot(moving.x, moving.y, moving.z)).toBeCloseTo(600, 5);
  });

  it("un hôte introuvable ne fait pas disparaître le corps", () => {
    // Données incohérentes : mieux vaut un corps au barycentre qu'une vue qui refuse de se
    // rendre.
    const orphan = world({ hostStarId: "n'existe pas" });
    const wide = systemOf([anchor, companion("sys-0-s2", 600)], [orphan]);
    expect(bodyPositionAt(wide, orphan, 0)).toEqual(
      bodyPositionAt(systemOf([anchor], [world({})]), world({}), 0),
    );
  });
});

describe("angularSpeedAt (chantier 50.1)", () => {
  it("redonne exactement la vitesse d'un corps, planète comme lune", () => {
    // Les objets qui orbitent sans être des `Planet` — rochers, sites, géocroiseurs — suivent
    // la même loi : la moindre divergence ici en ferait deux.
    const planete = planet({ id: "p1", orbitRadius: 137 });
    const lune = planet({ id: "m1", kind: "moon", orbitRadius: 26 });
    expect(angularSpeedAt(137, PLANET_KEPLER_CONSTANT)).toBe(
      angularSpeedOf(planete),
    );
    expect(angularSpeedAt(26, MOON_KEPLER_CONSTANT)).toBe(angularSpeedOf(lune));
  });
});

describe("spinAngleAt (chantier 50.1)", () => {
  const spin = (over: Partial<SpinElements> = {}): SpinElements => ({
    axialTilt: 0.4,
    axisNode: 1.1,
    periodTicks: 120,
    spinAngle: 0.7,
    retrograde: false,
    ...over,
  });

  it("à t=0, l'angle est la phase initiale", () => {
    expect(spinAngleAt(spin(), 0)).toBe(0.7);
  });

  it("avance linéairement : une demi-période, un demi-tour", () => {
    expect(spinAngleAt(spin(), 60) - spinAngleAt(spin(), 0)).toBeCloseTo(
      Math.PI,
      9,
    );
  });

  it("fait exactement un tour en une période", () => {
    expect(spinAngleAt(spin(), 120) - spinAngleAt(spin(), 0)).toBeCloseTo(
      2 * Math.PI,
      9,
    );
  });

  it("un corps rétrograde tourne à contresens", () => {
    const prograde = spinAngleAt(spin(), 30) - 0.7;
    const retrograde = spinAngleAt(spin({ retrograde: true }), 30) - 0.7;
    expect(retrograde).toBeCloseTo(-prograde, 9);
    expect(retrograde).toBeLessThan(0);
  });
});

describe("eccentricPositionAt (chantier 50.8)", () => {
  const orbit = (over: Partial<EccentricElements> = {}): EccentricElements => ({
    orbitRadius: 150,
    orbitAngle: 0.4,
    inclination: 0.1,
    ascendingNode: 1.2,
    eccentricity: 0.3,
    meanAnomaly: 0,
    ...over,
  });
  const fromCenter = (p: Vec3) => Math.hypot(p.x, p.y, p.z);
  /** Une demi-période orbitale, en ticks. */
  const half = Math.PI / angularSpeedAt(150, PLANET_KEPLER_CONSTANT);

  it("sans excentricité, c'est l'orbite circulaire au même pas", () => {
    const circle = orbit({ eccentricity: 0 });
    for (const tick of [0, 333, 5000]) {
      const p = eccentricPositionAt(circle, tick);
      const q = orbitPosition(
        circle,
        angularSpeedAt(150, PLANET_KEPLER_CONSTANT) * tick,
      );
      expect(p.x).toBeCloseTo(q.x, 9);
      expect(p.y).toBeCloseTo(q.y, 9);
      expect(p.z).toBeCloseTo(q.z, 9);
    }
  });

  it("au périastre à t=0, à l'apoastre une demi-période plus tard", () => {
    expect(fromCenter(eccentricPositionAt(orbit(), 0))).toBeCloseTo(105, 9);
    expect(fromCenter(eccentricPositionAt(orbit(), half))).toBeCloseTo(195, 9);
  });

  it("plonge au périastre et traîne à l'apoastre, comme le veut Kepler", () => {
    // Deuxième loi : les vitesses aux apsides sont dans le rapport inverse des distances,
    // (1 + e) / (1 − e) ≈ 1,86 à e = 0,3.
    const el = orbit();
    const atPeri = distance3(
      eccentricPositionAt(el, 0),
      eccentricPositionAt(el, 10),
    );
    const atApo = distance3(
      eccentricPositionAt(el, half),
      eccentricPositionAt(el, half + 10),
    );
    expect(atPeri / atApo).toBeCloseTo(1.3 / 0.7, 2);
  });

  it("revient au même point après une période complète", () => {
    const el = orbit({ meanAnomaly: 2.2 });
    const start = eccentricPositionAt(el, 0);
    const back = eccentricPositionAt(el, 2 * half);
    expect(distance3(start, back)).toBeCloseTo(0, 6);
  });

  it("le tracé passe par les apsides que le corps atteint", () => {
    // `eccentricPointAt` dessine la route, `eccentricPositionAt` la parcourt : mêmes apsides.
    const el = orbit();
    expect(distance3(eccentricPointAt(el, 0), eccentricPositionAt(el, 0))).toBe(
      0,
    );
    expect(
      distance3(eccentricPointAt(el, Math.PI), eccentricPositionAt(el, half)),
    ).toBeCloseTo(0, 9);
  });
});
