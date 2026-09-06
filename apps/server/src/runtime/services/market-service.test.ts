import { beforeEach, describe, expect, it } from "vitest";
import { GameEngine } from "../../game.js";
import { resetDb, advanceTicks, summaries } from "../../test-harness.js";

beforeEach(() => resetDb());

describe("GameEngine — empires PNJ (chantier 14)", () => {
  it("un await GameEngine.loadOrBootstrap() nu ne seme aucun PNJ : ensureNpcPopulation reste opt-in", async () => {
    const engine = await GameEngine.loadOrBootstrap();
    expect(summaries(engine)).toHaveLength(1);
    expect(summaries(engine)[0]!.kind).toBe("human");
  });

  it("ensureNpcPopulation amorce des PNJ avec leur propre colonie mère", async () => {
    const engine = await GameEngine.loadOrBootstrap();
    engine.ensureNpcPopulation(3);
    const all = summaries(engine);
    expect(all).toHaveLength(4);
    const npcs = all.filter((e) => e.kind === "npc");
    expect(npcs).toHaveLength(3);
    for (const npc of npcs) {
      expect(npc.colonies).toHaveLength(1);
      expect(npc.isDefault).toBe(false);
    }
  });

  it("ensureNpcPopulation est idempotent : ne double jamais la population", async () => {
    const engine = await GameEngine.loadOrBootstrap();
    engine.ensureNpcPopulation(3);
    engine.ensureNpcPopulation(3);
    expect(summaries(engine).filter((e) => e.kind === "npc")).toHaveLength(3);
    // Relèvement du quota : complète sans toucher aux PNJ déjà en place (ids en SET,
    // pas triés — des UUID n'ont aucun ordre lexicographique lié à leur création).
    const before = new Set(
      summaries(engine)
        .filter((e) => e.kind === "npc")
        .map((e) => e.id),
    );
    engine.ensureNpcPopulation(5);
    const after = summaries(engine).filter((e) => e.kind === "npc");
    expect(after).toHaveLength(5);
    expect([...before].every((id) => after.some((e) => e.id === id))).toBe(
      true,
    );
  });

  it("un compte humain n'adopte jamais un empire PNJ (bug corrigé au chantier 14)", async () => {
    const engine = await GameEngine.loadOrBootstrap();
    const bootId = summaries(engine)[0]!.id;
    engine.ensureNpcPopulation(3);

    // Premier compte : adopte bien l'empire humain amorcé au boot, pas un PNJ.
    const alice = engine.createEmpireForAccount("compte-alice", "Alice")!;
    expect(alice.id).toBe(bootId);
    expect(alice.kind).toBe("human");

    // Deuxième compte : obtient un empire humain neuf — jamais l'un des PNJ existants,
    // qui ont pourtant accountId===null comme l'empire amorcé avant adoption.
    const bob = engine.createEmpireForAccount("compte-bob", "Bob")!;
    expect(bob.kind).toBe("human");
    expect(bob.id).not.toBe(bootId);
    const npcIds = summaries(engine)
      .filter((e) => e.kind === "npc")
      .map((e) => e.id);
    expect(npcIds).not.toContain(bob.id);
    expect(npcIds).toHaveLength(3);
  });

  it("devSpawnNpcEmpire instancie un PNJ isolé, hors du quota d'ensureNpcPopulation", async () => {
    const engine = await GameEngine.loadOrBootstrap();
    const id = engine.devSpawnNpcEmpire("Voisin");
    expect(id).not.toBeNull();
    expect(summaries(engine).find((e) => e.id === id)?.kind).toBe("npc");
  });
});
describe("GameEngine — pilote économique PNJ (chantier 14)", () => {
  it("un PNJ vend son surplus orbital et finit par contractualiser un besoin", async () => {
    const engine = await GameEngine.loadOrBootstrap();
    engine.ensureNpcPopulation(1);
    const npcId = summaries(engine).find((e) => e.kind === "npc")!.id;
    const npc = engine.empireById(npcId)!;

    // Assez de cycles économiques (tick éco = 12 ticks) pour que le minerai excédentaire
    // se vende plusieurs fois et que les crédits accumulés couvrent enfin le séquestre
    // d'un contrat. La vitesse dépend de l'habitabilité/des gisements tirés par la seed :
    // marge large pour rester fiable sur toutes les parties générées.
    advanceTicks(engine, 900);

    const colony = engine.snapshotForEmpire(npc).colonies[0]!;
    // Le PNJ vend dès que l'orbite dépasse le seuil : elle reste bornée, jamais au plafond.
    expect(colony.orbitalResources.ore).toBeLessThan(500);

    const npcContracts = engine
      .snapshotForEmpire(npc)
      .contracts.filter((c) => c.issuerId === npcId);
    expect(npcContracts.length).toBeGreaterThan(0);
    // Publié pour un besoin réel (métaux/biens/composants : jamais produits localement).
    expect(["metals", "goods", "components"]).toContain(
      npcContracts[0]!.resource,
    );
    expect(npcContracts[0]!.issuerColor).toBe(npc.color);
  });

  it("un empire humain n'a aucun pilotage automatique (npcTick n'agit que sur les PNJ)", async () => {
    const engine = await GameEngine.loadOrBootstrap();
    advanceTicks(engine, 350);
    // L'empire par défaut est humain : aucun contrat n'a dû être publié en son nom.
    expect(
      engine.contracts.filter(
        (c) => c.issuerId === engine.defaultEmpireForDev.id,
      ),
    ).toHaveLength(0);
  });
});

describe("GameEngine — budget de temps du pilote PNJ (chantier 43.6)", () => {
  it("neuf cents ticks avec trois PNJ tiennent dans le budget", async () => {
    // Ce que ce test attrape, et qu'aucun autre n'attrapait : `npcTick` pesait 99,7 % du
    // coût d'un tick, et personne ne le savait. Le chiffre était pourtant imprimé à chaque
    // exécution de ce fichier — « 901 tick(s) en 37020,8ms » — sans que rien ne le lise.
    //
    // La cause : `nearestTradingPost` lançait un plus-court-chemin PAR COMPTOIR de la
    // galaxie, sur un graphe reconstruit à chaque appel, pour une réponse qui ne change
    // qu'à la matérialisation d'une galaxie. Une galaxie comptait sept à quatorze systèmes
    // avant le chantier 37 ; elle en compte trois à cinq cents.
    //
    // Le seuil est un PLANCHER D'IMPLÉMENTATION, pas une mesure de la machine : même
    // esprit que le budget d'images de `map3d.spec.ts`. Mesuré à ~0,7 s après mémoïsation,
    // 70 s avant. Trente secondes laissent quarante fois la marge et attrapent quand même
    // un retour à l'état d'avant. Il ne doit jamais être relevé pour faire passer un test.
    const engine = await GameEngine.loadOrBootstrap();
    engine.ensureNpcPopulation(3);

    const startedAt = performance.now();
    advanceTicks(engine, 900);
    const elapsed = performance.now() - startedAt;

    expect(elapsed).toBeLessThan(30_000);
  });
});
