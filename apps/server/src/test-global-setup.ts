import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import * as schema from "./db/schema.js";
import { runMigrations } from "./db/migrator.js";

/**
 * Fabrique UNE fois l'archive de schéma que chaque fichier de test restaurera
 * (chantier 49).
 *
 * Avant : trente fichiers isolés, trente amorçages de cluster PGlite, trente rejeux des
 * trente migrations — 666 lignes de SQL et 48 `CREATE TABLE` à chaque fois, soit ~5,3 s
 * par fichier et 159 s des 213 s de la suite complète.
 *
 * Mesuré dans le conteneur : amorçage d'un cluster nu 1 964 ms, `dumpDataDir` 71 ms,
 * restauration par `loadDataDir` 296 ms. La restauration est plus rapide qu'un amorçage
 * NU, migrations mises à part, parce qu'elle saute aussi `initdb`.
 *
 * Ce module n'importe volontairement pas `db/index.ts` : le singleton y est un `const`
 * de portée module, et l'importer ouvrirait ici une connexion sur le chemin par défaut du
 * dev. D'où `db/migrator.ts`, qui ne construit rien.
 */
export const SCHEMA_SNAPSHOT = join(tmpdir(), "spacesim-test-schema.tar");

export default async function setup(): Promise<void> {
  const pg = new PGlite();
  await runMigrations(":memory:", drizzle(pg, { schema }));
  const archive = await pg.dumpDataDir("none");
  writeFileSync(SCHEMA_SNAPSHOT, Buffer.from(await archive.arrayBuffer()));
  await pg.close();
}
