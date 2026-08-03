import {
  applySanctionSchema,
  hasPermission,
  SANCTION_ACTIONS,
} from "@spacesim/protocol";
import type { FastifyInstance } from "fastify";
import { accountDetail, listAccounts } from "../../../admin/accounts-query.js";
import {
  listAuditEntries,
  recordAuditEntry,
} from "../../../admin/audit-service.js";
import { applySanction } from "../../../admin/sanctions-service.js";
import type { GameEngine } from "../../../game.js";
import { registerContentRoutes } from "./content.js";
import { adminGuard } from "./guard.js";

/**
 * Espace `/api/admin/*` (chantier 23.1) : garde de rôle sur chaque route (`adminGuard`),
 * enregistrée dans un plugin Fastify scopé (`prefix`) pour que le `preHandler` ne fuite pas
 * vers `/auth/*`/`/dev/*`/`/ws`. Contrairement à `/dev/*`, toujours actif — la protection est
 * le rôle du compte, pas l'environnement.
 */
export function registerAdminRoutes(
  app: FastifyInstance,
  engine: GameEngine,
): void {
  app.register(
    async (admin) => {
      admin.addHook("preHandler", adminGuard);

      // Route de fumée (chantier 23.1) : prouve tout le tuyau (session → rôle → DB) avant
      // qu'aucune fonctionnalité produit n'existe.
      admin.get(
        "/audit",
        { config: { adminAction: "audit.read" } },
        async () => ({
          entries: await listAuditEntries(),
        }),
      );

      // Gestion joueurs (chantier 23.3) : recherche/liste + détail d'un compte.
      admin.get(
        "/accounts",
        { config: { adminAction: "account.view" } },
        async (request) => {
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
        },
      );

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

      // Sanctions (chantier 23.4) : `adminAction: "account.warn"` n'est que le seuil
      // d'entrée sur la route (le moins sévère des 5 genres) — le genre réellement demandé
      // est revérifié individuellement contre `SANCTION_ACTIONS` juste après, pour que la
      // matrice de permissions reste la seule source de vérité même si un rôle futur
      // n'obtient pas tous les genres de sanction.
      admin.post(
        "/accounts/:id/sanctions",
        { config: { adminAction: "account.warn" } },
        async (request, reply) => {
          const { id } = request.params as { id: string };
          const parsed = applySanctionSchema.safeParse(request.body);
          if (!parsed.success) {
            return reply.code(400).send({
              error: parsed.error.issues[0]?.message ?? "Requête invalide",
            });
          }
          const actor = request.adminAccount!;
          const action = SANCTION_ACTIONS[parsed.data.kind];
          if (!hasPermission(actor.role, action)) {
            return reply
              .code(403)
              .send({ error: "Action non autorisée pour ce rôle" });
          }
          const target = await accountDetail(engine, id);
          if (!target) return reply.code(404).send({ error: "Compte inconnu" });

          await applySanction({
            accountId: id,
            kind: parsed.data.kind,
            reason: parsed.data.reason,
            actorAccountId: actor.id,
            actorEmail: actor.email,
            durationMs: parsed.data.durationMs,
          });
          await recordAuditEntry({
            actorAccountId: actor.id,
            actorEmail: actor.email,
            action,
            targetType: "account",
            targetId: id,
            reason: parsed.data.reason,
          });
          return accountDetail(engine, id);
        },
      );

      registerContentRoutes(admin, engine);

      // Tableau de bord ops (chantier 23.12) : additif, réservé à "admin" — pas de mutation,
      // donc pas d'audit. `/ops/empires` délègue à `devEmpireSummaries()` (déjà utilisé par
      // `/dev/empires`, même forme) ; `/ops/health` expose tick/flush/croissance de l'univers,
      // jusqu'ici visibles seulement dans les logs.
      admin.get(
        "/ops/empires",
        { config: { adminAction: "ops.read" } },
        () => ({
          empires: engine.devEmpireSummaries(),
        }),
      );

      admin.get("/ops/health", { config: { adminAction: "ops.read" } }, () =>
        engine.opsHealth(),
      );
    },
    { prefix: "/api/admin" },
  );
}
