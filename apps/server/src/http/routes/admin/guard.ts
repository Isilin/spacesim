import type { AdminActionId } from "@spacesim/protocol";
import { hasPermission } from "@spacesim/protocol";
import type { FastifyReply, FastifyRequest } from "fastify";
import { type Account, bearerToken, resolveSession } from "../../../auth.js";

declare module "fastify" {
  interface FastifyContextConfig {
    /** Action admin déclarée par la route — vérifiée contre le rôle du compte connecté. */
    adminAction?: AdminActionId;
  }
  interface FastifyRequest {
    /** Posé par `adminGuard` une fois la session et le rôle validés. */
    adminAccount?: Account;
  }
}

/**
 * Garde `preHandler` de tout `/api/admin/*` (chantier 23.1) : résout la session comme
 * `/auth/*` (même `resolveSession`/`bearerToken`), puis vérifie le rôle contre l'action
 * déclarée par la route (`config.adminAction`). Fail-closed : une route sans `adminAction`
 * déclaré est refusée, jamais laissée passer par oubli.
 */
export async function adminGuard(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const account = await resolveSession(bearerToken(request.headers.authorization));
  if (!account) {
    reply.code(401).send({ error: "Session invalide" });
    return;
  }
  const action = request.routeOptions.config.adminAction;
  if (!action || !hasPermission(account.role, action)) {
    reply.code(403).send({ error: "Action non autorisée pour ce rôle" });
    return;
  }
  request.adminAccount = account;
}
