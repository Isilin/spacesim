import type { Gateway, ResourceId, Universe } from "../types.js";

/** Coût de référence d'un portail (galaxie voisine) — pharaonique, couvert par convois. */
export const GATEWAY_COST: Partial<Record<ResourceId, number>> = {
  metals: 2000,
  components: 800,
  energy: 1500,
  credits: 1000,
};

/** Surcoût par rang d'éloignement : viser loin coûte plus cher (chantier 9). */
const GATEWAY_COST_PER_RING = 0.35;

/** Chantier final une fois le coût couvert (timer réel). */
export const GATEWAY_BUILD_MS = 600_000;

/** Index d'une galaxie d'après son id (`gal-7` → 7) ; 1 si l'id est inattendu. */
export function galaxyIndexOfId(galaxyId: string): number {
  const index = Number.parseInt(galaxyId.slice("gal-".length), 10);
  return Number.isFinite(index) && index >= 0 ? index : 1;
}

/**
 * Coût du portail vers une galaxie : la galaxie voisine (index 1) vaut le coût de
 * référence, chaque rang supplémentaire l'alourdit. L'univers étant infini, le coût
 * doit croître avec la distance, sinon les anneaux lointains — plus riches — seraient
 * aussi accessibles que les proches.
 */
export function gatewayCost(galaxyId: string): Partial<Record<ResourceId, number>> {
  const rings = Math.max(0, galaxyIndexOfId(galaxyId) - 1);
  const scale = 1 + GATEWAY_COST_PER_RING * rings;
  const cost: Partial<Record<ResourceId, number>> = {};
  for (const [res, base] of Object.entries(GATEWAY_COST) as [ResourceId, number][]) {
    cost[res] = Math.round(base * scale);
  }
  return cost;
}

/** Ce qui reste à livrer par ressource. */
export function gatewayRemaining(gateway: Gateway): Partial<Record<ResourceId, number>> {
  const remaining: Partial<Record<ResourceId, number>> = {};
  for (const [res, total] of Object.entries(gatewayCost(gateway.galaxyId)) as [ResourceId, number][]) {
    const missing = total - (gateway.progress[res] ?? 0);
    if (missing > 0) remaining[res] = missing;
  }
  return remaining;
}

/** Le coût est-il entièrement couvert ? */
export function gatewayCovered(gateway: Gateway): boolean {
  return Object.keys(gatewayRemaining(gateway)).length === 0;
}

/** Progression globale 0–1 (pondérée par les coûts). */
export function gatewayProgressRatio(gateway: Gateway): number {
  let delivered = 0;
  let total = 0;
  for (const [res, cost] of Object.entries(gatewayCost(gateway.galaxyId)) as [ResourceId, number][]) {
    total += cost;
    delivered += Math.min(gateway.progress[res] ?? 0, cost);
  }
  return total === 0 ? 1 : delivered / total;
}

/**
 * Liaisons inter-galactiques offertes par les portails actifs :
 * chaque portail relie l'ancrage de la galaxie d'origine (index 0) à celui de sa cible.
 * Les portails actifs forment un réseau via l'ancrage d'origine.
 */
export function gatewayLinks(universe: Universe, gateways: readonly Gateway[]): [string, string][] {
  const home = universe.galaxies[0];
  if (!home) return [];
  const links: [string, string][] = [];
  for (const gateway of gateways) {
    if (!gateway.active) continue;
    const target = universe.galaxies.find((g) => g.id === gateway.galaxyId);
    if (!target) continue;
    links.push([home.anchorSystemId, target.anchorSystemId]);
  }
  return links;
}
