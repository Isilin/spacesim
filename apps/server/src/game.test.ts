import { beforeEach, describe, expect, it } from "vitest";
import { db, schema } from "./db/index.js";
import { GameEngine } from "./game.js";

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
