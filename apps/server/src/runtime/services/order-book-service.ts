import {
  matchOrders,
  type MarketOrder,
  type OrderSide,
  type ResourceId,
  type StationHolding,
} from "@spacesim/shared";
import { randomUUID } from "node:crypto";
import type { Empire } from "../../empire.js";
import type { GameRuntime } from "../game-runtime.js";
import type { Logger } from "../logger.js";
import { OrderBookRepository } from "../repositories/order-book-repository.js";

/** Ce que le service a besoin de savoir de la station visée, sans dépendre du domaine. */
export interface VenueAccess {
  ok: boolean;
  reason?: string;
  ownerId: string;
  taxRate: number;
}

/**
 * Carnet d'ordres des stations de joueur (chantier 32.25).
 *
 * Voir [ADR 0012](../../../../../docs/adr/0012-carnet-d-ordres-et-avoirs-de-station.md) :
 * les ordres sont adossés à des **avoirs** déposés à la station, le séquestre est intégral
 * et immédiat, et l'appariement lui-même vit dans `packages/shared` — pur et prouvable.
 *
 * Ce service ne déplace **jamais** de marchandise entre lieux : il change qui possède quoi
 * à un endroit donné. Le transport reste l'affaire des convois (ADR 0004).
 */
export class OrderBookService {
  private readonly repo: OrderBookRepository;

  constructor(
    private readonly runtime: GameRuntime,
    private readonly notify: () => void,
    private readonly logger: Logger,
    /** Droit de commercer à cette station : palier d'accès, taxe, propriétaire. */
    private readonly venueAccess: (
      empire: Empire,
      stationId: string,
    ) => VenueAccess,
    /** Verse la taxe au propriétaire de la station (stock de crédits de la station). */
    private readonly applyStationTrade: (
      stationId: string,
      creditDelta: number,
    ) => number,
  ) {
    this.repo = new OrderBookRepository(runtime.clock.id, runtime.writeSet);
  }

  async loadOrderBook(): Promise<void> {
    for (const order of await this.repo.loadOrders()) {
      this.runtime.orderMap.set(order.id, order);
    }
    for (const holding of await this.repo.loadHoldings()) {
      this.runtime.holdingMap.set(
        `${holding.stationId}|${holding.empireId}`,
        holding,
      );
    }
  }

  /** Carnet d'une station — les ordres au repos, tous côtés et toutes ressources. */
  bookOf(stationId: string): MarketOrder[] {
    return [...this.runtime.orderMap.values()].filter(
      (o) => o.stationId === stationId,
    );
  }

  holdingOf(stationId: string, empireId: string): StationHolding {
    return (
      this.runtime.holdingMap.get(`${stationId}|${empireId}`) ?? {
        stationId,
        empireId,
        resources: {},
        credits: 0,
      }
    );
  }

  /** Avoirs d'un empire, tous lieux confondus — ce que le snapshot lui montre. */
  holdingsOfEmpire(empireId: string): StationHolding[] {
    return [...this.runtime.holdingMap.values()].filter(
      (h) => h.empireId === empireId,
    );
  }

  private saveHolding(holding: StationHolding): void {
    const key = `${holding.stationId}|${holding.empireId}`;
    // Un avoir vide est supprimé plutôt que gardé à zéro : la table décrit ce qui est
    // garé quelque part, pas l'historique de qui est passé.
    const empty =
      holding.credits <= 0 &&
      Object.values(holding.resources).every((n) => (n ?? 0) <= 0);
    if (empty) {
      this.runtime.holdingMap.delete(key);
      this.repo.deleteHolding(holding.stationId, holding.empireId);
      return;
    }
    this.runtime.holdingMap.set(key, holding);
    this.repo.saveHolding(holding);
  }

  /** Crédite (ou débite) un avoir. Utilisé par le dépôt, l'exécution et l'annulation. */
  private adjustHolding(
    stationId: string,
    empireId: string,
    resource: ResourceId | null,
    delta: number,
  ): void {
    const current = this.holdingOf(stationId, empireId);
    const next: StationHolding =
      resource === null
        ? { ...current, credits: current.credits + delta }
        : {
            ...current,
            resources: {
              ...current.resources,
              [resource]: (current.resources[resource] ?? 0) + delta,
            },
          };
    this.saveHolding(next);
  }

  /**
   * Dépose dans un avoir ce qu'un convoi vient de livrer (chantier 32.25). Appelée par la
   * logistique à l'arrivée : le service ne fabrique jamais de marchandise lui-même.
   */
  depositToHolding(
    stationId: string,
    empireId: string,
    cargo: Partial<Record<ResourceId, number>>,
  ): void {
    for (const [resource, amount] of Object.entries(cargo) as [
      ResourceId,
      number,
    ][]) {
      if (amount > 0) this.adjustHolding(stationId, empireId, resource, amount);
    }
    this.notify();
  }

  /**
   * Retire d'un avoir ce qu'un convoi vient chercher. Retourne ce qui a réellement été
   * pris — jamais plus que le disponible, jamais un solde négatif.
   */
  takeFromHolding(
    stationId: string,
    empireId: string,
    request: Partial<Record<ResourceId, number>>,
  ): Partial<Record<ResourceId, number>> {
    const taken: Partial<Record<ResourceId, number>> = {};
    for (const [resource, amount] of Object.entries(request) as [
      ResourceId,
      number,
    ][]) {
      const available =
        this.holdingOf(stationId, empireId).resources[resource] ?? 0;
      const quantity = Math.min(available, Math.max(0, amount));
      if (quantity <= 0) continue;
      taken[resource] = quantity;
      this.adjustHolding(stationId, empireId, resource, -quantity);
    }
    this.notify();
    return taken;
  }

  /** Rapatrie les crédits d'un avoir vers une colonie — les crédits n'ont pas de lieu. */
  claimHoldingCredits(empire: Empire, stationId: string): number {
    const holding = this.holdingOf(stationId, empire.id);
    const amount = Math.floor(holding.credits);
    if (amount <= 0) return 0;
    this.adjustHolding(stationId, empire.id, null, -amount);
    this.notify();
    return amount;
  }

  /**
   * Crédite un avoir — réservé aux tests et aux outils de dev. En jeu, les crédits
   * n'entrent dans un avoir que par une exécution : il n'existe pas de dépôt de crédits,
   * puisqu'ils n'ont pas de lieu et servent depuis n'importe où.
   */
  creditHoldingForTest(
    stationId: string,
    empireId: string,
    amount: number,
  ): void {
    this.adjustHolding(stationId, empireId, null, amount);
  }

  /**
   * Action joueur : poser un ordre limite.
   *
   * Le séquestre est **immédiat et intégral** : un achat retient `quantité × prix`, une
   * vente sort la marchandise de l'avoir. Sans cela le carnet afficherait des offres qu'un
   * clic révèle creuses, et l'annulation deviendrait une arme (ADR 0012).
   */
  placeOrder(
    empire: Empire,
    stationId: string,
    side: OrderSide,
    resource: ResourceId,
    quantity: number,
    pricePerUnit: number,
  ): string | null {
    const access = this.venueAccess(empire, stationId);
    if (!access.ok) return access.reason ?? "Station inaccessible";
    const qty = Math.floor(quantity);
    if (qty <= 0) return "Quantité invalide";
    if (!(pricePerUnit > 0)) return "Prix invalide";

    if (side === "sell") {
      const available =
        this.holdingOf(stationId, empire.id).resources[resource] ?? 0;
      if (available < qty)
        return `Avoir insuffisant sur place (${Math.floor(available)})`;
      this.adjustHolding(stationId, empire.id, resource, -qty);
    } else {
      const cost = qty * pricePerUnit;
      if (this.holdingOf(stationId, empire.id).credits < cost)
        return `Crédits insuffisants sur place (${Math.ceil(cost)} requis)`;
      this.adjustHolding(stationId, empire.id, null, -cost);
    }

    const { fills, remaining } = matchOrders(this.bookOf(stationId), {
      ownerId: empire.id,
      side,
      resource,
      quantity: qty,
      pricePerUnit,
    });

    for (const fill of fills) {
      this.settle(
        stationId,
        access.taxRate,
        access.ownerId,
        side === "buy" ? empire.id : fill.restingOwnerId,
        side === "buy" ? fill.restingOwnerId : empire.id,
        resource,
        fill.quantity,
        fill.pricePerUnit,
      );
      const resting = this.runtime.orderMap.get(fill.restingOrderId);
      if (!resting) continue;
      const next: MarketOrder = {
        ...resting,
        remaining: resting.remaining - fill.quantity,
      };
      if (next.remaining > 0) {
        this.runtime.orderMap.set(next.id, next);
        this.repo.saveOrder(next);
      } else {
        this.runtime.orderMap.delete(next.id);
        this.repo.deleteOrder(next.id);
      }
    }

    // L'entrant rembourse sa propre différence de prix : il a séquestré à SA limite alors
    // qu'il a peut-être payé moins cher (le prix du repos). Sans ce remboursement, la
    // différence disparaîtrait du jeu.
    if (side === "buy") {
      const paid = fills.reduce(
        (sum, f) => sum + f.quantity * f.pricePerUnit,
        0,
      );
      const escrowed = fills.reduce(
        (sum, f) => sum + f.quantity * pricePerUnit,
        0,
      );
      if (escrowed > paid)
        this.adjustHolding(stationId, empire.id, null, escrowed - paid);
    }

    if (remaining > 0) {
      const order: MarketOrder = {
        id: randomUUID(),
        stationId,
        ownerId: empire.id,
        side,
        resource,
        remaining,
        pricePerUnit,
        createdAt: Date.now(),
      };
      this.runtime.orderMap.set(order.id, order);
      this.repo.saveOrder(order);
    }
    this.notify();
    return null;
  }

  /**
   * Applique une exécution : la marchandise passe à l'acheteur, les crédits au vendeur,
   * la taxe au propriétaire de la station.
   *
   * Le vendeur paie la taxe : c'est lui qui reçoit des crédits, et la prélever sur
   * l'acheteur ferait payer un prix différent de celui affiché au carnet.
   */
  private settle(
    stationId: string,
    taxRate: number,
    stationOwnerId: string,
    buyerId: string,
    sellerId: string,
    resource: ResourceId,
    quantity: number,
    pricePerUnit: number,
  ): void {
    const gross = quantity * pricePerUnit;
    const tax = gross * taxRate;
    this.adjustHolding(stationId, buyerId, resource, quantity);
    this.adjustHolding(stationId, sellerId, null, gross - tax);
    if (tax > 0 && stationOwnerId !== sellerId) {
      this.applyStationTrade(stationId, tax);
    }
    this.logger.info(
      `[game] ${quantity} ${resource} @ ${pricePerUnit} à ${stationId}`,
    );
  }

  /** Action joueur : annuler son ordre — le séquestre restant revient à l'avoir. */
  cancelOrder(empire: Empire, orderId: string): string | null {
    const order = this.runtime.orderMap.get(orderId);
    if (!order || order.ownerId !== empire.id) return "Ordre inconnu";
    if (order.side === "sell") {
      this.adjustHolding(
        order.stationId,
        empire.id,
        order.resource,
        order.remaining,
      );
    } else {
      this.adjustHolding(
        order.stationId,
        empire.id,
        null,
        order.remaining * order.pricePerUnit,
      );
    }
    this.runtime.orderMap.delete(orderId);
    this.repo.deleteOrder(orderId);
    this.notify();
    return null;
  }

  /** Retire les ordres d'une station disparue — leur séquestre part avec elle. */
  dropStationOrders(stationId: string): void {
    for (const order of this.bookOf(stationId)) {
      this.runtime.orderMap.delete(order.id);
      this.repo.deleteOrder(order.id);
    }
  }
}
