import { migrate as migratePg } from "drizzle-orm/node-postgres/migrator";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { migrate as migratePglite } from "drizzle-orm/pglite/migrator";
import type { PgliteDatabase } from "drizzle-orm/pglite";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type * as schema from "./schema.js";

type Schema = typeof schema;
type AnyDb = NodePgDatabase<Schema> | PgliteDatabase<Schema>;

/**
 * Séparé de `db/index.ts` au chantier 49 : ce module ne construit AUCUNE connexion.
 *
 * Importer `db/index.ts` ouvre la connexion, puisque le singleton est un `const` de
 * portée module. Le `globalSetup` des tests a justement besoin des migrations SANS ce
 * singleton — il fabrique sa propre instance pour en tirer un instantané de schéma.
 * Sans cette coupure, le seul fait d'importer le migrateur y ouvrait une base sur le
 * chemin par défaut du dev.
 */
export const migrationsFolder = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  "drizzle",
);

/** `postgres://…`/`postgresql://…` → vrai serveur ; tout le reste → PGlite (chantier 20.3). */
export function isPostgresUrl(url: string): boolean {
  return url.startsWith("postgres://") || url.startsWith("postgresql://");
}

/**
 * Applique les migrations en attente (drizzle-kit, dossier `apps/server/drizzle`).
 * Appel explicite (chantier 20.1), fait depuis le boot réel (`index.ts`) ou le setup de
 * test (`test-setup.ts`). `url` doit être celle utilisée pour construire `database`
 * (même routage pg/PGlite que `createDb`) — les deux migrateurs ne sont pas interchangeables.
 */
export async function runMigrations(
  url: string,
  database: AnyDb,
): Promise<void> {
  if (isPostgresUrl(url)) {
    await migratePg(database as NodePgDatabase<Schema>, { migrationsFolder });
  } else {
    await migratePglite(database as PgliteDatabase<Schema>, {
      migrationsFolder,
    });
  }
}
