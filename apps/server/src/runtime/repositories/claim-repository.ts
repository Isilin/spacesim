import { and, eq, isNull } from "drizzle-orm";
import { db, schema } from "../../db/index.js";
import type { WriteSet } from "../persistence/write-set.js";

/** Propriétaire unique de la table `claims` (chantier 19.3). */
export class ClaimRepository {
  constructor(
    private readonly gameId: string,
    private readonly writeSet: WriteSet,
  ) {}

  async systemIdsOwnedBy(ownerId: string): Promise<string[]> {
    return db
      .select({ systemId: schema.claims.systemId })
      .from(schema.claims)
      .where(eq(schema.claims.ownerId, ownerId))
      .all()
      .map((row) => row.systemId);
  }

  insert(systemId: string, ownerId: string): void {
    this.writeSet.upsert("claims", systemId, {
      systemId,
      gameId: this.gameId,
      ownerId,
      claimedAt: Date.now(),
    });
  }

  remove(systemId: string): void {
    this.writeSet.delete("claims", systemId);
  }

  /** Backfill legacy : adopte les claims SANS propriétaire (sauvegardes pré-7b). Écriture directe : opération de démarrage ponctuelle, hors WriteSet. */
  adoptOrphans(ownerId: string): void {
    db.update(schema.claims)
      .set({ ownerId })
      .where(and(eq(schema.claims.gameId, this.gameId), isNull(schema.claims.ownerId)))
      .run();
  }
}
