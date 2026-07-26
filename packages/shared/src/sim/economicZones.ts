import { findGalaxyOfSystem } from "../universe.js";
import type { Universe } from "../model/universe.js";
import type { Contract } from "../model/social.js";

/**
 * Activité économique par galaxie (chantier 17.3) : dérivée, jamais stockée — la somme
 * de la valeur des contrats ouverts qui s'y trouvent (chantiers 14/15, PNJ et factions
 * compris, puisque les contrats ne sont pas brouillardés). Rend visible où le monde bat.
 */
export function galaxyActivity(
  contracts: readonly Contract[],
  universe: Universe,
): Map<string, number> {
  const activity = new Map<string, number>();
  for (const contract of contracts) {
    if (contract.status !== "open") continue;
    const galaxy = findGalaxyOfSystem(universe, contract.systemId);
    if (!galaxy) continue;
    const value = contract.remaining * contract.pricePerUnit;
    activity.set(galaxy.id, (activity.get(galaxy.id) ?? 0) + value);
  }
  return activity;
}

/** Normalise une carte d'activité en intensité 0–1 (0 = rien, 1 = la galaxie la plus active). */
export function normalizedActivity(activity: ReadonlyMap<string, number>): Map<string, number> {
  let max = 0;
  for (const value of activity.values()) max = Math.max(max, value);
  if (max <= 0) return new Map();
  const out = new Map<string, number>();
  for (const [id, value] of activity) out.set(id, value / max);
  return out;
}
