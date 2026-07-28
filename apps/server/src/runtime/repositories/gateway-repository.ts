import type { Gateway } from "@spacesim/shared";
import { db, schema } from "../../db/index.js";
import type { WriteSet } from "../persistence/write-set.js";

/** Propriétaire unique de la table `gateways` (chantier 19.3). */
export class GatewayRepository {
  constructor(
    private readonly gameId: string,
    private readonly writeSet: WriteSet,
  ) {}

  async loadAll(): Promise<Gateway[]> {
    return db
      .select()
      .from(schema.gateways)
      .all()
      .map((row) => ({
        galaxyId: row.galaxyId,
        progress: JSON.parse(row.progress),
        activatesAt: row.activatesAt,
        active: row.active === 1,
      }));
  }

  private toRow(gateway: Gateway) {
    return {
      galaxyId: gateway.galaxyId,
      gameId: this.gameId,
      progress: JSON.stringify(gateway.progress),
      activatesAt: gateway.activatesAt,
      active: gateway.active ? 1 : 0,
    };
  }

  insert(gateway: Gateway): void {
    this.writeSet.upsert("gateways", gateway.galaxyId, this.toRow(gateway));
  }

  save(gateway: Gateway): void {
    this.writeSet.upsert("gateways", gateway.galaxyId, this.toRow(gateway));
  }
}
