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
  schema.universeTradingPosts,
  schema.universeBelts,
  schema.universeBodies,
  schema.universeSystems,
  schema.universeGalaxies,
  schema.games,
] as const;

beforeEach(async () => {
  for (const table of UNIVERSE_TABLES) await db.delete(table);
  await db.insert(schema.games).values({
    id: GAME_ID,
    seed: SEED,
    lastTickAt: 0,
    createdAt: 0,
    galaxyCount: 0,
  });
});

const galaxyCount = async () => {
  const rows = await db
    .select()
    .from(schema.games)
    .where(eq(schema.games.id, GAME_ID));
  return rows[0]!.galaxyCount;
};

describe("universe-store", () => {
  it("round-trip : l'univers rechargé est identique à l'univers matérialisé", async () => {
    const universe = withParentIndexes(generateUniverse(SEED, 3));
    await appendGalaxies(GAME_ID, universe.galaxies, 3);
    const loaded = await loadUniverse(GAME_ID, SEED);
    expect(loaded).toEqual(universe);
    expect(await galaxyCount()).toBe(3);
  });

  it("idempotence : rejouer appendGalaxies ne réécrit rien", async () => {
    const universe = withParentIndexes(generateUniverse(SEED, 2));
    await appendGalaxies(GAME_ID, universe.galaxies, 2);
    const before = await loadUniverse(GAME_ID, SEED);
    await appendGalaxies(GAME_ID, universe.galaxies, 2);
    expect(await materializedGalaxyCount(GAME_ID)).toBe(2);
    expect(await loadUniverse(GAME_ID, SEED)).toEqual(before);
  });

  it("append partiel : seules les galaxies manquantes sont insérées", async () => {
    const three = withParentIndexes(generateUniverse(SEED, 3));
    await appendGalaxies(GAME_ID, three.galaxies, 3);
    const five = withParentIndexes(generateUniverse(SEED, 5));
    await appendGalaxies(GAME_ID, five.galaxies, 5);
    expect(await materializedGalaxyCount(GAME_ID)).toBe(5);
    expect(await galaxyCount()).toBe(5);
    expect(await loadUniverse(GAME_ID, SEED)).toEqual(five);
  });

  it("la DB est la vérité : une correction manuelle survit au rechargement", async () => {
    const universe = withParentIndexes(generateUniverse(SEED, 1));
    await appendGalaxies(GAME_ID, universe.galaxies, 1);
    const body = universe.galaxies[0]!.systems[0]!.planets[0]!;
    await db
      .update(schema.universeBodies)
      .set({ name: "Monde corrigé", habitability: 99 })
      .where(eq(schema.universeBodies.id, body.id));
    const loaded = (await loadUniverse(GAME_ID, SEED))!;
    const reloaded = loaded.galaxies[0]!.systems[0]!.planets[0]!;
    expect(reloaded.name).toBe("Monde corrigé");
    expect(reloaded.habitability).toBe(99);
    // Le générateur, lui, redonnerait l'original — il n'a plus autorité.
    expect(body.name).not.toBe("Monde corrigé");
  });

  it("refuse une galaxie non-mère sans parentIndex figé", async () => {
    const galaxy = generateGalaxyAt(SEED, 1);
    await expect(appendGalaxies(GAME_ID, [galaxy], 2)).rejects.toThrow(
      /parentIndex/,
    );
    // La transaction a tout annulé : rien n'est matérialisé.
    expect(await materializedGalaxyCount(GAME_ID)).toBe(0);
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

  it("loadUniverse renvoie null sur une base sans univers", async () => {
    expect(await loadUniverse(GAME_ID, SEED)).toBeNull();
  });
});
