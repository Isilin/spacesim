import { beforeEach, describe, expect, it } from "vitest";
import { GameEngine } from "../../game.js";
import { resetDb, advanceTicks, empireFor } from "../../test-harness.js";

beforeEach(() => resetDb());

describe("GameEngine — logistique orbitale (chantier 12)", () => {
  /** Colonie mère de l'empire, relue depuis le snapshot. */
  const homeColony = (engine: GameEngine, empire: ReturnType<typeof empireFor>) =>
    engine.snapshotForEmpire(empire).colonies[0]!;

  it("la colonie mère naît avec un dock et une soute orbitale", async () => {
    const engine = await GameEngine.loadOrBootstrap();
    const colony = homeColony(engine, engine.defaultEmpireForDev);
    expect(colony.buildings.orbital_dock).toBe(1);
    expect(colony.orbitalResources.ore).toBeGreaterThan(0);
  });

  it("l'ascenseur hisse le surplus au fil des ticks, en consommant de l'énergie", async () => {
    const engine = await GameEngine.loadOrBootstrap();
    const before = homeColony(engine, engine.defaultEmpireForDev);
    const orbitBefore = before.orbitalResources.ore;
    advanceTicks(engine, 20);
    const after = homeColony(engine, engine.defaultEmpireForDev);
    // La règle par défaut monte le minerai au-delà du seuil gardé au sol.
    expect(after.orbitalResources.ore).toBeGreaterThan(orbitBefore);
    expect(after.resources.ore).toBeGreaterThanOrEqual(0);
  });

  /**
   * Station de la galaxie d'origine, rendue visible de l'empire. Le brouillard initial
   * ne couvre qu'un système : sans cette révélation, le test se sauterait au hasard des
   * seeds au lieu de vérifier quoi que ce soit.
   */
  const reachableStation = (engine: GameEngine, empire: ReturnType<typeof empireFor>) => {
    const station = engine.universe.galaxies[0]!.systems.find((s) => s.station)?.station;
    if (!station) throw new Error("la galaxie d'origine a toujours au moins une station");
    engine.devArmFleet(empire, station.systemId, {}); // révèle le système
    return station;
  };

  it("une expédition prélève l'orbite, jamais le sol", async () => {
    const engine = await GameEngine.loadOrBootstrap();
    const empire = empireFor(engine, "alice");
    const colony = homeColony(engine, empire);
    // La colonie mère n'a pas toujours une station chez elle : on en pose une à portée
    // en explorant, sinon le test n'aurait rien à vendre.
    const station = reachableStation(engine, empire);

    const orbitBefore = colony.orbitalResources.ore;
    const groundBefore = colony.resources.ore;
    expect(engine.market.sellToStation(empire, colony.id, station.id, { ore: 10 })).toBeNull();

    const after = homeColony(engine, empire);
    expect(after.orbitalResources.ore).toBe(orbitBefore - 10);
    // Le sol n'a pas bougé : la marchandise partait bien de l'orbite.
    expect(after.resources.ore).toBe(groundBefore);
  });

  it("le stock au sol ne se substitue pas à l'orbite quand elle est vide", async () => {
    const engine = await GameEngine.loadOrBootstrap();
    const empire = empireFor(engine, "alice");
    const colony = homeColony(engine, empire);
    const station = reachableStation(engine, empire);

    // Bien plus que l'orbite, mais couvert par le sol : doit être refusé quand même.
    const tooMuch = Math.floor(colony.orbitalResources.ore + colony.resources.ore);
    expect(engine.market.sellToStation(empire, colony.id, station.id, { ore: tooMuch })).toMatch(
      /Stock orbital insuffisant/,
    );
  });
});
