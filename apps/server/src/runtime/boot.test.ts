import { beforeEach, describe, expect, it } from "vitest";
import { GameEngine } from "../game.js";
import {
  resetDb,
  WARSHIP,
  advanceTicks,
  empireFor,
  summaries,
} from "../test-harness.js";

beforeEach(() => resetDb());

describe("GameEngine — harnais & socle (Sprint 0)", () => {
  it("crée une partie neuve : une colonie mère, un empire, tick 0", async () => {
    const engine = await GameEngine.loadOrBootstrap();
    expect(engine.game.tick).toBe(0);
    expect([...engine.defaultEmpireForDev.colonyMap.values()]).toHaveLength(1);
    const empires = summaries(engine);
    expect(empires).toHaveLength(1);
    expect(empires[0]!.isDefault).toBe(true);
    expect(empires[0]!.colonies).toHaveLength(1);
    // La colonie mère révèle son système (brouillard initial).
    expect([...engine.defaultEmpireForDev.explored]).toEqual([
      empires[0]!.exploredSystemIds[0],
    ]);
  });

  it("le tick est déterministe : N ticks avancent l'horloge d'exactement N", async () => {
    const engine = await GameEngine.loadOrBootstrap();
    const t0 = engine.game.tick;
    advanceTicks(engine, 10);
    expect(engine.game.tick).toBe(t0 + 10);
  });

  it("le tick produit : les ressources de la colonie évoluent", async () => {
    const engine = await GameEngine.loadOrBootstrap();
    const before = [...engine.defaultEmpireForDev.colonyMap.values()][0]!
      .resources;
    advanceTicks(engine, 20);
    const after = [...engine.defaultEmpireForDev.colonyMap.values()][0]!
      .resources;
    // Mine + centrale + ferme produisent : au moins une ressource a bougé.
    expect(after).not.toEqual(before);
  });
});
describe("GameEngine — isolation multi-empire (Sprint 0)", () => {
  it("devSpawnEmpire crée un second empire à l'état et au brouillard disjoints", async () => {
    const engine = await GameEngine.loadOrBootstrap();
    const id = engine.devSpawnEmpire("Colonia");
    expect(id).not.toBeNull();

    const [a, b] = summaries(engine);
    expect(summaries(engine)).toHaveLength(2);
    // Colonies sur des systèmes différents.
    expect(a!.colonies[0]!.systemId).not.toBe(b!.colonies[0]!.systemId);
    // Brouillards disjoints (chacun ne voit que son système).
    const fogA = new Set(a!.exploredSystemIds);
    expect(b!.exploredSystemIds.some((s) => fogA.has(s))).toBe(false);
    // Le nouvel empire démarre neuf.
    expect(b!.influence).toBe(0);
  });

  it("les empires ticent indépendamment (influence par empire)", async () => {
    const engine = await GameEngine.loadOrBootstrap();
    engine.devSpawnEmpire("Colonia");
    const before = summaries(engine);
    advanceTicks(engine, 10);
    const after = summaries(engine);

    for (const b of before) {
      const a = after.find((e) => e.id === b.id)!;
      // Chaque empire voit son influence progresser séparément.
      expect(a.influence).toBeGreaterThan(b.influence);
    }
  });

  it("le snapshot de l'empire par défaut ne fuit pas les entités d'un autre empire", async () => {
    const engine = await GameEngine.loadOrBootstrap();
    const defaultSystem = [...engine.defaultEmpireForDev.explored][0];
    engine.devSpawnEmpire("Colonia");

    // Les accesseurs publics (message `hello`) restent la vue du defaultEmpire :
    // une seule colonie, un seul système exploré — rien de l'empire spawné.
    expect([...engine.defaultEmpireForDev.colonyMap.values()]).toHaveLength(1);
    expect([...engine.defaultEmpireForDev.explored]).toEqual([defaultSystem]);
  });
});
describe("GameEngine — chargement multi-empire (Phase A)", () => {
  it("recharge tous les empires, entités routées par propriétaire", async () => {
    const key = (c: { systemId: string; name: string }) =>
      `${c.systemId}/${c.name}`;
    const e1 = await GameEngine.loadOrBootstrap();
    const defBefore = summaries(e1)[0]!;
    const defaultId = defBefore.id;
    const spawnedId = e1.devSpawnEmpire("Colonia")!;
    expect(spawnedId).not.toBeNull();
    const colBefore = summaries(e1).find((e) => e.id === spawnedId)!;
    // Les deux colonies mères sont sur des planètes distinctes (clé système/nom).
    expect(defBefore.colonies.map(key)).not.toEqual(
      colBefore.colonies.map(key),
    );
    // `devSpawnEmpire` est un appel direct (pas une commande WS ni un tick) : rien ne
    // déclenche le flush automatiquement (chantier 20.2) — on l'attend explicitement
    // avant de simuler un reboot, sous peine de « perdre » cet empire au rechargement.
    await e1.flush();

    // Rechargement depuis la même DB en mémoire (simule un reboot serveur).
    const e2 = await GameEngine.loadOrBootstrap();
    const reloaded = summaries(e2);
    expect(reloaded).toHaveLength(2);

    const def = reloaded.find((e) => e.id === defaultId)!;
    const colonia = reloaded.find((e) => e.id === spawnedId)!;
    // Chaque empire retrouve EXACTEMENT ses colonies (routées par ownerId), pas celles
    // de l'autre : aucune contamination croisée au rechargement.
    expect(def.colonies.map(key)).toEqual(defBefore.colonies.map(key));
    expect(colonia.colonies.map(key)).toEqual(colBefore.colonies.map(key));
    const colKeys = new Set(colonia.colonies.map(key));
    expect(def.colonies.map(key).some((k) => colKeys.has(k))).toBe(false);
    // Le premier player reste l'empire par défaut (fallback compat).
    expect(def.isDefault).toBe(true);
    expect(colonia.isDefault).toBe(false);
  });

  it("createEmpireForAccount : le 1er compte adopte l'empire amorcé, le 2e en obtient un neuf", async () => {
    const engine = await GameEngine.loadOrBootstrap();
    const seeded = summaries(engine)[0]!.id;

    // Premier compte : adoption — pas de second empire fantôme sur la meilleure planète.
    const alice = engine.createEmpireForAccount("compte-alice", "Alice")!;
    expect(alice.id).toBe(seeded);
    expect(alice.name).toBe("Alice");
    expect(summaries(engine)).toHaveLength(1);

    // Même compte → même empire (inscription rejouée, reconnexion).
    expect(engine.createEmpireForAccount("compte-alice")!.id).toBe(seeded);
    expect(engine.empireForAccount("compte-alice")!.id).toBe(seeded);
    expect(summaries(engine)).toHaveLength(1);

    // Deuxième compte → empire neuf, avec sa propre colonie mère.
    const bob = engine.createEmpireForAccount("compte-bob", "Bob")!;
    expect(bob.id).not.toBe(seeded);
    expect(summaries(engine)).toHaveLength(2);
    expect(engine.snapshotForEmpire(bob).colonies).toHaveLength(1);

    // Compte sans empire : aucune résolution.
    expect(engine.empireForAccount("compte-inconnu")).toBeNull();
  });

  it("le snapshot d'une connexion ne montre que les entités de son empire", async () => {
    const engine = await GameEngine.loadOrBootstrap();
    const alice = empireFor(engine, "alice");
    const snapDefault = engine.snapshotForEmpire(empireFor(engine, "defaut"));
    const snapAlice = engine.snapshotForEmpire(alice);

    // Chaque snapshot ne contient que la (les) colonie(s) de son empire.
    expect(snapAlice.colonies).toHaveLength(1);
    expect(snapDefault.colonies).toHaveLength(1);
    const aliceColonyIds = new Set(snapAlice.colonies.map((c) => c.id));
    expect(snapDefault.colonies.some((c) => aliceColonyIds.has(c.id))).toBe(
      false,
    );
    // Brouillards (systèmes explorés) disjoints.
    const aliceFog = new Set(snapAlice.exploredSystemIds);
    expect(snapDefault.exploredSystemIds.some((s) => aliceFog.has(s))).toBe(
      false,
    );
  });

  it("une action ne s'applique qu'aux entités de l'empire agissant (Phase C)", async () => {
    const engine = await GameEngine.loadOrBootstrap();
    const def = empireFor(engine, "alpha");
    const alice = empireFor(engine, "alice");
    const defColonyId = engine.snapshotForEmpire(def).colonies[0]!.id;
    const aliceColonyId = engine.snapshotForEmpire(alice).colonies[0]!.id;

    // Colonie possédée : l'action passe la validation de propriété (pas d'erreur « inconnue »).
    expect(engine.industry.build(alice, aliceColonyId, "mine")).not.toBe(
      "Colonie inconnue",
    );
    // Colonie d'un autre empire : rejetée dans les deux sens.
    expect(engine.industry.build(alice, defColonyId, "mine")).toBe(
      "Colonie inconnue",
    );
    expect(engine.industry.build(def, aliceColonyId, "mine")).toBe(
      "Colonie inconnue",
    );

    // Flotte : alice en crée une ; l'empire par défaut ne peut pas la piloter.
    expect(
      engine.fleetService.createFleet(alice, aliceColonyId, "Garde"),
    ).toBeNull();
    const aliceFleetId = engine.snapshotForEmpire(alice).fleets[0]!.id;
    expect(
      engine.fleetService.moveFleet(def, aliceFleetId, "gal-0-sys-0"),
    ).toBe("Flotte inconnue");
    expect(engine.snapshotForEmpire(def).fleets).toHaveLength(0);
  });

  it("attackFleet : la flotte ennemie écrasée est détruite, la bataille est archivée", async () => {
    const engine = await GameEngine.loadOrBootstrap();
    const a = empireFor(engine, "alpha");
    const b = empireFor(engine, "bravo");
    a.influence = 1000; // déclarer la guerre coûte de l'influence (chantier 16)
    const sys = "gal-0-sys-0";
    const fa = engine.devArmFleet(a, sys, { [WARSHIP]: 50 });
    const fb = engine.devArmFleet(b, sys, { [WARSHIP]: 1 });

    // En paix par défaut : l'attaque est refusée tant que la guerre n'est pas déclarée.
    expect(engine.fleetService.attackFleet(a, fa, fb)).toBe(
      "En paix — déclarez la guerre d'abord",
    );
    expect(engine.diplomacy.declareWar(a, b.id)).toBeNull();
    expect(engine.fleetService.attackFleet(a, fa, fb)).toBeNull();
    // La flotte faible du défenseur est anéantie (retirée de son empire).
    expect(engine.snapshotForEmpire(b).fleets.some((f) => f.id === fb)).toBe(
      false,
    );
    // L'attaquant garde une flotte, une bataille est journalisée.
    expect(engine.snapshotForEmpire(a).fleets.some((f) => f.id === fa)).toBe(
      true,
    );
    expect(engine.snapshotForEmpire(a).battles.length).toBeGreaterThan(0);
  });

  it("attackFleet : cible hors système ou amie rejetée", async () => {
    const engine = await GameEngine.loadOrBootstrap();
    const a = empireFor(engine, "alpha");
    const b = empireFor(engine, "bravo");
    a.influence = 1000; // déclarer la guerre coûte de l'influence (chantier 16)
    const fa = engine.devArmFleet(a, "gal-0-sys-0", { [WARSHIP]: 5 });
    const fb = engine.devArmFleet(b, "gal-0-sys-1", { [WARSHIP]: 5 });
    const fa2 = engine.devArmFleet(a, "gal-0-sys-0", { [WARSHIP]: 5 });
    engine.diplomacy.declareWar(a, b.id);
    expect(engine.fleetService.attackFleet(a, fa, fb)).toBe(
      "Cible hors de portée",
    );
    expect(engine.fleetService.attackFleet(a, fa, fa2)).toBe("Cible inconnue"); // amie
  });

  it("attackColony : raid pille des ressources et rompt le claim ennemi", async () => {
    const engine = await GameEngine.loadOrBootstrap();
    const a = empireFor(engine, "alpha");
    const b = empireFor(engine, "charlie");
    a.influence = 1000; // déclarer la guerre coûte de l'influence (chantier 16)
    const bColony = engine.snapshotForEmpire(b).colonies[0]!;
    const bSummary = summaries(engine).find((e) => e.id === b.id)!;
    const bSystem = bSummary.colonies[0]!.systemId;

    const oreBefore = bColony.resources.ore;
    // L'attaquant arrive sur zone ; le défenseur n'a aucune flotte → raid direct.
    const fa = engine.devArmFleet(a, bSystem, { [WARSHIP]: 5 });
    engine.diplomacy.declareWar(a, b.id);
    expect(engine.fleetService.attackColony(a, fa, bColony.id)).toBeNull();

    const oreAfter = engine.snapshotForEmpire(b).colonies[0]!.resources.ore;
    expect(oreAfter).toBeLessThan(oreBefore); // 25 % du minerai pillé
  });

  it("attackColony : cible amie ou hors portée rejetée", async () => {
    const engine = await GameEngine.loadOrBootstrap();
    const a = empireFor(engine, "alpha");
    const own = engine.snapshotForEmpire(a).colonies[0]!;
    const fa = engine.devArmFleet(a, "gal-0-sys-0", { [WARSHIP]: 5 });
    expect(engine.fleetService.attackColony(a, fa, own.id)).toBe(
      "Colonie cible inconnue",
    );
  });

  it("diplomatie : declareWar/makePeace basculent l'état, reflété dans le classement", async () => {
    const engine = await GameEngine.loadOrBootstrap();
    const a = empireFor(engine, "alpha");
    const b = empireFor(engine, "bravo");
    a.influence = 1000; // déclarer la guerre coûte de l'influence (chantier 16)
    const rowB = () =>
      engine.snapshotForEmpire(a).leaderboard.find((e) => e.id === b.id)!;

    expect(rowB().relation).toBe("neutral");
    expect(engine.diplomacy.declareWar(a, b.id)).toBeNull();
    expect(rowB().relation).toBe("war");
    // La relation est symétrique : b voit aussi la guerre.
    const rowAfromB = engine
      .snapshotForEmpire(b)
      .leaderboard.find((e) => e.id === a.id)!;
    expect(rowAfromB.relation).toBe("war");
    expect(engine.diplomacy.declareWar(a, b.id)).toBe("Déjà en guerre");
    expect(engine.diplomacy.makePeace(a, b.id)).toBeNull();
    expect(rowB().relation).toBe("neutral");
  });

  it("makePeace impose un cooldown avant de pouvoir redéclarer la guerre au même empire", async () => {
    const engine = await GameEngine.loadOrBootstrap();
    const a = empireFor(engine, "alpha");
    const b = empireFor(engine, "bravo");
    a.influence = 1000; // déclarer la guerre coûte de l'influence (chantier 16)

    expect(engine.diplomacy.declareWar(a, b.id)).toBeNull();
    expect(engine.diplomacy.makePeace(a, b.id)).toBeNull();
    // Juste après la paix : le cooldown est actif.
    expect(engine.diplomacy.declareWar(a, b.id)).toMatch(/Cooldown/);

    // Largement de quoi dépasser WAR_COOLDOWN_MS (10 min = 120 ticks).
    advanceTicks(engine, 130);
    expect(engine.diplomacy.declareWar(a, b.id)).toBeNull();
  });

  it("préserve l'état d'empire (influence, brouillard) au rechargement", async () => {
    const e1 = await GameEngine.loadOrBootstrap();
    e1.devSpawnEmpire("Colonia");
    e1.devFastForward(50); // 10 ticks : l'influence de chaque empire progresse
    const before = summaries(e1);

    const e2 = await GameEngine.loadOrBootstrap();
    const after = summaries(e2);
    for (const b of before) {
      const a = after.find((e) => e.id === b.id)!;
      expect(a.influence).toBeCloseTo(b.influence, 5);
      expect(a.exploredCount).toBe(b.exploredCount);
    }
  });
});

describe("GameEngine — choix d'itinéraire (chantier 31.10)", () => {
  it("moveFleet refuse un itinéraire forgé et accepte un itinéraire réel", async () => {
    const engine = await GameEngine.loadOrBootstrap();
    const empire = empireFor(engine, "navigateur");
    const galaxy = engine.universe.galaxies[0]!;
    const from = galaxy.systems[0]!.id;
    // Un voisin réel du système de départ, donc une arête qui existe.
    const link = galaxy.links.find(([a, b]) => a === from || b === from)!;
    const neighbour = link[0] === from ? link[1] : link[0];
    const fleetId = engine.devArmFleet(empire, from, { [WARSHIP]: 1 });

    // Chemin forgé : deux systèmes non reliés dans le graphe. Sans validation, le
    // joueur obtiendrait un trajet direct entre deux points quelconques.
    const forge = galaxy.systems.find(
      (s) =>
        s.id !== from &&
        s.id !== neighbour &&
        !galaxy.links.some(
          ([a, b]) => (a === from && b === s.id) || (b === from && a === s.id),
        ),
    )!;
    expect(
      engine.fleetService.moveFleet(empire, fleetId, forge.id, [
        from,
        forge.id,
      ]),
    ).toBe("Itinéraire invalide");

    // Un itinéraire qui n'aboutit pas à la destination annoncée est refusé aussi.
    expect(
      engine.fleetService.moveFleet(empire, fleetId, neighbour, [from]),
    ).toBe("Itinéraire invalide");

    // Le même trajet, avec l'arête réelle, passe.
    expect(
      engine.fleetService.moveFleet(empire, fleetId, neighbour, [
        from,
        neighbour,
      ]),
    ).toBeNull();
  });
});
