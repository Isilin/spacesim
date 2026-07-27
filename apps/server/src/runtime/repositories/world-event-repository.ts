import type { WorldEvent, WorldEventKind } from "@spacesim/shared";
import { eq } from "drizzle-orm";
import { db, schema } from "../../db/index.js";

/** Propriétaire unique de la table `world_events` (chantier 19.3). */
export class WorldEventRepository {
  constructor(private readonly gameId: string) {}

  async loadAll(): Promise<WorldEvent[]> {
    return db
      .select()
      .from(schema.worldEvents)
      .all()
      .map((row) => ({
        id: row.id,
        kind: row.kind as WorldEventKind,
        ...(row.galaxyId !== null ? { galaxyId: row.galaxyId } : {}),
        ...(row.factionId !== null ? { factionId: row.factionId } : {}),
        createdAt: row.createdAt,
        expiresAt: row.expiresAt,
      }));
  }

  insert(event: WorldEvent): void {
    db.insert(schema.worldEvents)
      .values({
        id: event.id,
        gameId: this.gameId,
        kind: event.kind,
        galaxyId: event.galaxyId ?? null,
        factionId: event.factionId ?? null,
        createdAt: event.createdAt,
        expiresAt: event.expiresAt,
      })
      .run();
  }

  /** Mise à jour des échéances (bascule d'humeur, décalage de dev-fastforward). */
  save(event: WorldEvent): void {
    db.update(schema.worldEvents)
      .set({ expiresAt: event.expiresAt })
      .where(eq(schema.worldEvents.id, event.id))
      .run();
  }

  remove(id: string): void {
    db.delete(schema.worldEvents).where(eq(schema.worldEvents.id, id)).run();
  }
}
