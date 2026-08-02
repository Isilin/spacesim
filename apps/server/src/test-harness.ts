import { WARSHIPS } from "@spacesim/shared";
import { sql } from "drizzle-orm";
import { db, schema } from "./db/index.js";
import type { GameEngine } from "./game.js";

/**
 * Harnais de test moteur (extrait de game.test.ts au chantier 19.2).
 *
 * La DB est en mémoire (`vitest.config.ts` → `SPACESIM_DB=:memory:`). Le module
 * `db` est un singleton par fichier de test : chaque fichier repart d'une base
 * vierge via `beforeEach(() => resetDb())`. `GameEngine.loadOrBootstrap()` crée
 * alors un univers neuf (colonie mère + marchés + portails) puisque la table
 * `games` est vide.
 */

/** Un id de vaisseau de guerre valide (pour armer des flottes de test). */
export const WARSHIP = Object.keys(WARSHIPS)[0]!;

/** Toutes les tables, vidées avant chaque test (FK déclaratives non appliquées en SQLite). */
export const ALL_TABLES = [
  schema.universeLinks,
  schema.universeTradingPosts,
  schema.universeBelts,
  schema.universeBodies,
  schema.universeSystems,
  schema.universeGalaxies,
  schema.transfers,
  schema.missions,
  schema.outposts,
  schema.routes,
  schema.colonies,
  schema.stations,
  schema.battles,
  schema.pirateLairs,
  schema.fleets,
  schema.contracts,
  schema.factionStates,
  schema.relations,
  schema.relationProposals,
  schema.objectives,
  schema.worldEvents,
  schema.blueprints,
  schema.gateways,
  schema.claims,
  schema.players,
  schema.tradingPostStates,
  schema.games,
] as const;

/**
 * `TRUNCATE` plutôt qu'un `DELETE` par table dans un ordre respectant les FK
 * (chantier 20.3 : les FK sont désormais RÉELLES en Postgres) — une seule instruction,
 * toutes les tables ensemble, `CASCADE` couvre les FK vers des tables hors de la liste.
 */
export async function resetDb(): Promise<void> {
  const names = ALL_TABLES.map((t) => sql`${t}`);
  await db.execute(sql`TRUNCATE TABLE ${sql.join(names, sql`, `)} CASCADE`);
}

/** Type des résumés renvoyés par `devEmpireSummaries` (outil de dev). */
export interface EmpireSummary {
  id: string;
  name: string;
  kind: "human" | "npc";
  isDefault: boolean;
  influence: number;
  exploredCount: number;
  exploredSystemIds: string[];
  colonies: { name: string; systemId: string; credits: number; ore: number }[];
}
export const summaries = (engine: GameEngine) =>
  engine.devEmpireSummaries() as EmpireSummary[];

/**
 * Empire d'un compte fictif (chantier 8) : le premier compte adopte l'empire amorcé au
 * boot, les suivants en obtiennent un neuf. Rappeler avec le même id rejoint le même empire.
 */
export const empireFor = (engine: GameEngine, accountId: string) =>
  engine.createEmpireForAccount(accountId, accountId)!;

/** Nombre de ticks avancés par `devFastForward` : delta multiple exact de TICK_MS (5s). */
export const advanceTicks = (engine: GameEngine, ticks: number) =>
  engine.devFastForward(ticks * 5);
