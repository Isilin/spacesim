import { beforeEach, describe, expect, it } from "vitest";
import { GameEngine } from "../../game.js";
import { resetDb, advanceTicks, empireFor } from "../../test-harness.js";

beforeEach(() => resetDb());

describe("GameEngine — état de faction (chantier 15)", () => {
  it("une partie neuve amorce les trois factions, neutres", () => {
    const engine = GameEngine.loadOrBootstrap();
    const states = engine.factionStates;
    expect(states).toHaveLength(3);
    for (const state of states) {
      expect(state.mood).toBe("neutral");
      expect(state.moodUntil).toBeNull();
    }
    expect(states.map((s) => s.factionId).sort()).toEqual(
      ["aether_cartel", "ferride", "ostara_league"].sort(),
    );
  });

  it("initFactionStates est idempotent : un rechargement ne dédouble jamais les factions", () => {
    GameEngine.loadOrBootstrap();
    const reloaded = GameEngine.loadOrBootstrap();
    expect(reloaded.factionStates).toHaveLength(3);
  });

  it("l'état de faction est diffusé à tous les empires (pas de brouillard)", () => {
    const engine = GameEngine.loadOrBootstrap();
    const other = engine.empireById(engine.devSpawnEmpire("Spectateur")!)!;
    expect(engine.snapshotForEmpire(other).factionStates).toHaveLength(3);
  });
});
describe("GameEngine — humeurs de faction (chantier 15)", () => {
  /** Station de la galaxie d'origine, révélée à l'empire (le brouillard initial ne
   * couvre qu'un système). */
  const reachableStation = (engine: GameEngine, empire: ReturnType<typeof empireFor>) => {
    const station = engine.universe.galaxies[0]!.systems.find((s) => s.station)?.station;
    if (!station) throw new Error("la galaxie d'origine a toujours au moins une station");
    engine.devArmFleet(empire, station.systemId, {});
    return station;
  };

  it("devSetFactionMood force l'humeur ; elle revient à neutre à l'échéance", () => {
    const engine = GameEngine.loadOrBootstrap();
    const factionId = engine.factionStates[0]!.factionId;
    expect(engine.devSetFactionMood(factionId, "boom", 10_000)).toBe(true);
    expect(engine.factionStates.find((s) => s.factionId === factionId)!.mood).toBe("boom");

    advanceTicks(engine, 12); // dépasse largement les 10s réglées

    expect(engine.factionStates.find((s) => s.factionId === factionId)!.mood).toBe("neutral");
  });

  it("devSetFactionMood refuse une faction inconnue", () => {
    const engine = GameEngine.loadOrBootstrap();
    expect(engine.devSetFactionMood("inconnue", "boom")).toBe(false);
  });

  it("un embargo bloque sellToStation et buyFromStation sous le seuil de standing", () => {
    const engine = GameEngine.loadOrBootstrap();
    const empire = engine.defaultEmpireForDev;
    const colony = engine.colonies[0]!;
    const station = reachableStation(engine, empire);

    expect(engine.devSetFactionMood(station.factionId, "embargo")).toBe(true);

    expect(engine.sellToStation(empire, colony.id, station.id, { ore: 10 })).toMatch(/Embargo/);
    expect(engine.buyFromStation(empire, colony.id, station.id, "ore", 10)).toMatch(/Embargo/);
  });

  it("un partenaire établi (standing suffisant) échappe à l'embargo", () => {
    const engine = GameEngine.loadOrBootstrap();
    const empire = engine.defaultEmpireForDev;
    const colony = engine.colonies[0]!;
    const station = reachableStation(engine, empire);
    empire.factionRep[station.factionId] = 500; // largement au-dessus du seuil

    expect(engine.devSetFactionMood(station.factionId, "embargo")).toBe(true);

    expect(engine.sellToStation(empire, colony.id, station.id, { ore: 10 })).toBeNull();
  });

  it("les humeurs finissent par bouger au fil des ticks économiques", () => {
    const engine = GameEngine.loadOrBootstrap();
    // Échantillonne à chaque tick éco plutôt qu'un seul gros bond : une humeur peut se
    // déclencher PUIS expirer dans la fenêtre, et l'état final seul ne le verrait pas.
    let sawNonNeutral = false;
    for (let i = 0; i < 60 && !sawNonNeutral; i++) {
      advanceTicks(engine, 12); // un tick économique par itération
      sawNonNeutral = engine.factionStates.some((s) => s.mood !== "neutral");
    }
    // Chance de bascule 8 %/tick éco/faction : probabilité d'échec conjointe ~1e-6 sur 60 essais.
    expect(sawNonNeutral).toBe(true);
  });
});
