import { beforeEach, describe, expect, it } from "vitest";
import { GameEngine } from "../../game.js";
import { resetDb, WARSHIP, empireFor } from "../../test-harness.js";

beforeEach(() => resetDb());

describe("GameEngine — propositions de pacte (chantier 16)", () => {
  it("propose un NAP : visible des deux côtés, invisible d'un tiers", async () => {
    const engine = await GameEngine.loadOrBootstrap();
    const a = empireFor(engine, "alpha");
    const b = empireFor(engine, "bravo");
    const c = empireFor(engine, "curieux");

    expect(engine.diplomacy.proposeRelation(a, b.id, "nap")).toBeNull();

    const proposalA = engine.snapshotForEmpire(a).proposals[0];
    const proposalB = engine.snapshotForEmpire(b).proposals[0];
    expect(proposalA).toBeDefined();
    expect(proposalA).toEqual(proposalB);
    expect(proposalA!.fromEmpireId).toBe(a.id);
    expect(proposalA!.toEmpireId).toBe(b.id);
    expect(proposalA!.kind).toBe("nap");
    expect(engine.snapshotForEmpire(c).proposals).toHaveLength(0);
  });

  it("respondRelation : accepter établit le pacte, refuser n'y change rien", async () => {
    const engine = await GameEngine.loadOrBootstrap();
    const a = empireFor(engine, "alpha");
    const b = empireFor(engine, "bravo");
    engine.diplomacy.proposeRelation(a, b.id, "nap");
    const proposalId = engine.snapshotForEmpire(b).proposals[0]!.id;

    expect(engine.diplomacy.respondRelation(b, proposalId, true)).toBeNull();
    const relation = engine
      .snapshotForEmpire(a)
      .relations.find((r) => r.empireA === a.id || r.empireB === a.id);
    expect(relation?.state).toBe("nap");
    expect(engine.snapshotForEmpire(a).proposals).toHaveLength(0);
  });

  it("respondRelation : un refus retire la proposition sans créer de relation", async () => {
    const engine = await GameEngine.loadOrBootstrap();
    const a = empireFor(engine, "alpha");
    const b = empireFor(engine, "bravo");
    engine.diplomacy.proposeRelation(a, b.id, "nap");
    const proposalId = engine.snapshotForEmpire(b).proposals[0]!.id;

    expect(engine.diplomacy.respondRelation(b, proposalId, false)).toBeNull();
    expect(engine.snapshotForEmpire(a).proposals).toHaveLength(0);
    expect(engine.snapshotForEmpire(a).relations).toHaveLength(0);
  });

  it("respondRelation : seul le destinataire peut répondre", async () => {
    const engine = await GameEngine.loadOrBootstrap();
    const a = empireFor(engine, "alpha");
    const b = empireFor(engine, "bravo");
    engine.diplomacy.proposeRelation(a, b.id, "nap");
    const proposalId = engine.snapshotForEmpire(b).proposals[0]!.id;

    expect(engine.diplomacy.respondRelation(a, proposalId, true)).toBe(
      "Proposition inconnue",
    );
  });

  it("proposeRelation : refuse un doublon tant qu'une proposition est en attente", async () => {
    const engine = await GameEngine.loadOrBootstrap();
    const a = empireFor(engine, "alpha");
    const b = empireFor(engine, "bravo");
    expect(engine.diplomacy.proposeRelation(a, b.id, "nap")).toBeNull();
    expect(engine.diplomacy.proposeRelation(a, b.id, "alliance")).toMatch(
      /déjà en attente/,
    );
    // Même dans l'autre sens : la clé de proposition est canonique.
    expect(engine.diplomacy.proposeRelation(b, a.id, "nap")).toMatch(
      /déjà en attente/,
    );
  });

  it("cancelProposal : seul l'émetteur peut retirer sa propre proposition", async () => {
    const engine = await GameEngine.loadOrBootstrap();
    const a = empireFor(engine, "alpha");
    const b = empireFor(engine, "bravo");
    engine.diplomacy.proposeRelation(a, b.id, "nap");
    const proposalId = engine.snapshotForEmpire(a).proposals[0]!.id;

    expect(engine.diplomacy.cancelProposal(b, proposalId)).toBe(
      "Proposition inconnue",
    );
    expect(engine.diplomacy.cancelProposal(a, proposalId)).toBeNull();
    expect(engine.snapshotForEmpire(a).proposals).toHaveLength(0);
  });

  it("breakRelation : rompt un pacte en vigueur, refuse s'il n'y en a pas", async () => {
    const engine = await GameEngine.loadOrBootstrap();
    const a = empireFor(engine, "alpha");
    const b = empireFor(engine, "bravo");
    expect(engine.diplomacy.breakRelation(a, b.id)).toMatch(/Aucun pacte/);

    engine.diplomacy.proposeRelation(a, b.id, "alliance");
    engine.diplomacy.respondRelation(
      b,
      engine.snapshotForEmpire(b).proposals[0]!.id,
      true,
    );
    expect(engine.diplomacy.breakRelation(a, b.id)).toBeNull();
    const relation = engine
      .snapshotForEmpire(a)
      .relations.find((r) => r.empireA === a.id || r.empireB === a.id);
    expect(relation?.state).toBe("neutral");
  });

  it("un PNJ répond immédiatement à un NAP : jamais de proposition qui reste en attente", async () => {
    const engine = await GameEngine.loadOrBootstrap();
    const a = empireFor(engine, "alpha");
    const npc = engine.empireById(engine.devSpawnNpcEmpire("Voisin")!)!;

    expect(engine.diplomacy.proposeRelation(a, npc.id, "nap")).toBeNull();
    expect(engine.snapshotForEmpire(a).proposals).toHaveLength(0);
    const relation = engine
      .snapshotForEmpire(a)
      .relations.find((r) => r.empireA === a.id || r.empireB === a.id);
    expect(relation?.state).toBe("nap");
  });

  it("un PNJ refuse une alliance avec un partenaire de force très disproportionnée", async () => {
    const engine = await GameEngine.loadOrBootstrap();
    const a = empireFor(engine, "alpha");
    const npc = engine.empireById(engine.devSpawnNpcEmpire("Voisin")!)!;
    // Écrase le ratio de puissance : le PNJ n'a aucune flotte, le proposeur en a une énorme.
    engine.devArmFleet(a, "gal-0-sys-0", { [WARSHIP]: 500 });
    engine.devArmFleet(npc, "gal-0-sys-0", { [WARSHIP]: 1 });

    expect(engine.diplomacy.proposeRelation(a, npc.id, "alliance")).toBeNull();
    expect(engine.snapshotForEmpire(a).proposals).toHaveLength(0);
    const relation = engine
      .snapshotForEmpire(a)
      .relations.find((r) => r.empireA === a.id || r.empireB === a.id);
    // Refusée : pas d'alliance, la relation reste neutre (ou absente).
    expect(relation?.state ?? "neutral").not.toBe("alliance");
  });
});
