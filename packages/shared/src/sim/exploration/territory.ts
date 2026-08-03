import type { Galaxy, Universe } from "../../model/universe.js";

/**
 * Territoire & frontières (chantier 7d). Fonctions pures sur le graphe de l'univers :
 * l'adjacence des systèmes vient des `links` de chaque galaxie.
 */

/** Bonus d'influence par tick et par système revendiqué contigu (territoire soudé). */
export const CONTIGUOUS_CLAIM_BONUS = 0.05;

/** Systèmes directement reliés à `systemId` dans sa galaxie. */
export function systemNeighbors(galaxy: Galaxy, systemId: string): string[] {
  const out: string[] = [];
  for (const [a, b] of galaxy.links) {
    if (a === systemId) out.push(b);
    else if (b === systemId) out.push(a);
  }
  return out;
}

/**
 * Sous-ensemble des systèmes revendiqués qui touchent au moins un autre système
 * revendiqué (territoire contigu). Un empire dispersé n'en tire aucun bonus ;
 * un bloc soudé les compte tous.
 */
export function contiguousClaims(
  universe: Universe,
  claimed: readonly string[],
): Set<string> {
  const claimedSet = new Set(claimed);
  const contiguous = new Set<string>();
  for (const galaxy of universe.galaxies) {
    for (const system of galaxy.systems) {
      if (!claimedSet.has(system.id)) continue;
      if (systemNeighbors(galaxy, system.id).some((n) => claimedSet.has(n))) {
        contiguous.add(system.id);
      }
    }
  }
  return contiguous;
}

/**
 * Un système revendiqué est une *frontière* s'il jouxte un système non revendiqué par
 * cet empire (bord du territoire — plus exposé au PvP / à la contestation).
 */
export function isFrontierSystem(
  universe: Universe,
  claimed: readonly string[],
  systemId: string,
): boolean {
  const claimedSet = new Set(claimed);
  if (!claimedSet.has(systemId)) return false;
  for (const galaxy of universe.galaxies) {
    if (!galaxy.systems.some((s) => s.id === systemId)) continue;
    return systemNeighbors(galaxy, systemId).some((n) => !claimedSet.has(n));
  }
  return false;
}
