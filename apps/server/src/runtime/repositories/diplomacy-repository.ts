import type { ProposalKind, Relation, RelationProposal, RelationState } from "@spacesim/shared";
import { and, eq } from "drizzle-orm";
import { db, schema } from "../../db/index.js";

/**
 * Propriétaire unique des tables `relations` et `relation_proposals` (chantier 19.3).
 * Lectures async (boot uniquement) ; écritures sync — c'est la couture où le
 * write-behind du chantier 20 se branchera sans changer une signature.
 */
export class DiplomacyRepository {
  constructor(private readonly gameId: string) {}

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

  insertRelation(relation: Relation): void {
    db.insert(schema.relations)
      .values({
        gameId: this.gameId,
        empireA: relation.empireA,
        empireB: relation.empireB,
        state: relation.state,
        since: relation.since,
        until: relation.until,
      })
      .run();
  }

  saveRelation(relation: Relation): void {
    db.update(schema.relations)
      .set({ state: relation.state, since: relation.since, until: relation.until })
      .where(
        and(
          eq(schema.relations.empireA, relation.empireA),
          eq(schema.relations.empireB, relation.empireB),
        ),
      )
      .run();
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
    db.insert(schema.relationProposals)
      .values({
        id: proposal.id,
        gameId: this.gameId,
        fromEmpireId: proposal.fromEmpireId,
        toEmpireId: proposal.toEmpireId,
        kind: proposal.kind,
        createdAt: proposal.createdAt,
      })
      .run();
  }

  removeProposal(id: string): void {
    db.delete(schema.relationProposals).where(eq(schema.relationProposals.id, id)).run();
  }
}
