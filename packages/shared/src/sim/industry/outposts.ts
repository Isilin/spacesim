import type { ResourceId } from "../../model/resources.js";
import type { AsteroidBelt } from "../../model/universe.js";

/** Minerai extrait par tick et par avant-poste, avant modificateur de richesse. */
export const MINING_RATE = 1.5;

/** Stock local maximal : au-delà, l'extraction s'arrête — il faut évacuer. */
export const OUTPOST_STOCK_CAP = 1500;

/** Coût de fondation (mission depuis une colonie). */
export const OUTPOST_COST: Partial<Record<ResourceId, number>> = {
  components: 25,
  metals: 80,
  credits: 50,
};

/** Entretien par tick, payé par la colonie propriétaire ; impayé = extraction stoppée. */
export const OUTPOST_UPKEEP_CREDITS = 0.05;

/** Richesse de la ceinture : modificateur de gisement, 1 par défaut. */
export function beltRichness(belt: AsteroidBelt): number {
  return belt.deposits.ore ?? 1;
}

/**
 * Un tick d'extraction : retourne le nouveau stock local.
 * `upkeepPaid` = false (colonie propriétaire à sec) → l'extraction s'arrête.
 */
export function outpostTick(
  oreStock: number,
  richness: number,
  upkeepPaid: boolean,
  yieldMult = 1,
): number {
  if (!upkeepPaid) return oreStock;
  return Math.min(OUTPOST_STOCK_CAP, oreStock + MINING_RATE * richness * yieldMult);
}
