import { PGlite } from "@electric-sql/pglite";
import {
  drizzle as drizzlePglite,
  type PgliteDatabase,
} from "drizzle-orm/pglite";
import {
  drizzle as drizzlePg,
  type NodePgDatabase,
} from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { readFileSync } from "node:fs";
import { config } from "../config.js";
import * as schema from "./schema.js";
import { isPostgresUrl, runMigrations } from "./migrator.js";

export { runMigrations };

type Schema = typeof schema;
export type Db = NodePgDatabase<Schema> | PgliteDatabase<Schema>;

/**
 * Ouvre la connexion et construit le client drizzle — ne migre pas (chantier 20.1).
 * `postgres://…` route vers un vrai serveur (`pg`, prod/20.4) ; sinon PGlite (WASM,
 * embarqué) : `:memory:` pour tests/e2e, un chemin de dossier pour le dev local sans
 * serveur Postgres. Même dialecte SQL dans les trois cas (chantier 20.3).
 */
/**
 * Préfixe réservé aux tests (chantier 49) : `snapshot:<chemin>` restaure une archive de
 * datadir PGlite au lieu d'amorcer un cluster vide.
 *
 * Trente fichiers de test isolés amorçaient chacun un cluster puis rejouaient les trente
 * migrations, soit ~5,3 s par fichier. Mesuré ici : amorçage nu 1 964 ms, restauration
 * d'archive 296 ms — `loadDataDir` saute `initdb` EN PLUS des migrations. La base reste
 * en mémoire dans les deux cas ; seule sa façon de naître change.
 */
const SNAPSHOT_PREFIX = "snapshot:";

export function createDb(url: string): Db {
  if (isPostgresUrl(url)) {
    return drizzlePg(new Pool({ connectionString: url }), { schema });
  }
  if (url.startsWith(SNAPSHOT_PREFIX)) {
    const archive = readFileSync(url.slice(SNAPSHOT_PREFIX.length));
    return drizzlePglite(new PGlite({ loadDataDir: new Blob([archive]) }), {
      schema,
    });
  }
  return drizzlePglite(new PGlite(url === ":memory:" ? undefined : url), {
    schema,
  });
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
    // `any` assumé : `db.transaction` diffère entre les deux dialectes pg (node-postgres/PGlite)
    (db as any).transaction(run),
  );
  // La file continue même si cette transaction échoue — seul l'appelant doit voir l'erreur.
  transactionTail = result.catch(() => {});
  return result as Promise<T>;
}

export { schema };
