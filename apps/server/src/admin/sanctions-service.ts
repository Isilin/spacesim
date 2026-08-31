import type { SanctionKind } from "@spacesim/protocol";
import { randomUUID } from "node:crypto";
import { revokeAllSessions } from "../auth.js";
import { db, schema } from "../db/index.js";

export interface ApplySanctionInput {
  accountId: string;
  kind: SanctionKind;
  reason: string;
  actorAccountId: string;
  actorEmail: string;
  /** Durée en ms — obligatoire pour `suspend`, ignorée sinon. */
  durationMs?: number;
}

/**
 * Applique une sanction : journalise l'événement (`account_sanctions`, lu par
 * `auth.ts` → `accountSanctionStatus`) et force la déconnexion pour tout ce qui rend le
 * compte inutilisable (`ban`/`suspend`/`force_logout`) — `revokeAllSessions` déjà prêt côté
 * `auth.ts` (chantier 8). `warn`/`unban` ne déconnectent jamais, et `mute`/`unmute` non
 * plus : un joueur réduit au silence continue de jouer (ADR 0010).
 */
export async function applySanction(
  input: ApplySanctionInput,
  now = Date.now(),
): Promise<void> {
  // `mute` accepte une durée FACULTATIVE : sans elle le silence est sans terme et ne se
  // lève que par `unmute`, comme un bannissement (chantier 32.16).
  const expiresAt =
    input.kind === "suspend" || (input.kind === "mute" && input.durationMs)
      ? now + (input.durationMs ?? 0)
      : null;
  await db.insert(schema.accountSanctions).values({
    id: randomUUID(),
    accountId: input.accountId,
    kind: input.kind,
    reason: input.reason,
    actorAccountId: input.actorAccountId,
    actorEmail: input.actorEmail,
    createdAt: now,
    expiresAt,
  });
  if (
    input.kind === "ban" ||
    input.kind === "suspend" ||
    input.kind === "force_logout"
  ) {
    await revokeAllSessions(input.accountId);
  }
}
