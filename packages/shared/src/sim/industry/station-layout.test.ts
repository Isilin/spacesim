import { describe, expect, it } from "vitest";
import type { HexCoord } from "./station-layout.js";
import {
  computeGrowthPoints,
  hexKey,
  isValidGrowthPoint,
  migrateLegacyZoneQueue,
  migrateLegacyZones,
  zoneCount,
} from "./station-layout.js";

const HEX_DIRECTIONS: HexCoord[] = [
  { q: 1, r: 0 },
  { q: 1, r: -1 },
  { q: 0, r: -1 },
  { q: -1, r: 0 },
  { q: -1, r: 1 },
  { q: 0, r: 1 },
];

describe("computeGrowthPoints", () => {
  it("une station vide (hub seul) offre exactement les 6 voisins du hub", () => {
    const points = computeGrowthPoints({ zones: [], zoneQueue: [] });
    expect(points).toHaveLength(6);
    expect(new Set(points.map((p) => hexKey(p.q, p.r))).size).toBe(6);
    expect(points.some((p) => p.q === 0 && p.r === 0)).toBe(false);
  });

  it("construire une zone ouvre ses voisins sans jamais dupliquer un candidat", () => {
    const zones = [{ zoneTypeId: "industrial_zone", q: 1, r: 0 }];
    const points = computeGrowthPoints({ zones, zoneQueue: [] });
    const keys = points.map((p) => hexKey(p.q, p.r));
    expect(new Set(keys).size).toBe(keys.length);
    // La cellule occupée par la zone n'est plus elle-même un candidat.
    expect(points.some((p) => p.q === 1 && p.r === 0)).toBe(false);
  });

  it("une zone en file (non résolue) compte déjà comme occupée", () => {
    const zoneQueue = [
      { zoneTypeId: "industrial_zone", q: 1, r: 0, startedAt: 0, finishesAt: 1000 },
    ];
    const points = computeGrowthPoints({ zones: [], zoneQueue });
    expect(points.some((p) => p.q === 1 && p.r === 0)).toBe(false);
  });
});

describe("isValidGrowthPoint", () => {
  it("accepte un voisin du hub, refuse le hub lui-même et une cellule non adjacente", () => {
    const station = { zones: [], zoneQueue: [] };
    expect(isValidGrowthPoint(station, 1, 0)).toBe(true);
    expect(isValidGrowthPoint(station, 0, 0)).toBe(false);
    expect(isValidGrowthPoint(station, 5, 5)).toBe(false);
  });
});

describe("zoneCount", () => {
  it("compte les zones bâties d'un type donné", () => {
    const zones = [
      { zoneTypeId: "industrial_zone", q: 1, r: 0 },
      { zoneTypeId: "industrial_zone", q: 1, r: -1 },
      { zoneTypeId: "science_zone", q: 0, r: -1 },
    ];
    expect(zoneCount({ zones }, "industrial_zone")).toBe(2);
    expect(zoneCount({ zones }, "science_zone")).toBe(1);
    expect(zoneCount({ zones }, "military_zone")).toBe(0);
  });
});

describe("migrateLegacyZones", () => {
  it("renvoie un tableau déjà migré tel quel (idempotence)", () => {
    const zones = [{ zoneTypeId: "industrial_zone", q: 1, r: 0 }];
    expect(migrateLegacyZones(zones)).toBe(zones);
  });

  it("convertit une ancienne carte de comptes en amas connexe de zones positionnées", () => {
    const migrated = migrateLegacyZones({ industrial_zone: 2, science_zone: 1 });
    expect(migrated).toHaveLength(3);

    const keys = migrated.map((z) => hexKey(z.q, z.r));
    expect(new Set(keys).size).toBe(3); // positions uniques

    // Amas connexe : chaque zone est adjacente au hub ou à une autre cellule occupée.
    const occupied = new Set<string>([hexKey(0, 0), ...keys]);
    for (const z of migrated) {
      const hasOccupiedNeighbor = HEX_DIRECTIONS.some((dir) =>
        occupied.has(hexKey(z.q + dir.q, z.r + dir.r)),
      );
      expect(hasOccupiedNeighbor).toBe(true);
    }
  });
});

describe("migrateLegacyZoneQueue", () => {
  it("laisse les entrées déjà positionnées inchangées", () => {
    const raw = [
      { zoneTypeId: "industrial_zone", q: 1, r: 0, startedAt: 0, finishesAt: 1000 },
    ];
    expect(migrateLegacyZoneQueue(raw, [])).toEqual(raw);
  });

  it("assigne des positions distinctes à plusieurs entrées héritées sans q/r", () => {
    const raw = [
      { zoneTypeId: "industrial_zone", startedAt: 0, finishesAt: 1000 },
      { zoneTypeId: "science_zone", startedAt: 1000, finishesAt: 2000 },
    ];
    const migrated = migrateLegacyZoneQueue(raw, []);
    expect(migrated).toHaveLength(2);
    const keys = migrated.map((z) => hexKey(z.q, z.r));
    expect(new Set(keys).size).toBe(2);
  });
});
