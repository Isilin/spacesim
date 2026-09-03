import { beforeEach, describe, expect, it } from "vitest";
import {
  OBJECTIVE_DURATION_MS,
  OBJECTIVE_KINDS,
  OBJECTIVE_REWARD_CREDITS,
} from "@spacesim/shared";
import { GameEngine } from "../../game.js";
import { resetDb, advanceTicks, summaries } from "../../test-harness.js";

beforeEach(() => resetDb());

describe("GameEngine — objectifs éphémères (chantier 17)", () => {
  it("un empire humain se voit tirer un objectif éphémère au premier tick économique", async () => {
    const engine = await GameEngine.loadOrBootstrap();
    const empire = engine.defaultEmpireForDev;
    advanceTicks(engine, 12);
    const objectives = engine.snapshotForEmpire(empire).objectives;
    expect(objectives.length).toBeGreaterThan(0);
    // Ce que ce test prouve : qu'un objectif est TIRÉ. Son statut n'en fait pas partie —
    // `lead_population` et `lead_influence` sont remplis d'emblée par le seul empire humain
    // de la partie, qui devance forcément les PNJ. La seed étant tirée au hasard à chaque
    // boot, exiger « open » faisait échouer ce test une fois sur trois selon le tirage.
    expect(OBJECTIVE_KINDS).toContain(objectives[0]!.kind);
    expect(objectives[0]!.deadline).toBeGreaterThan(objectives[0]!.createdAt);
  });

  it("un empire PNJ ne reçoit jamais d'objectif éphémère", async () => {
    const engine = await GameEngine.loadOrBootstrap();
    engine.ensureNpcPopulation(1);
    const npc = engine.empireById(
      summaries(engine).find((e) => e.kind === "npc")!.id,
    )!;
    advanceTicks(engine, 100);
    expect(engine.snapshotForEmpire(npc).objectives).toHaveLength(0);
  });

  it("les objectifs sont redactés : jamais visibles d'un tiers", async () => {
    const engine = await GameEngine.loadOrBootstrap();
    const empire = engine.defaultEmpireForDev;
    // Aussi humain : reçoit son PROPRE objectif — la redaction se prouve en vérifiant
    // qu'il ne voit pas celui de l'autre, pas qu'il n'en a aucun.
    const other = engine.empireById(engine.devSpawnEmpire("Curieux")!)!;
    advanceTicks(engine, 12);
    const mine = engine.snapshotForEmpire(empire).objectives;
    const theirs = engine.snapshotForEmpire(other).objectives;
    expect(mine.length).toBeGreaterThan(0);
    expect(theirs.length).toBeGreaterThan(0);
    expect(mine.some((o) => theirs.some((t) => t.id === o.id))).toBe(false);
  });

  it("un objectif se résout toujours (rempli ou expiré), jamais bloqué indéfiniment", async () => {
    const engine = await GameEngine.loadOrBootstrap();
    const empire = engine.defaultEmpireForDev;
    advanceTicks(engine, 12);
    const objective = engine.snapshotForEmpire(empire).objectives[0]!;

    advanceTicks(engine, Math.ceil(OBJECTIVE_DURATION_MS / 5000) + 5);

    const resolved = engine
      .snapshotForEmpire(empire)
      .objectives.find((o) => o.id === objective.id)!;
    expect(["completed", "expired"]).toContain(resolved.status);
  });

  it("rempli, un objectif verse sa récompense en crédits", async () => {
    const engine = await GameEngine.loadOrBootstrap();
    const empire = engine.defaultEmpireForDev;
    advanceTicks(engine, 12);
    const objective = engine.snapshotForEmpire(empire).objectives[0]!;
    // Seul empire de la partie : forcément en tête de population/influence, donc au moins
    // ces deux tirages se valident tout de suite (colonize_n_systems/hold_system, non).
    if (
      objective.kind !== "lead_population" &&
      objective.kind !== "lead_influence"
    )
      return;

    const creditsBefore = [...empire.colonyMap.values()][0]!.resources.credits;
    advanceTicks(engine, 2);

    const resolved = engine
      .snapshotForEmpire(empire)
      .objectives.find((o) => o.id === objective.id)!;
    expect(resolved.status).toBe("completed");
    expect(
      [...empire.colonyMap.values()][0]!.resources.credits,
    ).toBeGreaterThanOrEqual(creditsBefore + OBJECTIVE_REWARD_CREDITS);
  });

  it("respecte un cooldown : pas de nouveau tirage juste après la résolution du précédent", async () => {
    const engine = await GameEngine.loadOrBootstrap();
    const empire = engine.defaultEmpireForDev;
    advanceTicks(engine, 12);
    const first = engine.snapshotForEmpire(empire).objectives[0]!;
    // Dépasse l'échéance : le premier objectif se résout (rempli ou expiré).
    advanceTicks(engine, Math.ceil(OBJECTIVE_DURATION_MS / 5000) + 5);
    expect(
      engine
        .snapshotForEmpire(empire)
        .objectives.find((o) => o.id === first.id)!.status,
    ).not.toBe("open");
    // Un seul tick économique de plus ne suffit pas à retirer un objectif : le cooldown
    // (aligné sur OBJECTIVE_DURATION_MS) doit encore courir.
    advanceTicks(engine, 12);
    expect(
      engine
        .snapshotForEmpire(empire)
        .objectives.some((o) => o.status === "open"),
    ).toBe(false);
  });
});
