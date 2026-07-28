import type { Fleet, PirateLair, StoredBattle } from "@spacesim/shared";
import { and, eq, isNull } from "drizzle-orm";
import { db, schema } from "../../db/index.js";
import type { WriteSet } from "../persistence/write-set.js";

/** Propriétaire unique des tables `fleets`, `pirate_lairs` et `battles` (chantier 19.3). */
export class FleetRepository {
  constructor(
    private readonly gameId: string,
    private readonly writeSet: WriteSet,
  ) {}

  /** `fallbackOwnerId` : propriétaire des flottes legacy sans `ownerId` (pré-chantier 7). */
  async loadFleets(fallbackOwnerId: string): Promise<Fleet[]> {
    return (await db.select().from(schema.fleets)).map((row) => ({
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

  saveFleet(fleet: Fleet): void {
    this.writeSet.upsert("fleets", fleet.id, {
      id: fleet.id,
      gameId: this.gameId,
      ownerId: fleet.ownerId,
      name: fleet.name,
      systemId: fleet.systemId,
      homeColonyId: fleet.homeColonyId,
      ships: JSON.stringify(fleet.ships),
      directives: JSON.stringify(fleet.directives),
      queue: JSON.stringify(fleet.queue),
      movement: fleet.movement ? JSON.stringify(fleet.movement) : null,
    });
  }

  removeFleet(id: string): void {
    this.writeSet.delete("fleets", id);
  }

  /** Backfill legacy : adopte les flottes SANS propriétaire (sauvegardes pré-7b). Écriture directe : opération de démarrage ponctuelle, hors WriteSet. */
  async adoptOrphanFleets(ownerId: string): Promise<void> {
    await db
      .update(schema.fleets)
      .set({ ownerId })
      .where(and(eq(schema.fleets.gameId, this.gameId), isNull(schema.fleets.ownerId)));
  }

  async loadLairs(): Promise<PirateLair[]> {
    return (await db.select().from(schema.pirateLairs)).map((row) => ({
      id: row.id,
      systemId: row.systemId,
      ships: JSON.parse(row.ships),
      directives: JSON.parse(row.directives),
      bounty: row.bounty,
    }));
  }

  saveLair(lair: PirateLair): void {
    this.writeSet.upsert("pirateLairs", lair.id, {
      id: lair.id,
      gameId: this.gameId,
      systemId: lair.systemId,
      ships: JSON.stringify(lair.ships),
      directives: JSON.stringify(lair.directives),
      bounty: lair.bounty,
    });
  }

  removeLair(id: string): void {
    this.writeSet.delete("pirateLairs", id);
  }

  async loadBattles(): Promise<StoredBattle[]> {
    return (await db.select().from(schema.battles)).map((row) => ({
      id: row.id,
      at: row.at,
      systemId: row.systemId,
      attackerName: row.attackerName,
      defenderName: row.defenderName,
      report: JSON.parse(row.report),
    }));
  }

  insertBattle(battle: StoredBattle): void {
    this.writeSet.upsert("battles", battle.id, {
      id: battle.id,
      gameId: this.gameId,
      at: battle.at,
      systemId: battle.systemId,
      attackerName: battle.attackerName,
      defenderName: battle.defenderName,
      report: JSON.stringify(battle.report),
    });
  }

  /** Purge d'une bataille tombée hors de la fenêtre conservée (chantier 20.3 : plus de
   *  requête de purge — l'appelant connaît déjà l'id via `runtime.battleLog` en RAM). */
  removeBattle(id: string): void {
    this.writeSet.delete("battles", id);
  }
}
