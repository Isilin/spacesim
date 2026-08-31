import type { EmpireEvent, EmpireEventKind } from "@spacesim/shared";
import { db, schema } from "../../db/index.js";
import type { WriteSet } from "../persistence/write-set.js";

/** Propriétaire unique de la table `empire_events` (chantier 32.2). */
export class EmpireEventRepository {
  constructor(
    private readonly gameId: string,
    private readonly writeSet: WriteSet,
  ) {}

  async loadAll(): Promise<EmpireEvent[]> {
    return (await db.select().from(schema.empireEvents)).map((row) => ({
      id: row.id,
      empireId: row.empireId,
      kind: row.kind as EmpireEventKind,
      createdAt: row.createdAt,
      readAt: row.readAt,
      ...(row.systemId !== null ? { systemId: row.systemId } : {}),
      ...(row.colonyId !== null ? { colonyId: row.colonyId } : {}),
      ...(row.otherName !== null ? { otherName: row.otherName } : {}),
      ...(row.subjectId !== null ? { subjectId: row.subjectId } : {}),
      ...(row.amount !== null ? { amount: row.amount } : {}),
    }));
  }

  private toRow(event: EmpireEvent) {
    return {
      id: event.id,
      gameId: this.gameId,
      empireId: event.empireId,
      kind: event.kind,
      createdAt: event.createdAt,
      readAt: event.readAt,
      systemId: event.systemId ?? null,
      colonyId: event.colonyId ?? null,
      otherName: event.otherName ?? null,
      subjectId: event.subjectId ?? null,
      amount: event.amount ?? null,
    };
  }

  insert(event: EmpireEvent): void {
    this.writeSet.upsert("empireEvents", event.id, this.toRow(event));
  }

  save(event: EmpireEvent): void {
    this.writeSet.upsert("empireEvents", event.id, this.toRow(event));
  }

  delete(eventId: string): void {
    this.writeSet.delete("empireEvents", eventId);
  }
}
