import { emptyOrbital, type Colony } from "@spacesim/shared";
import { and, eq, isNull } from "drizzle-orm";
import { db, schema } from "../../db/index.js";

/**
 * Propriétaire unique de la table `colonies` (chantier 19.3). Le mapping row↔Colony
 * n'existe plus qu'ICI — il vivait en trois exemplaires (bootstrap ×2, industry).
 * `save` était l'écriture la plus partagée du serveur (callback injecté dans 5
 * services) : chaque service tient désormais sa propre instance du repo.
 */
export class ColonyRepository {
  constructor(private readonly gameId: string) {}

  /** `fallbackOwnerId` : colonies legacy sans `ownerId` (pré-chantier 7). */
  async loadAll(fallbackOwnerId: string): Promise<Colony[]> {
    return db
      .select()
      .from(schema.colonies)
      .all()
      .map((row) => ({
        id: row.id,
        ownerId: row.ownerId ?? fallbackOwnerId,
        planetId: row.planetId,
        name: row.name,
        resources: JSON.parse(row.resources),
        orbitalResources: { ...emptyOrbital(), ...JSON.parse(row.orbitalResources) },
        liftRules: JSON.parse(row.liftRules),
        buildings: JSON.parse(row.buildings),
        queue: JSON.parse(row.queue),
        population: row.population,
        satisfaction: row.satisfaction,
        ships: JSON.parse(row.ships),
        shipsBusy: JSON.parse(row.shipsBusy),
        shipQueue: JSON.parse(row.shipQueue),
      }));
  }

  insert(colony: Colony): void {
    db.insert(schema.colonies)
      .values({
        id: colony.id,
        gameId: this.gameId,
        ownerId: colony.ownerId ?? null,
        planetId: colony.planetId,
        name: colony.name,
        resources: JSON.stringify(colony.resources),
        orbitalResources: JSON.stringify(colony.orbitalResources),
        liftRules: JSON.stringify(colony.liftRules),
        buildings: JSON.stringify(colony.buildings),
        queue: JSON.stringify(colony.queue),
        population: colony.population,
        satisfaction: colony.satisfaction,
        ships: JSON.stringify(colony.ships),
        shipsBusy: JSON.stringify(colony.shipsBusy),
        shipQueue: JSON.stringify(colony.shipQueue),
        createdAt: Date.now(),
      })
      .run();
  }

  save(colony: Colony): void {
    db.update(schema.colonies)
      .set({
        resources: JSON.stringify(colony.resources),
        orbitalResources: JSON.stringify(colony.orbitalResources),
        liftRules: JSON.stringify(colony.liftRules),
        buildings: JSON.stringify(colony.buildings),
        queue: JSON.stringify(colony.queue),
        population: colony.population,
        satisfaction: colony.satisfaction,
        ships: JSON.stringify(colony.ships),
        shipsBusy: JSON.stringify(colony.shipsBusy),
        shipQueue: JSON.stringify(colony.shipQueue),
      })
      .where(eq(schema.colonies.id, colony.id))
      .run();
  }

  /** Backfill legacy : adopte les colonies SANS propriétaire (sauvegardes pré-7b). */
  adoptOrphans(ownerId: string): void {
    db.update(schema.colonies)
      .set({ ownerId })
      .where(and(eq(schema.colonies.gameId, this.gameId), isNull(schema.colonies.ownerId)))
      .run();
  }
}
