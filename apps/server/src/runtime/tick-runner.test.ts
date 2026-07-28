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
import { Persister } from "./persistence/persister.js";
import { TickRunner, type TickServices } from "./tick-runner.js";

/** Vide la seule table que TickRunner.run touche directement (games/players — pas de DB
 *  mémoire dédiée ici, ce module réutilise le singleton `db` comme le reste des tests serveur). */
beforeEach(async () => {
  await db.delete(schema.players);
  await db.delete(schema.games);
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

/**
 * Enregistre l'ordre d'appel de chaque phase — neuf services factices (structurellement
 * compatibles avec `TickServices`), pas les vrais. `TickRunner` ne connaît plus qu'une
 * interface par service depuis le chantier 19.6 ; ce harnais reflète cette frontière.
 */
function recordingServices(): { services: TickServices; notify: () => void; calls: string[] } {
  const calls: string[] = [];
  const services: TickServices = {
    industry: {
      resolveResearch: () => calls.push("resolveResearch"),
      colonyProductionTick: () => calls.push("colonyProductionTick"),
      persistColony: () => calls.push("persistColony"),
    } as unknown as TickServices["industry"],
    logistics: {
      deliverTransfers: () => calls.push("deliverTransfers"),
      resolveMissions: () => calls.push("resolveMissions"),
      processRoutes: () => calls.push("processRoutes"),
      outpostsTick: () => calls.push("outpostsTick"),
      persistOutposts: () => calls.push("persistOutposts"),
    } as unknown as TickServices["logistics"],
    gateway: {
      resolveGateways: () => calls.push("resolveGateways"),
    } as unknown as TickServices["gateway"],
    contract: {
      resolveContracts: () => calls.push("resolveContracts"),
    } as unknown as TickServices["contract"],
    market: {
      economyTick: () => calls.push("economyTick"),
      factionMoodTick: () => calls.push("factionMoodTick"),
      npcTick: () => calls.push("npcTick"),
    } as unknown as TickServices["market"],
    exploration: {
      influenceTick: () => calls.push("influenceTick"),
      ensureFrontier: () => calls.push("ensureFrontier"),
      universeExplored: () => new Set<string>(),
      claimOwner: () => null,
    } as unknown as TickServices["exploration"],
    fleetService: {
      fleetsTick: () => calls.push("fleetsTick"),
      spawnPirates: () => calls.push("spawnPirates"),
    } as unknown as TickServices["fleetService"],
    diplomacy: {
      resolveWorldEvents: () => calls.push("resolveWorldEvents"),
      worldEventTick: () => calls.push("worldEventTick"),
    } as unknown as TickServices["diplomacy"],
    objective: {
      resolveObjectives: () => calls.push("resolveObjectives"),
      generateObjectives: () => calls.push("generateObjectives"),
    } as unknown as TickServices["objective"],
  };
  return { services, notify: () => calls.push("notify"), calls };
}

describe("TickRunner — ordre des phases", () => {
  it("un tick non-économique saute les phases réservées au tick éco", async () => {
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
    await db.insert(schema.games).values({ ...runtime.clock, createdAt: Date.now() });
    runtime.empires.set("a", makeEmpire("a"));

    const { services, notify, calls } = recordingServices();
    new TickRunner(runtime, services, notify, new Persister(runtime.writeSet)).run(1);

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

  it("un tick économique déroule aussi les phases éco, dans l'ordre documenté", async () => {
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
    await db.insert(schema.games).values({ ...runtime.clock, createdAt: Date.now() });
    runtime.empires.set("a", makeEmpire("a"));

    const { services, notify, calls } = recordingServices();
    new TickRunner(runtime, services, notify, new Persister(runtime.writeSet)).run(1);

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

  it("avance l'horloge et persiste tick/lastTickAt", async () => {
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
    await db.insert(schema.games).values({ ...runtime.clock, createdAt: Date.now() });

    const { services, notify } = recordingServices();
    const persister = new Persister(runtime.writeSet);
    new TickRunner(runtime, services, notify, persister).run(3);
    // `run()` déclenche le flush en fire-and-forget (chantier 20.2) : on l'attend ici
    // pour asserter sur la DB — `flush()` renvoie la même promesse déjà en vol.
    await persister.flush();

    expect(runtime.clock.tick).toBe(8);
    const rows = await db.select().from(schema.games);
    expect(rows[0]!.tick).toBe(8);
  });
});
