import { emptyStationResources, type Station } from "@spacesim/shared";
import { db, schema } from "../../db/index.js";
import type { WriteSet } from "../persistence/write-set.js";

/**
 * Propriétaire unique de la table `stations` (chantier 24, même patron que
 * `ColonyRepository`, chantier 19.3). `insert`/`save` écrivent dans le `WriteSet` —
 * jamais directement en base ; `createdAt` n'est fixé qu'à l'insertion.
 */
export class StationRepository {
  constructor(
    private readonly gameId: string,
    private readonly writeSet: WriteSet,
  ) {}

  async loadAll(): Promise<Station[]> {
    return (await db.select().from(schema.stations)).map((row) => ({
      id: row.id,
      ownerId: row.ownerId,
      bodyId: row.bodyId,
      systemId: row.systemId,
      name: row.name,
      resources: { ...emptyStationResources(), ...JSON.parse(row.resources) },
      zones: JSON.parse(row.zones),
      zoneQueue: JSON.parse(row.zoneQueue),
      installations: JSON.parse(row.installations),
      installQueue: JSON.parse(row.installQueue),
      marketAccess: row.marketAccess as Station["marketAccess"],
      marketTaxRate: row.marketTaxRate,
    }));
  }

  private toRow(station: Station, createdAt: number) {
    return {
      id: station.id,
      gameId: this.gameId,
      ownerId: station.ownerId,
      bodyId: station.bodyId,
      systemId: station.systemId,
      name: station.name,
      resources: JSON.stringify(station.resources),
      zones: JSON.stringify(station.zones),
      zoneQueue: JSON.stringify(station.zoneQueue),
      installations: JSON.stringify(station.installations),
      installQueue: JSON.stringify(station.installQueue),
      createdAt,
      marketAccess: station.marketAccess,
      marketTaxRate: station.marketTaxRate,
    };
  }

  insert(station: Station): void {
    this.writeSet.upsert(
      "stations",
      station.id,
      this.toRow(station, Date.now()),
    );
  }

  save(station: Station): void {
    // `createdAt` est figé côté domaine (jamais lu dans `Station`) : 0 pour ne pas
    // l'écraser en cas de fallback INSERT (même choix que `ColonyRepository.save`).
    this.writeSet.upsert("stations", station.id, this.toRow(station, 0));
  }
}
