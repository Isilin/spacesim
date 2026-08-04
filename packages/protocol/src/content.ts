import { z } from "zod";

/**
 * Contrats CRUD du CMS de contenu (chantier 23.5+) — un domaine à la fois, en commençant
 * par les vaisseaux de guerre. Idempotent par construction : `PUT
 * /api/admin/content/warships/:id` crée l'entrée si l'id est inconnu, la met à jour
 * sinon (pas de `POST` séparé — id choisi par l'admin, une chaîne lisible comme
 * "plasma_cruiser", pas un UUID serveur).
 */

const combatPhaseWeaponsSchema = z.object({
  long: z.number().nonnegative(),
  medium: z.number().nonnegative(),
  short: z.number().nonnegative(),
});

export const WARSHIP_CATEGORIES = [
  "skirmisher",
  "line",
  "capital",
  "support",
] as const;
export const warshipCategorySchema = z.enum(WARSHIP_CATEGORIES);

export const upsertWarshipSchema = z.object({
  nameFr: z.string().trim().min(1).max(80),
  descriptionFr: z.string().trim().max(500).default(""),
  hull: z.number().positive(),
  shield: z.number().nonnegative(),
  weapons: combatPhaseWeaponsSchema,
  initiative: z.number(),
  category: warshipCategorySchema,
  cost: z.record(z.string(), z.number().nonnegative()),
  buildMs: z.number().int().positive(),
  /** null = aucune tech requise. */
  requiresTech: z.string().trim().min(1).nullable(),
  fleetDamageBonus: z.number().nonnegative().nullable(),
});
export type UpsertWarshipInput = z.infer<typeof upsertWarshipSchema>;

/** Couleur hex à 6 chiffres — cartes/badges/contrats attendent ce format exact. */
const hexColorSchema = z
  .string()
  .trim()
  .regex(/^#[0-9a-fA-F]{6}$/, "Couleur hexadécimale attendue, ex. #ff8c42");

export const upsertFactionSchema = z.object({
  name: z.string().trim().min(1).max(80),
  color: hexColorSchema,
  descriptionFr: z.string().trim().max(500).default(""),
  produces: z.record(z.string(), z.number().nonnegative()),
  consumes: z.record(z.string(), z.number().nonnegative()),
});
export type UpsertFactionInput = z.infer<typeof upsertFactionSchema>;

/**
 * Bâtiments (chantier 23.7) : à la différence des vaisseaux/factions, l'id **n'est pas**
 * libre pour cette passe — `BuildingId` reste un tuple fermé (`Colony.buildings`,
 * `ClientMessageSchema`) tant que ce desserrement n'a pas été traité séparément. La route
 * refuse un id inconnu de `BUILDING_IDS` (vérifié côté serveur, qui a accès à la liste).
 */
export const upsertBuildingSchema = z.object({
  nameFr: z.string().trim().min(1).max(80),
  descriptionFr: z.string().trim().max(500).default(""),
  cost: z.record(z.string(), z.number().nonnegative()),
  buildMs: z.number().int().positive(),
  outputs: z.record(z.string(), z.number().nonnegative()).nullable(),
  inputs: z.record(z.string(), z.number().nonnegative()).nullable(),
  /** Ressource dont la production est multipliée par le gisement de la planète. */
  depositScaled: z.string().trim().min(1).nullable(),
  jobsPerInstance: z.number().int().nonnegative().nullable(),
});
export type UpsertBuildingInput = z.infer<typeof upsertBuildingSchema>;

/**
 * Vaisseaux civils historiques (chantier 23.8) : id libre, même recette que les
 * vaisseaux de guerre — `ShipId` est déjà `string` partout (`buildShip` en protocole
 * n'a jamais eu de tuple fermé), aucun desserrement requis.
 */
export const upsertShipSchema = z.object({
  nameFr: z.string().trim().min(1).max(80),
  descriptionFr: z.string().trim().max(500).default(""),
  capacity: z.number().nonnegative(),
  cost: z.record(z.string(), z.number().nonnegative()),
  buildMs: z.number().int().positive(),
  /** null = aucune tech requise. */
  requiresTech: z.string().trim().min(1).nullable(),
  speedMult: z.number().positive(),
  fuelPerJump: z.number().nonnegative(),
});
export type UpsertShipInput = z.infer<typeof upsertShipSchema>;

/**
 * Scalaires d'équilibrage (chantier 23.8) : comme les bâtiments, la clé **n'est pas**
 * libre — elle doit être un des champs de `BalanceConstants`
 * (`packages/shared/src/balance.ts`), vérifié côté serveur qui seul connaît la liste.
 */
export const upsertConstantSchema = z.object({
  value: z.number(),
  descriptionFr: z.string().trim().max(300).default(""),
});
export type UpsertConstantInput = z.infer<typeof upsertConstantSchema>;

/**
 * Arbre de recherche (chantier 23.9) : id libre (id-minting), même recette que les
 * vaisseaux/factions — `Empire.researched`/`researchQueue` sont déjà `string[]`, aucun
 * tuple fermé à desserrer. `effects` reprend un à un les champs de `TechEffects`
 * (`packages/shared/src/content/techs.ts`) ; `unlockBuildings` reste une liste de chaînes
 * non validée contre `BUILDING_IDS` ici (une faute de frappe ne débloquerait simplement
 * rien de reconnu, sans casser l'écriture).
 */
const techEffectsSchema = z.object({
  unlockBuildings: z.array(z.string()).optional(),
  outputMult: z.record(z.string(), z.number().positive()).optional(),
  outputMultAll: z.number().positive().optional(),
  housingMult: z.number().positive().optional(),
  habitabilityBonus: z.number().optional(),
  queueBonus: z.number().optional(),
  probeSpeedMult: z.number().positive().optional(),
  probeCostMult: z.number().positive().optional(),
  colonyShipSpeedMult: z.number().positive().optional(),
  transferSpeedMult: z.number().positive().optional(),
  satisfactionBonus: z.number().optional(),
  popGrowthMult: z.number().positive().optional(),
  goodsNeedMult: z.number().positive().optional(),
  creditsMult: z.number().positive().optional(),
  foodNeedMult: z.number().positive().optional(),
  storageMult: z.number().positive().optional(),
  buildSpeedMult: z.number().positive().optional(),
  shipBuildSpeedMult: z.number().positive().optional(),
  outpostYieldMult: z.number().positive().optional(),
  influenceMult: z.number().positive().optional(),
  liftCapacityMult: z.number().positive().optional(),
  liftThroughputMult: z.number().positive().optional(),
  fuelMult: z.number().positive().optional(),
  tradeMargin: z.number().optional(),
});

export const TECH_BRANCHES = [
  "industry",
  "colonization",
  "society",
  "military",
] as const;
export const techBranchSchema = z.enum(TECH_BRANCHES);

export const upsertTechSchema = z.object({
  nameFr: z.string().trim().min(1).max(80),
  descriptionFr: z.string().trim().max(500).default(""),
  branch: techBranchSchema,
  cost: z.number().positive(),
  durationMs: z.number().int().positive(),
  requires: z.array(z.string()),
  effects: techEffectsSchema,
});
export type UpsertTechInput = z.infer<typeof upsertTechSchema>;

/**
 * Châssis + modules (chantier 23.10) : id libre, même recette que les vaisseaux/techs —
 * `Blueprint.chassisId`/`modules` sont déjà `string`/`string[]` en protocole
 * (`createBlueprint`/`updateBlueprint` utilisent `idSchema`), aucun tuple à desserrer.
 * `sim/industry/design.ts` (`resolveBlueprint`/`validateBlueprint`) n'avait aucune
 * injection avant ce chantier — c'est le domaine le plus risqué de la vague.
 */
export const SLOT_TYPES = [
  "weapon",
  "defense",
  "propulsion",
  "utility",
] as const;
export const slotTypeSchema = z.enum(SLOT_TYPES);

const slotCountsSchema = z.object({
  weapon: z.number().int().nonnegative(),
  defense: z.number().int().nonnegative(),
  propulsion: z.number().int().nonnegative(),
  utility: z.number().int().nonnegative(),
});

export const CHASSIS_KINDS = [
  "generic",
  "military",
  "freighter",
  "miner",
  "colonizer",
  "explorer",
] as const;
export const chassisKindSchema = z.enum(CHASSIS_KINDS);

export const SHIP_DOMAINS = ["fleet", "colony"] as const;
export const shipDomainSchema = z.enum(SHIP_DOMAINS);

export const MODULE_ROLES = [
  "weapon",
  "defense",
  "propulsion",
  "cargo",
  "mining",
  "habitat",
  "support",
  "sensor",
] as const;
export const moduleRoleSchema = z.enum(MODULE_ROLES);

export const upsertChassisSchema = z.object({
  nameFr: z.string().trim().min(1).max(80),
  descriptionFr: z.string().trim().max(500).default(""),
  kind: chassisKindSchema,
  domain: shipDomainSchema,
  hull: z.number().positive(),
  baseInitiative: z.number(),
  power: z.number().nonnegative(),
  tonnage: z.number().nonnegative(),
  calc: z.number().nonnegative(),
  slots: slotCountsSchema,
  baseSpeedMult: z.number().positive(),
  baseFuelPerJump: z.number().nonnegative(),
  /** null = pas de spécialisation de rôle ; sinon, bonus pour un sous-ensemble des rôles
   * (jamais forcément les 4) — z.partialRecord, pas z.record (voir game.ts:resourcesSchema
   * pour le même changement de comportement Zod 4). */
  roleBonus: z
    .partialRecord(moduleRoleSchema, z.number().positive())
    .nullable(),
  cost: z.record(z.string(), z.number().nonnegative()),
  buildMs: z.number().int().positive(),
  /** null = aucune tech requise. */
  requiresTech: z.string().trim().min(1).nullable(),
});
export type UpsertChassisInput = z.infer<typeof upsertChassisSchema>;

const moduleEffectsSchema = z.object({
  weapons: combatPhaseWeaponsSchema.partial().optional(),
  shield: z.number().optional(),
  hullBonus: z.number().optional(),
  initiative: z.number().optional(),
  capacity: z.number().optional(),
  speedMult: z.number().optional(),
  fuelDelta: z.number().optional(),
  miningYield: z.number().optional(),
  colonizer: z.boolean().optional(),
  fleetDamageBonus: z.number().optional(),
});

export const upsertModuleSchema = z.object({
  nameFr: z.string().trim().min(1).max(80),
  descriptionFr: z.string().trim().max(500).default(""),
  slot: slotTypeSchema,
  role: moduleRoleSchema,
  power: z.number().nonnegative(),
  tonnage: z.number().nonnegative(),
  calc: z.number().nonnegative(),
  cost: z.record(z.string(), z.number().nonnegative()),
  buildMs: z.number().int().positive(),
  /** null = aucune tech requise. */
  requiresTech: z.string().trim().min(1).nullable(),
  effects: moduleEffectsSchema,
});
export type UpsertModuleInput = z.infer<typeof upsertModuleSchema>;

/**
 * Presets + jalons (chantier 23.11) — dernier domaine de contenu, dépend de 23.10 :
 * un preset n'est qu'un couple châssis/modules, déjà résolu par les tables injectables.
 * Id libre pour les deux (même recette qu'ailleurs) ; `metric` reste un enum fermé côté
 * jalons — voir `apps/server/src/db/schema.ts` `contentMilestones`.
 */
export const upsertPresetSchema = z.object({
  nameFr: z.string().trim().min(1).max(80),
  descriptionFr: z.string().trim().max(500).default(""),
  chassisId: z.string().trim().min(1),
  modules: z.array(z.string()),
  starter: z.boolean(),
});
export type UpsertPresetInput = z.infer<typeof upsertPresetSchema>;

export const MILESTONE_METRICS = [
  "population",
  "colonies",
  "explored",
  "techs",
] as const;
export const milestoneMetricSchema = z.enum(MILESTONE_METRICS);

export const upsertMilestoneSchema = z.object({
  metric: milestoneMetricSchema,
  threshold: z.number().positive(),
});
export type UpsertMilestoneInput = z.infer<typeof upsertMilestoneSchema>;

/**
 * Types de zone + installations de station orbitale (chantier 24.7) : même recette que
 * châssis/modules (id libre, id-minting). `zoneType` référence un type de zone par son
 * id (comme `chassisId` sur les presets), pas un enum fermé — un type de zone peut
 * lui-même être créé depuis l'admin.
 */
export const upsertZoneTypeSchema = z.object({
  nameFr: z.string().trim().min(1).max(80),
  descriptionFr: z.string().trim().max(500).default(""),
  cost: z.record(z.string(), z.number().nonnegative()),
  buildMs: z.number().int().positive(),
  /** null = aucune tech requise. */
  requiresTech: z.string().trim().min(1).nullable(),
});
export type UpsertZoneTypeInput = z.infer<typeof upsertZoneTypeSchema>;

export const upsertInstallationSchema = z.object({
  nameFr: z.string().trim().min(1).max(80),
  descriptionFr: z.string().trim().max(500).default(""),
  zoneType: z.string().trim().min(1),
  cost: z.record(z.string(), z.number().nonnegative()),
  buildMs: z.number().int().positive(),
  inputs: z.record(z.string(), z.number().nonnegative()).nullable(),
  outputs: z.record(z.string(), z.number().nonnegative()).nullable(),
  /** null = aucune tech requise. */
  requiresTech: z.string().trim().min(1).nullable(),
  /** Capacité de marché conférée (chantier 25) ; null/absent = aucune — défaut permissif
   * pour ne pas casser un client (admin ou test) écrit avant l'ajout de ce champ. */
  grants: z
    .enum(["resourceMarket", "blueprintMarket"])
    .nullable()
    .default(null),
});
export type UpsertInstallationInput = z.infer<typeof upsertInstallationSchema>;

// ── Schémas de réponse (chantier 27.15) ──────────────────────────────────────
// GET liste et PUT renvoient tous deux { <domaine>: Entrée[] } — nécessaire pour que le
// spec OpenAPI (donc le client orval) documente une vraie forme, pas `void`.

export const contentWarshipSchema = upsertWarshipSchema.extend({
  id: z.string(),
});
export const warshipsListResponseSchema = z.object({
  warships: z.array(contentWarshipSchema),
});

export const contentFactionSchema = upsertFactionSchema.extend({
  id: z.string(),
});
export const factionsListResponseSchema = z.object({
  factions: z.array(contentFactionSchema),
});

export const contentBuildingSchema = upsertBuildingSchema.extend({
  id: z.string(),
});
export const buildingsListResponseSchema = z.object({
  buildings: z.array(contentBuildingSchema),
});

export const contentShipSchema = upsertShipSchema.extend({ id: z.string() });
export const shipsListResponseSchema = z.object({
  ships: z.array(contentShipSchema),
});

export const contentConstantSchema = upsertConstantSchema.extend({
  key: z.string(),
});
export const constantsListResponseSchema = z.object({
  constants: z.array(contentConstantSchema),
});

export const contentTechSchema = upsertTechSchema.extend({ id: z.string() });
export const techsListResponseSchema = z.object({
  techs: z.array(contentTechSchema),
});

export const contentChassisSchema = upsertChassisSchema.extend({
  id: z.string(),
});
export const chassisListResponseSchema = z.object({
  chassis: z.array(contentChassisSchema),
});

export const contentModuleSchema = upsertModuleSchema.extend({
  id: z.string(),
});
export const modulesListResponseSchema = z.object({
  modules: z.array(contentModuleSchema),
});

export const contentPresetSchema = upsertPresetSchema.extend({
  id: z.string(),
});
export const presetsListResponseSchema = z.object({
  presets: z.array(contentPresetSchema),
});

export const contentMilestoneSchema = upsertMilestoneSchema.extend({
  id: z.string(),
});
export const milestonesListResponseSchema = z.object({
  milestones: z.array(contentMilestoneSchema),
});

export const contentZoneTypeSchema = upsertZoneTypeSchema.extend({
  id: z.string(),
});
export const zoneTypesListResponseSchema = z.object({
  zoneTypes: z.array(contentZoneTypeSchema),
});

export const contentInstallationSchema = upsertInstallationSchema.extend({
  id: z.string(),
});
export const installationsListResponseSchema = z.object({
  installations: z.array(contentInstallationSchema),
});
