import { and, eq } from "drizzle-orm";
import type { PgTable } from "drizzle-orm/pg-core";
import { schema, withTransaction } from "../../db/index.js";
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
  universeGalaxies: ["id"],
  universeSystems: ["id"],
  universeBodies: ["id"],
  universeBelts: ["id"],
  universeStations: ["id"],
  universeLinks: ["aSystemId", "bSystemId"],
};

function tableFor(name: string): { table: PgTable; pkNames: readonly string[] } {
  const pkNames = PRIMARY_KEYS[name as SchemaKey];
  const table = schema[name as SchemaKey] as PgTable | undefined;
  if (!table || !pkNames) {
    throw new Error(`Persister: table inconnue ou sans clé déclarée "${name}"`);
  }
  return { table, pkNames };
}

function whereClause(table: PgTable, pkNames: readonly string[], pk: readonly unknown[]) {
  // biome-ignore lint/suspicious/noExplicitAny: table dynamique, colonnes indexées par nom
  const t = table as any;
  const conditions = pkNames.map((name, i) => eq(t[name], pk[i]));
  return conditions.length === 1 ? conditions[0] : and(...conditions);
}

/**
 * Applique un upsert SANS s'appuyer sur `ON CONFLICT` (plusieurs tables mutées par les
 * repositories n'ont pas d'index UNIQUE déclaré, ex. `relations`) : UPDATE d'abord, et
 * seulement si 0 ligne touchée, INSERT — sûr puisque `WriteSet.upsert()` garantit une
 * ligne toujours complète (voir son commentaire). `.returning()` (plutôt que
 * `rowCount`) pour rester portable entre les deux dialectes pg (node-postgres, PGlite).
 */
// biome-ignore lint/suspicious/noExplicitAny: transaction dynamique table par table
async function applyUpsert(tx: any, entry: DrainedUpsert): Promise<void> {
  const { table, pkNames } = tableFor(entry.table);
  const where = whereClause(table, pkNames, entry.pk);
  const updated = await tx.update(table).set(entry.values).where(where).returning();
  if (updated.length === 0) {
    await tx.insert(table).values(entry.values);
  }
}

// biome-ignore lint/suspicious/noExplicitAny: transaction dynamique table par table
async function applyDelete(tx: any, entry: DrainedDelete): Promise<void> {
  const { table, pkNames } = tableFor(entry.table);
  const where = whereClause(table, pkNames, entry.pk);
  await tx.delete(table).where(where);
}

/**
 * Flushe un `WriteSet` en une transaction, de façon SÉRIALISÉE : jamais deux flush
 * concurrents (chantier 20.2 — décision d'architecture write-behind). `flush()` ne
 * rejette jamais : un échec est journalisé et exposé via `lastFlushError`, les entrées
 * en cause retournent dans le `WriteSet` pour un nouvel essai au flush suivant — les
 * appelants (fin de commande WS, fin de lot de ticks) l'invoquent en fire-and-forget,
 * la RAM fait déjà autorité (`notify()` est parti avant, sans attendre ce flush).
 *
 * Sérialisation par CHAÎNAGE (`tail`) plutôt que par le couple inFlight/queued
 * (chantier 20.3, bug corrigé) : l'ancienne version relançait un flush « rattrapage »
 * via `void this.flush()` — non attendu par l'appelant, qui pouvait donc considérer
 * son `await flush()` terminé alors qu'un flush chaîné tournait encore, capable de
 * retarder l'écriture de lignes dont d'autres flush (tests, boot) dépendaient déjà.
 * Chaque appel s'accroche maintenant à la queue : son `Promise` ne se résout qu'une
 * fois SA place dans la chaîne (et tout ce qui la précède) réellement flushée.
 */
export class Persister {
  lastFlushAt: number | null = null;
  lastFlushError: string | null = null;

  private tail: Promise<void> = Promise.resolve();

  constructor(
    private readonly writeSet: WriteSet,
    private readonly logger: Logger = consoleLogger,
  ) {}

  flush(): Promise<void> {
    this.tail = this.tail.then(() => this.runFlush());
    return this.tail;
  }

  private async runFlush(): Promise<void> {
    if (this.writeSet.isEmpty()) return;
    const { upserts, deletes } = this.writeSet.drain();
    try {
      await withTransaction(async (tx) => {
        for (const entry of upserts) await applyUpsert(tx, entry);
        for (const entry of deletes) await applyDelete(tx, entry);
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
