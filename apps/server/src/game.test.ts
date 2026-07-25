import { beforeEach, describe, expect, it } from "vitest";
import {
  FACTIONS,
  FRONTIER_GALAXIES,
  GATEWAY_COST,
  gatewayCost,
  INITIAL_GALAXIES,
  MAX_EMPIRES_PER_GALAXY,
  TECHS,
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
  schema.contracts,
  schema.factionStates,
  schema.relations,
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
  kind: "human" | "npc";
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

  it("makePeace impose un cooldown avant de pouvoir redéclarer la guerre au même empire", () => {
    const engine = GameEngine.load();
    const a = empireFor(engine, "alpha");
    const b = empireFor(engine, "bravo");

    expect(engine.declareWar(a, b.id)).toBeNull();
    expect(engine.makePeace(a, b.id)).toBeNull();
    // Juste après la paix : le cooldown est actif.
    expect(engine.declareWar(a, b.id)).toMatch(/Cooldown/);

    // Largement de quoi dépasser WAR_COOLDOWN_MS (10 min = 120 ticks).
    advanceTicks(engine, 130);
    expect(engine.declareWar(a, b.id)).toBeNull();
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

describe("GameEngine — logistique orbitale (chantier 12)", () => {
  /** Colonie mère de l'empire, relue depuis le snapshot. */
  const homeColony = (engine: GameEngine, empire: ReturnType<typeof empireFor>) =>
    engine.snapshotForEmpire(empire).colonies[0]!;

  it("la colonie mère naît avec un dock et une soute orbitale", () => {
    const engine = GameEngine.load();
    const colony = engine.colonies[0]!;
    expect(colony.buildings.orbital_dock).toBe(1);
    expect(colony.orbitalResources.ore).toBeGreaterThan(0);
  });

  it("l'ascenseur hisse le surplus au fil des ticks, en consommant de l'énergie", () => {
    const engine = GameEngine.load();
    const before = engine.colonies[0]!;
    const orbitBefore = before.orbitalResources.ore;
    advanceTicks(engine, 20);
    const after = engine.colonies[0]!;
    // La règle par défaut monte le minerai au-delà du seuil gardé au sol.
    expect(after.orbitalResources.ore).toBeGreaterThan(orbitBefore);
    expect(after.resources.ore).toBeGreaterThanOrEqual(0);
  });

  /**
   * Station de la galaxie d'origine, rendue visible de l'empire. Le brouillard initial
   * ne couvre qu'un système : sans cette révélation, le test se sauterait au hasard des
   * seeds au lieu de vérifier quoi que ce soit.
   */
  const reachableStation = (engine: GameEngine, empire: ReturnType<typeof empireFor>) => {
    const station = engine.universe.galaxies[0]!.systems.find((s) => s.station)?.station;
    if (!station) throw new Error("la galaxie d'origine a toujours au moins une station");
    engine.devArmFleet(empire, station.systemId, {}); // révèle le système
    return station;
  };

  it("une expédition prélève l'orbite, jamais le sol", () => {
    const engine = GameEngine.load();
    const empire = empireFor(engine, "alice");
    const colony = homeColony(engine, empire);
    // La colonie mère n'a pas toujours une station chez elle : on en pose une à portée
    // en explorant, sinon le test n'aurait rien à vendre.
    const station = reachableStation(engine, empire);

    const orbitBefore = colony.orbitalResources.ore;
    const groundBefore = colony.resources.ore;
    expect(engine.sellToStation(empire, colony.id, station.id, { ore: 10 })).toBeNull();

    const after = homeColony(engine, empire);
    expect(after.orbitalResources.ore).toBe(orbitBefore - 10);
    // Le sol n'a pas bougé : la marchandise partait bien de l'orbite.
    expect(after.resources.ore).toBe(groundBefore);
  });

  it("le stock au sol ne se substitue pas à l'orbite quand elle est vide", () => {
    const engine = GameEngine.load();
    const empire = empireFor(engine, "alice");
    const colony = homeColony(engine, empire);
    const station = reachableStation(engine, empire);

    // Bien plus que l'orbite, mais couvert par le sol : doit être refusé quand même.
    const tooMuch = Math.floor(colony.orbitalResources.ore + colony.resources.ore);
    expect(engine.sellToStation(empire, colony.id, station.id, { ore: tooMuch })).toMatch(
      /Stock orbital insuffisant/,
    );
  });
});

describe("GameEngine — file de recherche (chantier 11)", () => {
  /** Science offerte à la colonie mère pour dérouler une chaîne sans attendre. */
  const grantScience = (engine: GameEngine, amount: number) => engine.devGrant({ science: amount });

  it("planifie une chaîne et l'enchaîne recherche après recherche", () => {
    const engine = GameEngine.load();
    const empire = empireFor(engine, "alice");
    grantScience(engine, 5000);

    // fusion_power exige metallurgy → advanced_mining : trois recherches successives.
    expect(engine.queueResearch(empire, "fusion_power")).toBeNull();
    expect(engine.snapshotForEmpire(empire).game.research?.techId).toBe("metallurgy");
    expect(engine.snapshotForEmpire(empire).game.researchQueue).toEqual([
      "advanced_mining",
      "fusion_power",
    ]);

    // Le temps passe : chaque tech terminée laisse la place à la suivante, sans clic.
    engine.devFastForward(3600);
    const state = engine.snapshotForEmpire(empire).game;
    expect(state.researched).toContain("metallurgy");
    expect(state.researched).toContain("advanced_mining");
    expect(state.researched).toContain("fusion_power");
    expect(state.researchQueue).toEqual([]);
    expect(state.research).toBeNull();
  });

  it("refuse une chaîne déjà acquise et sait se vider", () => {
    const engine = GameEngine.load();
    const empire = empireFor(engine, "alice");
    grantScience(engine, 5000);

    expect(engine.queueResearch(empire, "inconnue")).toBe("Technologie inconnue");
    expect(engine.queueResearch(empire, "fusion_power")).toBeNull();
    expect(engine.clearResearchQueue(empire)).toBeNull();
    expect(engine.snapshotForEmpire(empire).game.researchQueue).toEqual([]);
    // La recherche déjà lancée n'est pas annulée par le vidage de la file.
    expect(engine.snapshotForEmpire(empire).game.research).not.toBeNull();

    engine.devFastForward(3600);
    expect(engine.queueResearch(empire, "metallurgy")).toBe("Technologie déjà acquise");
  });

  it("la file patiente au lieu de se vider quand la science manque", () => {
    const engine = GameEngine.load();
    const empire = empireFor(engine, "alice");
    // Juste de quoi payer la première tech de la chaîne.
    grantScience(engine, TECHS.metallurgy.cost);

    expect(engine.queueResearch(empire, "fusion_power")).toBeNull();
    engine.devFastForward(600);
    const state = engine.snapshotForEmpire(empire).game;
    expect(state.researched).toContain("metallurgy");
    // La suite reste en attente, prête à repartir dès que la science rentre.
    expect(state.researchQueue).toContain("fusion_power");
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

  it("une extension pousse la nouvelle carte à tous les clients", () => {
    const engine = GameEngine.load();
    const alice = empireFor(engine, "alice");
    // Abonnement d'une connexion, comme le fait le WebSocket : chaque notification
    // recompose le snapshot de l'empire.
    const pushes: (number | undefined)[] = [];
    engine.onChange(() => pushes.push(engine.snapshotForEmpire(alice).universe?.galaxies.length));

    // Un tick ordinaire ne réémet pas l'univers (payload lourd, inchangé).
    engine.devFastForward(5);
    expect(pushes.every((p) => p === undefined)).toBe(true);

    // L'univers grandit sous l'effet des nouveaux arrivants : même un empire qui n'a
    // rien exploré doit recevoir la carte étendue, sinon sa carte reste tronquée.
    const sizeBefore = engine.universe.galaxies.length;
    for (let i = 0; i < MAX_EMPIRES_PER_GALAXY + 1; i++) engine.devSpawnEmpire(`Voisin ${i}`);
    expect(engine.universe.galaxies.length).toBeGreaterThan(sizeBefore);
    expect(pushes).toContain(engine.universe.galaxies.length);
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

describe("GameEngine — empires PNJ (chantier 14)", () => {
  it("un GameEngine.load() nu ne seme aucun PNJ : ensureNpcPopulation reste opt-in", () => {
    const engine = GameEngine.load();
    expect(summaries(engine)).toHaveLength(1);
    expect(summaries(engine)[0]!.kind).toBe("human");
  });

  it("ensureNpcPopulation amorce des PNJ avec leur propre colonie mère", () => {
    const engine = GameEngine.load();
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

  it("ensureNpcPopulation est idempotent : ne double jamais la population", () => {
    const engine = GameEngine.load();
    engine.ensureNpcPopulation(3);
    engine.ensureNpcPopulation(3);
    expect(summaries(engine).filter((e) => e.kind === "npc")).toHaveLength(3);
    // Relèvement du quota : complète sans toucher aux PNJ déjà en place (ids en SET,
    // pas triés — des UUID n'ont aucun ordre lexicographique lié à leur création).
    const before = new Set(summaries(engine).filter((e) => e.kind === "npc").map((e) => e.id));
    engine.ensureNpcPopulation(5);
    const after = summaries(engine).filter((e) => e.kind === "npc");
    expect(after).toHaveLength(5);
    expect([...before].every((id) => after.some((e) => e.id === id))).toBe(true);
  });

  it("un compte humain n'adopte jamais un empire PNJ (bug corrigé au chantier 14)", () => {
    const engine = GameEngine.load();
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

  it("devSpawnNpcEmpire instancie un PNJ isolé, hors du quota d'ensureNpcPopulation", () => {
    const engine = GameEngine.load();
    const id = engine.devSpawnNpcEmpire("Voisin");
    expect(id).not.toBeNull();
    expect(summaries(engine).find((e) => e.id === id)?.kind).toBe("npc");
  });
});

describe("GameEngine — contrats de fourniture (chantier 14)", () => {
  /** Colonie mère de l'empire, relue depuis le snapshot. */
  const homeColony = (engine: GameEngine, empire: ReturnType<typeof empireFor>) =>
    engine.snapshotForEmpire(empire).colonies[0]!;

  it("postContract : publie un contrat et met le séquestre sous garde", () => {
    const engine = GameEngine.load();
    const empire = engine.defaultEmpireForDev;
    const colony = engine.colonies[0]!;
    const creditsBefore = colony.resources.credits;

    expect(engine.postContract(empire, colony.id, "ore", 10, 1, 3_600_000)).toBeNull();

    // Séquestre = quantité × prix, prélevé au sol (les crédits ne sont pas orbitaux).
    expect(engine.colonies[0]!.resources.credits).toBe(creditsBefore - 10);

    const contract = engine.contracts[0]!;
    expect(contract.resource).toBe("ore");
    expect(contract.remaining).toBe(10);
    expect(contract.status).toBe("open");
    expect(contract.issuerId).toBe(empire.id);
  });

  it("un contrat est diffusé à tous les empires, pas seulement à son émetteur (pas de brouillard)", () => {
    const engine = GameEngine.load();
    const empire = engine.defaultEmpireForDev;
    const colony = engine.colonies[0]!;
    // Un tiers totalement étranger à la transaction — jamais exploré le système de
    // l'émetteur, jamais interagi avec lui.
    const bystander = engine.empireById(engine.devSpawnEmpire("Spectateur")!)!;

    expect(engine.postContract(empire, colony.id, "ore", 10, 1, 3_600_000)).toBeNull();
    const contractId = engine.contracts[0]!.id;

    // Comme leaderboard/gateways : diffusé en entier, à la différence de markets/territories
    // qui restent brouillardés par empire.
    const seenByBystander = engine.snapshotForEmpire(bystander).contracts.find(
      (c) => c.id === contractId,
    );
    expect(seenByBystander).toBeDefined();
    expect(seenByBystander!.status).toBe("open");
    expect(seenByBystander!.issuerName).toBe(empire.name);
  });

  it("postContract : refuse une ressource non contractualisable (crédits, science)", () => {
    const engine = GameEngine.load();
    const empire = engine.defaultEmpireForDev;
    const colony = engine.colonies[0]!;
    expect(engine.postContract(empire, colony.id, "credits", 10, 1, 3_600_000)).toMatch(
      /non contractualisable/,
    );
  });

  it("postContract : refuse si le séquestre dépasse les crédits disponibles", () => {
    const engine = GameEngine.load();
    const empire = engine.defaultEmpireForDev;
    const colony = engine.colonies[0]!;
    expect(engine.postContract(empire, colony.id, "ore", 10_000, 1, 3_600_000)).toMatch(
      /Crédits insuffisants/,
    );
  });

  it("cancelContract : rembourse le séquestre et clôt le contrat", () => {
    const engine = GameEngine.load();
    const empire = engine.defaultEmpireForDev;
    const colony = engine.colonies[0]!;
    const creditsBefore = colony.resources.credits;
    engine.postContract(empire, colony.id, "ore", 10, 1, 3_600_000);
    const contractId = engine.contracts[0]!.id;

    expect(engine.cancelContract(empire, contractId)).toBeNull();
    expect(engine.colonies[0]!.resources.credits).toBe(creditsBefore);
    expect(engine.contracts[0]!.status).toBe("cancelled");
  });

  it("cancelContract : refuse si l'appelant n'est pas l'émetteur", () => {
    const engine = GameEngine.load();
    const issuer = engine.defaultEmpireForDev;
    const colony = engine.colonies[0]!;
    engine.postContract(issuer, colony.id, "ore", 10, 1, 3_600_000);
    const contractId = engine.contracts[0]!.id;
    // devSpawnEmpire (pas empireFor) : un compte adopterait l'empire par défaut encore
    // libre, ce qui en ferait le même empire que l'émetteur au lieu d'un tiers.
    const other = engine.empireById(engine.devSpawnEmpire("Curieux")!)!;

    expect(engine.cancelContract(other, contractId)).toMatch(/Seul l'émetteur/);
  });

  it("un contrat non honoré expire et rembourse le séquestre restant", () => {
    const engine = GameEngine.load();
    const empire = engine.defaultEmpireForDev;
    const colony = engine.colonies[0]!;
    // Séquestre volontairement massif : la production organique de la colonie sur la
    // fenêtre du test (taxe par colon, quelques crédits) ne doit pas pouvoir la noyer.
    engine.devGrant({ credits: 2000 });
    const creditsAfterGrant = engine.colonies[0]!.resources.credits;
    engine.postContract(empire, colony.id, "ore", 1000, 1, 300_000); // durée mini clampée

    advanceTicks(engine, 400 / 5); // dépasse largement l'échéance

    expect(engine.contracts[0]!.status).toBe("expired");
    expect(engine.contracts[0]!.remaining).toBe(1000); // rien n'a été livré
    // Le séquestre (1000) revient, à la production organique de la fenêtre près.
    expect(engine.colonies[0]!.resources.credits).toBeGreaterThan(creditsAfterGrant - 50);
  });

  it("acceptContract : livre la cargaison à l'émetteur (autre empire) et paie l'accepteur", () => {
    const engine = GameEngine.load();
    // L'accepteur est l'empire par défaut : seuls ses timers sont avancés par
    // devFastForward (outil de dev mono-empire — Sprint 0), indispensable pour faire
    // arriver le convoi dans ce test.
    const accepter = engine.defaultEmpireForDev;
    const accepterColony = engine.colonies[0]!;
    // devSpawnEmpire (pas empireFor) : un compte adopterait l'empire par défaut encore
    // libre, ce qui en ferait le même empire que l'accepteur au lieu d'un tiers.
    const issuer = engine.empireById(engine.devSpawnEmpire("Émetteur")!)!;
    const issuerColony = homeColony(engine, issuer);

    // Nourriture, pas minerai : le minerai a une consigne d'ascension par défaut (colonie
    // mère) qui ferait dériver l'orbite toute seule sur la longue avance de temps ci-dessous.
    expect(engine.postContract(issuer, issuerColony.id, "food", 10, 2, 3_600_000)).toBeNull();
    const contractId = engine.contracts[0]!.id;

    // Amorce généreuse d'énergie en orbite et de crédits au sol : sans elles, aucun convoi
    // ne peut appareiller ni payer ses frais, et le nombre de sauts jusqu'à la colonie
    // émettrice (donc carburant et frais) dépend de la seed — pas de marge fixe fiable.
    engine.devGrant({ credits: 500 });
    engine.setLiftRule(accepter, accepterColony.id, "energy", { keepGround: 0, direction: "up" });
    advanceTicks(engine, 60);

    const beforeAccept = engine.colonies[0]!;
    const orbitalFoodBefore = beforeAccept.orbitalResources.food;

    expect(engine.acceptContract(accepter, accepterColony.id, contractId, 10)).toBeNull();

    const afterAccept = engine.colonies[0]!;
    expect(afterAccept.orbitalResources.food).toBe(orbitalFoodBefore - 10);

    // Décompté à l'acceptation, pas à la livraison — anti-survente.
    const accepted = engine.snapshotForEmpire(issuer).contracts.find((c) => c.id === contractId)!;
    expect(accepted.remaining).toBe(0);
    expect(accepted.status).toBe("fulfilled");
    const mission = engine
      .snapshotForEmpire(accepter)
      .missions.find((m) => m.kind === "deliver_contract");
    expect(mission).toBeDefined();

    const issuerFoodBefore = homeColony(engine, issuer).orbitalResources.food;
    const accepterCreditsBeforeDelivery = engine.colonies[0]!.resources.credits;

    // Juste assez pour faire arriver CE convoi précis (le nombre de sauts, donc la durée,
    // dépend de la seed — pas une avance à l'aveugle).
    const durationS = Math.ceil((mission!.arrivesAt - mission!.departedAt) / 1000);
    const ticksElapsed = Math.ceil((durationS + 5) / 5);
    advanceTicks(engine, ticksElapsed);

    const issuerAfter = homeColony(engine, issuer);
    expect(issuerAfter.orbitalResources.food).toBe(issuerFoodBefore + 10);
    // Payé au prix du contrat (2 crédits/unité × 10 livrées), à la production organique
    // (taxe par colon) des ticks écoulés près — bornée très au-dessus de ce qu'elle peut
    // réellement produire, pour ne détecter qu'un paiement manquant, pas la dérive normale.
    const creditsAfterDelivery = engine.colonies[0]!.resources.credits;
    const organicTolerance = ticksElapsed * 2 + 5;
    expect(creditsAfterDelivery).toBeGreaterThanOrEqual(accepterCreditsBeforeDelivery + 20);
    expect(creditsAfterDelivery).toBeLessThan(accepterCreditsBeforeDelivery + 20 + organicTolerance);
    expect(engine.snapshotForEmpire(accepter).missions).toHaveLength(0);
  });

  it("acceptContract : refuse d'accepter son propre contrat", () => {
    const engine = GameEngine.load();
    const empire = engine.defaultEmpireForDev;
    const colony = engine.colonies[0]!;
    engine.postContract(empire, colony.id, "ore", 10, 1, 3_600_000);
    const contractId = engine.contracts[0]!.id;
    expect(engine.acceptContract(empire, colony.id, contractId, 10)).toMatch(/propre contrat/);
  });

  it("acceptContract : refuse une quantité au-delà du reliquat", () => {
    const engine = GameEngine.load();
    const issuer = engine.defaultEmpireForDev;
    const colony = engine.colonies[0]!;
    engine.postContract(issuer, colony.id, "ore", 10, 1, 3_600_000);
    const contractId = engine.contracts[0]!.id;
    const other = engine.empireById(engine.devSpawnEmpire("Voisin")!)!;
    const otherColony = homeColony(engine, other);
    expect(engine.acceptContract(other, otherColony.id, contractId, 999)).toMatch(/indisponible/);
  });
});

describe("GameEngine — pilote économique PNJ (chantier 14)", () => {
  it("un PNJ vend son surplus orbital et finit par contractualiser un besoin", () => {
    const engine = GameEngine.load();
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

    const npcContracts = engine.snapshotForEmpire(npc).contracts.filter((c) => c.issuerId === npcId);
    expect(npcContracts.length).toBeGreaterThan(0);
    // Publié pour un besoin réel (métaux/biens/composants : jamais produits localement).
    expect(["metals", "goods", "components"]).toContain(npcContracts[0]!.resource);
    expect(npcContracts[0]!.issuerColor).toBe(npc.color);
  });

  it("un empire humain n'a aucun pilotage automatique (npcTick n'agit que sur les PNJ)", () => {
    const engine = GameEngine.load();
    advanceTicks(engine, 350);
    // L'empire par défaut est humain : aucun contrat n'a dû être publié en son nom.
    expect(engine.contracts.filter((c) => c.issuerId === engine.defaultEmpireForDev.id)).toHaveLength(
      0,
    );
  });
});

describe("GameEngine — état de faction (chantier 15)", () => {
  it("une partie neuve amorce les trois factions, neutres", () => {
    const engine = GameEngine.load();
    const states = engine.factionStates;
    expect(states).toHaveLength(3);
    for (const state of states) {
      expect(state.mood).toBe("neutral");
      expect(state.moodUntil).toBeNull();
    }
    expect(states.map((s) => s.factionId).sort()).toEqual(
      ["aether_cartel", "ferride", "ostara_league"].sort(),
    );
  });

  it("initFactionStates est idempotent : un rechargement ne dédouble jamais les factions", () => {
    GameEngine.load();
    const reloaded = GameEngine.load();
    expect(reloaded.factionStates).toHaveLength(3);
  });

  it("l'état de faction est diffusé à tous les empires (pas de brouillard)", () => {
    const engine = GameEngine.load();
    const other = engine.empireById(engine.devSpawnEmpire("Spectateur")!)!;
    expect(engine.snapshotForEmpire(other).factionStates).toHaveLength(3);
  });
});

describe("GameEngine — humeurs de faction (chantier 15)", () => {
  /** Station de la galaxie d'origine, révélée à l'empire (le brouillard initial ne
   * couvre qu'un système). */
  const reachableStation = (engine: GameEngine, empire: ReturnType<typeof empireFor>) => {
    const station = engine.universe.galaxies[0]!.systems.find((s) => s.station)?.station;
    if (!station) throw new Error("la galaxie d'origine a toujours au moins une station");
    engine.devArmFleet(empire, station.systemId, {});
    return station;
  };

  it("devSetFactionMood force l'humeur ; elle revient à neutre à l'échéance", () => {
    const engine = GameEngine.load();
    const factionId = engine.factionStates[0]!.factionId;
    expect(engine.devSetFactionMood(factionId, "boom", 10_000)).toBe(true);
    expect(engine.factionStates.find((s) => s.factionId === factionId)!.mood).toBe("boom");

    advanceTicks(engine, 12); // dépasse largement les 10s réglées

    expect(engine.factionStates.find((s) => s.factionId === factionId)!.mood).toBe("neutral");
  });

  it("devSetFactionMood refuse une faction inconnue", () => {
    const engine = GameEngine.load();
    expect(engine.devSetFactionMood("inconnue", "boom")).toBe(false);
  });

  it("un embargo bloque sellToStation et buyFromStation sous le seuil de standing", () => {
    const engine = GameEngine.load();
    const empire = engine.defaultEmpireForDev;
    const colony = engine.colonies[0]!;
    const station = reachableStation(engine, empire);

    expect(engine.devSetFactionMood(station.factionId, "embargo")).toBe(true);

    expect(engine.sellToStation(empire, colony.id, station.id, { ore: 10 })).toMatch(/Embargo/);
    expect(engine.buyFromStation(empire, colony.id, station.id, "ore", 10)).toMatch(/Embargo/);
  });

  it("un partenaire établi (standing suffisant) échappe à l'embargo", () => {
    const engine = GameEngine.load();
    const empire = engine.defaultEmpireForDev;
    const colony = engine.colonies[0]!;
    const station = reachableStation(engine, empire);
    empire.factionRep[station.factionId] = 500; // largement au-dessus du seuil

    expect(engine.devSetFactionMood(station.factionId, "embargo")).toBe(true);

    expect(engine.sellToStation(empire, colony.id, station.id, { ore: 10 })).toBeNull();
  });

  it("les humeurs finissent par bouger au fil des ticks économiques", () => {
    const engine = GameEngine.load();
    // Échantillonne à chaque tick éco plutôt qu'un seul gros bond : une humeur peut se
    // déclencher PUIS expirer dans la fenêtre, et l'état final seul ne le verrait pas.
    let sawNonNeutral = false;
    for (let i = 0; i < 60 && !sawNonNeutral; i++) {
      advanceTicks(engine, 12); // un tick économique par itération
      sawNonNeutral = engine.factionStates.some((s) => s.mood !== "neutral");
    }
    // Chance de bascule 8 %/tick éco/faction : probabilité d'échec conjointe ~1e-6 sur 60 essais.
    expect(sawNonNeutral).toBe(true);
  });
});

describe("GameEngine — contrats de faction (chantier 15)", () => {
  /** Faction d'une station de la galaxie d'origine : garantit que le contrat de pénurie
   * déclenché cible une station à portée (pas de portail requis pour l'atteindre). */
  const homeGalaxyFactionId = (engine: GameEngine) =>
    engine.universe.galaxies[0]!.systems.find((s) => s.station)!.station!.factionId;

  it("une pénurie publie un contrat pour un besoin réel, sans séquestre prélevé", () => {
    const engine = GameEngine.load();
    const factionId = homeGalaxyFactionId(engine);
    expect(engine.devSetFactionMood(factionId, "shortage")).toBe(true);

    const contract = engine.contracts.find((c) => c.issuerId === factionId);
    expect(contract).toBeDefined();
    expect(contract!.status).toBe("open");
    expect(contract!.issuerName).toBe(FACTIONS[factionId as keyof typeof FACTIONS].name);
    expect(Object.keys(FACTIONS[factionId as keyof typeof FACTIONS].consumes)).toContain(
      contract!.resource,
    );
  });

  it("ne double jamais un contrat de pénurie tant qu'un autre est ouvert", () => {
    const engine = GameEngine.load();
    const factionId = homeGalaxyFactionId(engine);
    engine.devSetFactionMood(factionId, "shortage");
    engine.devSetFactionMood(factionId, "neutral");
    engine.devSetFactionMood(factionId, "shortage");

    expect(engine.contracts.filter((c) => c.issuerId === factionId && c.status === "open")).toHaveLength(
      1,
    );
  });

  it("honoré, un contrat de faction livre au comptoir, paie au prix fixé et crédite le standing", () => {
    const engine = GameEngine.load();
    const empire = engine.defaultEmpireForDev;
    const colony = engine.colonies[0]!;
    const factionId = homeGalaxyFactionId(engine);

    expect(engine.devSetFactionMood(factionId, "shortage")).toBe(true);
    const contract = engine.contracts.find((c) => c.issuerId === factionId)!;

    // Lève d'abord l'énergie du carburant, SEULE et en quantité MODESTE : l'orbite n'a
    // que 600 de capacité totale (dock unique), déjà entamée par le minerai/vivres de
    // la colonie mère (200) — trop d'énergie la remplirait avant même d'y loger la
    // cargaison. Le débit de l'ascenseur est aussi partagé entre consignes "up"
    // (RESOURCES itère l'énergie en premier), donc lever les deux à la fois affamerait
    // la cargaison derrière l'énergie.
    engine.devGrant({ energy: 200, credits: 500 });
    engine.setLiftRule(empire, colony.id, "energy", { keepGround: 0, direction: "up" });
    advanceTicks(engine, 15);
    engine.setLiftRule(empire, colony.id, "energy", null);

    // Puis la cargaison demandée (quelle qu'elle soit), seule à son tour. La colonie mère
    // naît avec sa PROPRE consigne "up" sur le minerai (chantier 12) — sans la couper, elle
    // continuerait de disputer le même débit et pourrait affamer la cargaison demandée.
    engine.setLiftRule(empire, colony.id, "ore", null);
    engine.devGrant({ [contract.resource]: 150 } as Record<string, number>);
    engine.setLiftRule(empire, colony.id, contract.resource, { keepGround: 0, direction: "up" });
    advanceTicks(engine, 30);

    const repBefore = empire.factionRep[factionId] ?? 0;
    expect(engine.acceptContract(empire, colony.id, contract.id, contract.quantity)).toBeNull();

    const mission = engine
      .snapshotForEmpire(empire)
      .missions.find((m) => m.kind === "deliver_contract")!;
    expect(mission).toBeDefined();
    const creditsBeforeDelivery = engine.colonies[0]!.resources.credits;

    const durationS = Math.ceil((mission.arrivesAt - mission.departedAt) / 1000);
    advanceTicks(engine, Math.ceil((durationS + 5) / 5));

    // Payé au prix fixé du contrat, standing crédité — même mécanique qu'un empire émetteur.
    expect(engine.colonies[0]!.resources.credits).toBeGreaterThanOrEqual(
      creditsBeforeDelivery + Math.floor(contract.quantity * contract.pricePerUnit),
    );
    expect(empire.factionRep[factionId] ?? 0).toBeGreaterThan(repBefore);
    expect(engine.snapshotForEmpire(empire).missions).toHaveLength(0);
    expect(engine.contracts.find((c) => c.id === contract.id)!.status).toBe("fulfilled");
  });

  it("un contrat de faction expiré sans être honoré n'entraîne aucun remboursement", () => {
    const engine = GameEngine.load();
    const factionId = homeGalaxyFactionId(engine);
    expect(engine.devSetFactionMood(factionId, "shortage")).toBe(true);
    const contractId = engine.contracts.find((c) => c.issuerId === factionId)!.id;

    // Échéance du contrat = FACTION_CONTRACT_DURATION_MS (1800 s = 360 ticks), indépendante
    // de la durée d'humeur passée à devSetFactionMood — marge large pour la dépasser.
    advanceTicks(engine, 370);

    expect(engine.contracts.find((c) => c.id === contractId)!.status).toBe("expired");
  });
});
