import { and, eq, isNull } from "drizzle-orm";
import { db, schema } from "../../db/index.js";

/** Propriétaire unique de la table `claims` (chantier 19.3). */
export class ClaimRepository {
  constructor(private readonly gameId: string) {}

  async systemIdsOwnedBy(ownerId: string): Promise<string[]> {
    return db
      .select({ systemId: schema.claims.systemId })
      .from(schema.claims)
      .where(eq(schema.claims.ownerId, ownerId))
      .all()
      .map((row) => row.systemId);
  }

  insert(systemId: string, ownerId: string): void {
    db.insert(schema.claims)
      .values({ systemId, gameId: this.gameId, ownerId, claimedAt: Date.now() })
      .run();
  }

  remove(systemId: string): void {
    db.delete(schema.claims).where(eq(schema.claims.systemId, systemId)).run();
  }

  /** Backfill legacy : adopte les claims SANS propriétaire (sauvegardes pré-7b). */
  adoptOrphans(ownerId: string): void {
    db.update(schema.claims)
      .set({ ownerId })
      .where(and(eq(schema.claims.gameId, this.gameId), isNull(schema.claims.ownerId)))
      .run();
  }
}
