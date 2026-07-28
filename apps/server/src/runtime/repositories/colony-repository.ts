import { emptyOrbital, type Colony } from "@spacesim/shared";
import { and, eq, isNull } from "drizzle-orm";
import { db, schema } from "../../db/index.js";
import type { WriteSet } from "../persistence/write-set.js";

/**
 * Propriétaire unique de la table `colonies` (chantier 19.3). Le mapping row↔Colony
 * n'existe plus qu'ICI — il vivait en trois exemplaires (bootstrap ×2, industry).
 * `save` était l'écriture la plus partagée du serveur (callback injecté dans 5
 * services) : chaque service tient désormais sa propre instance du repo.
 *
 * `insert`/`save` écrivent dans le `WriteSet` (chantier 20.2) — jamais directement en
 * base ; `createdAt` n'est fixé qu'à l'insertion (pas de re-timestamp sur `save`, un
 * upsert ré-appliquerait `Date.now()` sinon).
 */
export class ColonyRepository {
  constructor(
    private readonly gameId: string,
    private readonly writeSet: WriteSet,
  ) {}

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

  private toRow(colony: Colony, createdAt: number) {
    return {
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
      createdAt,
    };
  }

  insert(colony: Colony): void {
    this.writeSet.upsert("colonies", colony.id, this.toRow(colony, Date.now()));
  }

  save(colony: Colony): void {
    // `createdAt` est un champ figé côté domaine (jamais lu dans `Colony`) : on
    // réutilise 0 pour ne pas l'écraser en cas de fallback INSERT — cas qui ne se
    // produit pas ici (`save` ne s'appelle jamais avant `insert` pour une colonie).
    this.writeSet.upsert("colonies", colony.id, this.toRow(colony, 0));
  }

  /** Backfill legacy : adopte les colonies SANS propriétaire (sauvegardes pré-7b). Écriture directe : opération de démarrage ponctuelle, hors WriteSet. */
  adoptOrphans(ownerId: string): void {
    db.update(schema.colonies)
      .set({ ownerId })
      .where(and(eq(schema.colonies.gameId, this.gameId), isNull(schema.colonies.ownerId)))
      .run();
  }
}
