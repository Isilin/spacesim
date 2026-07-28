import type { WorldEvent, WorldEventKind } from "@spacesim/shared";
import { db, schema } from "../../db/index.js";
import type { WriteSet } from "../persistence/write-set.js";

/** Propriétaire unique de la table `world_events` (chantier 19.3). */
export class WorldEventRepository {
  constructor(
    private readonly gameId: string,
    private readonly writeSet: WriteSet,
  ) {}

  async loadAll(): Promise<WorldEvent[]> {
    return (await db.select().from(schema.worldEvents)).map((row) => ({
      id: row.id,
      kind: row.kind as WorldEventKind,
      ...(row.galaxyId !== null ? { galaxyId: row.galaxyId } : {}),
      ...(row.factionId !== null ? { factionId: row.factionId } : {}),
      createdAt: row.createdAt,
      expiresAt: row.expiresAt,
    }));
  }

  private toRow(event: WorldEvent) {
    return {
      id: event.id,
      gameId: this.gameId,
      kind: event.kind,
      galaxyId: event.galaxyId ?? null,
      factionId: event.factionId ?? null,
      createdAt: event.createdAt,
      expiresAt: event.expiresAt,
    };
  }

  insert(event: WorldEvent): void {
    this.writeSet.upsert("worldEvents", event.id, this.toRow(event));
  }

  /** Mise à jour des échéances (bascule d'humeur, décalage de dev-fastforward). */
  save(event: WorldEvent): void {
    this.writeSet.upsert("worldEvents", event.id, this.toRow(event));
  }

  remove(id: string): void {
    this.writeSet.delete("worldEvents", id);
  }
}
