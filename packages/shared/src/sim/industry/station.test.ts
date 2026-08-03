import { describe, expect, it } from "vitest";
import { INSTALLATIONS } from "../../content/installations.js";
import { ZONE_TYPES } from "../../content/zone-types.js";
import type { Station } from "../../model/industry.js";
import { computeEffects, NO_EFFECTS } from "../empire/research.js";
import { computeGrowthPoints } from "./station-layout.js";
import {
  applyStationTick,
  canFoundStation,
  deliverToStation,
  emptyStationResources,
  enqueueInstallation,
  enqueueZone,
  hasBlueprintMarket,
  hasResourceMarket,
  resolveInstallQueue,
  resolveZoneQueue,
  takeFromStation,
} from "./station.js";

function makeStation(overrides: Partial<Station> = {}): Station {
  return {
    id: "station-1",
    ownerId: "empire-1",
    bodyId: "gal-0-sys-0-p1",
    systemId: "gal-0-sys-0",
    name: "Avant-poste",
    resources: emptyStationResources(),
    zones: [],
    zoneQueue: [],
    installations: {},
    installQueue: [],
    marketAccess: "closed",
    marketTaxRate: 0,
    ...overrides,
  };
}

/** Premier point de croissance disponible — pour ne pas coder de coordonnées en dur
 *  dans les tests et rester robuste à un futur réglage de la géométrie. */
function firstGrowthPoint(station: Pick<Station, "zones" | "zoneQueue">) {
  const [point] = computeGrowthPoints(station);
  if (!point) throw new Error("Aucun point de croissance disponible");
  return point;
}

const baseEffects = computeEffects(["orbital_engineering"]);

describe("canFoundStation", () => {
  it("refuse sans aucun type de zone débloqué", () => {
    expect(canFoundStation(NO_EFFECTS)).toBe(false);
  });

  it("autorise dès qu'un type de zone est débloqué", () => {
    expect(canFoundStation(baseEffects)).toBe(true);
  });
});

describe("enqueueZone", () => {
  it("paie le coût et ajoute à la file, positionnée au point de croissance demandé", () => {
    const station = makeStation({
      resources: { ...emptyStationResources(), metals: 500, components: 200 },
    });
    const { q, r } = firstGrowthPoint(station);
    const result = enqueueZone(station, "industrial_zone", q, r, 1000, baseEffects);
    if (!result.ok) throw new Error(result.reason);
    expect(result.station.resources.metals).toBe(
      500 - ZONE_TYPES.industrial_zone.cost.metals!,
    );
    expect(result.station.resources.components).toBe(
      200 - ZONE_TYPES.industrial_zone.cost.components!,
    );
    expect(result.station.zoneQueue).toHaveLength(1);
    expect(result.station.zoneQueue[0]).toMatchObject({ q, r });
    expect(result.station.zoneQueue[0]!.finishesAt).toBe(
      1000 + ZONE_TYPES.industrial_zone.buildMs,
    );
  });

  it("refuse une zone dont la tech n'est pas recherchée", () => {
    const station = makeStation({
      resources: { ...emptyStationResources(), metals: 500, components: 200 },
    });
    const { q, r } = firstGrowthPoint(station);
    const result = enqueueZone(station, "science_zone", q, r, 0, baseEffects);
    expect(result.ok).toBe(false);
  });

  it("refuse si ressources insuffisantes", () => {
    const station = makeStation({
      resources: { ...emptyStationResources(), metals: 10 },
    });
    const { q, r } = firstGrowthPoint(station);
    const result = enqueueZone(station, "industrial_zone", q, r, 0, baseEffects);
    expect(result.ok).toBe(false);
  });

  it("refuse un emplacement qui n'est pas un point de croissance valide", () => {
    const station = makeStation({
      resources: { ...emptyStationResources(), metals: 500, components: 200 },
    });
    // Le hub (0,0) n'est jamais un point de croissance valide.
    const result = enqueueZone(station, "industrial_zone", 0, 0, 0, baseEffects);
    expect(result.ok).toBe(false);
  });

  it("refuse de viser deux fois la même cellule (déjà réservée en file)", () => {
    let station = makeStation({
      resources: { ...emptyStationResources(), metals: 100_000, components: 100_000 },
    });
    const { q, r } = firstGrowthPoint(station);
    const first = enqueueZone(station, "industrial_zone", q, r, 0, baseEffects);
    if (!first.ok) throw new Error(first.reason);
    station = first.station;
    const second = enqueueZone(station, "industrial_zone", q, r, 0, baseEffects);
    expect(second.ok).toBe(false);
  });

  it("n'a pas de plafond de nombre de zones — seul le coût limite", () => {
    let station = makeStation({
      resources: {
        ...emptyStationResources(),
        metals: 100_000,
        components: 100_000,
      },
    });
    for (let i = 0; i < 10; i++) {
      const { q, r } = firstGrowthPoint(station);
      const result = enqueueZone(station, "industrial_zone", q, r, 0, baseEffects);
      if (!result.ok) throw new Error(result.reason);
      station = result.station;
    }
    expect(station.zoneQueue).toHaveLength(10);
  });
});

describe("resolveZoneQueue", () => {
  it("convertit les zones terminées en instances positionnées", () => {
    const station = makeStation({
      zoneQueue: [
        { zoneTypeId: "industrial_zone", q: 1, r: 0, startedAt: 0, finishesAt: 1000 },
      ],
    });
    const resolved = resolveZoneQueue(station, 1000);
    expect(resolved.zones).toEqual([{ zoneTypeId: "industrial_zone", q: 1, r: 0 }]);
    expect(resolved.zoneQueue).toHaveLength(0);
  });

  it("laisse en file ce qui n'est pas encore terminé", () => {
    const station = makeStation({
      zoneQueue: [
        { zoneTypeId: "industrial_zone", q: 1, r: 0, startedAt: 0, finishesAt: 2000 },
      ],
    });
    const resolved = resolveZoneQueue(station, 1000);
    expect(resolved.zones).toHaveLength(0);
    expect(resolved.zoneQueue).toHaveLength(1);
  });
});

describe("enqueueInstallation", () => {
  const effects = computeEffects(["orbital_engineering"]);

  it("refuse sans emplacement de zone disponible", () => {
    const station = makeStation({
      resources: { ...emptyStationResources(), metals: 500 },
      zones: [],
    });
    const result = enqueueInstallation(
      station,
      "orbital_solar_array",
      0,
      effects,
    );
    expect(result.ok).toBe(false);
  });

  it("accepte dans la limite des zones construites", () => {
    const station = makeStation({
      resources: { ...emptyStationResources(), metals: 500 },
      zones: [{ zoneTypeId: "industrial_zone", q: 1, r: 0 }],
    });
    const result = enqueueInstallation(
      station,
      "orbital_solar_array",
      1000,
      effects,
    );
    if (!result.ok) throw new Error(result.reason);
    expect(result.station.installQueue).toHaveLength(1);
    expect(result.station.resources.metals).toBe(
      500 - INSTALLATIONS.orbital_solar_array.cost.metals!,
    );
  });

  it("refuse au-delà du nombre de zones du type visé", () => {
    let station = makeStation({
      resources: { ...emptyStationResources(), metals: 100_000 },
      zones: [{ zoneTypeId: "industrial_zone", q: 1, r: 0 }],
    });
    const first = enqueueInstallation(
      station,
      "orbital_solar_array",
      0,
      effects,
    );
    if (!first.ok) throw new Error(first.reason);
    station = first.station;
    const second = enqueueInstallation(
      station,
      "orbital_solar_array",
      0,
      effects,
    );
    expect(second.ok).toBe(false);
  });
});

describe("resolveInstallQueue", () => {
  it("convertit les installations terminées en instances", () => {
    const station = makeStation({
      installQueue: [
        {
          installationId: "orbital_solar_array",
          startedAt: 0,
          finishesAt: 500,
        },
      ],
    });
    const resolved = resolveInstallQueue(station, 500);
    expect(resolved.installations.orbital_solar_array).toBe(1);
    expect(resolved.installQueue).toHaveLength(0);
  });
});

describe("applyStationTick", () => {
  it("produit sans intrant (panneau solaire)", () => {
    const station = makeStation({ installations: { orbital_solar_array: 2 } });
    const next = applyStationTick(station);
    expect(next.resources.energy).toBe(
      INSTALLATIONS.orbital_solar_array.outputs!.energy! * 2,
    );
  });

  it("consomme les intrants et produit en proportion", () => {
    const station = makeStation({
      resources: { ...emptyStationResources(), ore: 100, energy: 100 },
      installations: { orbital_smelter_module: 1 },
    });
    const next = applyStationTick(station);
    expect(next.resources.ore).toBe(
      100 - INSTALLATIONS.orbital_smelter_module.inputs!.ore!,
    );
    expect(next.resources.metals).toBe(
      INSTALLATIONS.orbital_smelter_module.outputs!.metals!,
    );
  });

  it("tourne à vide si les intrants manquent — la pénurie se propage", () => {
    const station = makeStation({
      resources: emptyStationResources(),
      installations: { orbital_smelter_module: 1 },
    });
    const next = applyStationTick(station);
    expect(next.resources.metals).toBe(0);
  });
});

describe("takeFromStation / deliverToStation", () => {
  it("livre puis prélève une cargaison", () => {
    const station = makeStation();
    const delivered = deliverToStation(station, { ore: 50 });
    expect(delivered.resources.ore).toBe(50);
    const taken = takeFromStation(delivered, { ore: 30 });
    expect(taken?.resources.ore).toBe(20);
  });

  it("refuse de prélever plus que le stock", () => {
    const station = makeStation({
      resources: { ...emptyStationResources(), ore: 10 },
    });
    expect(takeFromStation(station, { ore: 20 })).toBeNull();
  });
});

describe("hasResourceMarket / hasBlueprintMarket (chantier 25)", () => {
  it("refuse sans installation construite", () => {
    expect(hasResourceMarket(makeStation())).toBe(false);
    expect(hasBlueprintMarket(makeStation())).toBe(false);
  });

  it("refuse tant que l'installation est seulement en file", () => {
    const station = makeStation({
      installQueue: [
        {
          installationId: "orbital_trade_exchange",
          startedAt: 0,
          finishesAt: 1000,
        },
      ],
    });
    expect(hasResourceMarket(station)).toBe(false);
  });

  it("autorise dès que l'installation de marché de ressources est construite", () => {
    const station = makeStation({
      installations: { orbital_trade_exchange: 1 },
    });
    expect(hasResourceMarket(station)).toBe(true);
    expect(hasBlueprintMarket(station)).toBe(false);
  });

  it("autorise le marché de plans indépendamment du marché de ressources", () => {
    const station = makeStation({
      installations: { orbital_brokerage_house: 1 },
    });
    expect(hasBlueprintMarket(station)).toBe(true);
    expect(hasResourceMarket(station)).toBe(false);
  });

  it("une installation sans grants (ex. panneau solaire) n'ouvre aucun marché", () => {
    const station = makeStation({
      installations: { orbital_solar_array: 1 },
    });
    expect(hasResourceMarket(station)).toBe(false);
    expect(hasBlueprintMarket(station)).toBe(false);
  });
});
