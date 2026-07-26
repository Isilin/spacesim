import type { ResourceId } from "../../model/resources.js";
import { BASE_PRICES, type MarketResource } from "../economy/market.js";
import type { ShipStats } from "./design.js";

/**
 * Valeur marchande d'un coût en ressources (chantier 13) : converti en crédits au prix de
 * référence. Sert de base au marché de plans/vaisseaux des stations PNJ — pas de contexte
 * régional ici (contrairement à `stationPrice`, rien n'est stocké physiquement en station).
 */
export function costValue(cost: Partial<Record<ResourceId, number>>): number {
  let value = 0;
  for (const [res, amount] of Object.entries(cost) as [ResourceId, number][]) {
    value += (BASE_PRICES[res as MarketResource] ?? 0) * amount;
  }
  return Math.round(value);
}

/** Valeur marchande d'un plan résolu. */
export function blueprintValue(stats: ShipStats): number {
  return costValue(stats.cost);
}
