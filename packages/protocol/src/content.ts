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

export const WARSHIP_CATEGORIES = ["skirmisher", "line", "capital", "support"] as const;
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
