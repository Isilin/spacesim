import type { Stocks } from "@spacesim/shared";
import { db, schema } from "../../db/index.js";
import type { WriteSet } from "../persistence/write-set.js";

/** Propriétaire unique de la table `station_states` (chantier 19.3). */
export class MarketRepository {
  constructor(
    private readonly gameId: string,
    private readonly writeSet: WriteSet,
  ) {}

  async loadAll(): Promise<{ stationId: string; stocks: Stocks }[]> {
    return (await db.select().from(schema.stationStates)).map((row) => ({
      stationId: row.stationId,
      stocks: JSON.parse(row.stocks),
    }));
  }

  private toRow(stationId: string, stocks: Stocks) {
    return { stationId, gameId: this.gameId, stocks: JSON.stringify(stocks) };
  }

  insert(stationId: string, stocks: Stocks): void {
    this.writeSet.upsert("stationStates", stationId, this.toRow(stationId, stocks));
  }

  save(stationId: string, stocks: Stocks): void {
    this.writeSet.upsert("stationStates", stationId, this.toRow(stationId, stocks));
  }
}
