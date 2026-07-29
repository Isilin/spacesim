import type { CombatDirective, CombatPhase } from "../../content/warships.js";
import { pick, randInt, type Rng } from "../../rng.js";
import {
  fleetPower,
  WARSHIP_COMBAT_DEFS,
  type CombatDef,
  type FleetComposition,
} from "./combat.js";

/** Probabilité qu'un repaire pirate apparaisse dans un système éligible, par tick éco. */
export const PIRATE_SPAWN_CHANCE = 0.04;

/** Crédits ponctionnés par tick à une colonie/avant-poste partageant le système d'un repaire. */
export const PIRATE_TAX_PER_TICK = 0.15;

const DIRECTIVE_POOL: CombatDirective[] = ["barrage", "shields", "evasive", "focus_fire"];

/** Directives pirates seedées (mêmes trois phases que le joueur). */
export function pirateDirectives(rng: Rng): Record<CombatPhase, CombatDirective> {
  return {
    long: pick(rng, DIRECTIVE_POOL),
    medium: pick(rng, DIRECTIVE_POOL),
    short: pick(rng, DIRECTIVE_POOL),
  };
}

/**
 * Composition d'un repaire selon un niveau de menace 1–3 (croissant loin du centre).
 * Reste modeste pour un défi early/mid, pas un mur.
 */
export function pirateComposition(rng: Rng, threat: number): FleetComposition {
  const composition: FleetComposition = {
    fighter: randInt(rng, 1, 2 + threat),
    frigate: randInt(rng, 0, threat),
  };
  if (threat >= 3) composition.cruiser = randInt(rng, 0, 1);
  return composition;
}

/** Butin d'un repaire, proportionnel à sa puissance. */
export function pirateBounty(
  composition: FleetComposition,
  defs: Record<string, CombatDef> = WARSHIP_COMBAT_DEFS,
): number {
  return Math.round(fleetPower(composition, defs) * 0.6);
}
