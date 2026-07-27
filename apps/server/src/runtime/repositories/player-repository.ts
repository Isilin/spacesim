import { eq } from "drizzle-orm";
import { db, schema } from "../../db/index.js";
import type { Empire } from "../../empire.js";

/** Ligne `players` mappée — l'hydratation en `Empire` reste au service Bootstrap. */
export interface PlayerRecord {
  id: string;
  accountId: string | null;
  kind: "human" | "npc";
  name: string;
  color: string;
  researched: Empire["researched"];
  research: Empire["research"];
  researchQueue: Empire["researchQueue"];
  influence: number;
  factionRep: Empire["factionRep"];
  explored: string[];
}

/** Propriétaire unique de la table `players` (chantier 19.3). */
export class PlayerRepository {
  constructor(private readonly gameId: string) {}

  private mapRow(row: typeof schema.players.$inferSelect): PlayerRecord {
    return {
      id: row.id,
      accountId: row.accountId,
      kind: row.kind as "human" | "npc",
      name: row.name,
      color: row.color,
      researched: JSON.parse(row.researched),
      research: row.research ? JSON.parse(row.research) : null,
      researchQueue: JSON.parse(row.researchQueue),
      influence: row.influence,
      factionRep: JSON.parse(row.factionRep),
      explored: JSON.parse(row.explored),
    };
  }

  /** Premier player de l'univers (ordre d'insertion) — sonde d'`ensureDefaultPlayer`. */
  async first(): Promise<PlayerRecord | null> {
    const row = db
      .select()
      .from(schema.players)
      .where(eq(schema.players.gameId, this.gameId))
      .limit(1)
      .get();
    return row ? this.mapRow(row) : null;
  }

  async loadAll(): Promise<PlayerRecord[]> {
    return db
      .select()
      .from(schema.players)
      .where(eq(schema.players.gameId, this.gameId))
      .all()
      .map((row) => this.mapRow(row));
  }

  insert(record: {
    id: string;
    accountId?: string | null;
    kind?: "human" | "npc";
    name: string;
    color: string;
  }): void {
    db.insert(schema.players)
      .values({
        id: record.id,
        gameId: this.gameId,
        accountId: record.accountId ?? null,
        kind: record.kind ?? "human",
        name: record.name,
        color: record.color,
        joinedAt: Date.now(),
        researched: "[]",
        research: null,
        researchQueue: "[]",
        influence: 0,
        factionRep: "{}",
        explored: "[]",
      })
      .run();
  }

  /** Adoption d'un empire orphelin par un compte (chantier 8). */
  adopt(id: string, accountId: string, name: string): void {
    db.update(schema.players).set({ accountId, name }).where(eq(schema.players.id, id)).run();
  }

  saveResearch(empire: Empire): void {
    db.update(schema.players)
      .set({
        researched: JSON.stringify(empire.researched),
        research: empire.research ? JSON.stringify(empire.research) : null,
        researchQueue: JSON.stringify(empire.researchQueue),
      })
      .where(eq(schema.players.id, empire.id))
      .run();
  }

  saveExplored(empire: Empire): void {
    db.update(schema.players)
      .set({ explored: JSON.stringify([...empire.explored]) })
      .where(eq(schema.players.id, empire.id))
      .run();
  }

  /** Persistance de fin de tick (influence + réputation de faction). */
  saveInfluence(empire: Empire): void {
    db.update(schema.players)
      .set({ influence: empire.influence, factionRep: JSON.stringify(empire.factionRep) })
      .where(eq(schema.players.id, empire.id))
      .run();
  }
}
