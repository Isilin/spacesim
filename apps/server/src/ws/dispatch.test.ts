import { ClientMessageSchema, type ClientMessage } from "@spacesim/protocol";
import { beforeEach, describe, expect, it } from "vitest";
import { db, schema } from "../db/index.js";
import { GameEngine } from "../game.js";
import { dispatchClientMessage } from "./dispatch.js";

/** Même liste que game.test.ts : DB en mémoire, table vidées avant chaque test. */
const ALL_TABLES = [
  schema.transfers,
  schema.missions,
  schema.outposts,
  schema.routes,
  schema.colonies,
  schema.battles,
  schema.pirateLairs,
  schema.fleets,
  schema.contracts,
  schema.factionStates,
  schema.relations,
  schema.relationProposals,
  schema.objectives,
  schema.worldEvents,
  schema.blueprints,
  schema.gateways,
  schema.claims,
  schema.players,
  schema.stationStates,
  schema.games,
] as const;

function resetDb(): void {
  for (const table of ALL_TABLES) db.delete(table).run();
}

beforeEach(() => resetDb());

describe("dispatchClientMessage — exhaustivité", () => {
  it("chaque commande du schéma protocol a une branche dans le dispatcher", async () => {
    const engine = await GameEngine.loadOrBootstrap();
    const empire = engine.defaultEmpireForDev;
    // Parcourt le schéma runtime (pas seulement le typage) : un `type` ajouté au
    // protocole sans branche correspondante tombe dans `assertNever` et ce test échoue.
    const types = ClientMessageSchema.options.map((option) => option.shape.type.value as string);
    expect(types.length).toBeGreaterThan(40);
    for (const type of types) {
      const stub = { type } as unknown as ClientMessage;
      expect(() => {
        try {
          dispatchClientMessage(engine, empire, stub);
        } catch (err) {
          if (err instanceof Error && /Commande WebSocket non gérée/.test(err.message)) throw err;
          // Un throw métier (champ manquant sur le stub minimal) est attendu et ignoré ici :
          // seule l'absence de branche dans le switch doit faire échouer ce test.
        }
      }).not.toThrow();
    }
  });
});

describe("dispatchClientMessage — passage d'arguments", () => {
  it("build : construit sur la bonne colonie, refuse une colonie d'un autre empire", async () => {
    // `createEmpireForAccount` adopte l'empire amorcé au premier appel (game.test.ts:185) :
    // les deux empires doivent donc naître d'un compte chacun, jamais l'un via
    // `defaultEmpireForDev` et l'autre via un premier appel — ce serait le même empire.
    const engine = await GameEngine.loadOrBootstrap();
    const owner = engine.createEmpireForAccount("compte-owner", "Owner")!;
    const stranger = engine.createEmpireForAccount("compte-bob", "Bob")!;
    const colonyId = engine.snapshotForEmpire(owner).colonies[0]!.id;

    const ok: ClientMessage = { type: "build", colonyId, buildingId: "mine" };
    expect(dispatchClientMessage(engine, owner, ok)).not.toBe("Colonie inconnue");
    expect(dispatchClientMessage(engine, stranger, ok)).toBe("Colonie inconnue");
  });

  it("claimSystem : revendique le système de la colonie mère", async () => {
    const engine = await GameEngine.loadOrBootstrap();
    const empire = engine.createEmpireForAccount("compte-owner", "Owner")!;
    empire.influence = 1000; // le claim coûte de l'influence (chantier 7e)
    const colony = engine.snapshotForEmpire(empire).colonies[0]!;
    const planet = engine.universe.galaxies
      .flatMap((g) => g.systems)
      .flatMap((s) => s.planets.map((p) => ({ ...p, systemId: s.id })))
      .find((p) => p.id === colony.planetId)!;

    const msg: ClientMessage = { type: "claimSystem", systemId: planet.systemId };
    expect(dispatchClientMessage(engine, empire, msg)).toBeNull();
  });

  it("proposeRelation : cible bien l'empire passé en argument, pas l'appelant", async () => {
    const engine = await GameEngine.loadOrBootstrap();
    const empire = engine.createEmpireForAccount("compte-owner", "Owner")!;
    const other = engine.createEmpireForAccount("compte-bob", "Bob")!;

    const msg: ClientMessage = {
      type: "proposeRelation",
      targetEmpireId: other.id,
      kind: "nap",
    };
    expect(dispatchClientMessage(engine, empire, msg)).toBeNull();
    const proposal = engine
      .snapshotForEmpire(other)
      .proposals.find((p) => p.fromEmpireId === empire.id);
    expect(proposal?.toEmpireId).toBe(other.id);
  });
});
