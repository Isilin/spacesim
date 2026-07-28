import { and, eq } from "drizzle-orm";
import type { SQLiteTable } from "drizzle-orm/sqlite-core";
import { db, schema } from "../../db/index.js";
import { consoleLogger, type Logger } from "../logger.js";
import type { DrainedDelete, DrainedUpsert, WriteSet } from "./write-set.js";

type SchemaKey = keyof typeof schema;

/**
 * Colonnes de clé (naturelle ou primaire) par table, dans l'ORDRE attendu des valeurs
 * `pk` du `WriteSet`. Sert à construire le `WHERE` du flush (update-ou-insert) — pas
 * besoin d'index UNIQUE déclaré en base (ex. `relations` n'en a pas) puisqu'on ne
 * s'appuie pas sur `ON CONFLICT`, voir `applyUpsert`.
 */
const PRIMARY_KEYS: Partial<Record<SchemaKey, readonly string[]>> = {
  games: ["id"],
  colonies: ["id"],
  relations: ["empireA", "empireB"],
  relationProposals: ["id"],
  objectives: ["id"],
  worldEvents: ["id"],
  factionStates: ["factionId"],
  blueprints: ["id"],
  transfers: ["id"],
  missions: ["id"],
  routes: ["id"],
  outposts: ["id"],
  stationStates: ["stationId"],
  gateways: ["galaxyId"],
  claims: ["systemId"],
  fleets: ["id"],
  pirateLairs: ["id"],
  battles: ["id"],
  players: ["id"],
  contracts: ["id"],
};

function tableFor(name: string): { table: SQLiteTable; pkNames: readonly string[] } {
  const pkNames = PRIMARY_KEYS[name as SchemaKey];
  const table = schema[name as SchemaKey] as SQLiteTable | undefined;
  if (!table || !pkNames) {
    throw new Error(`Persister: table inconnue ou sans clé déclarée "${name}"`);
  }
  return { table, pkNames };
}

function whereClause(table: SQLiteTable, pkNames: readonly string[], pk: readonly unknown[]) {
  // biome-ignore lint/suspicious/noExplicitAny: table dynamique, colonnes indexées par nom
  const t = table as any;
  const conditions = pkNames.map((name, i) => eq(t[name], pk[i]));
  return conditions.length === 1 ? conditions[0] : and(...conditions);
}

/**
 * Applique un upsert SANS s'appuyer sur `ON CONFLICT` (plusieurs tables mutées par les
 * repositories n'ont pas d'index UNIQUE déclaré, ex. `relations`) : UPDATE d'abord, et
 * seulement si 0 ligne touchée, INSERT — sûr puisque `WriteSet.upsert()` garantit une
 * ligne toujours complète (voir son commentaire).
 */
// biome-ignore lint/suspicious/noExplicitAny: transaction dynamique table par table
function applyUpsert(tx: any, entry: DrainedUpsert): void {
  const { table, pkNames } = tableFor(entry.table);
  const where = whereClause(table, pkNames, entry.pk);
  const result = tx.update(table).set(entry.values).where(where).run();
  if (result.changes === 0) {
    tx.insert(table).values(entry.values).run();
  }
}

// biome-ignore lint/suspicious/noExplicitAny: transaction dynamique table par table
function applyDelete(tx: any, entry: DrainedDelete): void {
  const { table, pkNames } = tableFor(entry.table);
  const where = whereClause(table, pkNames, entry.pk);
  tx.delete(table).where(where).run();
}

/**
 * Flushe un `WriteSet` en une transaction, de façon SÉRIALISÉE : jamais deux flush
 * concurrents (chantier 20.2 — décision d'architecture write-behind). `flush()` ne
 * rejette jamais : un échec est journalisé et exposé via `lastFlushError`, les entrées
 * en cause retournent dans le `WriteSet` pour un nouvel essai au flush suivant — les
 * appelants (fin de commande WS, fin de lot de ticks) l'invoquent en fire-and-forget,
 * la RAM fait déjà autorité (`notify()` est parti avant, sans attendre ce flush).
 */
export class Persister {
  lastFlushAt: number | null = null;
  lastFlushError: string | null = null;

  private inFlight: Promise<void> | null = null;
  /** Une demande de flush est arrivée pendant qu'un autre tournait déjà. */
  private queued = false;

  constructor(
    private readonly writeSet: WriteSet,
    private readonly logger: Logger = consoleLogger,
  ) {}

  flush(): Promise<void> {
    if (this.inFlight) {
      this.queued = true;
      return this.inFlight;
    }
    this.inFlight = this.runFlush().finally(() => {
      this.inFlight = null;
      if (this.queued) {
        this.queued = false;
        // Le WriteSet a pu se reprovisionner pendant ce flush — on relance.
        void this.flush();
      }
    });
    return this.inFlight;
  }

  private async runFlush(): Promise<void> {
    if (this.writeSet.isEmpty()) return;
    const { upserts, deletes } = this.writeSet.drain();
    try {
      db.transaction((tx) => {
        for (const entry of upserts) applyUpsert(tx, entry);
        for (const entry of deletes) applyDelete(tx, entry);
      });
      this.lastFlushAt = Date.now();
      this.lastFlushError = null;
    } catch (err) {
      // La transaction a fait rollback : on remet les entrées en attente pour le
      // prochain flush plutôt que de les perdre silencieusement.
      for (const entry of upserts) this.writeSet.upsert(entry.table, entry.pk, entry.values);
      for (const entry of deletes) this.writeSet.delete(entry.table, entry.pk);
      this.lastFlushError = err instanceof Error ? err.message : String(err);
      this.logger.warn(
        `[persister] flush échoué, nouvel essai au prochain : ${this.lastFlushError}`,
      );
    }
  }
}
