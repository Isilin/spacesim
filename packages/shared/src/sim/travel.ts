import {
  TRANSFER_BASE_CREDITS,
  TRANSFER_BASE_MS,
  TRANSFER_CREDITS_PER_JUMP,
  TRANSFER_MS_PER_JUMP,
} from "../constants.js";
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
