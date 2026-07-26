import type { Colony } from "../../model/industry.js";

/** Influence par colon et par tick, à satisfaction 100. */
export const INFLUENCE_PER_COLONIST = 0.005;

/** Influence par monument et par tick. */
export const MONUMENT_INFLUENCE = 0.5;

/** Coût d'influence pour fonder la (n+1)ième colonie : base × growth^(n-1). */
export const COLONIZE_INFLUENCE_BASE = 20;
export const COLONIZE_INFLUENCE_GROWTH = 1.5;

/** Revendication de système : coût initial + entretien par tick. */
export const CLAIM_COST = 60;
export const CLAIM_UPKEEP = 0.02;

/** Bonus de production des colonies situées dans un système revendiqué. */
export const CLAIM_PRODUCTION_BONUS = 1.15;

/** Réputation gagnée par crédit échangé en station. */
export const REP_PER_CREDIT = 0.1;

/** Paliers de réputation : remise sur les prix (achats −x %, ventes +x %). */
export const REP_TIERS = [
  { min: 800, bonus: 0.15 },
  { min: 300, bonus: 0.1 },
  { min: 100, bonus: 0.05 },
] as const;

/** Remise commerciale au niveau de réputation donné. */
export function repBonus(rep: number): number {
  for (const tier of REP_TIERS) {
    if (rep >= tier.min) return tier.bonus;
  }
  return 0;
}

/** Coût d'influence de la prochaine colonie (la première est gratuite). */
export function colonizeInfluenceCost(existingColonies: number): number {
  if (existingColonies <= 0) return 0;
  return Math.round(COLONIZE_INFLUENCE_BASE * COLONIZE_INFLUENCE_GROWTH ** (existingColonies - 1));
}

/**
 * Influence nette générée par tick : population satisfaite + monuments,
 * moins l'entretien des revendications.
 */
export function influencePerTick(
  colonies: readonly Colony[],
  claimCount: number,
  influenceMult = 1,
): number {
  let influence = 0;
  for (const colony of colonies) {
    influence += colony.population * (colony.satisfaction / 100) * INFLUENCE_PER_COLONIST;
    influence += (colony.buildings.monument ?? 0) * MONUMENT_INFLUENCE;
  }
  // L'entretien des revendications n'est pas allégé par la tech : seul le rayonnement l'est.
  return influence * influenceMult - claimCount * CLAIM_UPKEEP;
}
