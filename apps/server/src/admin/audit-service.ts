import type { AdminActionId } from "@spacesim/protocol";
import { desc } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { db, schema } from "../db/index.js";

export interface AuditEntry {
  id: string;
  actorAccountId: string;
  actorEmail: string;
  action: AdminActionId;
  targetType: string | null;
  targetId: string | null;
  reason: string | null;
  metadata: string | null;
  createdAt: number;
}

export interface AuditEntryInput {
  actorAccountId: string;
  actorEmail: string;
  action: AdminActionId;
  targetType?: string;
  targetId?: string;
  reason?: string;
  metadata?: string;
}

/**
 * Journalise une action admin. Écrit en direct via `db.insert` (hors `WriteSet`/`Persister` :
 * chemin humain à basse fréquence, pas le chemin chaud tick/commande que le write-behind
 * protège). N'est appelé que pour des mutations — les lectures ne sont pas auditées.
 */
export async function recordAuditEntry(entry: AuditEntryInput, now = Date.now()): Promise<void> {
  await db.insert(schema.adminAuditLog).values({
    id: randomUUID(),
    actorAccountId: entry.actorAccountId,
    actorEmail: entry.actorEmail,
    action: entry.action,
    targetType: entry.targetType ?? null,
    targetId: entry.targetId ?? null,
    reason: entry.reason ?? null,
    metadata: entry.metadata ?? null,
    createdAt: now,
  });
}

/** Entrées les plus récentes d'abord. */
export async function listAuditEntries(limit = 100): Promise<AuditEntry[]> {
  const rows = await db
    .select()
    .from(schema.adminAuditLog)
    .orderBy(desc(schema.adminAuditLog.createdAt))
    .limit(limit);
  return rows.map((row) => ({ ...row, action: row.action as AdminActionId }));
}
