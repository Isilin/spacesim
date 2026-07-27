import Database from "better-sqlite3";
import { drizzle, type BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { config } from "../config.js";
import * as schema from "./schema.js";

type Schema = typeof schema;

const migrationsFolder = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "drizzle");

/** Ouvre la connexion SQLite et construit le client drizzle — ne migre pas (chantier 20.1). */
export function createDb(path: string): BetterSQLite3Database<Schema> {
  const sqlite = new Database(path);
  sqlite.pragma("journal_mode = WAL");
  return drizzle(sqlite, { schema });
}

/**
 * Applique les migrations en attente (drizzle-kit, dossier `apps/server/drizzle`).
 * Auparavant lancé au chargement du module (effet de bord d'import) ; maintenant un
 * appel explicite, fait depuis le boot réel (`index.ts`) ou le setup de test
 * (`test-setup.ts`) — jamais implicite, pour préparer un boot async (chantier 20.3).
 */
export function runMigrations(database: BetterSQLite3Database<Schema>): void {
  migrate(database, { migrationsFolder });
}

// Singleton consommé par les repositories et la plupart des tests (import direct de
// `db`) : la connexion s'ouvre toujours à l'import (comportement inchangé), seule la
// migration automatique a disparu.
export const db = createDb(config.databaseUrl);

export { schema };
