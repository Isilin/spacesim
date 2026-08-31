import type { MarketOrder, OrderSide } from "../../model/social.js";

/**
 * Appariement d'un carnet d'ordres (chantier 32.23).
 *
 * **Pur, déterministe, sans I/O ni horloge ni aléa.** C'est la partie du marché qu'on doit
 * pouvoir prouver, et le seul endroit où une erreur crée de la monnaie. Voir
 * [ADR 0012](../../../../docs/adr/0012-carnet-d-ordres-et-avoirs-de-station.md).
 */

/** Une exécution : qui a acheté à qui, combien, à quel prix. */
export interface Fill {
  /** Ordre au repos apparié — c'est LUI qui donne le prix. */
  restingOrderId: string;
  restingOwnerId: string;
  quantity: number;
  pricePerUnit: number;
}

export interface MatchResult {
  fills: Fill[];
  /** Reste de l'ordre entrant après appariement : il rejoint le carnet s'il est > 0. */
  remaining: number;
}

/**
 * Un ordre au repos peut-il satisfaire l'entrant ? Une vente exige au moins son prix, un
 * achat n'accepte pas plus que le sien.
 */
function crosses(
  incomingSide: OrderSide,
  incomingPrice: number,
  restingPrice: number,
): boolean {
  return incomingSide === "buy"
    ? restingPrice <= incomingPrice
    : restingPrice >= incomingPrice;
}

/**
 * Apparie un ordre entrant contre le carnet.
 *
 * Priorité **prix** puis **ancienneté** : le meilleur prix passe d'abord, et à prix égal
 * celui qui attend depuis le plus longtemps. Le prix retenu est celui de l'ordre **au
 * repos** — apparier au prix de l'entrant punirait exactement le comportement qu'on veut
 * encourager, afficher un prix et prendre le risque d'attendre.
 *
 * `book` n'est pas muté : la fonction décrit ce qui doit se passer, l'appelant l'applique.
 */
export function matchOrders(
  book: readonly MarketOrder[],
  incoming: {
    ownerId: string;
    side: OrderSide;
    resource: string;
    quantity: number;
    pricePerUnit: number;
  },
): MatchResult {
  const opposite: OrderSide = incoming.side === "buy" ? "sell" : "buy";
  const candidates = book
    .filter(
      (o) =>
        o.side === opposite &&
        o.resource === incoming.resource &&
        o.remaining > 0 &&
        // On ne s'apparie pas à soi-même : ce serait un aller-retour gratuit qui
        // fabriquerait du volume sans rien échanger, et la taxe de station le rendrait
        // même coûteux sans contrepartie.
        o.ownerId !== incoming.ownerId &&
        crosses(incoming.side, incoming.pricePerUnit, o.pricePerUnit),
    )
    .sort((a, b) => {
      // Meilleur prix d'abord : le moins cher pour un acheteur, le plus cher pour un
      // vendeur.
      const byPrice =
        incoming.side === "buy"
          ? a.pricePerUnit - b.pricePerUnit
          : b.pricePerUnit - a.pricePerUnit;
      if (byPrice !== 0) return byPrice;
      if (a.createdAt !== b.createdAt) return a.createdAt - b.createdAt;
      // Départage final par identifiant : deux ordres posés dans la même milliseconde
      // doivent s'apparier dans un ordre stable, sinon deux serveurs rejouant le même
      // journal divergeraient.
      return a.id < b.id ? -1 : 1;
    });

  const fills: Fill[] = [];
  let remaining = incoming.quantity;
  for (const order of candidates) {
    if (remaining <= 0) break;
    const quantity = Math.min(remaining, order.remaining);
    if (quantity <= 0) continue;
    fills.push({
      restingOrderId: order.id,
      restingOwnerId: order.ownerId,
      quantity,
      pricePerUnit: order.pricePerUnit,
    });
    remaining -= quantity;
  }
  return { fills, remaining };
}

/**
 * Meilleur prix de chaque côté — la « fourchette » affichée au joueur.
 * `null` quand ce côté est vide : un carnet à moitié vide est un état normal, pas un prix
 * de zéro.
 */
export function bestPrices(
  book: readonly MarketOrder[],
  resource: string,
): { bid: number | null; ask: number | null } {
  let bid: number | null = null;
  let ask: number | null = null;
  for (const order of book) {
    if (order.resource !== resource || order.remaining <= 0) continue;
    if (order.side === "buy") {
      if (bid === null || order.pricePerUnit > bid) bid = order.pricePerUnit;
    } else if (ask === null || order.pricePerUnit < ask) {
      ask = order.pricePerUnit;
    }
  }
  return { bid, ask };
}
