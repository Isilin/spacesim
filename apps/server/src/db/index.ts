import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import * as schema from "./schema.js";

const DB_PATH = process.env.SPACESIM_DB ?? "spacesim.db";

const sqlite = new Database(DB_PATH);
sqlite.pragma("journal_mode = WAL");

export const db = drizzle(sqlite, { schema });

// Migrations drizzle-kit appliquées au boot (dossier apps/server/drizzle).
const migrationsFolder = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "drizzle");
migrate(db, { migrationsFolder });

export { schema };
