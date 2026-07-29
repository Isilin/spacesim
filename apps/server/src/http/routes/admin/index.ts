import type { FastifyInstance } from "fastify";
import { accountDetail, listAccounts } from "../../../admin/accounts-query.js";
import { listAuditEntries } from "../../../admin/audit-service.js";
import type { GameEngine } from "../../../game.js";
import { adminGuard } from "./guard.js";

/**
 * Espace `/api/admin/*` (chantier 23.1) : garde de rôle sur chaque route (`adminGuard`),
 * enregistrée dans un plugin Fastify scopé (`prefix`) pour que le `preHandler` ne fuite pas
 * vers `/auth/*`/`/dev/*`/`/ws`. Contrairement à `/dev/*`, toujours actif — la protection est
 * le rôle du compte, pas l'environnement.
 */
export function registerAdminRoutes(app: FastifyInstance, engine: GameEngine): void {
  app.register(
    async (admin) => {
      admin.addHook("preHandler", adminGuard);

      // Route de fumée (chantier 23.1) : prouve tout le tuyau (session → rôle → DB) avant
      // qu'aucune fonctionnalité produit n'existe.
      admin.get("/audit", { config: { adminAction: "audit.read" } }, async () => ({
        entries: await listAuditEntries(),
      }));

      // Gestion joueurs (chantier 23.3) : recherche/liste + détail d'un compte.
      admin.get("/accounts", { config: { adminAction: "account.view" } }, async (request) => {
        const { query, limit, offset } = request.query as {
          query?: string;
          limit?: string;
          offset?: string;
        };
        return listAccounts(engine, {
          query,
          limit: Math.min(Number(limit) || 50, 200),
          offset: Number(offset) || 0,
        });
      });

      admin.get(
        "/accounts/:id",
        { config: { adminAction: "account.view" } },
        async (request, reply) => {
          const { id } = request.params as { id: string };
          const detail = await accountDetail(engine, id);
          if (!detail) return reply.code(404).send({ error: "Compte inconnu" });
          return detail;
        },
      );
    },
    { prefix: "/api/admin" },
  );
}
