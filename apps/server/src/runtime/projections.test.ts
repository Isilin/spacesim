import { emptyOrbital, emptyResources, generateUniverse } from "@spacesim/shared";
import { describe, expect, it } from "vitest";
import { Empire } from "../empire.js";
import { GameRuntime } from "./game-runtime.js";
import {
  clientUniverseForEmpire,
  foreignPresenceForEmpire,
  leaderboardForEmpire,
  marketsForEmpire,
  snapshotForEmpire,
  territoriesForEmpire,
} from "./projections.js";

/**
 * Runtime + deux empires : `a` a exploré `systemA` (sa colonie mère) mais pas `systemB`,
 * où `b` est installé. Aucune base de données — GameRuntime et Empire sont purement en
 * mémoire, donc ces tests n'ont besoin ni de db/index.js ni de resetDb().
 */
function twoEmpireFixture() {
  const runtime = new GameRuntime(
    {
      id: "game-1",
      seed: "projections-test",
      tick: 0,
      lastTickAt: Date.now(),
      galaxyCount: 1,
    },
    generateUniverse("projections-test", 1),
  );
  const systems = runtime.universe.galaxies[0]!.systems;
  const systemA = systems[0]!.id;
  const systemB = systems[1]!.id;
  const planetA = systems[0]!.planets[0]!.id;
  const planetB = systems[1]!.planets[0]!.id;

  const a = new Empire("empire-a", "Alpha", "#f00");
  const b = new Empire("empire-b", "Bravo", "#0f0");
  a.explored.add(systemA);
  b.explored.add(systemB);
  runtime.empires.set(a.id, a);
  runtime.empires.set(b.id, b);
  runtime.defaultEmpire = a;
  // `foreignPresenceForEmpire` lit runtime.content.installations (chantier 25) — seul
  // champ exercé par ces tests, le reste n'a pas besoin d'être un ContentBundle valide.
  runtime.content = { installations: {} } as GameRuntime["content"];

  const colonyA = {
    id: "colony-a",
    planetId: planetA,
    name: "Colonie A",
    resources: emptyResources(),
    orbitalResources: emptyOrbital(),
    liftRules: {},
    buildings: {},
    queue: [],
    population: 10,
    satisfaction: 80,
    ships: {},
    shipsBusy: [],
    shipQueue: [],
  };
  const colonyB = { ...colonyA, id: "colony-b", planetId: planetB, name: "Colonie B" };
  a.colonyMap.set(colonyA.id, colonyA);
  b.colonyMap.set(colonyB.id, colonyB);

  const fleetB = {
    id: "fleet-b",
    name: "Garde",
    systemId: systemB,
    homeColonyId: colonyB.id,
    ships: { fighter: 2 },
    directives: {},
    queue: [],
    movement: null,
  };
  b.fleetMap.set(fleetB.id, fleetB);

  const stationB = {
    id: "station-b",
    ownerId: b.id,
    bodyId: planetB,
    systemId: systemB,
    name: "Station B",
    resources: emptyResources(),
    zones: { commercial_zone: 1 },
    zoneQueue: [],
    installations: {},
    installQueue: [],
    marketAccess: "closed" as const,
    marketTaxRate: 0,
  };
  b.stationMap.set(stationB.id, stationB);

  return { runtime, a, b, systemA, systemB, stationB };
}

describe("projections — isolation multi-empire", () => {
  it("clientUniverseForEmpire ne masque pas les systèmes explorés par l'empire", () => {
    const { runtime, a, systemA, systemB } = twoEmpireFixture();
    const redacted = clientUniverseForEmpire(runtime, a);
    const system = redacted.galaxies[0]!.systems.find((s) => s.id === systemA)!;
    expect(system.planets.length).toBeGreaterThan(0);
    const other = redacted.galaxies[0]!.systems.find((s) => s.id === systemB)!;
    expect(other.planets).toHaveLength(0);
  });

  it("marketsForEmpire ne renvoie que les comptoirs des systèmes explorés", () => {
    const { runtime, a, systemA } = twoEmpireFixture();
    runtime.marketMap.set("comptoir-a", emptyResources());
    runtime.marketMap.set("comptoir-b", emptyResources());
    runtime.tradingPostsById.set("comptoir-a", {
      id: "comptoir-a",
      systemId: systemA,
      factionId: "faction",
      name: "comptoir A",
    });
    runtime.tradingPostsById.set("comptoir-b", {
      id: "comptoir-b",
      systemId: "unexplored-system",
      factionId: "faction",
      name: "comptoir B",
    });
    const markets = marketsForEmpire(runtime, a);
    expect(markets.map((m) => m.tradingPostId)).toEqual(["comptoir-a"]);
  });

  it("territoriesForEmpire montre ses propres claims même non explorés, jamais ceux d'un tiers non exploré", () => {
    const { runtime, a, b, systemB } = twoEmpireFixture();
    a.claimedSystemIds = ["far-away-system"]; // pas exploré, mais c'est le sien : visible
    b.claimedSystemIds = [systemB]; // pas exploré par a : invisible pour a

    const territories = territoriesForEmpire(runtime, a);
    expect(territories.map((t) => t.systemId)).toEqual(["far-away-system"]);
  });

  it("foreignPresenceForEmpire ne montre jamais les entités de l'empire lui-même", () => {
    const { runtime, a, b, systemB } = twoEmpireFixture();
    a.explored.add(systemB); // a explore maintenant le système de b
    const { foreignFleets, foreignColonies } = foreignPresenceForEmpire(runtime, a);
    expect(foreignFleets.map((f) => f.id)).toEqual(["fleet-b"]);
    expect(foreignFleets.every((f) => f.ownerId !== a.id)).toBe(true);
    expect(foreignColonies.map((c) => c.id)).toEqual(["colony-b"]);

    // b, symétriquement, ne voit jamais sa propre flotte listée comme étrangère.
    const forB = foreignPresenceForEmpire(runtime, b);
    expect(forB.foreignFleets).toHaveLength(0);
  });

  it("foreignStations : sans installation de marché, aucun champ market (non-fuite, chantier 25)", () => {
    const { runtime, a, systemB } = twoEmpireFixture();
    a.explored.add(systemB);
    const { foreignStations } = foreignPresenceForEmpire(runtime, a);
    expect(foreignStations).toHaveLength(1);
    expect(foreignStations[0]!.market).toBeUndefined();
    expect(Object.keys(foreignStations[0]!)).toEqual([
      "id",
      "ownerId",
      "ownerName",
      "ownerColor",
      "name",
      "systemId",
      "bodyId",
    ]);
  });

  it("foreignStations : une installation de marché expose le stock échangeable, jamais le reste", () => {
    const { runtime, a, b, systemB, stationB } = twoEmpireFixture();
    a.explored.add(systemB);
    runtime.content = {
      ...runtime.content,
      installations: {
        orbital_trade_exchange: {
          id: "orbital_trade_exchange",
          nameFr: "Comptoir",
          descriptionFr: "",
          zoneType: "commercial_zone",
          cost: {},
          buildMs: 1000,
          inputs: null,
          outputs: null,
          requiresTech: null,
          grants: "resourceMarket",
        },
      },
    } as GameRuntime["content"];
    b.stationMap.set(stationB.id, {
      ...stationB,
      installations: { orbital_trade_exchange: 1 },
      marketAccess: "public",
      marketTaxRate: 0.05,
      resources: { ...stationB.resources, metals: 42, credits: 7 },
    });

    const { foreignStations } = foreignPresenceForEmpire(runtime, a);
    const market = foreignStations[0]!.market!;
    expect(market.hasResourceMarket).toBe(true);
    expect(market.hasBlueprintMarket).toBe(false);
    expect(market.access).toBe("public");
    expect(market.taxRate).toBe(0.05);
    expect(market.tradableStocks.metals).toBe(42);
    // Jamais les ressources hors marché (crédits/science) — même stock que la vraie
    // Station derrière, mais réduit aux MARKET_RESOURCES.
    expect(market.tradableStocks.credits).toBeUndefined();
    expect(market.tradableStocks.science).toBeUndefined();
  });

  it("leaderboardForEmpire classe tous les empires, y compris ceux non explorés par le viewer", () => {
    const { runtime, a, b } = twoEmpireFixture();
    const rows = leaderboardForEmpire(runtime, a);
    expect(rows.map((r) => r.id).sort()).toEqual([a.id, b.id].sort());
    // Le viewer a toujours une relation "neutral" envers lui-même.
    expect(rows.find((r) => r.id === a.id)?.relation).toBe("neutral");
  });

  it("snapshotForEmpire ne fuit aucune entité privée d'un autre empire", () => {
    const { runtime, a, b } = twoEmpireFixture();
    const snapshotA = snapshotForEmpire(runtime, a);
    // Colonies/flottes personnelles : uniquement les siennes.
    expect(snapshotA.colonies.map((c) => c.id)).toEqual(["colony-a"]);
    expect(snapshotA.fleets).toHaveLength(0);
    // b n'a pas encore été explorée par a : ni sa flotte, ni sa colonie n'apparaissent.
    expect(snapshotA.foreignFleets).toHaveLength(0);
    expect(snapshotA.foreignColonies).toHaveLength(0);

    const snapshotB = snapshotForEmpire(runtime, b);
    expect(snapshotB.colonies.map((c) => c.id)).toEqual(["colony-b"]);
    expect(snapshotB.fleets.map((f) => f.id)).toEqual(["fleet-b"]);
  });
});
