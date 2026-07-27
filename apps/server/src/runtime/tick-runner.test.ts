import {
  ECONOMY_TICK_TICKS,
  emptyOrbital,
  emptyResources,
  generateUniverse,
} from "@spacesim/shared";
import { beforeEach, describe, expect, it } from "vitest";
import { db, schema } from "../db/index.js";
import { Empire } from "../empire.js";
import { GameRuntime } from "./game-runtime.js";
import { TickRunner, type TickHost } from "./tick-runner.js";

/** Vide la seule table que TickRunner.run touche directement (games/players — pas de DB
 *  mémoire dédiée ici, ce module réutilise le singleton `db` comme le reste des tests serveur). */
beforeEach(() => {
  db.delete(schema.players).run();
  db.delete(schema.games).run();
});

/** Empire minimal, avec une colonie pour exercer `persistColony`/`persistOutposts`. */
function makeEmpire(id: string): Empire {
  const empire = new Empire(id, id, "#fff");
  empire.colonyMap.set(`${id}-colony`, {
    id: `${id}-colony`,
    planetId: "planet-x",
    name: "Colonie",
    resources: emptyResources(),
    orbitalResources: emptyOrbital(),
    liftRules: {},
    buildings: {},
    queue: [],
    population: 1,
    satisfaction: 80,
    ships: {},
    shipsBusy: [],
    shipQueue: [],
  });
  return empire;
}

/** Enregistre l'ordre d'appel de chaque phase — un host factice, pas le vrai GameEngine. */
function recordingHost(): { host: TickHost; calls: string[] } {
  const calls: string[] = [];
  const host: TickHost = {
    deliverTransfers: () => calls.push("deliverTransfers"),
    resolveMissions: () => calls.push("resolveMissions"),
    resolveResearch: () => calls.push("resolveResearch"),
    resolveGateways: () => calls.push("resolveGateways"),
    resolveContracts: () => calls.push("resolveContracts"),
    resolveObjectives: () => calls.push("resolveObjectives"),
    resolveWorldEvents: () => calls.push("resolveWorldEvents"),
    worldEventTick: () => calls.push("worldEventTick"),
    processRoutes: () => calls.push("processRoutes"),
    outpostsTick: () => calls.push("outpostsTick"),
    fleetsTick: () => calls.push("fleetsTick"),
    spawnPirates: () => calls.push("spawnPirates"),
    influenceTick: () => calls.push("influenceTick"),
    economyTick: () => calls.push("economyTick"),
    factionMoodTick: () => calls.push("factionMoodTick"),
    npcTick: () => calls.push("npcTick"),
    generateObjectives: () => calls.push("generateObjectives"),
    ensureFrontier: () => calls.push("ensureFrontier"),
    colonyProductionTick: () => calls.push("colonyProductionTick"),
    persistColony: () => calls.push("persistColony"),
    persistOutposts: () => calls.push("persistOutposts"),
    notify: () => calls.push("notify"),
  };
  return { host, calls };
}

describe("TickRunner — ordre des phases", () => {
  it("un tick non-économique saute les phases réservées au tick éco", () => {
    const runtime = new GameRuntime(
      {
        id: "g",
        seed: "tick-runner-test",
        tick: 0, // tick 1 après avance : 1 % ECONOMY_TICK_TICKS !== 0 tant que ce n'est pas un multiple
        lastTickAt: Date.now(),
        galaxyCount: 1,
      },
      generateUniverse("tick-runner-test", 1),
    );
    db.insert(schema.games)
      .values({ ...runtime.clock, createdAt: Date.now() })
      .run();
    runtime.empires.set("a", makeEmpire("a"));

    const { host, calls } = recordingHost();
    new TickRunner(runtime, host).run(1);

    expect(calls).toEqual([
      "deliverTransfers",
      "resolveMissions",
      "resolveResearch",
      "resolveGateways",
      "resolveContracts",
      "resolveObjectives",
      "resolveWorldEvents",
      "processRoutes",
      "outpostsTick",
      "fleetsTick",
      "influenceTick",
      "colonyProductionTick",
      "persistColony",
      "persistOutposts",
      "notify",
    ]);
  });

  it("un tick économique déroule aussi les phases éco, dans l'ordre documenté", () => {
    const runtime = new GameRuntime(
      {
        id: "g",
        seed: "tick-runner-test",
        tick: ECONOMY_TICK_TICKS - 1, // + 1 tick = multiple de ECONOMY_TICK_TICKS
        lastTickAt: Date.now(),
        galaxyCount: 1,
      },
      generateUniverse("tick-runner-test", 1),
    );
    db.insert(schema.games)
      .values({ ...runtime.clock, createdAt: Date.now() })
      .run();
    runtime.empires.set("a", makeEmpire("a"));

    const { host, calls } = recordingHost();
    new TickRunner(runtime, host).run(1);

    expect(calls).toEqual([
      "deliverTransfers",
      "resolveMissions",
      "resolveResearch",
      "resolveGateways",
      "resolveContracts",
      "resolveObjectives",
      "resolveWorldEvents",
      "worldEventTick",
      "processRoutes",
      "outpostsTick",
      "fleetsTick",
      "spawnPirates",
      "influenceTick",
      "economyTick",
      "factionMoodTick",
      "npcTick",
      "generateObjectives",
      "ensureFrontier",
      "colonyProductionTick",
      "persistColony",
      "persistOutposts",
      "notify",
    ]);
  });

  it("avance l'horloge et persiste tick/lastTickAt", () => {
    const runtime = new GameRuntime(
      {
        id: "g",
        seed: "tick-runner-test",
        tick: 5,
        lastTickAt: 1000,
        galaxyCount: 1,
      },
      generateUniverse("tick-runner-test", 1),
    );
    db.insert(schema.games)
      .values({ ...runtime.clock, createdAt: Date.now() })
      .run();

    const { host } = recordingHost();
    new TickRunner(runtime, host).run(3);

    expect(runtime.clock.tick).toBe(8);
    const row = db.select().from(schema.games).get()!;
    expect(row.tick).toBe(8);
  });
});
