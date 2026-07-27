import type { Contract, ResourceId } from "@spacesim/shared";
import { eq } from "drizzle-orm";
import { db, schema } from "../../db/index.js";

/** Propriétaire unique de la table `contracts` (chantier 19.3). */
export class ContractRepository {
  constructor(private readonly gameId: string) {}

  async loadAll(): Promise<Contract[]> {
    return db
      .select()
      .from(schema.contracts)
      .all()
      .map((row) => ({
        id: row.id,
        issuerId: row.issuerId,
        issuerName: row.issuerName,
        issuerColor: row.issuerColor,
        colonyId: row.colonyId,
        colonyName: row.colonyName,
        systemId: row.systemId,
        resource: row.resource as ResourceId,
        quantity: row.quantity,
        remaining: row.remaining,
        pricePerUnit: row.pricePerUnit,
        createdAt: row.createdAt,
        deadline: row.deadline,
        status: row.status as Contract["status"],
      }));
  }

  insert(contract: Contract): void {
    db.insert(schema.contracts)
      .values({
        id: contract.id,
        gameId: this.gameId,
        issuerId: contract.issuerId,
        issuerName: contract.issuerName,
        issuerColor: contract.issuerColor,
        colonyId: contract.colonyId,
        colonyName: contract.colonyName,
        systemId: contract.systemId,
        resource: contract.resource,
        quantity: contract.quantity,
        remaining: contract.remaining,
        pricePerUnit: contract.pricePerUnit,
        createdAt: contract.createdAt,
        deadline: contract.deadline,
        status: contract.status,
      })
      .run();
  }

  /** Ne met à jour que ce qui bouge après publication : reliquat, statut, échéance. */
  save(contract: Contract): void {
    db.update(schema.contracts)
      .set({ remaining: contract.remaining, status: contract.status, deadline: contract.deadline })
      .where(eq(schema.contracts.id, contract.id))
      .run();
  }
}
