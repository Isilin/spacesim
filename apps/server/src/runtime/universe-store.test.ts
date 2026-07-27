import { generateGalaxyAt, generateUniverse } from "@spacesim/shared";
import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { db, schema } from "../db/index.js";
import {
  appendGalaxies,
  loadUniverse,
  materializedGalaxyCount,
  withParentIndexes,
} from "./universe-store.js";

const GAME_ID = "test-game";
const SEED = "store-seed";

const UNIVERSE_TABLES = [
  schema.universeLinks,
  schema.universeStations,
  schema.universeBelts,
  schema.universeBodies,
  schema.universeSystems,
  schema.universeGalaxies,
  schema.games,
] as const;

beforeEach(() => {
  for (const table of UNIVERSE_TABLES) db.delete(table).run();
  db.insert(schema.games)
    .values({ id: GAME_ID, seed: SEED, lastTickAt: 0, createdAt: 0, galaxyCount: 0 })
    .run();
});

const galaxyCount = () =>
  db.select().from(schema.games).where(eq(schema.games.id, GAME_ID)).get()!.galaxyCount;

describe("universe-store", () => {
  it("round-trip : l'univers rechargé est identique à l'univers matérialisé", () => {
    const universe = withParentIndexes(generateUniverse(SEED, 3));
    appendGalaxies(GAME_ID, universe.galaxies, 3);
    const loaded = loadUniverse(GAME_ID, SEED);
    expect(loaded).toEqual(universe);
    expect(galaxyCount()).toBe(3);
  });

  it("idempotence : rejouer appendGalaxies ne réécrit rien", () => {
    const universe = withParentIndexes(generateUniverse(SEED, 2));
    appendGalaxies(GAME_ID, universe.galaxies, 2);
    const before = loadUniverse(GAME_ID, SEED);
    appendGalaxies(GAME_ID, universe.galaxies, 2);
    expect(materializedGalaxyCount(GAME_ID)).toBe(2);
    expect(loadUniverse(GAME_ID, SEED)).toEqual(before);
  });

  it("append partiel : seules les galaxies manquantes sont insérées", () => {
    const three = withParentIndexes(generateUniverse(SEED, 3));
    appendGalaxies(GAME_ID, three.galaxies, 3);
    const five = withParentIndexes(generateUniverse(SEED, 5));
    appendGalaxies(GAME_ID, five.galaxies, 5);
    expect(materializedGalaxyCount(GAME_ID)).toBe(5);
    expect(galaxyCount()).toBe(5);
    expect(loadUniverse(GAME_ID, SEED)).toEqual(five);
  });

  it("la DB est la vérité : une correction manuelle survit au rechargement", () => {
    const universe = withParentIndexes(generateUniverse(SEED, 1));
    appendGalaxies(GAME_ID, universe.galaxies, 1);
    const body = universe.galaxies[0]!.systems[0]!.planets[0]!;
    db.update(schema.universeBodies)
      .set({ name: "Monde corrigé", habitability: 99 })
      .where(eq(schema.universeBodies.id, body.id))
      .run();
    const loaded = loadUniverse(GAME_ID, SEED)!;
    const reloaded = loaded.galaxies[0]!.systems[0]!.planets[0]!;
    expect(reloaded.name).toBe("Monde corrigé");
    expect(reloaded.habitability).toBe(99);
    // Le générateur, lui, redonnerait l'original — il n'a plus autorité.
    expect(body.name).not.toBe("Monde corrigé");
  });

  it("refuse une galaxie non-mère sans parentIndex figé", () => {
    const galaxy = generateGalaxyAt(SEED, 1);
    expect(() => appendGalaxies(GAME_ID, [galaxy], 2)).toThrow(/parentIndex/);
    // La transaction a tout annulé : rien n'est matérialisé.
    expect(materializedGalaxyCount(GAME_ID)).toBe(0);
  });

  it("withParentIndexes fige la mère à null et les autres sur leur voisine", () => {
    const universe = withParentIndexes(generateUniverse(SEED, 4));
    expect(universe.galaxies[0]!.parentIndex).toBeNull();
    for (let i = 1; i < 4; i++) {
      const parent = universe.galaxies[i]!.parentIndex;
      expect(parent).toBeGreaterThanOrEqual(0);
      expect(parent).toBeLessThan(i);
    }
  });

  it("loadUniverse renvoie null sur une base sans univers", () => {
    expect(loadUniverse(GAME_ID, SEED)).toBeNull();
  });
});
