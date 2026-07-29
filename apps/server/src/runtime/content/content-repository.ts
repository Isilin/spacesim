import { eq } from "drizzle-orm";
import { db, schema } from "../../db/index.js";
import type {
  ContentBuilding,
  ContentChassis,
  ContentCombatTuning,
  ContentConstant,
  ContentFaction,
  ContentModule,
  ContentShip,
  ContentTech,
  ContentWarship,
} from "./content-types.js";

/** Ligne unique de `content_combat_tuning` — id fixe, jamais une clé de contenu. */
const TUNING_ROW_ID = "default";

type WarshipRow = typeof schema.contentWarships.$inferSelect;
type TuningRow = typeof schema.contentCombatTuning.$inferSelect;
type FactionRow = typeof schema.contentFactions.$inferSelect;
type BuildingRow = typeof schema.contentBuildings.$inferSelect;
type ShipRow = typeof schema.contentShips.$inferSelect;
type ConstantRow = typeof schema.contentConstants.$inferSelect;
type TechRow = typeof schema.contentTechs.$inferSelect;
type ChassisRow = typeof schema.contentChassis.$inferSelect;
type ModuleRow = typeof schema.contentModules.$inferSelect;

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

function shipFromRow(row: ShipRow): ContentShip {
  return {
    id: row.id,
    nameFr: row.nameFr,
    descriptionFr: row.descriptionFr,
    capacity: row.capacity,
    cost: JSON.parse(row.cost),
    buildMs: row.buildMs,
    requiresTech: row.requiresTech,
    speedMult: row.speedMult,
    fuelPerJump: row.fuelPerJump,
  };
}

function rowFromShip(s: ContentShip) {
  return {
    id: s.id,
    nameFr: s.nameFr,
    descriptionFr: s.descriptionFr,
    capacity: s.capacity,
    cost: JSON.stringify(s.cost),
    buildMs: s.buildMs,
    requiresTech: s.requiresTech,
    speedMult: s.speedMult,
    fuelPerJump: s.fuelPerJump,
  };
}

function constantFromRow(row: ConstantRow): ContentConstant {
  return { key: row.key, value: row.value, descriptionFr: row.descriptionFr };
}

function rowFromConstant(c: ContentConstant) {
  return { key: c.key, value: c.value, descriptionFr: c.descriptionFr };
}

function techFromRow(row: TechRow): ContentTech {
  return {
    id: row.id,
    nameFr: row.nameFr,
    descriptionFr: row.descriptionFr,
    branch: row.branch,
    cost: row.cost,
    durationMs: row.durationMs,
    requires: JSON.parse(row.requires),
    effects: JSON.parse(row.effects),
  };
}

function rowFromTech(t: ContentTech) {
  return {
    id: t.id,
    nameFr: t.nameFr,
    descriptionFr: t.descriptionFr,
    branch: t.branch,
    cost: t.cost,
    durationMs: t.durationMs,
    requires: JSON.stringify(t.requires),
    effects: JSON.stringify(t.effects),
  };
}

function chassisFromRow(row: ChassisRow): ContentChassis {
  return {
    id: row.id,
    nameFr: row.nameFr,
    descriptionFr: row.descriptionFr,
    kind: row.kind,
    domain: row.domain,
    hull: row.hull,
    baseInitiative: row.baseInitiative,
    power: row.power,
    tonnage: row.tonnage,
    calc: row.calc,
    slots: JSON.parse(row.slots),
    baseSpeedMult: row.baseSpeedMult,
    baseFuelPerJump: row.baseFuelPerJump,
    roleBonus: row.roleBonus ? JSON.parse(row.roleBonus) : null,
    cost: JSON.parse(row.cost),
    buildMs: row.buildMs,
    requiresTech: row.requiresTech,
  };
}

function rowFromChassis(c: ContentChassis) {
  return {
    id: c.id,
    nameFr: c.nameFr,
    descriptionFr: c.descriptionFr,
    kind: c.kind,
    domain: c.domain,
    hull: c.hull,
    baseInitiative: c.baseInitiative,
    power: c.power,
    tonnage: c.tonnage,
    calc: c.calc,
    slots: JSON.stringify(c.slots),
    baseSpeedMult: c.baseSpeedMult,
    baseFuelPerJump: c.baseFuelPerJump,
    roleBonus: c.roleBonus ? JSON.stringify(c.roleBonus) : null,
    cost: JSON.stringify(c.cost),
    buildMs: c.buildMs,
    requiresTech: c.requiresTech,
  };
}

function moduleFromRow(row: ModuleRow): ContentModule {
  return {
    id: row.id,
    nameFr: row.nameFr,
    descriptionFr: row.descriptionFr,
    slot: row.slot,
    role: row.role,
    power: row.power,
    tonnage: row.tonnage,
    calc: row.calc,
    cost: JSON.parse(row.cost),
    buildMs: row.buildMs,
    requiresTech: row.requiresTech,
    effects: JSON.parse(row.effects),
  };
}

function rowFromModule(m: ContentModule) {
  return {
    id: m.id,
    nameFr: m.nameFr,
    descriptionFr: m.descriptionFr,
    slot: m.slot,
    role: m.role,
    power: m.power,
    tonnage: m.tonnage,
    calc: m.calc,
    cost: JSON.stringify(m.cost),
    buildMs: m.buildMs,
    requiresTech: m.requiresTech,
    effects: JSON.stringify(m.effects),
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

  async countShips(): Promise<number> {
    const rows = await db.select({ id: schema.contentShips.id }).from(schema.contentShips);
    return rows.length;
  }

  async loadShips(): Promise<Record<string, ContentShip>> {
    const rows = await db.select().from(schema.contentShips).orderBy(schema.contentShips.id);
    return Object.fromEntries(rows.map((row) => [row.id, shipFromRow(row)]));
  }

  async insertShips(ships: ContentShip[]): Promise<void> {
    if (ships.length === 0) return;
    await db.insert(schema.contentShips).values(ships.map(rowFromShip));
  }

  async saveShip(ship: ContentShip): Promise<void> {
    const row = rowFromShip(ship);
    await db
      .insert(schema.contentShips)
      .values(row)
      .onConflictDoUpdate({ target: schema.contentShips.id, set: row });
  }

  async countConstants(): Promise<number> {
    const rows = await db
      .select({ key: schema.contentConstants.key })
      .from(schema.contentConstants);
    return rows.length;
  }

  async loadConstants(): Promise<Record<string, ContentConstant>> {
    const rows = await db
      .select()
      .from(schema.contentConstants)
      .orderBy(schema.contentConstants.key);
    return Object.fromEntries(rows.map((row) => [row.key, constantFromRow(row)]));
  }

  async insertConstants(constants: ContentConstant[]): Promise<void> {
    if (constants.length === 0) return;
    await db.insert(schema.contentConstants).values(constants.map(rowFromConstant));
  }

  async saveConstant(constant: ContentConstant): Promise<void> {
    const row = rowFromConstant(constant);
    await db
      .insert(schema.contentConstants)
      .values(row)
      .onConflictDoUpdate({ target: schema.contentConstants.key, set: row });
  }

  async countTechs(): Promise<number> {
    const rows = await db.select({ id: schema.contentTechs.id }).from(schema.contentTechs);
    return rows.length;
  }

  async loadTechs(): Promise<Record<string, ContentTech>> {
    const rows = await db.select().from(schema.contentTechs).orderBy(schema.contentTechs.id);
    return Object.fromEntries(rows.map((row) => [row.id, techFromRow(row)]));
  }

  async insertTechs(techs: ContentTech[]): Promise<void> {
    if (techs.length === 0) return;
    await db.insert(schema.contentTechs).values(techs.map(rowFromTech));
  }

  async saveTech(tech: ContentTech): Promise<void> {
    const row = rowFromTech(tech);
    await db
      .insert(schema.contentTechs)
      .values(row)
      .onConflictDoUpdate({ target: schema.contentTechs.id, set: row });
  }

  async countChassis(): Promise<number> {
    const rows = await db.select({ id: schema.contentChassis.id }).from(schema.contentChassis);
    return rows.length;
  }

  async loadChassis(): Promise<Record<string, ContentChassis>> {
    const rows = await db.select().from(schema.contentChassis).orderBy(schema.contentChassis.id);
    return Object.fromEntries(rows.map((row) => [row.id, chassisFromRow(row)]));
  }

  async insertChassis(chassis: ContentChassis[]): Promise<void> {
    if (chassis.length === 0) return;
    await db.insert(schema.contentChassis).values(chassis.map(rowFromChassis));
  }

  async saveChassis(chassis: ContentChassis): Promise<void> {
    const row = rowFromChassis(chassis);
    await db
      .insert(schema.contentChassis)
      .values(row)
      .onConflictDoUpdate({ target: schema.contentChassis.id, set: row });
  }

  async countModules(): Promise<number> {
    const rows = await db.select({ id: schema.contentModules.id }).from(schema.contentModules);
    return rows.length;
  }

  async loadModules(): Promise<Record<string, ContentModule>> {
    const rows = await db.select().from(schema.contentModules).orderBy(schema.contentModules.id);
    return Object.fromEntries(rows.map((row) => [row.id, moduleFromRow(row)]));
  }

  async insertModules(modules: ContentModule[]): Promise<void> {
    if (modules.length === 0) return;
    await db.insert(schema.contentModules).values(modules.map(rowFromModule));
  }

  async saveModule(module: ContentModule): Promise<void> {
    const row = rowFromModule(module);
    await db
      .insert(schema.contentModules)
      .values(row)
      .onConflictDoUpdate({ target: schema.contentModules.id, set: row });
  }
}
