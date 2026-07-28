import { db, schema } from "../../db/index.js";
import type { Clock } from "../../empire.js";
import type { WriteSet } from "../persistence/write-set.js";

/**
 * Propriétaire de la table `games` (chantier 19.3). Exception documentée :
 * `universe-store.appendGalaxies` aligne `games.galaxyCount` dans SA transaction
 * de matérialisation — c'est le prix de l'invariant « compteur ≡ tables univers ».
 *
 * `insert()` reste une écriture DIRECTE (chantier 20.2) : appelée une seule fois, au
 * bootstrap, avant que le moteur ne serve la moindre commande ou ticke — hors du cycle
 * commande/tick que le write-behind couvre. `saveTick()`, elle, tourne à chaque lot de
 * ticks et passe par le `WriteSet`.
 */
export class GameRepository {
  async find(): Promise<typeof schema.games.$inferSelect | null> {
    const rows = await db.select().from(schema.games).limit(1);
    return rows[0] ?? null;
  }

  async insert(row: typeof schema.games.$inferInsert): Promise<void> {
    await db.insert(schema.games).values(row);
  }

  /**
   * Persistance de fin de lot de ticks. Ne porte pas `createdAt` (absent de `Clock`) :
   * sans risque, la ligne `games` existe TOUJOURS avant le premier tick (`insert()` au
   * bootstrap précède `engine.start()`), donc le fallback INSERT du flush ne se
   * déclenche jamais ici en pratique — seul le chemin UPDATE s'exécute.
   */
  saveTick(clock: Clock, writeSet: WriteSet): void {
    writeSet.upsert("games", clock.id, {
      id: clock.id,
      seed: clock.seed,
      tick: clock.tick,
      lastTickAt: clock.lastTickAt,
      galaxyCount: clock.galaxyCount,
    });
  }
}
