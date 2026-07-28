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
  joinedAt: number;
  researched: Empire["researched"];
  research: Empire["research"];
  researchQueue: Empire["researchQueue"];
  influence: number;
  factionRep: Empire["factionRep"];
  explored: string[];
}

/**
 * Propriétaire unique de la table `players` (chantier 19.3). `insert()`/`adopt()`
 * passent par le `WriteSet` (chantier 20.3) : le créateur (`createEmpireForAccount`,
 * dev tools) ne relit jamais la ligne en base dans le même appel. EXCEPTION :
 * `insertDefault()` reste une écriture DIRECTE — `ensureDefaultPlayer()` l'appelle
 * juste avant `loadPlayers()`, qui LUI fait un vrai `SELECT` (reconstruit `Empire`
 * depuis la base, pas depuis la RAM) ; un upsert seulement staged serait invisible à
 * ce `SELECT` avant le prochain flush.
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
      joinedAt: row.joinedAt,
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
    const rows = await db
      .select()
      .from(schema.players)
      .where(eq(schema.players.gameId, this.gameId))
      .limit(1);
    return rows[0] ? this.mapRow(rows[0]) : null;
  }

  async loadAll(): Promise<PlayerRecord[]> {
    return (
      await db.select().from(schema.players).where(eq(schema.players.gameId, this.gameId))
    ).map((row) => this.mapRow(row));
  }

  private newRow(record: {
    id: string;
    accountId?: string | null;
    kind?: "human" | "npc";
    name: string;
    color: string;
  }) {
    return {
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
    };
  }

  insert(record: {
    id: string;
    accountId?: string | null;
    kind?: "human" | "npc";
    name: string;
    color: string;
  }): void {
    this.writeSet.upsert("players", record.id, this.newRow(record));
  }

  /** Voir le commentaire de classe : écriture directe, boot seulement (`ensureDefaultPlayer`). */
  async insertDefault(record: {
    id: string;
    accountId?: string | null;
    kind?: "human" | "npc";
    name: string;
    color: string;
  }): Promise<void> {
    await db.insert(schema.players).values(this.newRow(record));
  }

  /**
   * Adoption d'un empire orphelin par un compte (chantier 8). Prend l'`Empire` déjà
   * muté (accountId/name à jour) : `rowFor` reconstruit la ligne complète exigée par
   * le `WriteSet` — un simple patch `{accountId, name}` ne suffirait pas au contrat
   * d'upsert (ligne toujours complète).
   */
  adopt(empire: Empire): void {
    this.writeSet.upsert("players", empire.id, this.rowFor(empire));
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
   * Ligne reconstruite depuis l'`Empire` en mémoire — ligne TOUJOURS complète (contrat
   * du `WriteSet` : `insert()`/`adopt()` passent par la même map que `saveResearch`/
   * `saveExplored`/`saveInfluence`, last-write-wins — un upsert partiel écraserait un
   * upsert complet précédent encore non flushé). `joinedAt` vient de `Empire` (fixé à
   * la construction ou à l'hydratation, jamais recalculé ici).
   */
  private rowFor(empire: Empire) {
    return {
      id: empire.id,
      gameId: this.gameId,
      accountId: empire.accountId ?? null,
      kind: empire.kind,
      name: empire.name,
      color: empire.color,
      joinedAt: empire.joinedAt,
      researched: JSON.stringify(empire.researched),
      research: empire.research ? JSON.stringify(empire.research) : null,
      researchQueue: JSON.stringify(empire.researchQueue),
      influence: empire.influence,
      factionRep: JSON.stringify(empire.factionRep),
      explored: JSON.stringify([...empire.explored]),
    };
  }
}
