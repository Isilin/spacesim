import type { RouteRule } from "../model/transport.js";

/**
 * Quantité à charger pour un cycle de route, 0 = pas de départ.
 * `destStock` n'a de sens que pour une destination colonie (station : passer 0).
 */
export function routeCargoQuantity(
  rule: RouteRule,
  sourceStock: number,
  destStock: number,
  capacity: number,
): number {
  if (capacity <= 0) return 0;
  let wanted = 0;
  switch (rule.type) {
    case "maintain": {
      if (destStock >= rule.minAtDestination) return 0;
      const exportable = Math.max(0, sourceStock - rule.keepAtSource);
      wanted = Math.min(exportable, rule.minAtDestination - destStock);
      break;
    }
    case "fixed": {
      // Attend d'avoir le lot complet à la source : cadence régulière, pas de miettes.
      if (sourceStock < rule.amount) return 0;
      wanted = rule.amount;
      break;
    }
    case "surplus": {
      wanted = Math.max(0, sourceStock - rule.keepAtSource);
      break;
    }
  }
  return Math.floor(Math.min(wanted, capacity, sourceStock));
}
