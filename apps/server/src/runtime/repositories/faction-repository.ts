import type { FactionState } from "@spacesim/shared";
import { eq } from "drizzle-orm";
import { db, schema } from "../../db/index.js";

/** Propriétaire unique de la table `faction_states` (chantier 19.3). */
export class FactionRepository {
  constructor(private readonly gameId: string) {}

  async loadAll(): Promise<FactionState[]> {
    return db
      .select()
      .from(schema.factionStates)
      .all()
      .map((row) => ({
        factionId: row.factionId,
        mood: row.mood as FactionState["mood"],
        moodUntil: row.moodUntil,
      }));
  }

  insert(state: FactionState): void {
    db.insert(schema.factionStates)
      .values({
        factionId: state.factionId,
        gameId: this.gameId,
        mood: state.mood,
        moodUntil: state.moodUntil,
      })
      .run();
  }

  save(state: FactionState): void {
    db.update(schema.factionStates)
      .set({ mood: state.mood, moodUntil: state.moodUntil })
      .where(eq(schema.factionStates.factionId, state.factionId))
      .run();
  }
}
