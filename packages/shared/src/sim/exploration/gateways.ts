import type { ResourceId } from "../../model/resources.js";
import type {
  ClientUniverse,
  Galaxy,
  Gateway,
  Universe,
} from "../../model/universe.js";

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
export function gatewayCost(
  galaxyId: string,
): Partial<Record<ResourceId, number>> {
  const rings = Math.max(0, galaxyIndexOfId(galaxyId) - 1);
  const scale = 1 + GATEWAY_COST_PER_RING * rings;
  const cost: Partial<Record<ResourceId, number>> = {};
  for (const [res, base] of Object.entries(GATEWAY_COST) as [
    ResourceId,
    number,
  ][]) {
    cost[res] = Math.round(base * scale);
  }
  return cost;
}

/** Ce qui reste à livrer par ressource. */
export function gatewayRemaining(
  gateway: Gateway,
): Partial<Record<ResourceId, number>> {
  const remaining: Partial<Record<ResourceId, number>> = {};
  for (const [res, total] of Object.entries(gatewayCost(gateway.galaxyId)) as [
    ResourceId,
    number,
  ][]) {
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
  for (const [res, cost] of Object.entries(gatewayCost(gateway.galaxyId)) as [
    ResourceId,
    number,
  ][]) {
    total += cost;
    delivered += Math.min(gateway.progress[res] ?? 0, cost);
  }
  return total === 0 ? 1 : delivered / total;
}

/**
 * Galaxie « parente » d'une galaxie : sa plus proche voisine d'index inférieur.
 *
 * En remontant les parents on atteint toujours la galaxie mère (index 0), donc les
 * parents forment un **arbre couvrant** enraciné sur la mère. Une galaxie ne s'ouvre
 * ainsi qu'un seul trou de ver vers sa voisine, et non vers toutes les autres — le
 * réseau se déploie de proche en proche, comme les liaisons entre systèmes.
 */
export function galaxyParentIndex(
  universe: ClientUniverse,
  index: number,
): number | null {
  if (index <= 0 || index >= universe.galaxies.length) return null;
  return (
    universe.galaxies[index]!.parentIndex ??
    computeGalaxyParentIndex(universe, index)
  );
}

/**
 * Calcul positionnel du parent (plus proche voisine d'index inférieur). Ne sert qu'à
 * figer `Galaxy.parentIndex` à la matérialisation, et de repli pour un univers sorti
 * du générateur pur — ne pas l'appeler sur un univers chargé depuis la DB.
 */
export function computeGalaxyParentIndex(
  universe: ClientUniverse,
  index: number,
): number | null {
  if (index <= 0 || index >= universe.galaxies.length) return null;
  const g = universe.galaxies[index]!;
  let best = 0;
  let bestDist = Infinity;
  for (let k = 0; k < index; k++) {
    const o = universe.galaxies[k]!;
    const d = Math.hypot(g.x - o.x, g.y - o.y);
    if (d < bestDist) {
      bestDist = d;
      best = k;
    }
  }
  return best;
}

/** Arête de l'arbre inter-galactique : un trou de ver potentiel entre deux voisines. */
export interface GalaxyLink {
  parentIndex: number;
  childIndex: number;
  parent: Galaxy;
  child: Galaxy;
}

/** Arbre inter-galactique complet (toutes les arêtes potentielles, actives ou non). */
export function galaxyLinks(universe: Universe): GalaxyLink[] {
  const links: GalaxyLink[] = [];
  for (let i = 1; i < universe.galaxies.length; i++) {
    const parentIndex = galaxyParentIndex(universe, i);
    if (parentIndex === null) continue;
    links.push({
      parentIndex,
      childIndex: i,
      parent: universe.galaxies[parentIndex]!,
      child: universe.galaxies[i]!,
    });
  }
  return links;
}

/**
 * Liaisons de saut offertes par les portails **actifs** : chaque portail relie l'ancrage
 * de la galaxie à celui de sa parente (arête de l'arbre), et non plus à la mère. Le
 * réseau de voyage épouse donc l'arbre de voisinage : atteindre une galaxie lointaine
 * exige que toute la chaîne de portails jusqu'à elle soit active.
 */
export function gatewayLinks(
  universe: ClientUniverse,
  gateways: readonly Gateway[],
): [string, string][] {
  const indexById = new Map(
    universe.galaxies.map((g, i) => [g.id, i] as const),
  );
  const links: [string, string][] = [];
  for (const gateway of gateways) {
    if (!gateway.active) continue;
    const childIndex = indexById.get(gateway.galaxyId);
    if (childIndex === undefined) continue;
    const parentIndex = galaxyParentIndex(universe, childIndex);
    if (parentIndex === null) continue;
    links.push([
      universe.galaxies[parentIndex]!.anchorSystemId,
      universe.galaxies[childIndex]!.anchorSystemId,
    ]);
  }
  return links;
}
