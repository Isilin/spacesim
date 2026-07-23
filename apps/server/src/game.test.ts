import { beforeEach, describe, expect, it } from "vitest";
import {
  FRONTIER_GALAXIES,
  GATEWAY_COST,
  gatewayCost,
  INITIAL_GALAXIES,
  MAX_EMPIRES_PER_GALAXY,
  WARSHIPS,
} from "@spacesim/shared";
import { db, schema } from "./db/index.js";
import { GameEngine } from "./game.js";

/** Un id de vaisseau de guerre valide (pour armer des flottes de test). */
const WARSHIP = Object.keys(WARSHIPS)[0]!;

/**
 * Harnais de test moteur (chantier 7 — Sprint 0).
 *
 * La DB est en mémoire (`vitest.config.ts` → `SPACESIM_DB=:memory:`). Le module
 * `db` est un singleton par fichier de test : on repart d'une base vierge à chaque
 * test via `resetDb()`. `GameEngine.load()` crée alors une partie neuve (colonie
 * mère + marchés + portails) puisque la table `games` est vide.
 */

/** Toutes les tables, vidées avant chaque test (aucune contrainte FK dans le schéma). */
const ALL_TABLES = [
  schema.transfers,
  schema.missions,
  schema.outposts,
  schema.routes,
  schema.colonies,
  schema.battles,
  schema.pirateLairs,
  schema.fleets,
  schema.gateways,
  schema.claims,
  schema.players,
  schema.stationStates,
  schema.games,
] as const;

function resetDb(): void {
  for (const table of ALL_TABLES) db.delete(table).run();
}

/** Type des résumés renvoyés par `devEmpireSummaries` (outil de dev). */
interface EmpireSummary {
  id: string;
  name: string;
  isDefault: boolean;
  influence: number;
  exploredCount: number;
  exploredSystemIds: string[];
  colonies: { name: string; systemId: string; credits: number; ore: number }[];
}
const summaries = (engine: GameEngine) => engine.devEmpireSummaries() as EmpireSummary[];

/**
 * Empire d'un compte fictif (chantier 8) : le premier compte adopte l'empire amorcé au
 * boot, les suivants en obtiennent un neuf. Rappeler avec le même id rejoint le même empire.
 */
const empireFor = (engine: GameEngine, accountId: string) =>
  engine.createEmpireForAccount(accountId, accountId)!;

/** Nombre de ticks avancés par `devFastForward` : delta multiple exact de TICK_MS (5s). */
const advanceTicks = (engine: GameEngine, ticks: number) => engine.devFastForward(ticks * 5);

beforeEach(() => resetDb());

describe("GameEngine — harnais & socle (Sprint 0)", () => {
  it("crée une partie neuve : une colonie mère, un empire, tick 0", () => {
    const engine = GameEngine.load();
    expect(engine.game.tick).toBe(0);
    expect(engine.colonies).toHaveLength(1);
    const empires = summaries(engine);
    expect(empires).toHaveLength(1);
    expect(empires[0]!.isDefault).toBe(true);
    expect(empires[0]!.colonies).toHaveLength(1);
    // La colonie mère révèle son système (brouillard initial).
    expect(engine.exploredSystemIds).toEqual([empires[0]!.exploredSystemIds[0]]);
  });

  it("le tick est déterministe : N ticks avancent l'horloge d'exactement N", () => {
    const engine = GameEngine.load();
    const t0 = engine.game.tick;
    advanceTicks(engine, 10);
    expect(engine.game.tick).toBe(t0 + 10);
  });

  it("le tick produit : les ressources de la colonie évoluent", () => {
    const engine = GameEngine.load();
    const before = engine.colonies[0]!.resources;
    advanceTicks(engine, 20);
    const after = engine.colonies[0]!.resources;
    // Mine + centrale + ferme produisent : au moins une ressource a bougé.
    expect(after).not.toEqual(before);
  });
});

describe("GameEngine — isolation multi-empire (Sprint 0)", () => {
  it("devSpawnEmpire crée un second empire à l'état et au brouillard disjoints", () => {
    const engine = GameEngine.load();
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

  it("les empires ticent indépendamment (influence par empire)", () => {
    const engine = GameEngine.load();
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

  it("le snapshot de l'empire par défaut ne fuit pas les entités d'un autre empire", () => {
    const engine = GameEngine.load();
    const defaultSystem = engine.exploredSystemIds[0];
    engine.devSpawnEmpire("Colonia");

    // Les accesseurs publics (message `hello`) restent la vue du defaultEmpire :
    // une seule colonie, un seul système exploré — rien de l'empire spawné.
    expect(engine.colonies).toHaveLength(1);
    expect(engine.exploredSystemIds).toEqual([defaultSystem]);
  });
});

describe("GameEngine — chargement multi-empire (Phase A)", () => {
  it("recharge tous les empires, entités routées par propriétaire", () => {
    const key = (c: { systemId: string; name: string }) => `${c.systemId}/${c.name}`;
    const e1 = GameEngine.load();
    const defBefore = summaries(e1)[0]!;
    const defaultId = defBefore.id;
    const spawnedId = e1.devSpawnEmpire("Colonia")!;
    expect(spawnedId).not.toBeNull();
    const colBefore = summaries(e1).find((e) => e.id === spawnedId)!;
    // Les deux colonies mères sont sur des planètes distinctes (clé système/nom).
    expect(defBefore.colonies.map(key)).not.toEqual(colBefore.colonies.map(key));

    // Rechargement depuis la même DB en mémoire (simule un reboot serveur).
    const e2 = GameEngine.load();
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

  it("createEmpireForAccount : le 1er compte adopte l'empire amorcé, le 2e en obtient un neuf", () => {
    const engine = GameEngine.load();
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

  it("le snapshot d'une connexion ne montre que les entités de son empire", () => {
    const engine = GameEngine.load();
    const alice = empireFor(engine, "alice");
    const snapDefault = engine.snapshotForEmpire(empireFor(engine, "defaut"));
    const snapAlice = engine.snapshotForEmpire(alice);

    // Chaque snapshot ne contient que la (les) colonie(s) de son empire.
    expect(snapAlice.colonies).toHaveLength(1);
    expect(snapDefault.colonies).toHaveLength(1);
    const aliceColonyIds = new Set(snapAlice.colonies.map((c) => c.id));
    expect(snapDefault.colonies.some((c) => aliceColonyIds.has(c.id))).toBe(false);
    // Brouillards (systèmes explorés) disjoints.
    const aliceFog = new Set(snapAlice.exploredSystemIds);
    expect(snapDefault.exploredSystemIds.some((s) => aliceFog.has(s))).toBe(false);
  });

  it("une action ne s'applique qu'aux entités de l'empire agissant (Phase C)", () => {
    const engine = GameEngine.load();
    const def = empireFor(engine, "alpha");
    const alice = empireFor(engine, "alice");
    const defColonyId = engine.snapshotForEmpire(def).colonies[0]!.id;
    const aliceColonyId = engine.snapshotForEmpire(alice).colonies[0]!.id;

    // Colonie possédée : l'action passe la validation de propriété (pas d'erreur « inconnue »).
    expect(engine.build(alice, aliceColonyId, "mine")).not.toBe("Colonie inconnue");
    // Colonie d'un autre empire : rejetée dans les deux sens.
    expect(engine.build(alice, defColonyId, "mine")).toBe("Colonie inconnue");
    expect(engine.build(def, aliceColonyId, "mine")).toBe("Colonie inconnue");

    // Flotte : alice en crée une ; l'empire par défaut ne peut pas la piloter.
    expect(engine.createFleet(alice, aliceColonyId, "Garde")).toBeNull();
    const aliceFleetId = engine.snapshotForEmpire(alice).fleets[0]!.id;
    expect(engine.moveFleet(def, aliceFleetId, "gal-0-sys-0")).toBe("Flotte inconnue");
    expect(engine.snapshotForEmpire(def).fleets).toHaveLength(0);
  });

  it("attackFleet : la flotte ennemie écrasée est détruite, la bataille est archivée", () => {
    const engine = GameEngine.load();
    const a = empireFor(engine, "alpha");
    const b = empireFor(engine, "bravo");
    const sys = "gal-0-sys-0";
    const fa = engine.devArmFleet(a, sys, { [WARSHIP]: 50 });
    const fb = engine.devArmFleet(b, sys, { [WARSHIP]: 1 });

    // En paix par défaut : l'attaque est refusée tant que la guerre n'est pas déclarée.
    expect(engine.attackFleet(a, fa, fb)).toBe("En paix — déclarez la guerre d'abord");
    expect(engine.declareWar(a, b.id)).toBeNull();
    expect(engine.attackFleet(a, fa, fb)).toBeNull();
    // La flotte faible du défenseur est anéantie (retirée de son empire).
    expect(engine.snapshotForEmpire(b).fleets.some((f) => f.id === fb)).toBe(false);
    // L'attaquant garde une flotte, une bataille est journalisée.
    expect(engine.snapshotForEmpire(a).fleets.some((f) => f.id === fa)).toBe(true);
    expect(engine.snapshotForEmpire(a).battles.length).toBeGreaterThan(0);
  });

  it("attackFleet : cible hors système ou amie rejetée", () => {
    const engine = GameEngine.load();
    const a = empireFor(engine, "alpha");
    const b = empireFor(engine, "bravo");
    const fa = engine.devArmFleet(a, "gal-0-sys-0", { [WARSHIP]: 5 });
    const fb = engine.devArmFleet(b, "gal-0-sys-1", { [WARSHIP]: 5 });
    const fa2 = engine.devArmFleet(a, "gal-0-sys-0", { [WARSHIP]: 5 });
    engine.declareWar(a, b.id);
    expect(engine.attackFleet(a, fa, fb)).toBe("Cible hors de portée");
    expect(engine.attackFleet(a, fa, fa2)).toBe("Cible inconnue"); // amie
  });

  it("attackColony : raid pille des ressources et rompt le claim ennemi", () => {
    const engine = GameEngine.load();
    const a = empireFor(engine, "alpha");
    const b = empireFor(engine, "charlie");
    const bColony = engine.snapshotForEmpire(b).colonies[0]!;
    const bSummary = summaries(engine).find((e) => e.id === b.id)!;
    const bSystem = bSummary.colonies[0]!.systemId;

    const oreBefore = bColony.resources.ore;
    // L'attaquant arrive sur zone ; le défenseur n'a aucune flotte → raid direct.
    const fa = engine.devArmFleet(a, bSystem, { [WARSHIP]: 5 });
    engine.declareWar(a, b.id);
    expect(engine.attackColony(a, fa, bColony.id)).toBeNull();

    const oreAfter = engine.snapshotForEmpire(b).colonies[0]!.resources.ore;
    expect(oreAfter).toBeLessThan(oreBefore); // 25 % du minerai pillé
  });

  it("attackColony : cible amie ou hors portée rejetée", () => {
    const engine = GameEngine.load();
    const a = empireFor(engine, "alpha");
    const own = engine.snapshotForEmpire(a).colonies[0]!;
    const fa = engine.devArmFleet(a, "gal-0-sys-0", { [WARSHIP]: 5 });
    expect(engine.attackColony(a, fa, own.id)).toBe("Colonie cible inconnue");
  });

  it("diplomatie : declareWar/makePeace basculent l'état, reflété dans le classement", () => {
    const engine = GameEngine.load();
    const a = empireFor(engine, "alpha");
    const b = empireFor(engine, "bravo");
    const rowB = () =>
      (engine.snapshotForEmpire(a).leaderboard as { id: string; atWar: boolean }[]).find(
        (e) => e.id === b.id,
      )!;

    expect(rowB().atWar).toBe(false);
    expect(engine.declareWar(a, b.id)).toBeNull();
    expect(rowB().atWar).toBe(true);
    // La relation est symétrique : b voit aussi la guerre.
    const rowAfromB = (engine.snapshotForEmpire(b).leaderboard as { id: string; atWar: boolean }[]).find(
      (e) => e.id === a.id,
    )!;
    expect(rowAfromB.atWar).toBe(true);
    expect(engine.declareWar(a, b.id)).toBe("Déjà en guerre");
    expect(engine.makePeace(a, b.id)).toBeNull();
    expect(rowB().atWar).toBe(false);
  });

  it("préserve l'état d'empire (influence, brouillard) au rechargement", () => {

    const e1 = GameEngine.load();
    e1.devSpawnEmpire("Colonia");
    e1.devFastForward(50); // 10 ticks : l'influence de chaque empire progresse
    const before = summaries(e1);

    const e2 = GameEngine.load();
    const after = summaries(e2);
    for (const b of before) {
      const a = after.find((e) => e.id === b.id)!;
      expect(a.influence).toBeCloseTo(b.influence, 5);
      expect(a.exploredCount).toBe(b.exploredCount);
    }
  });
});

describe("GameEngine — univers extensible (chantier 9)", () => {
  /** Galaxies sans la moindre colonie : l'invariant de frontière porte là-dessus. */
  const emptyGalaxies = (engine: GameEngine) => {
    const colonized = new Set(
      summaries(engine).flatMap((e) => e.colonies.map((c) => c.systemId.split("-sys-")[0])),
    );
    return engine.universe.galaxies.filter((g) => !colonized.has(g.id)).length;
  };

  it("partie neuve : INITIAL_GALAXIES galaxies, frontière vierge intacte", () => {
    const engine = GameEngine.load();
    expect(engine.universe.galaxies).toHaveLength(INITIAL_GALAXIES);
    expect(emptyGalaxies(engine)).toBeGreaterThanOrEqual(FRONTIER_GALAXIES);
    // Chaque galaxie lointaine a son chantier de portail.
    expect(engine.gateways).toHaveLength(INITIAL_GALAXIES - 1);
  });

  it("recharge l'univers à la taille persistée, galaxies connues inchangées", () => {
    const e1 = GameEngine.load();
    const known = e1.universe.galaxies;
    // Simule une extension déjà survenue en partie (le compteur fait foi au boot).
    db.update(schema.games).set({ galaxyCount: 7 }).run();

    const e2 = GameEngine.load();
    expect(e2.universe.galaxies).toHaveLength(7);
    expect(e2.universe.galaxies.slice(0, known.length)).toEqual(known);
    // Les galaxies apparues sont équipées : portail et comptoirs approvisionnés.
    expect(e2.gateways).toHaveLength(6);
    const stationIds = e2.universe.galaxies
      .flatMap((g) => g.systems)
      .flatMap((s) => (s.station ? [s.station.id] : []));
    const stocked = new Set(
      db.select().from(schema.stationStates).all().map((r) => r.stationId),
    );
    expect(stationIds.every((id) => stocked.has(id))).toBe(true);
  });

  it("les nouveaux empires naissent voisins, puis débordent en poussant la frontière", () => {
    const engine = GameEngine.load();
    const galaxyOf = (systemId: string) => systemId.split("-sys-")[0];

    // MAX_EMPIRES_PER_GALAXY = 4 : les premiers arrivants partagent la galaxie d'origine.
    for (let i = 1; i < MAX_EMPIRES_PER_GALAXY; i++) engine.devSpawnEmpire(`Voisin ${i}`);
    const starters = summaries(engine).map((e) => galaxyOf(e.colonies[0]!.systemId));
    expect(starters).toHaveLength(MAX_EMPIRES_PER_GALAXY);
    expect(new Set(starters).size).toBe(1);
    expect(starters[0]).toBe("gal-0");
    // Chacun sur son propre système : brouillards disjoints.
    const systems = summaries(engine).map((e) => e.colonies[0]!.systemId);
    expect(new Set(systems).size).toBe(MAX_EMPIRES_PER_GALAXY);

    // L'empire de trop déborde sur une autre galaxie…
    engine.devSpawnEmpire("Débordement");
    const spilled = summaries(engine).at(-1)!;
    expect(galaxyOf(spilled.colonies[0]!.systemId)).not.toBe("gal-0");
    // … qui n'était plus vierge : la frontière s'est reformée plus loin.
    expect(engine.universe.galaxies.length).toBeGreaterThan(INITIAL_GALAXIES);
    expect(emptyGalaxies(engine)).toBeGreaterThanOrEqual(FRONTIER_GALAXIES);
  });

  it("le portail coûte plus cher à mesure qu'on vise loin", () => {
    const near = gatewayCost("gal-1");
    const far = gatewayCost("gal-6");
    expect(far.metals!).toBeGreaterThan(near.metals!);
    // Le coût de référence est celui de la galaxie voisine.
    expect(near).toEqual(GATEWAY_COST);
  });

  it("étendre l'univers ne coûte rien aux empires en place", () => {
    const e1 = GameEngine.load();
    const before = summaries(e1);
    db.update(schema.games).set({ galaxyCount: 9 }).run();

    const e2 = GameEngine.load();
    expect(e2.universe.galaxies).toHaveLength(9);
    const after = summaries(e2);
    expect(after.map((e) => e.id)).toEqual(before.map((e) => e.id));
    for (const b of before) {
      const a = after.find((e) => e.id === b.id)!;
      expect(a.colonies.map((c) => c.systemId)).toEqual(b.colonies.map((c) => c.systemId));
      expect(a.exploredSystemIds).toEqual(b.exploredSystemIds);
    }
  });
});
