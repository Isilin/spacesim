import type {
  MarketOrder,
  OrderSide,
  ResourceId,
  StationHolding,
} from "@spacesim/shared";
import { db, schema } from "../../db/index.js";
import type { WriteSet } from "../persistence/write-set.js";

/** Propriétaire unique de `market_orders` et `station_holdings` (chantier 32.24). */
export class OrderBookRepository {
  constructor(
    private readonly gameId: string,
    private readonly writeSet: WriteSet,
  ) {}

  async loadOrders(): Promise<MarketOrder[]> {
    return (await db.select().from(schema.marketOrders)).map((row) => ({
      id: row.id,
      stationId: row.stationId,
      ownerId: row.ownerId,
      side: row.side as OrderSide,
      resource: row.resource as ResourceId,
      remaining: row.remaining,
      pricePerUnit: row.pricePerUnit,
      createdAt: row.createdAt,
    }));
  }

  async loadHoldings(): Promise<StationHolding[]> {
    return (await db.select().from(schema.stationHoldings)).map((row) => ({
      stationId: row.stationId,
      empireId: row.empireId,
      // Le JSON est écrit par ce même repository ; un contenu illisible signalerait une
      // corruption, pas un cas courant — on laisse remonter plutôt que d'inventer un
      // avoir vide qui effacerait silencieusement des biens.
      resources: JSON.parse(row.resources) as Partial<
        Record<ResourceId, number>
      >,
      credits: row.credits,
    }));
  }

  saveOrder(order: MarketOrder): void {
    this.writeSet.upsert("marketOrders", order.id, {
      id: order.id,
      gameId: this.gameId,
      stationId: order.stationId,
      ownerId: order.ownerId,
      side: order.side,
      resource: order.resource,
      remaining: order.remaining,
      pricePerUnit: order.pricePerUnit,
      createdAt: order.createdAt,
    });
  }

  deleteOrder(id: string): void {
    this.writeSet.delete("marketOrders", id);
  }

  saveHolding(holding: StationHolding): void {
    this.writeSet.upsert(
      "stationHoldings",
      [holding.stationId, holding.empireId],
      {
        stationId: holding.stationId,
        empireId: holding.empireId,
        gameId: this.gameId,
        resources: JSON.stringify(holding.resources),
        credits: holding.credits,
      },
    );
  }

  deleteHolding(stationId: string, empireId: string): void {
    this.writeSet.delete("stationHoldings", [stationId, empireId]);
  }
}
