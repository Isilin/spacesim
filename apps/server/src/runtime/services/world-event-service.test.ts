import { beforeEach, describe, expect, it } from "vitest";
import { GameEngine } from "../../game.js";
import { resetDb, advanceTicks } from "../../test-harness.js";

beforeEach(() => resetDb());

describe("GameEngine — événements de monde (chantier 17)", () => {
  it("devTriggerWorldEvent (galaxie) crée un événement visible, non brouillardé", () => {
    const engine = GameEngine.loadOrBootstrap();
    const galaxyId = engine.universe.galaxies[0]!.id;
    const other = engine.empireById(engine.devSpawnEmpire("Spectateur")!)!;

    const eventId = engine.devTriggerWorldEvent("economic_crisis", galaxyId);
    expect(eventId).not.toBeNull();

    const mine = engine.snapshotForEmpire(engine.defaultEmpireForDev).worldEvents;
    const theirs = engine.snapshotForEmpire(other).worldEvents;
    expect(mine.some((e) => e.id === eventId)).toBe(true);
    expect(theirs.some((e) => e.id === eventId)).toBe(true);
  });

  it("devTriggerWorldEvent (faction_boom) force aussitôt l'humeur de la faction visée", () => {
    const engine = GameEngine.loadOrBootstrap();
    const factionId = engine.factionStates[0]!.factionId;

    const eventId = engine.devTriggerWorldEvent("faction_boom", factionId);
    expect(eventId).not.toBeNull();
    expect(engine.factionStates.find((s) => s.factionId === factionId)!.mood).toBe("boom");
  });

  it("devTriggerWorldEvent refuse une cible inconnue", () => {
    const engine = GameEngine.loadOrBootstrap();
    expect(engine.devTriggerWorldEvent("faction_boom", "inconnue")).toBeNull();
    expect(engine.devTriggerWorldEvent("economic_crisis", "gal-inconnue")).toBeNull();
  });

  it("un événement de monde expire et disparaît du flux", () => {
    const engine = GameEngine.loadOrBootstrap();
    const galaxyId = engine.universe.galaxies[0]!.id;
    const eventId = engine.devTriggerWorldEvent("gold_rush", galaxyId, 10_000);

    advanceTicks(engine, 12); // dépasse largement les 10s réglées

    expect(
      engine
        .snapshotForEmpire(engine.defaultEmpireForDev)
        .worldEvents.some((e) => e.id === eventId),
    ).toBe(false);
  });

  it("un événement finit par se déclencher naturellement au fil des ticks économiques", () => {
    const engine = GameEngine.loadOrBootstrap();
    let sawEvent = false;
    for (let i = 0; i < 300 && !sawEvent; i++) {
      advanceTicks(engine, 12); // un tick économique par itération
      sawEvent = engine.snapshotForEmpire(engine.defaultEmpireForDev).worldEvents.length > 0;
    }
    // Chance de déclenchement 5 %/tick éco : probabilité d'échec sur 300 essais ~2e-7 —
    // marge large (le module pur est déjà testé en détail, ceci ne vérifie que le câblage).
    expect(sawEvent).toBe(true);
  });
});
