import { eq } from "drizzle-orm";
import { db, schema } from "../../db/index.js";
import type {
  ContentBuilding,
  ContentCombatTuning,
  ContentFaction,
  ContentWarship,
} from "./content-types.js";

/** Ligne unique de `content_combat_tuning` — id fixe, jamais une clé de contenu. */
const TUNING_ROW_ID = "default";

type WarshipRow = typeof schema.contentWarships.$inferSelect;
type TuningRow = typeof schema.contentCombatTuning.$inferSelect;
type FactionRow = typeof schema.contentFactions.$inferSelect;
type BuildingRow = typeof schema.contentBuildings.$inferSelect;

function warshipFromRow(row: WarshipRow): ContentWarship {
  return {
    id: row.id,
    nameFr: row.nameFr,
    descriptionFr: row.descriptionFr,
    hull: row.hull,
    shield: row.shield,
    weapons: JSON.parse(row.weapons),
    initiative: row.initiative,
    category: row.category as ContentWarship["category"],
    cost: JSON.parse(row.cost),
    buildMs: row.buildMs,
    requiresTech: row.requiresTech,
    fleetDamageBonus: row.fleetDamageBonus,
  };
}

function rowFromWarship(w: ContentWarship) {
  return {
    id: w.id,
    nameFr: w.nameFr,
    descriptionFr: w.descriptionFr,
    hull: w.hull,
    shield: w.shield,
    weapons: JSON.stringify(w.weapons),
    initiative: w.initiative,
    category: w.category,
    cost: JSON.stringify(w.cost),
    buildMs: w.buildMs,
    requiresTech: w.requiresTech,
    fleetDamageBonus: w.fleetDamageBonus,
  };
}

function tuningFromRow(row: TuningRow): ContentCombatTuning {
  return {
    categoryAdvantage: JSON.parse(row.categoryAdvantage),
    directives: JSON.parse(row.directives),
    directiveCounter: JSON.parse(row.directiveCounter),
    counterBonus: row.counterBonus,
  };
}

function rowFromTuning(t: ContentCombatTuning) {
  return {
    id: TUNING_ROW_ID,
    categoryAdvantage: JSON.stringify(t.categoryAdvantage),
    directives: JSON.stringify(t.directives),
    directiveCounter: JSON.stringify(t.directiveCounter),
    counterBonus: t.counterBonus,
  };
}

function factionFromRow(row: FactionRow): ContentFaction {
  return {
    id: row.id,
    name: row.name,
    color: row.color,
    descriptionFr: row.descriptionFr,
    produces: JSON.parse(row.produces),
    consumes: JSON.parse(row.consumes),
  };
}

function rowFromFaction(f: ContentFaction) {
  return {
    id: f.id,
    name: f.name,
    color: f.color,
    descriptionFr: f.descriptionFr,
    produces: JSON.stringify(f.produces),
    consumes: JSON.stringify(f.consumes),
  };
}

function buildingFromRow(row: BuildingRow): ContentBuilding {
  return {
    id: row.id,
    nameFr: row.nameFr,
    descriptionFr: row.descriptionFr,
    cost: JSON.parse(row.cost),
    buildMs: row.buildMs,
    outputs: row.outputs ? JSON.parse(row.outputs) : null,
    inputs: row.inputs ? JSON.parse(row.inputs) : null,
    depositScaled: row.depositScaled,
    jobsPerInstance: row.jobsPerInstance,
  };
}

function rowFromBuilding(b: ContentBuilding) {
  return {
    id: b.id,
    nameFr: b.nameFr,
    descriptionFr: b.descriptionFr,
    cost: JSON.stringify(b.cost),
    buildMs: b.buildMs,
    outputs: b.outputs ? JSON.stringify(b.outputs) : null,
    inputs: b.inputs ? JSON.stringify(b.inputs) : null,
    depositScaled: b.depositScaled,
    jobsPerInstance: b.jobsPerInstance,
  };
}

/**
 * Accès DB au contenu de jeu (chantier 23.5+) — une classe par cohérence avec le reste
 * du moteur, mais hors `WriteSet`/`Persister` : chemin admin à basse fréquence, pas le
 * chemin chaud tick/commande que le write-behind protège (même choix que
 * `admin/audit-service.ts`).
 */
export class ContentRepository {
  async countWarships(): Promise<number> {
    const rows = await db.select({ id: schema.contentWarships.id }).from(schema.contentWarships);
    return rows.length;
  }

  async loadWarships(): Promise<Record<string, ContentWarship>> {
    // Tri explicite par id : sans lui, l'ordre de restitution n'est pas garanti stable
    // après un UPDATE (ex. via `onConflictDoUpdate`), ce qui ferait sauter les lignes
    // dans l'écran admin à chaque édition.
    const rows = await db.select().from(schema.contentWarships).orderBy(schema.contentWarships.id);
    return Object.fromEntries(rows.map((row) => [row.id, warshipFromRow(row)]));
  }

  async insertWarships(warships: ContentWarship[]): Promise<void> {
    if (warships.length === 0) return;
    await db.insert(schema.contentWarships).values(warships.map(rowFromWarship));
  }

  async saveWarship(warship: ContentWarship): Promise<void> {
    const row = rowFromWarship(warship);
    await db
      .insert(schema.contentWarships)
      .values(row)
      .onConflictDoUpdate({ target: schema.contentWarships.id, set: row });
  }

  async hasTuning(): Promise<boolean> {
    const rows = await db
      .select({ id: schema.contentCombatTuning.id })
      .from(schema.contentCombatTuning)
      .where(eq(schema.contentCombatTuning.id, TUNING_ROW_ID));
    return rows.length > 0;
  }

  async loadTuning(): Promise<ContentCombatTuning> {
    const rows = await db
      .select()
      .from(schema.contentCombatTuning)
      .where(eq(schema.contentCombatTuning.id, TUNING_ROW_ID));
    const row = rows[0];
    if (!row)
      throw new Error("content_combat_tuning non initialisée — ensureSeeded() manquant au boot");
    return tuningFromRow(row);
  }

  async insertTuning(tuning: ContentCombatTuning): Promise<void> {
    await db.insert(schema.contentCombatTuning).values(rowFromTuning(tuning));
  }

  async saveTuning(tuning: ContentCombatTuning): Promise<void> {
    const row = rowFromTuning(tuning);
    await db
      .insert(schema.contentCombatTuning)
      .values(row)
      .onConflictDoUpdate({ target: schema.contentCombatTuning.id, set: row });
  }

  async countFactions(): Promise<number> {
    const rows = await db.select({ id: schema.contentFactions.id }).from(schema.contentFactions);
    return rows.length;
  }

  async loadFactions(): Promise<Record<string, ContentFaction>> {
    const rows = await db.select().from(schema.contentFactions).orderBy(schema.contentFactions.id);
    return Object.fromEntries(rows.map((row) => [row.id, factionFromRow(row)]));
  }

  async insertFactions(factions: ContentFaction[]): Promise<void> {
    if (factions.length === 0) return;
    await db.insert(schema.contentFactions).values(factions.map(rowFromFaction));
  }

  async saveFaction(faction: ContentFaction): Promise<void> {
    const row = rowFromFaction(faction);
    await db
      .insert(schema.contentFactions)
      .values(row)
      .onConflictDoUpdate({ target: schema.contentFactions.id, set: row });
  }

  async countBuildings(): Promise<number> {
    const rows = await db.select({ id: schema.contentBuildings.id }).from(schema.contentBuildings);
    return rows.length;
  }

  async loadBuildings(): Promise<Record<string, ContentBuilding>> {
    const rows = await db
      .select()
      .from(schema.contentBuildings)
      .orderBy(schema.contentBuildings.id);
    return Object.fromEntries(rows.map((row) => [row.id, buildingFromRow(row)]));
  }

  async insertBuildings(buildings: ContentBuilding[]): Promise<void> {
    if (buildings.length === 0) return;
    await db.insert(schema.contentBuildings).values(buildings.map(rowFromBuilding));
  }

  async saveBuilding(building: ContentBuilding): Promise<void> {
    const row = rowFromBuilding(building);
    await db
      .insert(schema.contentBuildings)
      .values(row)
      .onConflictDoUpdate({ target: schema.contentBuildings.id, set: row });
  }
}
