import { eq } from "drizzle-orm";
import { db, schema } from "../../db/index.js";
import type { Empire } from "../../empire.js";
import type { WriteSet } from "../persistence/write-set.js";

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

/**
 * Propriétaire unique de la table `players` (chantier 19.3). `insert()` reste une
 * écriture DIRECTE (chantier 20.2) : elle a lieu à la création d'un empire (bootstrap
 * ou inscription d'un compte), toujours suivie d'autres opérations qui présument
 * l'empire déjà lisible en base dans le même appel synchrone (ex. `bootstrap.
 * insertColony`) — la faire passer par le `WriteSet` casserait cet ordre sans qu'un
 * flush intermédiaire n'ait de sens ici. Les mises à jour courantes (recherche,
 * brouillard, influence de fin de tick), elles, passent par le `WriteSet`.
 */
export class PlayerRepository {
  constructor(
    private readonly gameId: string,
    private readonly writeSet: WriteSet,
  ) {}

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
    this.writeSet.upsert("players", empire.id, this.rowFor(empire));
  }

  saveExplored(empire: Empire): void {
    this.writeSet.upsert("players", empire.id, this.rowFor(empire));
  }

  /** Persistance de fin de tick (influence + réputation de faction). */
  saveInfluence(empire: Empire): void {
    this.writeSet.upsert("players", empire.id, this.rowFor(empire));
  }

  /**
   * Ligne reconstruite depuis l'`Empire` en mémoire — SANS `joinedAt` (pas porté par
   * `Empire`, immuable après `insert()`). Sans risque : `insert()` est une écriture
   * directe qui précède toujours ces sauvegardes (voir le commentaire de classe), donc
   * le fallback INSERT du flush (qui exigerait `joinedAt`) ne se déclenche jamais ici.
   */
  private rowFor(empire: Empire) {
    return {
      id: empire.id,
      gameId: this.gameId,
      accountId: empire.accountId ?? null,
      kind: empire.kind,
      name: empire.name,
      color: empire.color,
      researched: JSON.stringify(empire.researched),
      research: empire.research ? JSON.stringify(empire.research) : null,
      researchQueue: JSON.stringify(empire.researchQueue),
      influence: empire.influence,
      factionRep: JSON.stringify(empire.factionRep),
      explored: JSON.stringify([...empire.explored]),
    };
  }
}
