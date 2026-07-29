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
export const ADMIN_ACTIONS = ["audit.read", "account.view"] as const;
export type AdminActionId = (typeof ADMIN_ACTIONS)[number];

/**
 * Matrice de permissions codée (pas éditable en DB — changement rare, niveau développeur, pas
 * niveau créateur de contenu). Pas de résolveur de hiérarchie : chaque rôle liste explicitement
 * ses actions ; `admin` reçoit systématiquement l'ensemble complet plutôt que d'être maintenu à
 * la main à chaque nouvelle action.
 */
export const ROLE_PERMISSIONS: Record<RoleId, ReadonlySet<AdminActionId>> = {
  player: new Set(),
  moderator: new Set(["account.view"]),
  content_editor: new Set(),
  admin: new Set(ADMIN_ACTIONS),
};

export function hasPermission(role: RoleId, action: AdminActionId): boolean {
  return ROLE_PERMISSIONS[role].has(action);
}
