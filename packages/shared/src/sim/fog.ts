import {
  COLONY_SHIP_BASE_MS,
  COLONY_SHIP_MS_PER_JUMP,
  PROBE_BASE_MS,
  PROBE_MS_PER_JUMP,
} from "../constants.js";
import type { Universe } from "../types.js";

/**
 * Expurge l'univers pour le client : les systèmes non explorés gardent leur
 * position et leur nom (visibles de loin) mais leurs corps sont masqués.
 */
export function redactUniverse(
  universe: Universe,
  exploredSystemIds: ReadonlySet<string>,
): Universe {
  return {
    ...universe,
    galaxies: universe.galaxies.map((galaxy) => ({
      ...galaxy,
      systems: galaxy.systems.map((sys) =>
        exploredSystemIds.has(sys.id)
          ? sys
          : { ...sys, planets: [], belts: [], station: undefined },
      ),
    })),
  };
}

export function probeDurationMs(jumps: number): number {
  return PROBE_BASE_MS + jumps * PROBE_MS_PER_JUMP;
}

export function colonyShipDurationMs(jumps: number): number {
  return COLONY_SHIP_BASE_MS + jumps * COLONY_SHIP_MS_PER_JUMP;
}
