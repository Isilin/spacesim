import type { RoleId } from "@spacesim/protocol";
import { eq, ilike, sql } from "drizzle-orm";
import {
  activeSessionCount,
  computeSanctionStatus,
  sanctionHistory,
  type SanctionEntry,
  type SanctionStatus,
} from "../auth.js";
import { db, schema } from "../db/index.js";
import type { GameEngine } from "../game.js";

export interface EmpireIdentity {
  id: string;
  name: string;
  color: string;
}

export interface AccountSummary {
  id: string;
  email: string;
  role: RoleId;
  createdAt: number;
  lastLoginAt: number | null;
  empire: EmpireIdentity | null;
}

export interface AccountListResult {
  accounts: AccountSummary[];
  total: number;
}

function empireIdentity(engine: GameEngine, accountId: string): EmpireIdentity | null {
  const empire = engine.empireForAccount(accountId);
  return empire ? { id: empire.id, name: empire.name, color: empire.color } : null;
}

/** Liste paginée des comptes, recherche par sous-chaîne d'e-mail (insensible à la casse). */
export async function listAccounts(
  engine: GameEngine,
  { query = "", limit = 50, offset = 0 }: { query?: string; limit?: number; offset?: number },
): Promise<AccountListResult> {
  const where = query ? ilike(schema.accounts.email, `%${query}%`) : undefined;
  const [rows, countRows] = await Promise.all([
    db
      .select()
      .from(schema.accounts)
      .where(where)
      .orderBy(schema.accounts.createdAt)
      .limit(limit)
      .offset(offset),
    db.select({ count: sql<number>`count(*)::int` }).from(schema.accounts).where(where),
  ]);
  return {
    accounts: rows.map((row) => ({
      id: row.id,
      email: row.email,
      role: row.role as RoleId,
      createdAt: row.createdAt,
      lastLoginAt: row.lastLoginAt,
      empire: empireIdentity(engine, row.id),
    })),
    total: countRows[0]?.count ?? 0,
  };
}

export interface AccountDetail extends AccountSummary {
  activeSessions: number;
  /** Même forme que `GameEngine.devEmpireSummaries()`, scopée à un seul empire — null si le
   *  compte n'a pas encore d'empire dans cette partie. */
  empireSummary: unknown | null;
  sanctionStatus: SanctionStatus;
  sanctionHistory: SanctionEntry[];
}

export async function accountDetail(
  engine: GameEngine,
  accountId: string,
): Promise<AccountDetail | null> {
  const rows = await db.select().from(schema.accounts).where(eq(schema.accounts.id, accountId));
  const row = rows[0];
  if (!row) return null;
  const history = await sanctionHistory(row.id);
  return {
    id: row.id,
    email: row.email,
    role: row.role as RoleId,
    createdAt: row.createdAt,
    lastLoginAt: row.lastLoginAt,
    empire: empireIdentity(engine, row.id),
    activeSessions: await activeSessionCount(row.id),
    empireSummary: engine.empireSummaryForAccount(row.id),
    sanctionStatus: computeSanctionStatus(history),
    sanctionHistory: history,
  };
}
