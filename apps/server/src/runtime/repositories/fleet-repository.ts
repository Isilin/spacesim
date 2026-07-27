import type { Fleet, PirateLair, StoredBattle } from "@spacesim/shared";
import { and, eq, isNull } from "drizzle-orm";
import { db, schema } from "../../db/index.js";

/** Propriétaire unique des tables `fleets`, `pirate_lairs` et `battles` (chantier 19.3). */
export class FleetRepository {
  constructor(private readonly gameId: string) {}

  /** `fallbackOwnerId` : propriétaire des flottes legacy sans `ownerId` (pré-chantier 7). */
  async loadFleets(fallbackOwnerId: string): Promise<Fleet[]> {
    return db
      .select()
      .from(schema.fleets)
      .all()
      .map((row) => ({
        id: row.id,
        ownerId: row.ownerId ?? fallbackOwnerId,
        name: row.name,
        systemId: row.systemId,
        homeColonyId: row.homeColonyId,
        ships: JSON.parse(row.ships),
        directives: JSON.parse(row.directives),
        queue: JSON.parse(row.queue),
        movement: row.movement ? JSON.parse(row.movement) : null,
      }));
  }

  saveFleet(fleet: Fleet, insert: boolean): void {
    const values = {
      name: fleet.name,
      systemId: fleet.systemId,
      homeColonyId: fleet.homeColonyId,
      ships: JSON.stringify(fleet.ships),
      directives: JSON.stringify(fleet.directives),
      queue: JSON.stringify(fleet.queue),
      movement: fleet.movement ? JSON.stringify(fleet.movement) : null,
    };
    if (insert) {
      db.insert(schema.fleets)
        .values({ id: fleet.id, gameId: this.gameId, ownerId: fleet.ownerId, ...values })
        .run();
    } else {
      db.update(schema.fleets).set(values).where(eq(schema.fleets.id, fleet.id)).run();
    }
  }

  removeFleet(id: string): void {
    db.delete(schema.fleets).where(eq(schema.fleets.id, id)).run();
  }

  /** Backfill legacy : adopte les flottes SANS propriétaire (sauvegardes pré-7b). */
  adoptOrphanFleets(ownerId: string): void {
    db.update(schema.fleets)
      .set({ ownerId })
      .where(and(eq(schema.fleets.gameId, this.gameId), isNull(schema.fleets.ownerId)))
      .run();
  }

  async loadLairs(): Promise<PirateLair[]> {
    return db
      .select()
      .from(schema.pirateLairs)
      .all()
      .map((row) => ({
        id: row.id,
        systemId: row.systemId,
        ships: JSON.parse(row.ships),
        directives: JSON.parse(row.directives),
        bounty: row.bounty,
      }));
  }

  saveLair(lair: PirateLair, insert: boolean): void {
    const values = {
      systemId: lair.systemId,
      ships: JSON.stringify(lair.ships),
      directives: JSON.stringify(lair.directives),
      bounty: lair.bounty,
    };
    if (insert) {
      db.insert(schema.pirateLairs)
        .values({ id: lair.id, gameId: this.gameId, ...values })
        .run();
    } else {
      db.update(schema.pirateLairs).set(values).where(eq(schema.pirateLairs.id, lair.id)).run();
    }
  }

  removeLair(id: string): void {
    db.delete(schema.pirateLairs).where(eq(schema.pirateLairs.id, id)).run();
  }

  async loadBattles(): Promise<StoredBattle[]> {
    return db
      .select()
      .from(schema.battles)
      .all()
      .map((row) => ({
        id: row.id,
        at: row.at,
        systemId: row.systemId,
        attackerName: row.attackerName,
        defenderName: row.defenderName,
        report: JSON.parse(row.report),
      }));
  }

  insertBattle(battle: StoredBattle): void {
    db.insert(schema.battles)
      .values({
        id: battle.id,
        gameId: this.gameId,
        at: battle.at,
        systemId: battle.systemId,
        attackerName: battle.attackerName,
        defenderName: battle.defenderName,
        report: JSON.stringify(battle.report),
      })
      .run();
  }

  /** Purge des batailles archivées au-delà de la fenêtre conservée. */
  removeBattlesExcept(keep: ReadonlySet<string>): void {
    for (const row of db.select({ id: schema.battles.id }).from(schema.battles).all()) {
      if (!keep.has(row.id)) db.delete(schema.battles).where(eq(schema.battles.id, row.id)).run();
    }
  }
}
