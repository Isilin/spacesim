import type { Contract, ResourceId } from "@spacesim/shared";
import { db, schema } from "../../db/index.js";
import type { WriteSet } from "../persistence/write-set.js";

/** Propriétaire unique de la table `contracts` (chantier 19.3). */
export class ContractRepository {
  constructor(
    private readonly gameId: string,
    private readonly writeSet: WriteSet,
  ) {}

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

  private toRow(contract: Contract) {
    return {
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
    };
  }

  insert(contract: Contract): void {
    this.writeSet.upsert("contracts", contract.id, this.toRow(contract));
  }

  /** Ne met à jour que ce qui bouge après publication : reliquat, statut, échéance — mais écrit la ligne complète (contrat du `WriteSet`). */
  save(contract: Contract): void {
    this.writeSet.upsert("contracts", contract.id, this.toRow(contract));
  }
}
