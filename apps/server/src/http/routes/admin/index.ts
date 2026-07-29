import type { FastifyInstance } from "fastify";
import { listAuditEntries } from "../../../admin/audit-service.js";
import { adminGuard } from "./guard.js";

/**
 * Espace `/api/admin/*` (chantier 23.1) : garde de rôle sur chaque route (`adminGuard`),
 * enregistrée dans un plugin Fastify scopé (`prefix`) pour que le `preHandler` ne fuite pas
 * vers `/auth/*`/`/dev/*`/`/ws`. Contrairement à `/dev/*`, toujours actif — la protection est
 * le rôle du compte, pas l'environnement.
 */
export function registerAdminRoutes(app: FastifyInstance): void {
  app.register(
    async (admin) => {
      admin.addHook("preHandler", adminGuard);

      // Route de fumée (chantier 23.1) : prouve tout le tuyau (session → rôle → DB) avant
      // qu'aucune fonctionnalité produit n'existe.
      admin.get("/audit", { config: { adminAction: "audit.read" } }, async () => ({
        entries: await listAuditEntries(),
      }));
    },
    { prefix: "/api/admin" },
  );
}
