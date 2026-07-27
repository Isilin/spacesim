import { eq } from "drizzle-orm";
import { db, schema } from "../../db/index.js";
import type { Clock } from "../../empire.js";

/**
 * Propriétaire de la table `games` (chantier 19.3). Exception documentée :
 * `universe-store.appendGalaxies` aligne `games.galaxyCount` dans SA transaction
 * de matérialisation — c'est le prix de l'invariant « compteur ≡ tables univers ».
 */
export class GameRepository {
  async find(): Promise<typeof schema.games.$inferSelect | null> {
    return db.select().from(schema.games).limit(1).get() ?? null;
  }

  insert(row: typeof schema.games.$inferInsert): void {
    db.insert(schema.games).values(row).run();
  }

  /** Persistance de fin de lot de ticks. */
  saveTick(clock: Clock): void {
    db.update(schema.games)
      .set({ tick: clock.tick, lastTickAt: clock.lastTickAt })
      .where(eq(schema.games.id, clock.id))
      .run();
  }
}
