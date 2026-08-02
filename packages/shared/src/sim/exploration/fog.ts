import { DEFAULT_BALANCE, type BalanceConstants } from "../../balance.js";
import type { Universe } from "../../model/universe.js";

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

export function probeDurationMs(
  jumps: number,
  balance: BalanceConstants = DEFAULT_BALANCE,
): number {
  return balance.probeBaseMs + jumps * balance.probeMsPerJump;
}

export function colonyShipDurationMs(
  jumps: number,
  balance: BalanceConstants = DEFAULT_BALANCE,
): number {
  return balance.colonyShipBaseMs + jumps * balance.colonyShipMsPerJump;
}

export function stationShipDurationMs(
  jumps: number,
  balance: BalanceConstants = DEFAULT_BALANCE,
): number {
  return balance.stationShipBaseMs + jumps * balance.stationShipMsPerJump;
}
