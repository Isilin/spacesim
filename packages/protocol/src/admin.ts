import { z } from "zod";

/** Rôles applicatifs, du moins au plus privilégié. Un compte a un seul rôle, par défaut "player". */
export const ROLE_IDS = ["player", "moderator", "content_editor", "admin"] as const;
export type RoleId = (typeof ROLE_IDS)[number];
export const roleSchema = z.enum(ROLE_IDS);

/**
 * Actions administratives nommées, vérifiées par rôle sur chaque route `/api/admin/*`
 * (chantier 23.1). Namespacées par domaine (`account.*`, `content.<domaine>.*`, `audit.*`…) ;
 * la liste grandit avec chaque sous-chantier, jamais en avance sur les routes réellement câblées.
 */
export const ADMIN_ACTIONS = [
  "audit.read",
  "account.view",
  "account.warn",
  "account.suspend",
  "account.ban",
  "account.unban",
  "account.force_logout",
  "content.warships.read",
  "content.warships.write",
  "content.factions.read",
  "content.factions.write",
  "content.buildings.read",
  "content.buildings.write",
  "content.ships.read",
  "content.ships.write",
] as const;
export type AdminActionId = (typeof ADMIN_ACTIONS)[number];

/**
 * Matrice de permissions codée (pas éditable en DB — changement rare, niveau développeur, pas
 * niveau créateur de contenu). Pas de résolveur de hiérarchie : chaque rôle liste explicitement
 * ses actions ; `admin` reçoit systématiquement l'ensemble complet plutôt que d'être maintenu à
 * la main à chaque nouvelle action.
 */
export const ROLE_PERMISSIONS: Record<RoleId, ReadonlySet<AdminActionId>> = {
  player: new Set(),
  moderator: new Set([
    "account.view",
    "account.warn",
    "account.suspend",
    "account.ban",
    "account.unban",
    "account.force_logout",
  ]),
  content_editor: new Set([
    "content.warships.read",
    "content.warships.write",
    "content.factions.read",
    "content.factions.write",
    "content.buildings.read",
    "content.buildings.write",
    "content.ships.read",
    "content.ships.write",
  ]),
  admin: new Set(ADMIN_ACTIONS),
};

export function hasPermission(role: RoleId, action: AdminActionId): boolean {
  return ROLE_PERMISSIONS[role].has(action);
}

// ── Sanctions (chantier 23.4) ────────────────────────────────────────────────

/** Un événement de sanction ; `warn`/`unban` ne rendent jamais le compte inutilisable. */
export const SANCTION_KINDS = ["warn", "suspend", "ban", "unban", "force_logout"] as const;
export type SanctionKind = (typeof SANCTION_KINDS)[number];

/** Corps de `POST /api/admin/accounts/:id/sanctions` — raison toujours obligatoire (audit). */
export const applySanctionSchema = z
  .object({
    kind: z.enum(SANCTION_KINDS),
    reason: z.string().trim().min(1).max(500),
    /** Obligatoire pour `suspend` (voir `.refine` ci-dessous), ignoré pour les autres genres. */
    durationMs: z
      .number()
      .int()
      .positive()
      .max(365 * 24 * 3600 * 1000)
      .optional(),
  })
  .refine((v) => v.kind !== "suspend" || v.durationMs !== undefined, {
    message: "durationMs requis pour une suspension",
    path: ["durationMs"],
  });
export type ApplySanctionInput = z.infer<typeof applySanctionSchema>;

/** Action admin correspondant à chaque genre de sanction, pour la vérif de rôle par route. */
export const SANCTION_ACTIONS: Record<SanctionKind, AdminActionId> = {
  warn: "account.warn",
  suspend: "account.suspend",
  ban: "account.ban",
  unban: "account.unban",
  force_logout: "account.force_logout",
};
