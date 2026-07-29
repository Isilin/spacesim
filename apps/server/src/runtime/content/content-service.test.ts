import { WARSHIP_IDS } from "@spacesim/shared";
import { beforeEach, describe, expect, it } from "vitest";
import { db, schema } from "../../db/index.js";
import {
  combatDefsFromWarships,
  ensureContentSeeded,
  loadContentBundle,
} from "./content-service.js";

beforeEach(async () => {
  await db.delete(schema.contentWarships);
  await db.delete(schema.contentCombatTuning);
});

describe("ensureContentSeeded", () => {
  it("peuple les vaisseaux de guerre et le réglage de combat depuis les tables historiques", async () => {
    await ensureContentSeeded();
    const bundle = await loadContentBundle();
    expect(Object.keys(bundle.warships).sort()).toEqual([...WARSHIP_IDS].sort());
    expect(bundle.warships.fighter?.nameFr).toBe("Chasseur");
    expect(bundle.combatTuning.counterBonus).toBeGreaterThan(1);
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
