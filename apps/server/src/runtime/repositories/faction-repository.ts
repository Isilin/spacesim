import type { FactionState } from "@spacesim/shared";
import { db, schema } from "../../db/index.js";
import type { WriteSet } from "../persistence/write-set.js";

/** Propriétaire unique de la table `faction_states` (chantier 19.3). */
export class FactionRepository {
  constructor(
    private readonly gameId: string,
    private readonly writeSet: WriteSet,
  ) {}

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

  private toRow(state: FactionState) {
    return {
      factionId: state.factionId,
      gameId: this.gameId,
      mood: state.mood,
      moodUntil: state.moodUntil,
    };
  }

  insert(state: FactionState): void {
    this.writeSet.upsert("factionStates", state.factionId, this.toRow(state));
  }

  save(state: FactionState): void {
    this.writeSet.upsert("factionStates", state.factionId, this.toRow(state));
  }
}
