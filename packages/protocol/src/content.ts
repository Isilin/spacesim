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
