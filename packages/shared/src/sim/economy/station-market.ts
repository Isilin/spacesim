import type { Station, StationMarketAccess } from "../../model/industry.js";
import type { ResourceId } from "../../model/resources.js";
import type { RelationState } from "../../model/social.js";
import {
  type MarketResource,
  type PriceContext,
  resolvePurchase,
  resolveSale,
  type Stocks,
} from "./market.js";

/**
 * Marché d'une station de joueur (chantier 25) : contrairement au comptoir PNJ, une
 * station n'a pas de faction — pas d'humeur, pas de réputation, pas de charte
 * commerciale. Le levier équivalent est posé par le joueur : qui a le droit de
 * commercer (`marketAccess`, calé sur les paliers diplomatiques) et à quel taux de
 * taxe. Le moteur de prix lui-même (`resolveSale`/`resolvePurchase`/`tradingPostPrice`,
 * `./market.js`) reste intouché — ce fichier ne fait qu'ajouter accès + taxe par-dessus.
 */

/**
 * "war" bloque toujours l'accès, quel que soit `access` — le propriétaire a toujours
 * accès à sa propre station.
 */
export function canTradeAtStation(
  ownerId: string,
  visitorId: string,
  access: StationMarketAccess,
  relation: RelationState,
): boolean {
  if (visitorId === ownerId) return true;
  if (relation === "war") return false;
  switch (access) {
    case "closed":
      return false;
    case "alliance":
      return relation === "alliance";
    case "nap":
      return relation === "alliance" || relation === "nap";
    case "public":
      return true;
  }
}

/**
 * Applique un delta de crédits au stock d'une station : un apport est toujours
 * intégral, un prélèvement est plafonné au disponible (jamais négatif) — même
 * logique que `takeFromStation` pour les autres ressources, appliquée aux crédits.
 * `applied` est le montant réellement appliqué (peut être moindre qu'un `delta`
 * négatif demandé si la station est à court de crédits).
 */
export function applyStationCredits(
  resources: Stocks,
  delta: number,
): { resources: Stocks; applied: number } {
  const applied = delta >= 0 ? delta : Math.max(delta, -resources.credits);
  return {
    resources: { ...resources, credits: resources.credits + applied },
    applied,
  };
}

/**
 * Vente d'un visiteur À la station : `resolveSale` (INCHANGÉE) fixe le stock et le
 * prix de marché ; le visiteur reçoit `revenue * (1 - taxRate)`, plafonné aux crédits
 * réellement disponibles côté station — un comptoir PNJ n'a pas de portefeuille
 * propre, une station si (liquidité émergente : à court de crédits, une station ne
 * peut plus payer ses vendeurs au plein tarif).
 */
export function resolveStationSale(
  station: Station,
  cargo: Partial<Record<ResourceId, number>>,
  taxRate: number,
  ctx?: PriceContext,
): { station: Station; revenue: number } {
  const { stocks, revenue: gross } = resolveSale(station.resources, cargo, ctx);
  const { resources, applied } = applyStationCredits(
    stocks,
    -Math.floor(gross * (1 - taxRate)),
  );
  return { station: { ...station, resources }, revenue: -applied };
}

/**
 * Achat d'un visiteur À la station : le budget reçu est BRUT (taxe comprise). On le
 * ramène en budget net pour `resolvePurchase` (INCHANGÉE), puis on regonfle le coût
 * réel de la taxe — le tout crédité au stock de la station (elle est à la fois
 * vendeuse du bien ET collectrice de la taxe).
 */
export function resolveStationPurchase(
  station: Station,
  resource: MarketResource,
  budget: number,
  maxQty: number,
  taxRate: number,
  ctx?: PriceContext,
): { station: Station; bought: number; spent: number } {
  const {
    stocks,
    bought,
    spent: net,
  } = resolvePurchase(
    station.resources,
    resource,
    budget / (1 + taxRate),
    maxQty,
    ctx,
  );
  const gross = Math.ceil(net * (1 + taxRate));
  const { resources } = applyStationCredits(stocks, gross);
  return { station: { ...station, resources }, bought, spent: gross };
}
