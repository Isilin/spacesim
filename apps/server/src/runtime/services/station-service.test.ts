import { beforeEach, describe, expect, it } from "vitest";
import { GameEngine } from "../../game.js";
import { advanceTicks, empireFor, resetDb } from "../../test-harness.js";

beforeEach(() => resetDb());

describe("GameEngine — stations orbitales (chantier 24)", () => {
  /** Colonie mère de l'empire, relue depuis le snapshot. */
  const homeColony = (
    engine: GameEngine,
    empire: ReturnType<typeof empireFor>,
  ) => engine.snapshotForEmpire(empire).colonies[0]!;

  /** Débloque `orbital_engineering` (et sa chaîne de prérequis) — la file de recherche
   *  s'enchaîne seule (chantier 11) ; on relance des fast-forward jusqu'à ce que le
   *  dernier maillon soit acquis, sans dépendre du nombre exact d'étapes. */
  function unlockOrbitalEngineering(
    engine: GameEngine,
    empire: ReturnType<typeof empireFor>,
  ): void {
    engine.devGrant({ science: 100_000 });
    expect(
      engine.industry.queueResearch(empire, "orbital_engineering"),
    ).toBeNull();
    for (let i = 0; i < 20; i++) {
      if (empire.researched.includes("orbital_engineering")) return;
      advanceTicks(engine, 200);
    }
    throw new Error(
      "orbital_engineering non débloquée après 20 relances de fast-forward",
    );
  }

  /** Un corps non colonisé, dans un système déjà exploré (galaxie d'origine). */
  function uncolonizedBody(
    engine: GameEngine,
    empire: ReturnType<typeof empireFor>,
  ) {
    const colonizedIds = new Set(
      [...empire.colonyMap.values()].map(
        (c: { planetId: string }) => c.planetId,
      ),
    );
    const body = engine.universe.galaxies[0]!.systems.flatMap(
      (s) => s.planets,
    ).find((p) => empire.explored.has(p.systemId) && !colonizedIds.has(p.id));
    if (!body)
      throw new Error(
        "aucun corps non colonisé dans le brouillard de l'empire",
      );
    return body;
  }

  it("refuse de fonder une station sans technologie de zone débloquée", async () => {
    const engine = await GameEngine.loadOrBootstrap();
    const empire = empireFor(engine, "alice");
    const colony = homeColony(engine, empire);
    const body = uncolonizedBody(engine, empire);
    expect(engine.station.foundStation(empire, colony.id, body.id)).toMatch(
      /Aucun type de zone débloqué/,
    );
  });

  it("fonde une station : coût débité, mission créée, station matérialisée à l'arrivée", async () => {
    const engine = await GameEngine.loadOrBootstrap();
    const empire = empireFor(engine, "alice");
    unlockOrbitalEngineering(engine, empire);
    engine.devGrant({ metals: 1000, components: 500, credits: 1000 });

    const colony = homeColony(engine, empire);
    const body = uncolonizedBody(engine, empire);
    const creditsBefore = colony.resources.credits;

    expect(engine.station.foundStation(empire, colony.id, body.id)).toBeNull();
    expect(empire.missionMap.size).toBeGreaterThan(0);
    const mission = [...empire.missionMap.values()].find(
      (m) => m.kind === "found_station",
    );
    expect(mission?.targetId).toBe(body.id);

    const afterDebit = homeColony(engine, empire);
    expect(afterDebit.resources.credits).toBeLessThan(creditsBefore);
    expect(empire.stationMap.size).toBe(0);

    // Rejoue le trajet : fast-forward large, la mission a un délai réel (chantier 24.5).
    advanceTicks(engine, 1000);
    expect(empire.stationMap.size).toBe(1);
    const station = [...empire.stationMap.values()][0]!;
    expect(station.bodyId).toBe(body.id);
    expect(station.ownerId).toBe(empire.id);
  });

  it("construit une zone puis une installation, et la production tourne au tick", async () => {
    const engine = await GameEngine.loadOrBootstrap();
    const empire = empireFor(engine, "alice");
    unlockOrbitalEngineering(engine, empire);
    engine.devGrant({ metals: 1000, components: 500, credits: 1000 });

    const colony = homeColony(engine, empire);
    const body = uncolonizedBody(engine, empire);
    expect(engine.station.foundStation(empire, colony.id, body.id)).toBeNull();
    advanceTicks(engine, 1000);
    const stationId = [...empire.stationMap.keys()][0]!;

    // Le transfert ponctuel vers une station (chantier 24.6) n'existe pas encore : on
    // crédite directement le stock pour isoler la construction de zones/installations
    // de son mode d'approvisionnement.
    const station = empire.stationMap.get(stationId)!;
    empire.stationMap.set(stationId, {
      ...station,
      resources: {
        ...station.resources,
        metals: 1000,
        components: 500,
        ore: 500,
        energy: 500,
      },
    });

    expect(
      engine.station.buildZone(empire, stationId, "industrial_zone"),
    ).toBeNull();
    advanceTicks(engine, 100);
    expect(empire.stationMap.get(stationId)!.zones.industrial_zone).toBe(1);

    expect(
      engine.station.buildInstallation(
        empire,
        stationId,
        "orbital_solar_array",
      ),
    ).toBeNull();
    // Une deuxième installation du même type dépasserait l'unique emplacement de zone.
    expect(
      engine.station.buildInstallation(
        empire,
        stationId,
        "orbital_solar_array",
      ),
    ).toMatch(/emplacement/);
    advanceTicks(engine, 100);
    const built = empire.stationMap.get(stationId)!;
    expect(built.installations.orbital_solar_array).toBe(1);

    const energyBefore = built.resources.energy;
    advanceTicks(engine, 5);
    const afterTick = empire.stationMap.get(stationId)!;
    expect(afterTick.resources.energy).toBeGreaterThan(energyBefore);
  });
});
