import type { ResourceId } from "../types.js";

export const FACTION_IDS = ["ferride", "ostara_league", "aether_cartel"] as const;

export type FactionId = (typeof FACTION_IDS)[number];

export interface FactionDef {
  id: FactionId;
  /** Production PNJ par tick économique : le stock monte, le prix baisse. */
  produces: Partial<Record<ResourceId, number>>;
  /** Consommation PNJ par tick économique : le stock descend, le prix monte. */
  consumes: Partial<Record<ResourceId, number>>;
}

/**
 * Trois factions marchandes aux profils complémentaires : chacune vend sa
 * spécialité à bas prix et paie cher ce qui lui manque — les routes d'arbitrage
 * émergent des profils. Noms/lore côté client (labels.ts).
 */
export const FACTIONS: Record<FactionId, FactionDef> = {
  // Consortium industriel : forges orbitales, affamé de vivres.
  ferride: {
    id: "ferride",
    produces: { metals: 45, components: 12, ore: 25 },
    consumes: { food: 40, goods: 25 },
  },
  // Ligue agraire : greniers de la galaxie, dépendante de l'industrie.
  ostara_league: {
    id: "ostara_league",
    produces: { food: 55, goods: 30 },
    consumes: { metals: 30, components: 8, energy: 25 },
  },
  // Cartel de l'énergie : réacteurs et minerai brut, friand de produits finis.
  aether_cartel: {
    id: "aether_cartel",
    produces: { energy: 55, ore: 35 },
    consumes: { components: 10, goods: 30 },
  },
};
