import {
  FUEL_PER_MASS_JUMP,
  GATEWAY_TOLL_CREDITS,
  TRANSFER_BASE_CREDITS,
  TRANSFER_BASE_MS,
  TRANSFER_CREDITS_PER_JUMP,
  TRANSFER_MS_PER_JUMP,
} from "../constants.js";
import { SHIPS, type LegacyShipId } from "../content/ships.js";
import type { Galaxy, Universe } from "../types.js";
import { findGalaxyOfSystem } from "../universe.js";

/** Distance en sauts entre deux systèmes d'une galaxie (BFS), -1 si inaccessible. */
export function jumpDistance(galaxy: Galaxy, fromSystemId: string, toSystemId: string): number {
  if (fromSystemId === toSystemId) return 0;
  const adjacency = new Map<string, string[]>();
  for (const [a, b] of galaxy.links) {
    adjacency.set(a, [...(adjacency.get(a) ?? []), b]);
    adjacency.set(b, [...(adjacency.get(b) ?? []), a]);
  }
  const visited = new Set([fromSystemId]);
  let frontier = [fromSystemId];
  let depth = 0;
  while (frontier.length > 0) {
    depth++;
    const next: string[] = [];
    for (const id of frontier) {
      for (const neighbor of adjacency.get(id) ?? []) {
        if (visited.has(neighbor)) continue;
        if (neighbor === toSystemId) return depth;
        visited.add(neighbor);
        next.push(neighbor);
      }
    }
    frontier = next;
  }
  return -1;
}

/**
 * Distance en sauts dans l'univers. `extraLinks` = liaisons de portail actives
 * (sim/gateways) ; sans elles, les galaxies restent isolées (-1 entre galaxies).
 */
export function jumpDistanceInUniverse(
  universe: Universe,
  fromSystemId: string,
  toSystemId: string,
  extraLinks: readonly [string, string][] = [],
): number {
  const from = findGalaxyOfSystem(universe, fromSystemId);
  const to = findGalaxyOfSystem(universe, toSystemId);
  if (!from || !to) return -1;
  // Cas courant : même galaxie, pas besoin du graphe global.
  if (from.id === to.id && extraLinks.length === 0) {
    return jumpDistance(from, fromSystemId, toSystemId);
  }

  const adjacency = new Map<string, string[]>();
  const addLink = (a: string, b: string) => {
    adjacency.set(a, [...(adjacency.get(a) ?? []), b]);
    adjacency.set(b, [...(adjacency.get(b) ?? []), a]);
  };
  for (const galaxy of universe.galaxies) {
    for (const [a, b] of galaxy.links) addLink(a, b);
  }
  for (const [a, b] of extraLinks) addLink(a, b);

  if (fromSystemId === toSystemId) return 0;
  const visited = new Set([fromSystemId]);
  let frontier = [fromSystemId];
  let depth = 0;
  while (frontier.length > 0) {
    depth++;
    const next: string[] = [];
    for (const id of frontier) {
      for (const neighbor of adjacency.get(id) ?? []) {
        if (visited.has(neighbor)) continue;
        if (neighbor === toSystemId) return depth;
        visited.add(neighbor);
        next.push(neighbor);
      }
    }
    frontier = next;
  }
  return -1;
}

export function transferDurationMs(jumps: number): number {
  return TRANSFER_BASE_MS + jumps * TRANSFER_MS_PER_JUMP;
}

export function transferCostCredits(jumps: number): number {
  return TRANSFER_BASE_CREDITS + jumps * TRANSFER_CREDITS_PER_JUMP;
}

// ── Convois (chantier 12) : le vaisseau employé compte enfin ──────────────────

/** Composition d'un convoi : nombre de vaisseaux par id (classe historique ou plan). */
export type ConvoyShips = Partial<Record<string, number>>;

/** Stats de convoi d'un id de vaisseau. */
export interface ConvoyStat {
  speedMult: number;
  fuelPerJump: number;
  capacity: number;
}

/** Provider par défaut : stats des classes civiles historiques (chantier 13 : plans → override). */
export function legacyConvoyStat(id: string): ConvoyStat {
  const def = SHIPS[id as LegacyShipId];
  return {
    speedMult: def?.speedMult ?? 1,
    fuelPerJump: def?.fuelPerJump ?? 0,
    capacity: def?.capacity ?? 0,
  };
}

function convoyEntries(ships: ConvoyShips): [string, number][] {
  return Object.entries(ships).filter(([, n]) => (n ?? 0) > 0) as [string, number][];
}

/**
 * Durée d'un convoi : celle du vaisseau le **plus lent**, un convoi ne se sépare pas.
 * Sans vaisseau précisé, on retombe sur le barème abstrait d'avant le chantier 12.
 */
export function convoyDurationMs(
  jumps: number,
  ships: ConvoyShips = {},
  statsOf: (id: string) => ConvoyStat = legacyConvoyStat,
): number {
  const entries = convoyEntries(ships);
  const slowest = entries.reduce((max, [id]) => Math.max(max, statsOf(id).speedMult), 0);
  return transferDurationMs(jumps) * (slowest || 1);
}

/**
 * Énergie brûlée par un convoi : chaque vaisseau paie ses sauts, plus une part liée à
 * la masse embarquée. Prélevée en orbite au départ — voyager coûte, et voyager chargé
 * coûte davantage.
 */
export function convoyFuel(
  jumps: number,
  ships: ConvoyShips,
  cargoMass = 0,
  statsOf: (id: string) => ConvoyStat = legacyConvoyStat,
): number {
  const perShip = convoyEntries(ships).reduce(
    (sum, [id, count]) => sum + statsOf(id).fuelPerJump * count,
    0,
  );
  const massPart = cargoMass * FUEL_PER_MASS_JUMP;
  return Math.ceil((perShip + massPart) * Math.max(1, jumps));
}

/**
 * Frais d'un convoi : frais de base par saut + péage par portail emprunté. Traverser
 * une galaxie n'est pas gratuit, sinon les anneaux lointains n'auraient pas de prix.
 */
export function convoyFees(jumps: number, portalsCrossed = 0): number {
  return transferCostCredits(jumps) + portalsCrossed * GATEWAY_TOLL_CREDITS;
}

/** Capacité totale d'un convoi. */
export function convoyCapacity(
  ships: ConvoyShips,
  statsOf: (id: string) => ConvoyStat = legacyConvoyStat,
): number {
  return convoyEntries(ships).reduce((sum, [id, count]) => sum + statsOf(id).capacity * count, 0);
}
