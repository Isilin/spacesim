import type { Stocks } from "@spacesim/shared";
import { eq } from "drizzle-orm";
import { db, schema } from "../../db/index.js";

/** Propriétaire unique de la table `station_states` (chantier 19.3). */
export class MarketRepository {
  constructor(private readonly gameId: string) {}

  async loadAll(): Promise<{ stationId: string; stocks: Stocks }[]> {
    return db
      .select()
      .from(schema.stationStates)
      .all()
      .map((row) => ({ stationId: row.stationId, stocks: JSON.parse(row.stocks) }));
  }

  insert(stationId: string, stocks: Stocks): void {
    db.insert(schema.stationStates)
      .values({ stationId, gameId: this.gameId, stocks: JSON.stringify(stocks) })
      .run();
  }

  save(stationId: string, stocks: Stocks): void {
    db.update(schema.stationStates)
      .set({ stocks: JSON.stringify(stocks) })
      .where(eq(schema.stationStates.stationId, stationId))
      .run();
  }
}
