import { EMPIRE_EVENT_KEEP, EMPIRE_EVENT_PAGE } from "@spacesim/shared";
import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { db, schema } from "../../db/index.js";
import { GameEngine } from "../../game.js";
import { empireFor, resetDb, WARSHIP } from "../../test-harness.js";

beforeEach(() => resetDb());

describe("GameEngine — boîte de réception d'empire (chantier 32)", () => {
  it("un événement n'est visible que de son destinataire", async () => {
    const engine = await GameEngine.loadOrBootstrap();
    const a = empireFor(engine, "alpha");
    const b = empireFor(engine, "bravo");

    engine.inbox.emit({ empireId: a.id, kind: "research_completed" });

    expect(engine.snapshotForEmpire(a).events).toHaveLength(1);
    expect(engine.snapshotForEmpire(b).events).toHaveLength(0);
  });

  it("le journal arrive du plus récent au plus ancien", async () => {
    const engine = await GameEngine.loadOrBootstrap();
    const a = empireFor(engine, "alpha");

    engine.inbox.emit({ empireId: a.id, kind: "research_completed" });
    engine.inbox.emit({ empireId: a.id, kind: "claim_lost" });

    // La lecture veut les dernières nouvelles d'abord ; le stockage reste chronologique.
    expect(engine.snapshotForEmpire(a).events.map((e) => e.kind)).toEqual([
      "claim_lost",
      "research_completed",
    ]);
  });

  it("markEventRead ne marque que l'entrée visée", async () => {
    const engine = await GameEngine.loadOrBootstrap();
    const a = empireFor(engine, "alpha");
    engine.inbox.emit({ empireId: a.id, kind: "research_completed" });
    engine.inbox.emit({ empireId: a.id, kind: "claim_lost" });
    const target = engine.snapshotForEmpire(a).events[0]!;

    engine.inbox.markRead(a.id, target.id);

    const after = engine.snapshotForEmpire(a);
    expect(after.unreadEventCount).toBe(1);
    expect(after.events.find((e) => e.id === target.id)?.readAt).not.toBeNull();
  });

  it("un empire ne peut pas marquer lu l'événement d'un autre", async () => {
    const engine = await GameEngine.loadOrBootstrap();
    const a = empireFor(engine, "alpha");
    const b = empireFor(engine, "bravo");
    engine.inbox.emit({ empireId: a.id, kind: "research_completed" });
    const target = engine.snapshotForEmpire(a).events[0]!;

    // Silencieux à dessein : répondre « inconnu » révélerait l'existence du journal
    // d'autrui (ADR 0008).
    engine.inbox.markRead(b.id, target.id);

    expect(engine.snapshotForEmpire(a).unreadEventCount).toBe(1);
  });

  it("markAllEventsRead vide le compteur de non-lus", async () => {
    const engine = await GameEngine.loadOrBootstrap();
    const a = empireFor(engine, "alpha");
    for (let i = 0; i < 3; i++)
      engine.inbox.emit({ empireId: a.id, kind: "research_completed" });

    engine.inbox.markAllRead(a.id);

    expect(engine.snapshotForEmpire(a).unreadEventCount).toBe(0);
  });

  it("le snapshot est borné à une page, le compteur porte sur le total", async () => {
    const engine = await GameEngine.loadOrBootstrap();
    const a = empireFor(engine, "alpha");
    const total = EMPIRE_EVENT_PAGE + 10;
    for (let i = 0; i < total; i++)
      engine.inbox.emit({ empireId: a.id, kind: "research_completed" });

    const snapshot = engine.snapshotForEmpire(a);
    // Un joueur revenu après trois semaines n'a pas besoin de tout recevoir à chaque
    // tick pour comprendre qu'il s'est passé quelque chose.
    expect(snapshot.events).toHaveLength(EMPIRE_EVENT_PAGE);
    expect(snapshot.unreadEventCount).toBe(total);
  });

  it("la purge ne jette que du lu, jamais un non-lu même très ancien", async () => {
    const engine = await GameEngine.loadOrBootstrap();
    const a = empireFor(engine, "alpha");

    // Un non-lu tout en tête de journal : c'est exactement ce qu'un joueur absent doit
    // retrouver, et la borne ne doit pas l'emporter.
    const oldest = engine.inbox.emit({
      empireId: a.id,
      kind: "colony_attacked",
    });
    for (let i = 0; i < EMPIRE_EVENT_KEEP + 20; i++) {
      const event = engine.inbox.emit({
        empireId: a.id,
        kind: "research_completed",
      });
      engine.inbox.markRead(a.id, event.id);
    }

    expect(engine.snapshotForEmpire(a).unreadEventCount).toBe(1);

    // Vérifié en BASE et pas en mémoire : la purge doit avoir traversé le `WriteSet`,
    // sinon la table grossirait indéfiniment pendant que la RAM resterait bornée.
    await engine.flush();
    const rows = await db
      .select()
      .from(schema.empireEvents)
      .where(eq(schema.empireEvents.empireId, a.id));
    expect(rows.length).toBeLessThanOrEqual(EMPIRE_EVENT_KEEP);
    expect(rows.some((r) => r.id === oldest.id)).toBe(true);
  });
});

describe("GameEngine — émetteurs de domaine (chantier 32.4)", () => {
  it("une déclaration de guerre prévient la cible, pas l'agresseur", async () => {
    const engine = await GameEngine.loadOrBootstrap();
    const a = empireFor(engine, "alpha");
    const b = empireFor(engine, "bravo");
    a.influence = 500;

    expect(engine.diplomacy.declareWar(a, b.id)).toBeNull();

    // L'agresseur voit le résultat à l'écran ; la cible peut être hors ligne.
    expect(engine.snapshotForEmpire(a).events).toHaveLength(0);
    const received = engine.snapshotForEmpire(b).events;
    expect(received).toHaveLength(1);
    expect(received[0]!.kind).toBe("relation_changed");
    expect(received[0]!.subjectId).toBe("war");
    expect(received[0]!.otherName).toBe(a.name);
  });

  it("une bataille inscrit les DEUX camps, chacun de son point de vue", async () => {
    const engine = await GameEngine.loadOrBootstrap();
    const a = empireFor(engine, "alpha");
    const b = empireFor(engine, "bravo");
    a.influence = 1000;
    const sys = "gal-0-sys-0";
    const fa = engine.devArmFleet(a, sys, { [WARSHIP]: 50 });
    const fb = engine.devArmFleet(b, sys, { [WARSHIP]: 1 });
    engine.diplomacy.declareWar(a, b.id);

    expect(engine.fleetService.attackFleet(a, fa, fb)).toBeNull();

    // Deux entrées et non une partagée : c'est ce qui permet de rédiger selon le camp
    // sans transporter le journal de l'adversaire (ADR 0008).
    const won = engine
      .snapshotForEmpire(a)
      .events.find((e) => e.kind === "battle_won");
    const lost = engine
      .snapshotForEmpire(b)
      .events.find((e) => e.kind === "battle_lost");
    expect(won?.otherName).toBe(b.name);
    expect(won?.systemId).toBe(sys);
    expect(lost?.otherName).toBe(a.name);
    // Aucun des deux ne voit l'entrée de l'autre.
    expect(
      engine.snapshotForEmpire(a).events.some((e) => e.kind === "battle_lost"),
    ).toBe(false);
  });

  it("un pacte accepté prévient le proposant, pas celui qui répond", async () => {
    const engine = await GameEngine.loadOrBootstrap();
    const a = empireFor(engine, "alpha");
    const b = empireFor(engine, "bravo");
    engine.diplomacy.proposeRelation(a, b.id, "nap");
    const proposalId = engine.snapshotForEmpire(b).proposals[0]!.id;

    engine.diplomacy.respondRelation(b, proposalId, true);

    expect(engine.snapshotForEmpire(b).events).toHaveLength(0);
    expect(engine.snapshotForEmpire(a).events[0]!.subjectId).toBe("nap");
  });
});
