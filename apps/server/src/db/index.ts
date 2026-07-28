import { PGlite } from "@electric-sql/pglite";
import { drizzle as drizzlePglite, type PgliteDatabase } from "drizzle-orm/pglite";
import { migrate as migratePglite } from "drizzle-orm/pglite/migrator";
import { drizzle as drizzlePg, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { migrate as migratePg } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { config } from "../config.js";
import * as schema from "./schema.js";

type Schema = typeof schema;
export type Db = NodePgDatabase<Schema> | PgliteDatabase<Schema>;

const migrationsFolder = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "drizzle");

/** `postgres://…`/`postgresql://…` → vrai serveur ; tout le reste → PGlite (chantier 20.3). */
function isPostgresUrl(url: string): boolean {
  return url.startsWith("postgres://") || url.startsWith("postgresql://");
}

/**
 * Ouvre la connexion et construit le client drizzle — ne migre pas (chantier 20.1).
 * `postgres://…` route vers un vrai serveur (`pg`, prod/20.4) ; sinon PGlite (WASM,
 * embarqué) : `:memory:` pour tests/e2e, un chemin de dossier pour le dev local sans
 * serveur Postgres. Même dialecte SQL dans les trois cas (chantier 20.3).
 */
export function createDb(url: string): Db {
  if (isPostgresUrl(url)) {
    return drizzlePg(new Pool({ connectionString: url }), { schema });
  }
  return drizzlePglite(new PGlite(url === ":memory:" ? undefined : url), { schema });
}

/**
 * Applique les migrations en attente (drizzle-kit, dossier `apps/server/drizzle`).
 * Appel explicite (chantier 20.1), fait depuis le boot réel (`index.ts`) ou le setup de
 * test (`test-setup.ts`). `url` doit être celle utilisée pour construire `database`
 * (même routage pg/PGlite que `createDb`) — les deux migrateurs ne sont pas interchangeables.
 */
export async function runMigrations(url: string, database: Db): Promise<void> {
  if (isPostgresUrl(url)) {
    await migratePg(database as NodePgDatabase<Schema>, { migrationsFolder });
  } else {
    await migratePglite(database as PgliteDatabase<Schema>, { migrationsFolder });
  }
}

// Singleton consommé par les repositories et la plupart des tests (import direct de
// `db`) : la connexion s'ouvre toujours à l'import, seule la migration automatique a
// disparu (chantier 20.1).
export const db = createDb(config.databaseUrl);

/**
 * File d'attente GLOBALE de transactions (chantier 20.3) : PGlite est une connexion
 * unique — deux `db.transaction()` lancées en parallèle (le flush du `Persister` d'un
 * côté, `appendGalaxies` de l'autre) peuvent s'entrelacer et casser la visibilité
 * read-your-writes d'une transaction sur l'autre (constaté : un flush voit encore
 * absente une ligne pourtant déjà validée par une transaction précédente). Toute
 * transaction du process passe par `withTransaction` plutôt que `db.transaction`
 * directement, pour ne jamais en avoir deux en vol à la fois sur cette connexion.
 */
let transactionTail: Promise<unknown> = Promise.resolve();

export function withTransaction<T>(run: (tx: Db) => Promise<T>): Promise<T> {
  const result = transactionTail.then(() =>
    // biome-ignore lint/suspicious/noExplicitAny: `db.transaction` diffère entre les deux dialectes pg (node-postgres/PGlite)
    (db as any).transaction(run),
  );
  // La file continue même si cette transaction échoue — seul l'appelant doit voir l'erreur.
  transactionTail = result.catch(() => {});
  return result as Promise<T>;
}

export { schema };
