import type { Colony } from "../../model/industry.js";
import { MARKET_RESOURCES, type MarketResource } from "./market.js";

/** Stock ORBITAL au-delà duquel un PNJ considère la ressource en surplus vendable. */
export const NPC_SURPLUS_THRESHOLD = 300;

/** Stock au SOL en-deçà duquel un PNJ considère la ressource comme un besoin à contractualiser. */
export const NPC_DEFICIT_THRESHOLD = 50;

/** Marge sur le prix spot pour l'offre d'un contrat PNJ — au-dessus du marché, pour inciter à livrer. */
export const NPC_CONTRACT_PRICE_MULT = 1.3;

/** Durée de vie des contrats publiés par un PNJ. */
export const NPC_CONTRACT_DURATION_MS = 1_800_000;

export interface NpcSellIntent {
  kind: "sell";
  resource: MarketResource;
  quantity: number;
}
export interface NpcContractIntent {
  kind: "postContract";
  resource: MarketResource;
  quantity: number;
}
export type NpcIntent = NpcSellIntent | NpcContractIntent;

/**
 * Décide quoi faire du surplus/déficit d'UNE colonie PNJ, à l'instant présent : vendre
 * l'excédent orbital, demander (par contrat) ce qui manque au sol. Pure et déterministe —
 * à l'image d'un éclaireur qui gère son comptoir localement : le moteur exécute ensuite
 * (vente au marché le plus proche, publication de contrat).
 */
export function decideColonyEconomy(colony: Colony): NpcIntent[] {
  const intents: NpcIntent[] = [];
  for (const resource of MARKET_RESOURCES) {
    const orbital = colony.orbitalResources[resource] ?? 0;
    if (orbital > NPC_SURPLUS_THRESHOLD) {
      intents.push({
        kind: "sell",
        resource,
        quantity: Math.floor(orbital - NPC_SURPLUS_THRESHOLD),
      });
      continue;
    }
    const ground = colony.resources[resource] ?? 0;
    if (ground < NPC_DEFICIT_THRESHOLD) {
      intents.push({
        kind: "postContract",
        resource,
        quantity: Math.ceil(NPC_DEFICIT_THRESHOLD - ground),
      });
    }
  }
  return intents;
}
