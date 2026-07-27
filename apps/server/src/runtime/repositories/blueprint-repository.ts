import type { Blueprint } from "@spacesim/shared";
import { eq } from "drizzle-orm";
import { db, schema } from "../../db/index.js";

/** Propriétaire unique de la table `blueprints` (chantier 19.3). */
export class BlueprintRepository {
  constructor(private readonly gameId: string) {}

  async loadAll(): Promise<Blueprint[]> {
    return db
      .select()
      .from(schema.blueprints)
      .all()
      .map((row) => ({
        id: row.id,
        ownerId: row.ownerId,
        name: row.name,
        chassisId: row.chassisId,
        modules: JSON.parse(row.modules),
        createdAt: row.createdAt,
      }));
  }

  save(bp: Blueprint, insert: boolean): void {
    if (insert) {
      db.insert(schema.blueprints)
        .values({
          id: bp.id,
          gameId: this.gameId,
          ownerId: bp.ownerId,
          name: bp.name,
          chassisId: bp.chassisId,
          modules: JSON.stringify(bp.modules),
          createdAt: bp.createdAt,
        })
        .run();
      return;
    }
    db.update(schema.blueprints)
      .set({ name: bp.name, chassisId: bp.chassisId, modules: JSON.stringify(bp.modules) })
      .where(eq(schema.blueprints.id, bp.id))
      .run();
  }

  remove(id: string): void {
    db.delete(schema.blueprints).where(eq(schema.blueprints.id, id)).run();
  }
}
