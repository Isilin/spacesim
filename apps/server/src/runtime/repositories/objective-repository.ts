import type { Objective, ObjectiveKind } from "@spacesim/shared";
import { eq } from "drizzle-orm";
import { db, schema } from "../../db/index.js";

/** Propriétaire unique de la table `objectives` (chantier 19.3). */
export class ObjectiveRepository {
  constructor(private readonly gameId: string) {}

  async loadAll(): Promise<Objective[]> {
    return db
      .select()
      .from(schema.objectives)
      .all()
      .map((row) => ({
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

  insert(objective: Objective): void {
    db.insert(schema.objectives)
      .values({
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
      })
      .run();
  }

  save(objective: Objective): void {
    db.update(schema.objectives)
      .set({ status: objective.status, deadline: objective.deadline })
      .where(eq(schema.objectives.id, objective.id))
      .run();
  }
}
