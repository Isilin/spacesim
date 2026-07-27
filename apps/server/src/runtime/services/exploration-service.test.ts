import { beforeEach, describe, expect, it } from "vitest";
import {
  FRONTIER_GALAXIES,
  GATEWAY_COST,
  INITIAL_GALAXIES,
  MAX_EMPIRES_PER_GALAXY,
  gatewayCost,
} from "@spacesim/shared";
import { eq } from "drizzle-orm";
import { db, schema } from "../../db/index.js";
import { GameEngine } from "../../game.js";
import { resetDb, empireFor, summaries } from "../../test-harness.js";

beforeEach(() => resetDb());

describe("GameEngine — univers extensible (chantier 9)", () => {
  /** Galaxies sans la moindre colonie : l'invariant de frontière porte là-dessus. */
  const emptyGalaxies = (engine: GameEngine) => {
    const colonized = new Set(
      summaries(engine).flatMap((e) => e.colonies.map((c) => c.systemId.split("-sys-")[0])),
    );
    return engine.universe.galaxies.filter((g) => !colonized.has(g.id)).length;
  };

  it("partie neuve : INITIAL_GALAXIES galaxies, frontière vierge intacte", async () => {
    const engine = await GameEngine.loadOrBootstrap();
    expect(engine.universe.galaxies).toHaveLength(INITIAL_GALAXIES);
    expect(emptyGalaxies(engine)).toBeGreaterThanOrEqual(FRONTIER_GALAXIES);
    // Chaque galaxie lointaine a son chantier de portail.
    expect(engine.gateways).toHaveLength(INITIAL_GALAXIES - 1);
  });

  it("recharge l'univers à la taille persistée, galaxies connues inchangées", async () => {
    const e1 = await GameEngine.loadOrBootstrap();
    const known = e1.universe.galaxies;
    // Simule une extension déjà survenue en partie (le compteur fait foi au boot).
    db.update(schema.games).set({ galaxyCount: 7 }).run();

    const e2 = await GameEngine.loadOrBootstrap();
    expect(e2.universe.galaxies).toHaveLength(7);
    expect(e2.universe.galaxies.slice(0, known.length)).toEqual(known);
    // Les galaxies apparues sont équipées : portail et comptoirs approvisionnés.
    expect(e2.gateways).toHaveLength(6);
    const stationIds = e2.universe.galaxies
      .flatMap((g) => g.systems)
      .flatMap((s) => (s.station ? [s.station.id] : []));
    const stocked = new Set(
      db
        .select()
        .from(schema.stationStates)
        .all()
        .map((r) => r.stationId),
    );
    expect(stationIds.every((id) => stocked.has(id))).toBe(true);
  });

  it("les nouveaux empires naissent voisins, puis débordent en poussant la frontière", async () => {
    const engine = await GameEngine.loadOrBootstrap();
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

  it("une extension pousse la nouvelle carte à tous les clients", async () => {
    const engine = await GameEngine.loadOrBootstrap();
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

  it("le portail coûte plus cher à mesure qu'on vise loin", async () => {
    const near = gatewayCost("gal-1");
    const far = gatewayCost("gal-6");
    expect(far.metals!).toBeGreaterThan(near.metals!);
    // Le coût de référence est celui de la galaxie voisine.
    expect(near).toEqual(GATEWAY_COST);
  });

  it("étendre l'univers ne coûte rien aux empires en place", async () => {
    const e1 = await GameEngine.loadOrBootstrap();
    const before = summaries(e1);
    db.update(schema.games).set({ galaxyCount: 9 }).run();

    const e2 = await GameEngine.loadOrBootstrap();
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
describe("GameEngine — univers persistant (chantier 18)", () => {
  it("le boot matérialise l'univers : tables peuplées, compteur aligné", async () => {
    const engine = await GameEngine.loadOrBootstrap();
    const galaxies = db.select().from(schema.universeGalaxies).all();
    expect(galaxies).toHaveLength(engine.universe.galaxies.length);
    expect(db.select().from(schema.universeSystems).all().length).toBeGreaterThan(0);
    expect(db.select().from(schema.universeBodies).all().length).toBeGreaterThan(0);
    // La mère n'a pas de parent ; toutes les autres pointent une voisine d'index inférieur.
    for (const g of galaxies) {
      if (g.index === 0) expect(g.parentGalaxyIndex).toBeNull();
      else expect(g.parentGalaxyIndex).toBeLessThan(g.index);
    }
  });

  it("reboot : l'univers rechargé est strictement identique", async () => {
    const e1 = await GameEngine.loadOrBootstrap();
    const before = e1.universe;
    const e2 = await GameEngine.loadOrBootstrap();
    expect(e2.universe).toEqual(before);
  });

  it("la DB est la vérité : une correction manuelle survit au reboot", async () => {
    const e1 = await GameEngine.loadOrBootstrap();
    const planet = e1.universe.galaxies[0]!.systems[0]!.planets[0]!;
    db.update(schema.universeBodies)
      .set({ name: "Monde corrigé" })
      .where(eq(schema.universeBodies.id, planet.id))
      .run();
    const e2 = await GameEngine.loadOrBootstrap();
    const reloaded = e2.universe.galaxies[0]!.systems[0]!.planets[0]!;
    expect(reloaded.id).toBe(planet.id);
    expect(reloaded.name).toBe("Monde corrigé");
  });

  it("rattrapage one-shot : une base d'avant le chantier 18 est matérialisée au boot", async () => {
    // Simule une base legacy : ligne games seule, aucune table universe_* peuplée.
    db.insert(schema.games)
      .values({
        id: "legacy",
        seed: "legacy-seed",
        tick: 0,
        lastTickAt: Date.now(),
        createdAt: Date.now(),
        galaxyCount: INITIAL_GALAXIES,
      })
      .run();
    const engine = await GameEngine.load();
    expect(db.select().from(schema.universeGalaxies).all()).toHaveLength(INITIAL_GALAXIES);
    expect(engine.universe.galaxies).toHaveLength(engine.universe.galaxies.length);
    // Rejouer load() est un no-op : rien de plus n'est matérialisé.
    const before = db.select().from(schema.universeBodies).all().length;
    await GameEngine.load();
    expect(db.select().from(schema.universeBodies).all()).toHaveLength(before);
  });

  it("étendre l'univers matérialise les galaxies neuves sans toucher aux anciennes", async () => {
    const engine = await GameEngine.loadOrBootstrap();
    const before = engine.universe.galaxies.length;
    const namesBefore = db
      .select()
      .from(schema.universeGalaxies)
      .all()
      .map((g) => [g.id, g.name] as const);
    // Remplit la galaxie de départ (MAX_EMPIRES_PER_GALAXY) : le suivant colonise
    // ailleurs et la frontière glissante doit s'ouvrir — donc se matérialiser.
    for (let i = 0; i < MAX_EMPIRES_PER_GALAXY; i++) engine.devSpawnEmpire(`ext-${i}`);
    engine.ensureFrontier();
    expect(engine.universe.galaxies.length).toBeGreaterThan(before);
    expect(db.select().from(schema.universeGalaxies).all()).toHaveLength(
      engine.universe.galaxies.length,
    );
    // Les galaxies déjà matérialisées sont intactes, et tout survit au reboot.
    const after = new Map(
      db
        .select()
        .from(schema.universeGalaxies)
        .all()
        .map((g) => [g.id, g.name] as const),
    );
    for (const [id, name] of namesBefore) expect(after.get(id)).toBe(name);
    const reloaded = await GameEngine.loadOrBootstrap();
    expect(reloaded.universe).toEqual(engine.universe);
  });

  it("load() lève sur une base vierge ; bootstrap lève sur une base peuplée", async () => {
    await expect(GameEngine.load()).rejects.toThrow(/bootstrapNewUniverse/);
    await GameEngine.bootstrapNewUniverse();
    await expect(GameEngine.bootstrapNewUniverse()).rejects.toThrow(/existe déjà/);
  });
});
