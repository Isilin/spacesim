import { BUILDING_IDS, FACTION_IDS, WARSHIP_IDS } from "@spacesim/shared";
import { beforeEach, describe, expect, it } from "vitest";
import { db, schema } from "../../db/index.js";
import {
  buildingDefsFromContent,
  combatDefsFromWarships,
  ensureContentSeeded,
  loadContentBundle,
} from "./content-service.js";

beforeEach(async () => {
  await db.delete(schema.contentWarships);
  await db.delete(schema.contentCombatTuning);
  await db.delete(schema.contentFactions);
  await db.delete(schema.contentBuildings);
});

describe("ensureContentSeeded", () => {
  it("peuple les vaisseaux de guerre et le réglage de combat depuis les tables historiques", async () => {
    await ensureContentSeeded();
    const bundle = await loadContentBundle();
    expect(Object.keys(bundle.warships).sort()).toEqual([...WARSHIP_IDS].sort());
    expect(bundle.warships.fighter?.nameFr).toBe("Chasseur");
    expect(bundle.combatTuning.counterBonus).toBeGreaterThan(1);
  });

  it("peuple les factions depuis packages/shared/src/content/factions.ts", async () => {
    await ensureContentSeeded();
    const bundle = await loadContentBundle();
    expect(Object.keys(bundle.factions).sort()).toEqual([...FACTION_IDS].sort());
    expect(bundle.factions.ferride?.name).toBe("Consortium Ferride");
    expect(bundle.factions.ferride?.produces.metals).toBeGreaterThan(0);
  });

  it("peuple les bâtiments depuis packages/shared/src/content/buildings.ts", async () => {
    await ensureContentSeeded();
    const bundle = await loadContentBundle();
    expect(Object.keys(bundle.buildings).sort()).toEqual([...BUILDING_IDS].sort());
    expect(bundle.buildings.mine?.nameFr).toBe("Mine");
    expect(bundle.buildings.mine?.depositScaled).toBe("ore");
  });

  it("est idempotent : un second appel ne duplique rien", async () => {
    await ensureContentSeeded();
    await ensureContentSeeded();
    const bundle = await loadContentBundle();
    expect(Object.keys(bundle.warships)).toHaveLength(WARSHIP_IDS.length);
  });

  it("ne touche pas une entrée déjà présente (une édition admin survit à un reboot)", async () => {
    await ensureContentSeeded();
    const before = await loadContentBundle();
    // Édition directe façon admin, simulée par la même voie que la route.
    const { ContentRepository } = await import("./content-repository.js");
    const repo = new ContentRepository();
    await repo.saveWarship({ ...before.warships.fighter!, hull: 12345 });

    await ensureContentSeeded();
    const after = await loadContentBundle();
    expect(after.warships.fighter?.hull).toBe(12345);
  });
});

describe("combatDefsFromWarships", () => {
  it("convertit le contenu chargé au format attendu par sim/military/combat.ts", async () => {
    await ensureContentSeeded();
    const bundle = await loadContentBundle();
    const defs = combatDefsFromWarships(bundle.warships);
    expect(defs.fighter).toEqual({
      hull: bundle.warships.fighter!.hull,
      shield: bundle.warships.fighter!.shield,
      weapons: bundle.warships.fighter!.weapons,
      initiative: bundle.warships.fighter!.initiative,
      fleetDamageBonus: 0,
      category: bundle.warships.fighter!.category,
    });
  });
});

describe("buildingDefsFromContent", () => {
  it("convertit le contenu chargé au format attendu par sim/industry/colony.ts", async () => {
    await ensureContentSeeded();
    const bundle = await loadContentBundle();
    const defs = buildingDefsFromContent(bundle.buildings);
    expect(defs.mine).toEqual({
      id: "mine",
      cost: bundle.buildings.mine!.cost,
      buildMs: bundle.buildings.mine!.buildMs,
      outputs: bundle.buildings.mine!.outputs ?? undefined,
      inputs: bundle.buildings.mine!.inputs ?? undefined,
      depositScaled: bundle.buildings.mine!.depositScaled,
      jobsPerInstance: bundle.buildings.mine!.jobsPerInstance ?? undefined,
    });
  });
});
