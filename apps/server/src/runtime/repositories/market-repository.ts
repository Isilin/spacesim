import type { Stocks } from "@spacesim/shared";
import { db, schema } from "../../db/index.js";
import type { WriteSet } from "../persistence/write-set.js";

/** Propriétaire unique de la table `trading_post_states` (chantier 19.3). */
export class MarketRepository {
  constructor(
    private readonly gameId: string,
    private readonly writeSet: WriteSet,
  ) {}

  async loadAll(): Promise<{ tradingPostId: string; stocks: Stocks }[]> {
    return (await db.select().from(schema.tradingPostStates)).map((row) => ({
      tradingPostId: row.tradingPostId,
      stocks: JSON.parse(row.stocks),
    }));
  }

  private toRow(tradingPostId: string, stocks: Stocks) {
    return {
      tradingPostId,
      gameId: this.gameId,
      stocks: JSON.stringify(stocks),
    };
  }

  insert(tradingPostId: string, stocks: Stocks): void {
    this.writeSet.upsert(
      "tradingPostStates",
      tradingPostId,
      this.toRow(tradingPostId, stocks),
    );
  }

  save(tradingPostId: string, stocks: Stocks): void {
    this.writeSet.upsert(
      "tradingPostStates",
      tradingPostId,
      this.toRow(tradingPostId, stocks),
    );
  }
}
