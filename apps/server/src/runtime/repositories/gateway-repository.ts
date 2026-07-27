import type { Gateway } from "@spacesim/shared";
import { eq } from "drizzle-orm";
import { db, schema } from "../../db/index.js";

/** Propriétaire unique de la table `gateways` (chantier 19.3). */
export class GatewayRepository {
  constructor(private readonly gameId: string) {}

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

  insert(gateway: Gateway): void {
    db.insert(schema.gateways)
      .values({
        galaxyId: gateway.galaxyId,
        gameId: this.gameId,
        progress: JSON.stringify(gateway.progress),
        activatesAt: gateway.activatesAt,
        active: gateway.active ? 1 : 0,
      })
      .run();
  }

  save(gateway: Gateway): void {
    db.update(schema.gateways)
      .set({
        progress: JSON.stringify(gateway.progress),
        activatesAt: gateway.activatesAt,
        active: gateway.active ? 1 : 0,
      })
      .where(eq(schema.gateways.galaxyId, gateway.galaxyId))
      .run();
  }
}
