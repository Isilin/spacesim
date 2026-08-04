import {
  accountsQuerySchema,
  applySanctionSchema,
  hasPermission,
  idParamSchema,
  SANCTION_ACTIONS,
} from "@spacesim/protocol";
import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { accountDetail, listAccounts } from "../../../admin/accounts-query.js";
import {
  listAuditEntries,
  recordAuditEntry,
} from "../../../admin/audit-service.js";
import { applySanction } from "../../../admin/sanctions-service.js";
import type { GameEngine } from "../../../game.js";
import type { ZodFastifyInstance } from "../../zod-fastify.js";
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
    async (rawAdmin) => {
      const admin: ZodFastifyInstance =
        rawAdmin.withTypeProvider<ZodTypeProvider>();
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

      // Gestion joueurs (chantier 23.3) : recherche/liste + détail d'un compte. Un
      // paramètre malformé (ex. limit=abc) renvoie désormais un 400 Zod plutôt que de se
      // coercer silencieusement (chantier 27.8).
      admin.get(
        "/accounts",
        {
          schema: { querystring: accountsQuerySchema },
          config: { adminAction: "account.view" },
        },
        async (request) => {
          const { query, limit, offset } = request.query;
          return listAccounts(engine, {
            query,
            limit: Math.min(limit ?? 50, 200),
            offset: offset ?? 0,
          });
        },
      );

      admin.get(
        "/accounts/:id",
        {
          schema: { params: idParamSchema },
          config: { adminAction: "account.view" },
        },
        async (request, reply) => {
          const { id } = request.params;
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
        {
          schema: { params: idParamSchema, body: applySanctionSchema },
          config: { adminAction: "account.warn" },
        },
        async (request, reply) => {
          const { id } = request.params;
          const actor = request.adminAccount!;
          const action = SANCTION_ACTIONS[request.body.kind];
          if (!hasPermission(actor.role, action)) {
            return reply
              .code(403)
              .send({ error: "Action non autorisée pour ce rôle" });
          }
          const target = await accountDetail(engine, id);
          if (!target) return reply.code(404).send({ error: "Compte inconnu" });

          await applySanction({
            accountId: id,
            kind: request.body.kind,
            reason: request.body.reason,
            actorAccountId: actor.id,
            actorEmail: actor.email,
            durationMs: request.body.durationMs,
          });
          await recordAuditEntry({
            actorAccountId: actor.id,
            actorEmail: actor.email,
            action,
            targetType: "account",
            targetId: id,
            reason: request.body.reason,
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
