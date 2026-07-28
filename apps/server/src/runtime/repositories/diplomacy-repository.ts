import type { ProposalKind, Relation, RelationProposal, RelationState } from "@spacesim/shared";
import { db, schema } from "../../db/index.js";
import type { WriteSet } from "../persistence/write-set.js";

/**
 * Propriétaire unique des tables `relations` et `relation_proposals` (chantier 19.3).
 * Lectures async (boot uniquement) ; écritures dans le `WriteSet` (chantier 20.2).
 */
export class DiplomacyRepository {
  constructor(
    private readonly gameId: string,
    private readonly writeSet: WriteSet,
  ) {}

  async loadRelations(): Promise<Relation[]> {
    return db
      .select()
      .from(schema.relations)
      .all()
      .map((row) => ({
        empireA: row.empireA,
        empireB: row.empireB,
        state: row.state as RelationState,
        since: row.since,
        until: row.until,
      }));
  }

  private saveRelationImpl(relation: Relation): void {
    this.writeSet.upsert("relations", [relation.empireA, relation.empireB], {
      gameId: this.gameId,
      empireA: relation.empireA,
      empireB: relation.empireB,
      state: relation.state,
      since: relation.since,
      until: relation.until,
    });
  }

  insertRelation(relation: Relation): void {
    this.saveRelationImpl(relation);
  }

  saveRelation(relation: Relation): void {
    this.saveRelationImpl(relation);
  }

  async loadProposals(): Promise<RelationProposal[]> {
    return db
      .select()
      .from(schema.relationProposals)
      .all()
      .map((row) => ({
        id: row.id,
        fromEmpireId: row.fromEmpireId,
        toEmpireId: row.toEmpireId,
        kind: row.kind as ProposalKind,
        createdAt: row.createdAt,
      }));
  }

  insertProposal(proposal: RelationProposal): void {
    this.writeSet.upsert("relationProposals", proposal.id, {
      id: proposal.id,
      gameId: this.gameId,
      fromEmpireId: proposal.fromEmpireId,
      toEmpireId: proposal.toEmpireId,
      kind: proposal.kind,
      createdAt: proposal.createdAt,
    });
  }

  removeProposal(id: string): void {
    this.writeSet.delete("relationProposals", id);
  }
}
