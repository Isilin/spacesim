import type { Objective, ObjectiveKind } from "@spacesim/shared";
import { db, schema } from "../../db/index.js";
import type { WriteSet } from "../persistence/write-set.js";

/** Propriétaire unique de la table `objectives` (chantier 19.3). */
export class ObjectiveRepository {
  constructor(
    private readonly gameId: string,
    private readonly writeSet: WriteSet,
  ) {}

  async loadAll(): Promise<Objective[]> {
    return (await db.select().from(schema.objectives)).map((row) => ({
      id: row.id,
      empireId: row.empireId,
      kind: row.kind as ObjectiveKind,
      ...(row.targetCount !== null ? { targetCount: row.targetCount } : {}),
      ...(row.targetSystemId !== null ? { targetSystemId: row.targetSystemId } : {}),
      reward: row.reward,
      createdAt: row.createdAt,
      deadline: row.deadline,
      status: row.status as Objective["status"],
    }));
  }

  private toRow(objective: Objective) {
    return {
      id: objective.id,
      gameId: this.gameId,
      empireId: objective.empireId,
      kind: objective.kind,
      targetCount: objective.targetCount ?? null,
      targetSystemId: objective.targetSystemId ?? null,
      reward: objective.reward,
      createdAt: objective.createdAt,
      deadline: objective.deadline,
      status: objective.status,
    };
  }

  insert(objective: Objective): void {
    this.writeSet.upsert("objectives", objective.id, this.toRow(objective));
  }

  save(objective: Objective): void {
    this.writeSet.upsert("objectives", objective.id, this.toRow(objective));
  }
}
