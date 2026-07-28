import type { Blueprint } from "@spacesim/shared";
import { db, schema } from "../../db/index.js";
import type { WriteSet } from "../persistence/write-set.js";

/** Propriétaire unique de la table `blueprints` (chantier 19.3). */
export class BlueprintRepository {
  constructor(
    private readonly gameId: string,
    private readonly writeSet: WriteSet,
  ) {}

  async loadAll(): Promise<Blueprint[]> {
    return (await db.select().from(schema.blueprints)).map((row) => ({
      id: row.id,
      ownerId: row.ownerId,
      name: row.name,
      chassisId: row.chassisId,
      modules: JSON.parse(row.modules),
      createdAt: row.createdAt,
    }));
  }

  save(bp: Blueprint): void {
    this.writeSet.upsert("blueprints", bp.id, {
      id: bp.id,
      gameId: this.gameId,
      ownerId: bp.ownerId,
      name: bp.name,
      chassisId: bp.chassisId,
      modules: JSON.stringify(bp.modules),
      createdAt: bp.createdAt,
    });
  }

  remove(id: string): void {
    this.writeSet.delete("blueprints", id);
  }
}
